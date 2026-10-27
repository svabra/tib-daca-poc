from __future__ import annotations

import importlib.util
import uuid
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from daca_catalog.modeling_schemas import (
    DerivedFieldBinding,
    LogicalEntityWrite,
    LogicalFieldWrite,
    LogicalModelAssistanceProvenanceWrite,
)
from daca_catalog.modeling_seed import PERSONNEL_MODEL_ID, seed_modeling_catalog
from daca_catalog.modeling_service import logical_write_from_payload
from daca_catalog.models import LogicalModelAssistanceProvenance, LogicalModelVersion, utc_now
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

HEADERS = {"X-DaCa-User": "cinthya.thor"}


def provenance(origin, **extra):
    return {
        "fieldPath": "title",
        "language": "fr",
        "provider": "deepl",
        "sourceTextHash": "a" * 64,
        "retrievedAt": utc_now().isoformat(),
        "payloadHash": "b" * 64,
        "origin": origin,
        **extra,
    }


@pytest.mark.parametrize(
    "name",
    ["Gebäude", "grösse_m²".replace("²", "2"), "Straße", "étage", "Gebau\u0308de", "_fläche-1"],
)
def test_unicode_technical_names_work_in_all_logical_mapping_inputs(name):
    field = LogicalFieldWrite(name=name, data_type="string")
    assert field.name == name
    assert LogicalEntityWrite(name=name, fields=[field]).name == name
    binding = DerivedFieldBinding(
        physical_column_id=uuid.uuid4(), entity_name=name, logical_field_name=name
    )
    assert binding.logical_field_name == name


@pytest.mark.parametrize("name", ["1Gebäude", "mit Leerzeichen", "feld/name", "😀", "a" * 256])
def test_invalid_technical_names_stay_rejected(name):
    with pytest.raises(ValidationError):
        LogicalFieldWrite(name=name, data_type="string")


@pytest.mark.parametrize("legacy,canonical", [("machine", "machine_translated"), ("accepted", "accepted_suggestion")])
def test_legacy_assistance_vocabulary_normalizes_at_the_write_boundary(legacy, canonical):
    assert LogicalModelAssistanceProvenanceWrite.model_validate(provenance(legacy)).origin == canonical


def test_saving_unicode_fields_and_all_assistance_origins_versions_cleanly(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    path = f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}"
    initial = client.get(path, headers=HEADERS)
    body = logical_write_from_payload(initial.json()).model_dump(mode="json", by_alias=True)
    body["entities"][0]["name"] = "Gebäude"
    body["entities"][0]["fields"][0]["name"] = "Flächengrösse"
    origins = ["machine_translated", "accepted_suggestion", "edited", "source_import"]
    body["assistanceProvenance"] = [
        provenance(origin, fieldPath=f"title.{index}") for index, origin in enumerate(origins)
    ]
    saved = client.put(
        f"{path}/versions/{initial.json()['versionId']}",
        headers={**HEADERS, "If-Match": initial.headers["etag"]},
        json=body,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["entities"][0]["fields"][0]["name"] == "Flächengrösse"
    assert [item["origin"] for item in saved.json()["assistanceProvenance"]] == origins
    exported = client.get(f"{path}/versions/{saved.json()['versionId']}/exports/shacl/ttl", headers=HEADERS)
    assert exported.status_code == 200, exported.text
    assert "Flächengrösse" in exported.text
    clone = client.post(f"{path}/versions", headers={**HEADERS, "If-Match": saved.headers["etag"]})
    assert clone.status_code == 201, clone.text
    assert [item["origin"] for item in clone.json()["assistanceProvenance"]] == origins
    invalid = {**body, "assistanceProvenance": [provenance("unknown")]}
    rejected = client.put(
        f"{path}/versions/{clone.json()['versionId']}",
        headers={**HEADERS, "If-Match": clone.headers["etag"]},
        json=invalid,
    )
    assert rejected.status_code == 422
    assert rejected.json()["errors"][0]["location"] == "body.assistanceProvenance.0.origin"
    with session_factory() as session:
        assert (
            session.scalar(select(func.count()).select_from(LogicalModelAssistanceProvenance)) == 8
        )


def test_origin_migration_preserves_historical_evidence_and_rejects_lossy_rollback(session_factory):
    migration_path = Path(__file__).parents[1] / "alembic/versions/0038_model_assistance_origins.py"
    spec = importlib.util.spec_from_file_location("origin_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with session_factory() as session:
        seed_modeling_catalog(session)
        version_id = session.scalar(
            select(LogicalModelVersion.id).where(
                LogicalModelVersion.logical_model_id == PERSONNEL_MODEL_ID
            )
        )
        context = MigrationContext.configure(session.connection())
        with Operations.context(context):
            migration.downgrade()
            old = LogicalModelAssistanceProvenance(
                id=uuid.uuid4(),
                logical_model_version_id=version_id,
                field_path="title",
                provider="deepl",
                source_text_hash="a" * 64,
                payload_hash="b" * 64,
                retrieved_at=utc_now(),
                origin="machine",
            )
            session.add(old)
            session.flush()
            migration.upgrade()
            session.refresh(old)
            assert old.origin == "machine"
            for index, origin in enumerate(
                ("machine_translated", "accepted_suggestion", "edited", "source_import")
            ):
                session.add(
                    LogicalModelAssistanceProvenance(
                        id=uuid.uuid4(),
                        logical_model_version_id=version_id,
                        field_path=f"field{index}",
                        provider="termdat",
                        source_text_hash="a" * 64,
                        payload_hash="b" * 64,
                        retrieved_at=utc_now(),
                        origin=origin,
                    )
                )
            session.flush()
            with pytest.raises(IntegrityError), session.begin_nested():
                session.connection()  # Materialize the savepoint before Alembic uses its bound connection.
                migration.downgrade()
        assert (
            session.scalar(select(func.count()).select_from(LogicalModelAssistanceProvenance)) == 5
        )
