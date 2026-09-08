from __future__ import annotations

import uuid

from daca_catalog.domain_glossary_seed import MOBILITY_DOMAIN_ID
from daca_catalog.modeling_seed import (
    PERSONNEL_MODEL_ID,
    PHYSICAL_SOURCE_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    AssetMapping,
    AssetMappingVersion,
    DcatDatasetVersion,
    LogicalModel,
    LogicalModelVersion,
    PhysicalDatabase,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalTable,
)
from sqlalchemy import func, select


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def _vehicle_table_id(session_factory) -> uuid.UUID:
    with session_factory() as session:
        return session.scalar(
            select(PhysicalTable.id)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .join(PhysicalSchemaSnapshot, PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id)
            .where(
                PhysicalSchemaSnapshot.source_id == PHYSICAL_SOURCE_ID,
                PhysicalSchemaSnapshot.sequence == 1,
                PhysicalDatabase.name == "logistics_db",
                PhysicalSchema.name == "logistics",
                PhysicalTable.name == "vehicle_inventory",
            )
        )


def test_logical_workflow_appends_versions_and_owner_publishes_without_distribution(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)

    initial = client.get(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}",
        headers=_headers("cinthya.thor"),
    )
    assert initial.status_code == 200
    assert initial.json()["distributions"] == []
    initial_version_id = initial.json()["versionId"]

    missing_precondition = client.post(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/"
        f"{initial_version_id}/submit",
        headers=_headers("cinthya.thor"),
    )
    assert missing_precondition.status_code == 428

    submitted = client.post(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/"
        f"{initial_version_id}/submit",
        headers=_headers("cinthya.thor", initial.headers["etag"]),
    )
    assert submitted.status_code == 200
    assert submitted.json()["revision"] == 2
    assert submitted.json()["status"] == "review_pending"
    assert submitted.json()["predecessorVersionId"] == initial_version_id

    review_id = submitted.json()["reviewId"]
    assert review_id

    steward_publish = client.post(
        f"/api/v1/logical-model-reviews/{review_id}/decision",
        json={"decision": "accept"},
        headers=_headers("cinthya.thor", submitted.headers["etag"]),
    )
    assert steward_publish.status_code == 403

    published = client.post(
        f"/api/v1/logical-model-reviews/{review_id}/decision",
        json={"decision": "accept"},
        headers=_headers("christian.spider", submitted.headers["etag"]),
    )
    assert published.status_code == 200
    assert published.json()["revision"] == 3
    assert published.json()["status"] == "published"
    assert published.json()["distributions"] == []

    with session_factory() as session:
        versions = list(
            session.scalars(
                select(LogicalModelVersion)
                .where(LogicalModelVersion.logical_model_id == PERSONNEL_MODEL_ID)
                .order_by(LogicalModelVersion.revision)
            )
        )
        assert [version.status for version in versions] == [
            "draft",
            "review_pending",
            "published",
        ]
        assert versions[1].predecessor_version_id == versions[0].id
        assert versions[2].predecessor_version_id == versions[1].id
        dataset = session.get(DcatDatasetVersion, versions[2].dataset_version_id)
        assert dataset.issued is not None
        assert dataset.published_at is not None
        assert session.get(LogicalModel, PERSONNEL_MODEL_ID).published_revision == 3


def test_derivation_preview_is_editable_and_commit_creates_initial_mappings(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
    table_id = _vehicle_table_id(session_factory)
    body = {
        "title": "Fahrzeugbestand Einsatzplanung",
        "description": "Editierbarer Vorschlag aus technischen Metadaten.",
        "dataDomainId": str(MOBILITY_DOMAIN_ID),
        "dataOwnerUserId": "lawrence.hill",
        "deputyOwnerUserId": "hong.an.captain",
    }

    preview = client.post(
        f"/api/v1/physical-tables/{table_id}/derivation-preview",
        json=body,
        headers=_headers("christian.man"),
    )
    assert preview.status_code == 200, preview.text
    proposal = preview.json()
    assert proposal["tableId"] == str(table_id)
    assert len(proposal["fields"]) == 5
    assert all(field["selected"] for field in proposal["fields"])
    proposal["fields"][0]["name"] = "fahrzeug_identifier"
    proposal["fields"][-1]["selected"] = False

    committed = client.post(
        f"/api/v1/physical-tables/{table_id}/derive-logical-model",
        json={**body, "fields": proposal["fields"]},
        headers=_headers("christian.man"),
    )
    assert committed.status_code == 201, committed.text
    payload = committed.json()
    assert payload["entities"][0]["fields"][0]["name"] == "fahrzeug_identifier"
    assert len(payload["entities"][0]["fields"]) == 4
    assert payload["hasPhysicalMapping"] is True

    with session_factory() as session:
        mappings = list(
            session.scalars(
                select(AssetMapping).where(AssetMapping.logical_model_id == uuid.UUID(payload["id"]))
            )
        )
        assert len(mappings) == 4
        versions = [
            session.scalar(
                select(AssetMappingVersion).where(
                    AssetMappingVersion.asset_mapping_id == mapping.id
                )
            )
            for mapping in mappings
        ]
        assert {version.mapping_type for version in versions} == {"Direct", "Renamed"}
        assert all(version.status == "draft" for version in versions)


def test_physical_reimport_persists_json_safe_drift_and_broken_successors(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        original_versions = {
            mapping.id: session.scalar(
                select(AssetMappingVersion)
                .where(AssetMappingVersion.asset_mapping_id == mapping.id)
                .order_by(AssetMappingVersion.revision.desc())
                .limit(1)
            )
            for mapping in session.scalars(
                select(AssetMapping).where(AssetMapping.physical_source_id == PHYSICAL_SOURCE_ID)
            )
        }

    imported = client.post(
        f"/api/v1/physical-sources/{PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "drift"},
        headers=_headers("christian.man", '"1"'),
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["snapshot"]["sequence"] == 2
    assert imported.headers["etag"] == '"2"'

    drift = client.get(
        f"/api/v1/physical-snapshots/{imported.json()['snapshot']['id']}/drift",
        headers=_headers("christian.man"),
    )
    assert drift.status_code == 200, drift.text
    change_types = {change["changeType"] for change in drift.json()["changes"]}
    assert {
        "column_added",
        "column_removed",
        "type_changed",
        "length_changed",
        "precision_changed",
        "scale_changed",
        "nullability_changed",
        "rename_candidate",
    } <= change_types
    assert any(
        change["changeType"] == "rename_candidate" and change["reviewStatus"] == "pending"
        for change in drift.json()["changes"]
    )

    with session_factory() as session:
        broken_successors = 0
        for mapping_id, original in original_versions.items():
            assert session.get(AssetMappingVersion, original.id).status == "draft"
            latest = session.scalar(
                select(AssetMappingVersion)
                .where(AssetMappingVersion.asset_mapping_id == mapping_id)
                .order_by(AssetMappingVersion.revision.desc())
                .limit(1)
            )
            if latest.id != original.id:
                assert latest.predecessor_version_id == original.id
                assert latest.status == "broken"
                broken_successors += 1
        assert broken_successors >= 4
        assert session.scalar(
            select(func.count())
            .select_from(PhysicalSchemaSnapshot)
            .where(PhysicalSchemaSnapshot.source_id == PHYSICAL_SOURCE_ID)
        ) == 2
