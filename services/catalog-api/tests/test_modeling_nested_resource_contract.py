from __future__ import annotations

import uuid

from daca_catalog.modeling_seed import (
    GENDER_CONCEPT_ID,
    MOBILITY_DOMAIN_ID,
    PERSONNEL_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.modeling_service import logical_write_from_payload
from daca_catalog.models import (
    AuditEvent,
    LogicalEntity,
    LogicalEntityVersion,
    LogicalField,
    LogicalFieldVersion,
    PhysicalColumn,
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


def test_nested_roots_version_monotonically_and_omissions_soft_retire(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)

    path = f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}"
    initial = client.get(path, headers=_headers("cinthya.thor"))
    assert initial.status_code == 200, initial.text
    initial_payload = initial.json()
    original_entity = initial_payload["entities"][0]
    original_field = original_entity["fields"][0]
    removed_original_field = original_entity["fields"][1]
    assert original_entity["originCatalogId"] == "urn:daca:catalog:bit-poc"
    assert original_entity["revision"] == 1
    assert len(original_entity["contentHash"]) == 64
    assert original_entity["lifecycle"] == "active"
    assert original_field["originCatalogId"] == "urn:daca:catalog:bit-poc"
    assert original_field["revision"] == 1
    assert len(original_field["contentHash"]) == 64
    assert original_field["lifecycle"] == "active"

    first_write = logical_write_from_payload(initial_payload).model_dump(
        mode="json", by_alias=True
    )
    first_write["entities"].append(
        {
            "name": "TemporaryEntity",
            "position": 1,
            "fields": [
                {
                    "name": "temporary_field",
                    "dataType": "string",
                    "position": 0,
                }
            ],
        }
    )
    added = client.put(
        f"{path}/versions/{initial_payload['versionId']}",
        json=first_write,
        headers=_headers("cinthya.thor", initial.headers["etag"]),
    )
    assert added.status_code == 200, added.text
    added_payload = added.json()
    assert added_payload["revision"] == 2
    assert added_payload["entities"][0]["revision"] == 2
    assert added_payload["entities"][0]["fields"][0]["revision"] == 2
    temporary_entity = next(
        item for item in added_payload["entities"] if item["name"] == "TemporaryEntity"
    )
    temporary_field = temporary_entity["fields"][0]
    assert temporary_entity["revision"] == 1
    assert temporary_field["revision"] == 1

    second_write = logical_write_from_payload(added_payload).model_dump(
        mode="json", by_alias=True
    )
    second_write["entities"] = [
        item for item in second_write["entities"] if item["id"] != temporary_entity["id"]
    ]
    second_write["entities"][0]["fields"] = [
        item
        for item in second_write["entities"][0]["fields"]
        if item["id"] != removed_original_field["id"]
    ]
    omitted = client.put(
        f"{path}/versions/{added_payload['versionId']}",
        json=second_write,
        headers=_headers("cinthya.thor", added.headers["etag"]),
    )
    assert omitted.status_code == 200, omitted.text
    omitted_payload = omitted.json()
    assert omitted_payload["revision"] == 3
    assert {item["id"] for item in omitted_payload["entities"]} == {
        original_entity["id"]
    }
    assert omitted_payload["entities"][0]["revision"] == 3
    assert len(omitted_payload["entities"][0]["fields"]) == 1
    assert omitted_payload["entities"][0]["fields"][0]["revision"] == 3

    with session_factory() as session:
        retired_entity = session.get(LogicalEntity, uuid.UUID(temporary_entity["id"]))
        retired_field = session.get(LogicalField, uuid.UUID(temporary_field["id"]))
        removed_field = session.get(
            LogicalField, uuid.UUID(removed_original_field["id"])
        )
        assert retired_entity is not None
        assert retired_entity.lifecycle == "retired"
        assert retired_entity.revision == 2
        assert retired_entity.retired_at is not None
        assert len(retired_entity.content_hash) == 64
        assert retired_field is not None
        assert retired_field.lifecycle == "retired"
        assert retired_field.revision == 2
        assert retired_field.retired_at is not None
        assert len(retired_field.content_hash) == 64
        assert removed_field is not None
        assert removed_field.lifecycle == "retired"
        assert removed_field.revision == 3
        assert removed_field.retired_at is not None
        assert session.scalar(
            select(func.count())
            .select_from(LogicalFieldVersion)
            .where(LogicalFieldVersion.logical_field_id == removed_field.id)
        ) == 2
        assert session.scalar(
            select(func.count())
            .select_from(LogicalEntityVersion)
            .where(LogicalEntityVersion.logical_entity_id == retired_entity.id)
        ) == 1
        assert session.scalar(
            select(func.count())
            .select_from(LogicalFieldVersion)
            .where(LogicalFieldVersion.logical_field_id == retired_field.id)
        ) == 1
        assert session.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(
                AuditEvent.resource_type.in_(["logical-entity", "logical-field"]),
                AuditEvent.action == "retired",
            )
        ) == 3


def test_derivation_round_trips_local_concepts_and_explicit_no_match(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        table = session.scalar(
            select(PhysicalTable)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .join(
                PhysicalSchemaSnapshot,
                PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id,
            )
            .where(PhysicalTable.name == "vehicle_inventory")
            .order_by(PhysicalSchemaSnapshot.sequence.desc())
            .limit(1)
        )
        assert table is not None
        columns = list(
            session.scalars(
                select(PhysicalColumn)
                .where(PhysicalColumn.physical_table_id == table.id)
                .order_by(PhysicalColumn.ordinal_position)
                .limit(2)
            )
        )
    assert len(columns) == 2

    fields = [
        {
            "physicalColumnId": str(columns[0].id),
            "name": columns[0].name,
            "dataType": columns[0].normalized_data_type,
            "conceptIds": [str(GENDER_CONCEPT_ID)],
            "primaryConceptId": str(GENDER_CONCEPT_ID),
        },
        {
            "physicalColumnId": str(columns[1].id),
            "name": columns[1].name,
            "dataType": columns[1].normalized_data_type,
            "conceptMatchExplicitlyNone": True,
        },
    ]
    body = {
        "title": "Ableitung mit Konzeptentscheid",
        "description": "Die Konzeptentscheidung wird im Preview und Commit erhalten.",
        "dataDomainId": str(MOBILITY_DOMAIN_ID),
        "dataOwnerUserId": "lawrence.hill",
        "deputyOwnerUserId": "hong.an.captain",
        "fields": fields,
    }
    preview = client.post(
        f"/api/v1/physical-tables/{table.id}/derivation-preview",
        json=body,
        headers=_headers("christian.man"),
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["fields"][0]["conceptIds"] == [str(GENDER_CONCEPT_ID)]
    assert preview.json()["fields"][0]["primaryConceptId"] == str(GENDER_CONCEPT_ID)
    assert preview.json()["fields"][1]["conceptMatchExplicitlyNone"] is True

    derived = client.post(
        f"/api/v1/physical-tables/{table.id}/derive-logical-model",
        json=body,
        headers=_headers("christian.man"),
    )
    assert derived.status_code == 201, derived.text
    logical_fields = derived.json()["entities"][0]["fields"]
    assert logical_fields[0]["conceptIds"] == [str(GENDER_CONCEPT_ID)]
    assert logical_fields[0]["primaryConceptId"] == str(GENDER_CONCEPT_ID)
    assert logical_fields[0]["conceptMatchExplicitlyNone"] is False
    assert logical_fields[1]["conceptIds"] == []
    assert logical_fields[1]["primaryConceptId"] is None
    assert logical_fields[1]["conceptMatchExplicitlyNone"] is True

    unknown = {**body, "fields": [{**fields[0], "conceptIds": [str(uuid.uuid4())]}]}
    unknown["fields"][0]["primaryConceptId"] = unknown["fields"][0]["conceptIds"][0]
    rejected = client.post(
        f"/api/v1/physical-tables/{table.id}/derivation-preview",
        json=unknown,
        headers=_headers("christian.man"),
    )
    assert rejected.status_code == 422

    contradictory = {
        **body,
        "fields": [{**fields[0], "conceptMatchExplicitlyNone": True}],
    }
    rejected = client.post(
        f"/api/v1/physical-tables/{table.id}/derivation-preview",
        json=contradictory,
        headers=_headers("christian.man"),
    )
    assert rejected.status_code == 422
