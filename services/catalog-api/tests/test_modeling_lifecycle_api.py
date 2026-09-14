from __future__ import annotations

import uuid
from collections.abc import Iterator
from dataclasses import dataclass

import pytest
from daca_catalog.main import create_app
from daca_catalog.modeling_core import canonical_hash
from daca_catalog.modeling_lifecycle_api import create_modeling_lifecycle_router
from daca_catalog.models import (
    AdministrativeOrganization,
    AssetMapping,
    AssetMappingVersion,
    AuditEvent,
    DataModelRoleAssignment,
    DcatDataset,
    DcatDatasetVersion,
    DemoUser,
    Domain,
    LogicalModel,
    LogicalModelVersion,
    PhysicalDriftChange,
    PhysicalSource,
)
from daca_catalog.settings import Settings
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

OWNER = "qa.lifecycle.owner"
DEPUTY = "qa.lifecycle.deputy"
STEWARD = "qa.lifecycle.steward"
ORGANIZATION = "qa-vbs-verteidigung"


@dataclass(frozen=True)
class LifecycleApi:
    client: TestClient
    session_factory: sessionmaker[Session]
    domain_id: uuid.UUID


def _seed_scope(factory: sessionmaker[Session]) -> uuid.UUID:
    domain_id = uuid.uuid5(uuid.NAMESPACE_URL, "urn:daca:qa:lifecycle-domain")
    with factory() as session:
        session.add(
            AdministrativeOrganization(
                id=ORGANIZATION,
                department_code="VBS",
                office_code="QA-DEF",
                display_name="Verteidigung QA",
                organization_type="office",
                department_order=50,
                office_order=1,
                active=True,
            )
        )
        for user_id, name, role in (
            (OWNER, "QA Data Owner", "data_owner"),
            (DEPUTY, "QA Deputy Data Owner", "deputy_data_owner"),
            (STEWARD, "QA Data Steward", "data_steward"),
        ):
            session.add(
                DemoUser(
                    id=user_id,
                    display_name=name,
                    organization="VBS / Verteidigung",
                    email=f"{user_id}@example.test",
                    roles=[role],
                    selectable=True,
                    active=True,
                )
            )
        session.flush()
        session.add_all(
            [
                DataModelRoleAssignment(
                    id=uuid.uuid4(),
                    user_id=OWNER,
                    department_code="VBS",
                    organization_id=ORGANIZATION,
                    role="data_owner",
                    active=True,
                ),
                DataModelRoleAssignment(
                    id=uuid.uuid4(),
                    user_id=DEPUTY,
                    department_code="VBS",
                    organization_id=ORGANIZATION,
                    role="deputy_data_owner",
                    delegated_owner_user_id=OWNER,
                    active=True,
                ),
                DataModelRoleAssignment(
                    id=uuid.uuid4(),
                    user_id=STEWARD,
                    department_code="VBS",
                    organization_id=ORGANIZATION,
                    role="data_steward",
                    active=True,
                ),
            ]
        )
        session.add(
            Domain(
                id=domain_id,
                urn=f"urn:daca:domain:{domain_id}",
                origin_catalog_id="urn:daca:catalog:bit-poc",
                revision=1,
                content_hash=canonical_hash({"name": "QA Personal"}),
                lifecycle="active",
                owner_user_id=OWNER,
                deputy_owner_user_id=DEPUTY,
            )
        )
        session.commit()
    return domain_id


@pytest.fixture
def lifecycle_api(session_factory: sessionmaker[Session]) -> Iterator[LifecycleApi]:
    domain_id = _seed_scope(session_factory)
    settings = Settings(
        database_url="sqlite+pysqlite://",
        cors_origins=["http://testserver"],
        daca_demo_auth=True,
        sample_policy_projection_url=None,
        internal_token="test-internal-token",
    )
    app = create_app(settings=settings, session_factory=session_factory, i14y_client=_NoopI14y())
    # Root integrates this router later. Keep the test valid before and after that integration.
    retire_path = "/api/v1/logical-models/{model_id}/versions/{version_id}/retire"
    if not any(getattr(route, "path", None) == retire_path for route in app.routes):
        app.include_router(create_modeling_lifecycle_router())
    with TestClient(app) as client:
        yield LifecycleApi(client=client, session_factory=session_factory, domain_id=domain_id)


class _NoopI14y:
    base_url = "https://api.test/public/v1/"


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def _source_body(*, name: str = "Lifecycle fixture") -> dict[str, object]:
    return {
        "name": name,
        "description": "Serverseitige, synthetische Metadatenquelle.",
        "adapterType": "fixture",
        "configRef": "fixture.baseline",
        "departmentCode": "VBS",
        "organizationId": ORGANIZATION,
    }


def _logical_body(domain_id: uuid.UUID) -> dict[str, object]:
    return {
        "identifiers": ["qa-logical-lifecycle"],
        "localizations": [
            {
                "language": "de",
                "title": "Unabhängiges Personalmodell",
                "description": "Logisches Modell ohne Distribution und physische Abhängigkeit.",
            }
        ],
        "dataOwnerUserId": OWNER,
        "deputyOwnerUserId": DEPUTY,
        "creator": {"type": "InternalOrganisation", "organizationId": ORGANIZATION, "englishName": "Defence"},
        "dataDomainId": str(domain_id),
        "departmentCode": "VBS",
        "organizationId": ORGANIZATION,
        "dataClassification": "internal",
        "dateCreated": "2026-09-07",
        "contactPoints": [{"name": "Data Office", "uri": "https://example.test/contact"}],
        "publisher": {
            "name": "Verteidigung",
            "identifier": ORGANIZATION,
            "uri": f"urn:daca:organization:{ORGANIZATION}",
        },
        "accessRights": "urn:daca:access-rights:internal",
        "themes": ["http://publications.europa.eu/resource/authority/data-theme/GOVE"],
        "conceptIds": [],
        "entities": [
            {
                "name": "person",
                "businessObject": "Person",
                "position": 0,
                "fields": [
                    {
                        "name": "person_id",
                        "businessObject": "Person",
                        "dataType": "uuid",
                        "classification": "internal",
                        "nullable": False,
                        "minCount": 1,
                        "maxCount": 1,
                        "position": 0,
                        "conceptIds": [],
                    }
                ],
            }
        ],
        "distributions": [],
        "dataServices": [],
    }


def _create_source(api: LifecycleApi) -> dict[str, object]:
    response = api.client.post(
        "/api/v1/physical-sources",
        headers=_headers(STEWARD),
        json=_source_body(),
    )
    assert response.status_code == 201, response.text
    assert response.headers["etag"] == '"1"'
    return response.json()


def _create_logical(api: LifecycleApi) -> dict[str, object]:
    response = api.client.post(
        "/api/v1/logical-models",
        headers=_headers(STEWARD),
        json=_logical_body(api.domain_id),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _import_source(api: LifecycleApi, source: dict[str, object], variant: str) -> tuple[dict, str]:
    response = api.client.post(
        f"/api/v1/physical-sources/{source['id']}/imports",
        headers=_headers(STEWARD, f'"{source["revision"]}"'),
        json={"fixtureVariant": variant},
    )
    assert response.status_code == 200, response.text
    source["revision"] = int(response.headers["etag"].strip('"'))
    return response.json(), response.headers["etag"]


def test_physical_source_create_update_retire_is_scoped_versioned_and_has_no_dsn(
    lifecycle_api: LifecycleApi,
):
    rejected = lifecycle_api.client.post(
        "/api/v1/physical-sources",
        headers=_headers(STEWARD),
        json={**_source_body(), "dsn": "postgresql://user:password@db/secret"},
    )
    assert rejected.status_code == 422

    source = _create_source(lifecycle_api)
    path = f"/api/v1/physical-sources/{source['id']}"
    assert lifecycle_api.client.put(path, headers=_headers(STEWARD), json=_source_body()).status_code == 428
    assert lifecycle_api.client.put(
        path, headers=_headers(STEWARD, '"99"'), json=_source_body()
    ).status_code == 412
    updated = lifecycle_api.client.put(
        path,
        headers=_headers(STEWARD, '"1"'),
        json=_source_body(name="Renamed lifecycle fixture"),
    )
    assert updated.status_code == 200, updated.text
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["revision"] == 2
    assert lifecycle_api.client.post(
        f"{path}/retire", headers=_headers(STEWARD, '"2"')
    ).status_code == 403

    retired = lifecycle_api.client.post(
        f"{path}/retire", headers=_headers(OWNER, '"2"')
    )
    assert retired.status_code == 200, retired.text
    assert retired.headers["etag"] == '"3"'
    assert retired.json()["lifecycle"] == "retired"
    assert lifecycle_api.client.delete(path, headers=_headers(OWNER)).status_code == 405

    with lifecycle_api.session_factory() as session:
        row = session.get(PhysicalSource, uuid.UUID(str(source["id"])))
        assert row is not None and row.retired_at is not None and row.config_ref == "fixture.baseline"
        assert list(
            session.scalars(
                select(AuditEvent.action)
                .where(AuditEvent.resource_type == "physical-source")
                .order_by(AuditEvent.revision)
            )
        ) == ["created", "updated", "retired"]


def test_logical_model_retire_creates_immutable_successor_and_owner_tombstones(
    lifecycle_api: LifecycleApi,
):
    logical = _create_logical(lifecycle_api)
    draft_path = (
        f"/api/v1/logical-models/{logical['id']}/versions/{logical['versionId']}/retire"
    )
    assert lifecycle_api.client.post(draft_path, headers=_headers(STEWARD, '"1"')).status_code == 403
    assert lifecycle_api.client.post(draft_path, headers=_headers(OWNER)).status_code == 428
    assert lifecycle_api.client.post(
        draft_path, headers=_headers(OWNER, '"1"')
    ).status_code == 409

    submitted = lifecycle_api.client.post(
        f"/api/v1/logical-models/{logical['id']}/versions/{logical['versionId']}/submit",
        headers=_headers(STEWARD, '"1"'),
    )
    assert submitted.status_code == 200, submitted.text
    submitted_payload = submitted.json()
    published = lifecycle_api.client.post(
        f"/api/v1/logical-model-reviews/{submitted_payload['reviewId']}/decision",
        json={"decision": "accept"},
        headers=_headers(OWNER, submitted.headers["etag"]),
    )
    assert published.status_code == 200, published.text
    published_payload = published.json()
    path = (
        f"/api/v1/logical-models/{logical['id']}/versions/"
        f"{published_payload['versionId']}/retire"
    )

    retired = lifecycle_api.client.post(path, headers=_headers(OWNER, '"1"'))
    assert retired.status_code == 200, retired.text
    payload = retired.json()
    assert payload["status"] == "retired"
    assert payload["lifecycle"] == "retired"
    assert payload["revision"] == 4
    assert payload["predecessorVersionId"] == published_payload["versionId"]
    assert payload["distributions"] == []

    with lifecycle_api.session_factory() as session:
        root = session.get(LogicalModel, uuid.UUID(str(logical["id"])))
        original = session.get(LogicalModelVersion, uuid.UUID(str(logical["versionId"])))
        # Lookup through the version because datasetVersionId is deliberately not the dataset root.
        dataset_version = session.get(DcatDatasetVersion, uuid.UUID(str(payload["datasetVersionId"])))
        assert root is not None and root.retired_at is not None
        assert original is not None and original.status == "draft"
        assert dataset_version is not None
        dataset = session.get(DcatDataset, dataset_version.dataset_id)
        assert dataset is not None and dataset.lifecycle == "retired" and dataset.retired_at is not None
        assert session.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(
                AuditEvent.resource_type == "logical-model",
                AuditEvent.resource_id == str(logical["id"]),
                AuditEvent.action == "retired",
            )
        ) == 1


def test_mapping_supersede_and_retire_append_versions_and_preserve_many_to_many_refs(
    lifecycle_api: LifecycleApi,
):
    source = _create_source(lifecycle_api)
    snapshot, _etag = _import_source(lifecycle_api, source, "baseline")
    logical = _create_logical(lifecycle_api)
    vehicle = next(
        table
        for database in snapshot["databases"]
        for schema in database["schemas"]
        for table in schema["tables"]
        if table["stableKey"] == "logistics_db.logistics.vehicle_inventory"
    )
    physical_ids = [vehicle["columns"][0]["id"], vehicle["columns"][1]["id"]]
    field_id = logical["entities"][0]["fields"][0]["fieldVersionId"]
    created = lifecycle_api.client.post(
        "/api/v1/asset-mappings",
        headers=_headers(STEWARD),
        json={
            "logicalModelVersionId": logical["versionId"],
            "physicalSnapshotId": snapshot["snapshot"]["id"],
            "mappingType": "Transformed",
            "classification": "confidential",
            "transformationRule": "coalesce(vehicle_id::text, vehicle_type_code)",
            "comment": "Zwei physische Repräsentationen.",
            "responsibleUserId": STEWARD,
            "validFrom": "2026-09-07",
            "logicalFieldVersionIds": [field_id],
            "physicalColumnIds": physical_ids,
        },
    )
    assert created.status_code == 201, created.text
    first = created.json()
    superseded = lifecycle_api.client.post(
        f"/api/v1/asset-mappings/{first['id']}/versions/{first['versionId']}/supersede",
        headers=_headers(STEWARD, '"1"'),
    )
    assert superseded.status_code == 200, superseded.text
    second = superseded.json()
    assert second["status"] == "superseded"
    assert second["classification"] == "confidential"
    assert second["revision"] == 2
    assert second["predecessorVersionId"] == first["versionId"]
    assert second["physicalColumnIds"] == physical_ids
    assert lifecycle_api.client.post(
        f"/api/v1/asset-mappings/{first['id']}/versions/{second['versionId']}/retire",
        headers=_headers(STEWARD, '"1"'),
    ).status_code == 403

    retired = lifecycle_api.client.post(
        f"/api/v1/asset-mappings/{first['id']}/versions/{second['versionId']}/retire",
        headers=_headers(OWNER, '"1"'),
    )
    assert retired.status_code == 200, retired.text
    assert retired.json()["lifecycle"] == "retired"
    assert retired.json()["revision"] == 3
    assert retired.json()["classification"] == "confidential"

    with lifecycle_api.session_factory() as session:
        root = session.get(AssetMapping, uuid.UUID(first["id"]))
        original = session.get(AssetMappingVersion, uuid.UUID(first["versionId"]))
        assert root is not None and root.retired_at is not None
        assert original is not None and original.status == "draft"
        actions = list(
            session.scalars(
                select(AuditEvent.action).where(
                    AuditEvent.resource_type == "asset-mapping",
                    AuditEvent.resource_id == first["id"],
                )
            )
        )
        assert "superseded" in actions and "retired" in actions


def test_rename_candidate_review_is_explicit_scoped_idempotent_and_audited(
    lifecycle_api: LifecycleApi,
):
    source = _create_source(lifecycle_api)
    _baseline, _ = _import_source(lifecycle_api, source, "baseline")
    drift_snapshot, _ = _import_source(lifecycle_api, source, "drift")
    report = lifecycle_api.client.get(
        f"/api/v1/physical-snapshots/{drift_snapshot['snapshot']['id']}/drift",
        headers=_headers(STEWARD),
    )
    assert report.status_code == 200, report.text
    rename = next(
        change for change in report.json()["changes"] if change["changeType"] == "rename_candidate"
    )
    ordinary = next(
        change for change in report.json()["changes"] if change["changeType"] != "rename_candidate"
    )
    assert rename["reviewStatus"] == "pending"
    rename_detail = lifecycle_api.client.get(
        f"/api/v1/physical-drift-changes/{rename['id']}",
        headers=_headers(STEWARD),
    )
    assert rename_detail.status_code == 200
    assert rename_detail.headers["etag"] == '"1"'
    assert lifecycle_api.client.post(
        f"/api/v1/physical-drift-changes/{ordinary['id']}/review",
        headers=_headers(STEWARD, '"1"'),
        json={"decision": "accept"},
    ).status_code == 422

    path = f"/api/v1/physical-drift-changes/{rename['id']}/review"
    assert lifecycle_api.client.post(
        path, headers=_headers(STEWARD), json={"decision": "accept"}
    ).status_code == 428
    assert lifecycle_api.client.post(
        path, headers=_headers(STEWARD, '"99"'), json={"decision": "accept"}
    ).status_code == 412
    accepted = lifecycle_api.client.post(
        path,
        headers=_headers(STEWARD, '"1"'),
        json={"decision": "accept", "comment": "Heuristik fachlich geprüft."},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["reviewStatus"] == "accepted"
    assert accepted.headers["etag"] == '"2"'
    assert lifecycle_api.client.post(
        path, headers=_headers(STEWARD, '"2"'), json={"decision": "accept"}
    ).status_code == 200
    assert lifecycle_api.client.post(
        path, headers=_headers(STEWARD, '"2"'), json={"decision": "reject"}
    ).status_code == 409

    with lifecycle_api.session_factory() as session:
        row = session.get(PhysicalDriftChange, uuid.UUID(rename["id"]))
        assert row is not None and row.review_status == "accepted"
        assert session.scalar(
            select(func.count())
            .select_from(AuditEvent)
            .where(
                AuditEvent.resource_type == "physical-drift-change",
                AuditEvent.resource_id == rename["id"],
                AuditEvent.action == "accepted",
            )
        ) == 1
