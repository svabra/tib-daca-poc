from __future__ import annotations

import uuid
from copy import deepcopy

from daca_catalog.domain_glossary_seed import MOBILITY_DOMAIN_ID
from daca_catalog.modeling_seed import (
    MODELING_ORGANIZATION_ID,
    PERSONNEL_DOMAIN_ID,
    PERSONNEL_MODEL_ID,
    PHYSICAL_SOURCE_ID,
    VIBDBU_PHYSICAL_SOURCE_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import (
    AssetMapping,
    AssetMappingVersion,
    DcatDatasetVersion,
    LogicalModel,
    LogicalModelVersion,
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


def test_synthetic_real_estate_source_is_readable_across_modeling_scopes(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)

    sources = client.get("/api/v1/physical-sources", headers=_headers("christian.spider"))
    assert sources.status_code == 200
    matching = [item for item in sources.json()["items"] if item["id"] == str(VIBDBU_PHYSICAL_SOURCE_ID)]
    assert len(matching) == 1
    assert matching[0]["name"] == "SAP VIBDBU Gebäudebestand"

    snapshots = client.get(
        f"/api/v1/physical-snapshots?sourceId={VIBDBU_PHYSICAL_SOURCE_ID}",
        headers=_headers("christian.spider"),
    )
    assert snapshots.status_code == 200
    assert snapshots.json()["total"] >= 1
    snapshot_id = snapshots.json()["items"][0]["id"]
    assert client.get(
        f"/api/v1/physical-snapshots/{snapshot_id}", headers=_headers("christian.spider")
    ).status_code == 200
    assert client.post(
        f"/api/v1/physical-sources/{VIBDBU_PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "baseline"}, headers=_headers("sibilla.micheli", '"1"'),
    ).status_code == 403


def test_defence_editors_can_derive_real_estate_models_with_scoped_roles(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_modeling_catalog(session)
        table_id = session.scalar(
            select(PhysicalTable.id)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .join(PhysicalSchemaSnapshot, PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id)
            .where(
                PhysicalSchemaSnapshot.source_id == VIBDBU_PHYSICAL_SOURCE_ID,
                PhysicalTable.name == "VIBDBU",
            )
        )
    assert table_id is not None
    personas = client.get("/api/v1/modeling/personas").json()
    for actor in ("christian.spider", "christian.man"):
        assert len([
            item for item in personas
            if item["userId"] == actor
            and item["organizationId"] == "vbs-armasuisse-immobilien"
            and item["role"] == "data_steward"
            and item["primaryOrganizationId"] == MODELING_ORGANIZATION_ID
        ]) == 1
        response = client.post(
            f"/api/v1/physical-tables/{table_id}/quick-derive-logical-model",
            json={}, headers=_headers(actor),
        )
        assert response.status_code == 201, response.text
        assert response.json()["organizationId"] == "vbs-armasuisse-immobilien"
    denied = client.post(
        f"/api/v1/physical-tables/{table_id}/quick-derive-logical-model",
        json={}, headers=_headers("sibilla.micheli"),
    )
    assert denied.status_code == 403


def test_personal_preferences_are_validated_and_scoped_to_demo_user(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
    path = "/api/v1/me/preferences/language"
    saved = client.put(path, json={"value": "fr"}, headers=_headers("christian.spider"))
    assert saved.status_code == 200
    assert client.get(path, headers=_headers("christian.spider")).json() == {"value": "fr"}
    assert client.get(path, headers=_headers("cinthya.thor")).json() == {"value": "de"}
    assert client.put(path, json={"value": "invalid"}, headers=_headers("christian.spider")).status_code == 422


def test_local_preview_session_uses_revocable_httponly_cookie(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
    assert client.get("/api/v1/session").status_code == 401
    login = client.post("/api/v1/session/login", json={"userId": "christian.spider"})
    assert login.status_code == 200
    assert login.json() == {"userId": "christian.spider"}
    assert "httponly" in login.headers["set-cookie"].lower()
    assert client.get("/api/v1/session").json() == {"userId": "christian.spider"}
    assert client.put(
        "/api/v1/me/preferences/theme", json={"value": "dark"},
        headers=_headers("cinthya.thor"),
    ).status_code == 200
    assert client.get("/api/v1/me/preferences/theme").json() == {"value": "dark"}
    assert client.post("/api/v1/session/logout").status_code == 200
    assert client.get("/api/v1/session").status_code == 401
    assert client.get(
        "/api/v1/me/preferences/theme", headers=_headers("cinthya.thor")
    ).json() == {"value": "light"}


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

    owner_tasks = client.get("/api/v1/tasks/mine", headers=_headers("christian.spider"))
    deputy_tasks = client.get("/api/v1/tasks/mine", headers=_headers("sibilla.micheli"))
    assert owner_tasks.status_code == 200
    assert any(
        task["taskType"] == "logical_model_review"
        and task["logicalModelReviewId"] == review_id
        for task in owner_tasks.json()
    )
    assert not any(task["taskType"] == "logical_model_review" for task in deputy_tasks.json())

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


def test_full_derivation_contract_atomically_creates_the_model_and_pinned_mappings(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
    table_id = _vehicle_table_id(session_factory)
    preview = client.post(
        f"/api/v1/physical-tables/{table_id}/derivation-preview",
        json={
            "title": "Fahrzeugbestand aus Snapshot",
            "description": "Vollständiger Formularvertrag für die physische Ableitung.",
            "dataDomainId": str(PERSONNEL_DOMAIN_ID),
            "dataOwnerUserId": "christian.spider",
            "deputyOwnerUserId": "sibilla.micheli",
        },
        headers=_headers("christian.man"),
    ).json()
    source_fields = preview["fields"][:2]
    logical_fields = []
    bindings = []
    for index, source_field in enumerate(source_fields):
        logical_name = "fahrzeug_identifier" if index == 0 else source_field["name"]
        logical_fields.append(
            {
                "name": logical_name,
                "dataType": source_field["dataType"],
                "length": source_field["length"],
                "precision": source_field["precision"],
                "decimalPlaces": source_field["scale"],
                "shortDescription": f"Aus {source_field['name']} übernommen.",
                "comment": "Technische Herkunft bleibt sichtbar.",
                "sourceSystem": "VBS PostgreSQL Metadaten (Fixture)",
                "classification": "internal",
                "nullable": source_field["nullable"],
                "minCount": source_field["minCount"],
                "maxCount": source_field["maxCount"],
                "position": index + 1,
                "conceptIds": [],
                "primaryConceptId": None,
                "valueListConceptId": None,
                "conceptMatchExplicitlyNone": True,
            }
        )
        bindings.append(
            {
                "physicalColumnId": source_field["physicalColumnId"],
                "entityName": "vehicle_inventory",
                "logicalFieldName": logical_name,
            }
        )
    request = {
        "logicalModel": {
            "identifiers": [f"derived:contract:{uuid.uuid4()}"],
            "localizations": [
                {
                    "language": "de",
                    "title": "Fahrzeugbestand aus Snapshot",
                    "description": "Fachlich bearbeiteter vollständiger Formularvertrag.",
                }
            ],
            "dataOwnerUserId": "christian.spider",
            "deputyOwnerUserId": "sibilla.micheli",
            "creator": {
                "type": "InternalOrganisation",
                "organizationId": MODELING_ORGANIZATION_ID,
                "englishName": "Defence",
            },
            "dataDomainId": str(PERSONNEL_DOMAIN_ID),
            "organizationUnitId": MODELING_ORGANIZATION_ID,
            "dataClassification": "internal",
            "dateCreated": "2026-09-22",
            "contactPoints": [{"name": "Christian Man", "email": "christian.man@vtg.admin.ch"}],
            "publisher": {
                "name": "Verteidigung",
                "identifier": MODELING_ORGANIZATION_ID,
                "uri": f"urn:daca:organization:{MODELING_ORGANIZATION_ID}",
            },
            "accessRights": "urn:daca:access-rights:internal",
            "entities": [
                {
                    "name": "vehicle_inventory",
                    "businessObject": "Fahrzeug",
                    "position": 1,
                    "fields": logical_fields,
                }
            ],
        },
        "fieldMappings": bindings,
    }

    committed = client.post(
        f"/api/v1/physical-tables/{table_id}/derive-logical-model",
        json=request,
        headers=_headers("christian.man"),
    )

    assert committed.status_code == 201, committed.text
    assert committed.headers["etag"] == '"1"'
    payload = committed.json()
    assert [field["name"] for field in payload["entities"][0]["fields"]] == [
        "fahrzeug_identifier",
        source_fields[1]["name"],
    ]
    with session_factory() as session:
        mappings = list(
            session.scalars(
                select(AssetMapping).where(
                    AssetMapping.logical_model_id == uuid.UUID(payload["id"])
                )
            )
        )
        versions = [
            session.scalar(
                select(AssetMappingVersion).where(
                    AssetMappingVersion.asset_mapping_id == mapping.id
                )
            )
            for mapping in mappings
        ]
        assert len(versions) == 2
        assert {version.mapping_type for version in versions} == {"Direct", "Renamed"}
        assert all(version.status == "draft" for version in versions)
        assert all(version.responsible_user_id == "christian.man" for version in versions)
        assert all(str(version.physical_snapshot_id) == preview["snapshotId"] for version in versions)

        foreign_column_id = session.scalar(
            select(PhysicalColumn.id)
            .join(PhysicalTable, PhysicalTable.id == PhysicalColumn.physical_table_id)
            .where(PhysicalTable.name == "org_unit")
            .limit(1)
        )
        model_count = session.scalar(select(func.count()).select_from(LogicalModel))

    invalid_column = deepcopy(request)
    invalid_column["logicalModel"]["identifiers"] = [f"derived:foreign:{uuid.uuid4()}"]
    invalid_column["fieldMappings"][0]["physicalColumnId"] = str(foreign_column_id)
    rejected = client.post(
        f"/api/v1/physical-tables/{table_id}/derive-logical-model",
        json=invalid_column,
        headers=_headers("christian.man"),
    )
    assert rejected.status_code == 422
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(LogicalModel)) == model_count

    duplicate_binding = deepcopy(request)
    duplicate_binding["logicalModel"]["identifiers"] = [f"derived:duplicate:{uuid.uuid4()}"]
    duplicate_binding["fieldMappings"].append(duplicate_binding["fieldMappings"][0])
    duplicate = client.post(
        f"/api/v1/physical-tables/{table_id}/derive-logical-model",
        json=duplicate_binding,
        headers=_headers("christian.man"),
    )
    assert duplicate.status_code == 422

    scope_violation = deepcopy(request)
    scope_violation["logicalModel"]["identifiers"] = [f"derived:scope:{uuid.uuid4()}"]
    scope_violation["logicalModel"]["organizationUnitId"] = "vbs-armasuisse-immobilien"
    scope_violation["logicalModel"]["organizationId"] = "vbs-armasuisse-immobilien"
    rejected_scope = client.post(
        f"/api/v1/physical-tables/{table_id}/derive-logical-model",
        json=scope_violation,
        headers=_headers("christian.man"),
    )
    assert rejected_scope.status_code == 422


def test_quick_derivation_creates_exact_mappings_and_is_idempotent(
    client, session_factory
) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)
    table_id = _vehicle_table_id(session_factory)

    created = client.post(
        f"/api/v1/physical-tables/{table_id}/quick-derive-logical-model",
        json={},
        headers=_headers("christian.man"),
    )

    assert created.status_code == 201, created.text
    payload = created.json()
    assert payload["localizations"][0]["title"] == "Vehicle Inventory"
    assert len(payload["entities"][0]["fields"]) == 5
    assert all(
        field["conceptMatchExplicitlyNone"]
        for field in payload["entities"][0]["fields"]
    )
    with session_factory() as session:
        mappings = list(
            session.scalars(
                select(AssetMapping).where(
                    AssetMapping.logical_model_id == uuid.UUID(payload["id"])
                )
            )
        )
        assert len(mappings) == 5
        versions = [
            session.scalar(
                select(AssetMappingVersion).where(
                    AssetMappingVersion.asset_mapping_id == mapping.id
                )
            )
            for mapping in mappings
        ]
        assert {version.mapping_type for version in versions} == {"Direct"}

    repeated = client.post(
        f"/api/v1/physical-tables/{table_id}/quick-derive-logical-model",
        json={},
        headers=_headers("christian.man"),
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == payload["id"]
    with session_factory() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(AssetMapping)
                .where(AssetMapping.logical_model_id == uuid.UUID(payload["id"]))
            )
            == 5
        )


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
