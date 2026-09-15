from __future__ import annotations

import uuid
from collections.abc import Iterator
from copy import deepcopy
from dataclasses import dataclass

import pytest
from daca_catalog.main import create_app
from daca_catalog.modeling_resources_api import create_modeling_resources_router
from daca_catalog.modeling_seed import (
    MODELING_ORGANIZATION_ID,
    PERSONNEL_DOMAIN_ID,
    PERSONNEL_MODEL_ID,
    VEHICLE_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.modeling_service import logical_write_from_payload
from daca_catalog.models import (
    AssetMapping,
    AuditEvent,
    DcatDataService,
    DcatDataServiceVersion,
    DcatDataset,
    DcatDatasetVersion,
    DcatDistribution,
    DcatDistributionVersion,
    LogicalEntity,
    LogicalField,
    LogicalModel,
    LogicalModelIdentifierReservation,
    LogicalModelVersion,
)
from daca_catalog.rdf_metadata import parse_dcat_datasets
from daca_catalog.settings import Settings
from fastapi.testclient import TestClient
from rdflib import Graph, URIRef
from rdflib.namespace import DCAT, RDF
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker


@dataclass(frozen=True)
class ResourcesApi:
    client: TestClient
    session_factory: sessionmaker[Session]


class _NoopI14y:
    base_url = "https://api.test/public/v1/"


@pytest.fixture
def resources_api(session_factory: sessionmaker[Session]) -> Iterator[ResourcesApi]:
    with session_factory() as session:
        seed_modeling_catalog(session)
    settings = Settings(
        database_url="sqlite+pysqlite://",
        cors_origins=["http://testserver"],
        daca_demo_auth=True,
        sample_policy_projection_url=None,
        internal_token="test-internal-token",
    )
    app = create_app(
        settings=settings,
        session_factory=session_factory,
        i14y_client=_NoopI14y(),
    )
    path = "/api/v1/catalog-datasets/{dataset_id}/distributions"
    if not any(getattr(route, "path", None) == path for route in app.routes):
        app.include_router(create_modeling_resources_router())
    with TestClient(app) as client:
        yield ResourcesApi(client=client, session_factory=session_factory)


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def _dataset_id(factory: sessionmaker[Session], model_id: uuid.UUID) -> uuid.UUID:
    with factory() as session:
        model = session.get(LogicalModel, model_id)
        assert model is not None
        version = session.scalar(
            select(LogicalModelVersion)
            .where(LogicalModelVersion.logical_model_id == model.id)
            .order_by(LogicalModelVersion.revision.desc())
            .limit(1)
        )
        assert version is not None
        dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
        assert dataset_version is not None
        return dataset_version.dataset_id


def _logical_body(*, access_rights: str) -> dict[str, object]:
    return {
        "identifiers": [f"qa-readiness-{uuid.uuid4()}"],
        "localizations": [
            {
                "language": "de",
                "title": "Readiness-Prüfmodell",
                "description": "Prüft die DCAT-Pflichtfelder vor der Publikation.",
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
        "departmentCode": "VBS",
        "organizationId": MODELING_ORGANIZATION_ID,
        "dataClassification": "internal",
        "dateCreated": "2026-09-07",
        "contactPoints": [{"name": "Data Office", "email": "data-office@example.test"}],
        "publisher": {
            "name": "Verteidigung",
            "identifier": MODELING_ORGANIZATION_ID,
            "uri": f"urn:daca:organization:{MODELING_ORGANIZATION_ID}",
        },
        "accessRights": access_rights,
        "themes": [],
        "conceptIds": [],
        "entities": [
            {
                "name": "readiness_record",
                "position": 0,
                "fields": [
                    {
                        "name": "record_id",
                        "dataType": "xsd:integer",
                        "classification": "internal",
                        "nullable": False,
                        "minCount": 1,
                        "maxCount": 1,
                        "position": 0,
                    }
                ],
            }
        ],
        "distributions": [],
        "dataServices": [],
    }


def test_multiple_logical_models_persist_independently_and_domain_owns_responsibility(
    resources_api: ResourcesApi,
) -> None:
    first_body = _logical_body(access_rights="urn:daca:access-rights:internal")
    second_body = deepcopy(first_body)
    second_body["identifiers"] = [f"second-model-{uuid.uuid4()}"]
    second_body["dataOwnerUserId"] = "client-cannot-assign-owner"
    second_body["deputyOwnerUserId"] = None
    second_body["localizations"][0]["title"] = "Zweites unabhängiges Modell"

    first = resources_api.client.post(
        "/api/v1/logical-models", headers=_headers("cinthya.thor"), json=first_body
    )
    second = resources_api.client.post(
        "/api/v1/logical-models", headers=_headers("cinthya.thor"), json=second_body
    )
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert first.json()["id"] != second.json()["id"]
    assert second.json()["dataOwnerUserId"] == "christian.spider"
    assert second.json()["deputyOwnerUserId"] == "sibilla.micheli"

    revised_body = deepcopy(first_body)
    revised_body["localizations"][0]["description"] = "Gespeicherte zweite Entwurfsversion."
    revised = resources_api.client.put(
        f"/api/v1/logical-models/{first.json()['id']}/versions/{first.json()['versionId']}",
        headers=_headers("cinthya.thor", first.headers["etag"]),
        json=revised_body,
    )
    assert revised.status_code == 200, revised.text
    assert revised.json()["revision"] == 2
    assert revised.headers["etag"] == '"2"'

    with resources_api.session_factory() as session:
        ids = {uuid.UUID(first.json()["id"]), uuid.UUID(second.json()["id"])}
        assert session.scalar(
            select(func.count()).select_from(LogicalModel).where(LogicalModel.id.in_(ids))
        ) == 2
        assert session.scalar(
            select(func.count()).select_from(LogicalModelVersion).where(
                LogicalModelVersion.logical_model_id.in_(ids)
            )
        ) == 3
        entities = list(
            session.scalars(select(LogicalEntity).where(LogicalEntity.logical_model_id.in_(ids)))
        )
        assert len(entities) >= 2
        assert {entity.logical_model_id for entity in entities} == ids
        assert session.scalar(
            select(func.count()).select_from(LogicalField).where(
                LogicalField.logical_entity_id.in_({entity.id for entity in entities})
            )
        ) == len(entities)


def test_logical_model_identifier_is_case_insensitive_atomic_and_released_on_revision(
    resources_api: ResourcesApi,
) -> None:
    first_body = _logical_body(access_rights="urn:daca:access-rights:internal")
    first_body["identifiers"] = ["VBS_Identifier_Test"]
    first = resources_api.client.post(
        "/api/v1/logical-models", headers=_headers("cinthya.thor"), json=first_body
    )
    assert first.status_code == 201, first.text

    unavailable = resources_api.client.get(
        "/api/v1/logical-model-identifiers/availability",
        headers=_headers("cinthya.thor"),
        params={"identifier": "vbs_identifier_test"},
    )
    assert unavailable.status_code == 200
    assert unavailable.json() == {"available": False}

    duplicate_body = deepcopy(first_body)
    duplicate_body["identifiers"] = ["vBs_iDeNtIfIeR_tEsT"]
    duplicate = resources_api.client.post(
        "/api/v1/logical-models", headers=_headers("cinthya.thor"), json=duplicate_body
    )
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.headers["content-type"].startswith("application/problem+json")
    assert duplicate.json()["errorCode"] == "DACA-LM-IDENTIFIER-DUPLICATE"
    assert duplicate.json()["errors"] == [{
        "location": "body.identifiers.0",
        "message": "Dieser Identifier ist bereits vergeben.",
        "type": "unique",
    }]
    assert "INSERT" not in duplicate.json()["detail"]

    revised_body = deepcopy(first_body)
    revised_body["identifiers"] = ["VBS_Identifier_Neu"]
    revised = resources_api.client.put(
        f"/api/v1/logical-models/{first.json()['id']}/versions/{first.json()['versionId']}",
        headers=_headers("cinthya.thor", first.headers["etag"]),
        json=revised_body,
    )
    assert revised.status_code == 200, revised.text
    assert revised.headers["etag"] == '"2"'
    old_identifier = resources_api.client.get(
        "/api/v1/logical-model-identifiers/availability",
        headers=_headers("cinthya.thor"),
        params={"identifier": "VBS_Identifier_Test"},
    )
    assert old_identifier.json() == {"available": True}
    current_identifier = resources_api.client.get(
        "/api/v1/logical-model-identifiers/availability",
        headers=_headers("cinthya.thor"),
        params={"identifier": "VBS_Identifier_Neu"},
    )
    assert current_identifier.json() == {"available": False}

    with resources_api.session_factory() as session:
        reservation = session.get(LogicalModelIdentifierReservation, uuid.UUID(first.json()["id"]))
        assert reservation is not None
        assert reservation.identifier == "VBS_Identifier_Neu"
        assert reservation.normalized_identifier == "vbs_identifier_neu"


def test_dataset_resources_append_immutable_versions_and_preserve_other_aggregates(
    resources_api: ResourcesApi,
) -> None:
    dataset_id = _dataset_id(resources_api.session_factory, PERSONNEL_MODEL_ID)
    distributions_path = f"/api/v1/catalog-datasets/{dataset_id}/distributions"
    services_path = f"/api/v1/catalog-datasets/{dataset_id}/data-services"

    initial = resources_api.client.get(
        distributions_path,
        headers=_headers("cinthya.thor"),
    )
    assert initial.status_code == 200, initial.text
    assert initial.headers["etag"] == '"1"'
    assert initial.json()["items"] == []
    assert (
        resources_api.client.post(
            services_path,
            headers=_headers("cinthya.thor"),
            json={"endpointUrl": "https://example.test/api"},
        ).status_code
        == 428
    )
    assert (
        resources_api.client.post(
            services_path,
            headers=_headers("cinthya.thor", '"99"'),
            json={"endpointUrl": "https://example.test/api"},
        ).status_code
        == 412
    )

    service = resources_api.client.post(
        services_path,
        headers=_headers("cinthya.thor", '"1"'),
        json={
            "title": {"de": "Personal-API"},
            "endpointUrl": "https://example.test/api",
            "endpointDescription": "https://example.test/openapi.json",
        },
    )
    assert service.status_code == 201, service.text
    assert service.headers["etag"] == '"2"'
    assert service.json()["total"] == 1

    stale = resources_api.client.post(
        distributions_path,
        headers=_headers("cinthya.thor", '"1"'),
        json={"accessUrl": "https://example.test/data"},
    )
    assert stale.status_code == 412
    distribution = resources_api.client.post(
        distributions_path,
        headers=_headers("cinthya.thor", '"2"'),
        json={
            "title": {"de": "Personal JSON"},
            "accessUrl": "https://example.test/data",
            "downloadUrl": "https://example.test/data.json",
            "mediaType": "application/json",
        },
    )
    assert distribution.status_code == 201, distribution.text
    assert distribution.headers["etag"] == '"3"'
    assert distribution.json()["total"] == 1
    latest_service = resources_api.client.get(
        services_path,
        headers=_headers("cinthya.thor"),
    ).json()["items"][0]
    original_service = service.json()["items"][0]
    assert latest_service["id"] == original_service["id"]
    assert latest_service["endpointUrl"] == original_service["endpointUrl"]
    assert latest_service["versionId"] != original_service["versionId"]
    assert latest_service["revision"] == original_service["revision"] + 1
    assert len(latest_service["contentHash"]) == 64
    assert (
        resources_api.client.delete(
            distributions_path,
            headers=_headers("christian.spider", '"3"'),
        ).status_code
        == 405
    )

    with resources_api.session_factory() as session:
        versions = list(
            session.scalars(
                select(LogicalModelVersion)
                .where(LogicalModelVersion.logical_model_id == PERSONNEL_MODEL_ID)
                .order_by(LogicalModelVersion.revision)
            )
        )
        assert [row.revision for row in versions] == [1, 2, 3]
        assert versions[1].predecessor_version_id == versions[0].id
        assert versions[2].predecessor_version_id == versions[1].id
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(
                    AuditEvent.resource_type == "logical-model",
                    AuditEvent.resource_id == str(PERSONNEL_MODEL_ID),
                    AuditEvent.action.in_(["data-service-added", "distribution-added"]),
                )
            )
            == 2
        )


def test_logical_model_collection_contains_identifiers_dates_and_derived_field_count(
    resources_api: ResourcesApi,
) -> None:
    response = resources_api.client.get(
        "/api/v1/logical-models",
        headers=_headers("christian.man"),
    )

    assert response.status_code == 200, response.text
    vehicle = next(
        item for item in response.json()["items"] if item["id"] == str(VEHICLE_MODEL_ID)
    )
    assert vehicle["identifiers"] == ["VBS-FAHRZEUGBESTAND-001"]
    assert vehicle["fieldCount"] == 5
    assert vehicle["dateCreated"] == "2026-09-07"
    assert vehicle["createdAt"]


def test_nested_dcat_resources_have_stable_roots_versions_and_soft_retirement(
    resources_api: ResourcesApi,
) -> None:
    dataset_id = _dataset_id(resources_api.session_factory, PERSONNEL_MODEL_ID)
    services_path = f"/api/v1/catalog-datasets/{dataset_id}/data-services"
    distributions_path = f"/api/v1/catalog-datasets/{dataset_id}/distributions"

    service_response = resources_api.client.post(
        services_path,
        headers=_headers("cinthya.thor", '"1"'),
        json={"title": {"de": "Personal-API"}, "endpointUrl": "https://example.test/api"},
    )
    assert service_response.status_code == 201, service_response.text
    service = service_response.json()["items"][0]
    assert service["urn"].startswith("urn:daca:dataset:")
    assert service["originCatalogId"] == "urn:daca:catalog:bit-poc"
    assert service["revision"] == 1
    assert service["lifecycle"] == "active"
    assert len(service["contentHash"]) == 64

    distribution_response = resources_api.client.post(
        distributions_path,
        headers=_headers("cinthya.thor", '"2"'),
        json={"title": {"de": "Personal JSON"}, "accessUrl": "https://example.test/data"},
    )
    assert distribution_response.status_code == 201, distribution_response.text
    distribution = distribution_response.json()["items"][0]
    assert distribution["revision"] == 1
    logical = resources_api.client.get(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}",
        headers=_headers("cinthya.thor"),
    ).json()
    body = logical_write_from_payload(logical).model_dump(mode="json", by_alias=True)
    body["dataServices"] = []
    body["distributions"] = []
    retired = resources_api.client.put(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/{logical['versionId']}",
        headers=_headers("cinthya.thor", f'"{logical["lockVersion"]}"'),
        json=body,
    )
    assert retired.status_code == 200, retired.text
    assert retired.json()["dataServices"] == []
    assert retired.json()["distributions"] == []

    with resources_api.session_factory() as session:
        service_root = session.get(DcatDataService, uuid.UUID(service["id"]))
        distribution_root = session.get(DcatDistribution, uuid.UUID(distribution["id"]))
        assert service_root is not None and service_root.lifecycle == "retired"
        assert distribution_root is not None and distribution_root.lifecycle == "retired"
        assert service_root.retired_at is not None
        assert distribution_root.retired_at is not None
        assert (
            session.scalar(
                select(func.count())
                .select_from(DcatDataServiceVersion)
                .where(DcatDataServiceVersion.data_service_id == service_root.id)
            )
            == 2
        )
        assert (
            session.scalar(
                select(func.count())
                .select_from(DcatDistributionVersion)
                .where(DcatDistributionVersion.distribution_id == distribution_root.id)
            )
            == 1
        )


def test_readiness_is_split_and_dcat_export_contains_real_data_service_graph(
    resources_api: ResourcesApi,
) -> None:
    dataset_id = _dataset_id(resources_api.session_factory, PERSONNEL_MODEL_ID)
    model = resources_api.client.get(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}",
        headers=_headers("cinthya.thor"),
    ).json()
    readiness_path = (
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/{model['versionId']}/readiness"
    )
    initial = resources_api.client.get(
        readiness_path,
        headers=_headers("cinthya.thor"),
    )
    assert initial.status_code == 200, initial.text
    assert initial.json()["dcatReady"] is True
    assert initial.json()["i14yReady"] is False
    assert initial.json()["dcatIssues"] == []
    assert "distribution or data service" in initial.json()["i14yIssues"][0]

    created = resources_api.client.post(
        f"/api/v1/catalog-datasets/{dataset_id}/data-services",
        headers=_headers("cinthya.thor", '"1"'),
        json={
            "title": {"de": "Personal-API"},
            "endpointUrl": "https://example.test/api",
            "endpointDescription": "https://example.test/openapi.json",
        },
    )
    assert created.status_code == 201, created.text
    version_id = created.json()["logicalModelVersionId"]
    ready = resources_api.client.get(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/{version_id}/readiness",
        headers=_headers("cinthya.thor"),
    )
    assert ready.status_code == 200, ready.text
    assert ready.json()["dcatReady"] is True
    assert ready.json()["i14yReady"] is True

    exported = resources_api.client.get(
        f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/{version_id}/exports/dcat/ttl",
        headers=_headers("cinthya.thor"),
    )
    assert exported.status_code == 200, exported.text
    graph = Graph().parse(data=exported.content, format="turtle")
    with resources_api.session_factory() as session:
        dataset = session.get(DcatDataset, dataset_id)
        data_service = session.scalar(
            select(DcatDataService).where(DcatDataService.dataset_id == dataset_id)
        )
        assert dataset is not None and data_service is not None
        dataset_uri = URIRef(dataset.urn)
        service_uri = URIRef(data_service.urn)
    assert (service_uri, RDF.type, DCAT.DataService) in graph
    assert (service_uri, DCAT.servesDataset, dataset_uri) in graph
    assert (service_uri, DCAT.endpointURL, URIRef("https://example.test/api")) in graph
    assert not list(graph.objects(dataset_uri, DCAT.theme))
    parsed = parse_dcat_datasets(exported.content, rdf_format="ttl")
    assert parsed[0].data_service_uris == (str(service_uri),)


def test_publish_rejects_a_persisted_model_that_is_not_dcat_ready(
    resources_api: ResourcesApi,
) -> None:
    created = resources_api.client.post(
        "/api/v1/logical-models",
        headers=_headers("cinthya.thor"),
        json=_logical_body(access_rights="not-an-iri"),
    )
    assert created.status_code == 201, created.text
    model = created.json()
    readiness = resources_api.client.get(
        f"/api/v1/logical-models/{model['id']}/versions/{model['versionId']}/readiness",
        headers=_headers("cinthya.thor"),
    )
    assert readiness.status_code == 200
    assert readiness.json()["dcatReady"] is False

    submitted = resources_api.client.post(
        f"/api/v1/logical-models/{model['id']}/versions/{model['versionId']}/submit",
        headers=_headers("cinthya.thor", '"1"'),
    )
    assert submitted.status_code == 200, submitted.text
    publish = resources_api.client.post(
        f"/api/v1/logical-model-reviews/{submitted.json()['reviewId']}/decision",
        json={"decision": "accept"},
        headers=_headers("christian.spider", submitted.headers["etag"]),
    )
    assert publish.status_code == 422, publish.text
    assert publish.json()["errorCode"] == "DACA-LM-DATA-VALIDATION"
    with resources_api.session_factory() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(LogicalModelVersion)
                .where(LogicalModelVersion.logical_model_id == uuid.UUID(model["id"]))
            )
            == 2
        )


def test_mapping_versions_and_workspace_share_one_canonical_projection(
    resources_api: ResourcesApi,
) -> None:
    with resources_api.session_factory() as session:
        mapping = session.scalar(
            select(AssetMapping)
            .where(AssetMapping.logical_model_id == VEHICLE_MODEL_ID)
            .order_by(AssetMapping.id)
            .limit(1)
        )
        assert mapping is not None
        mapping_id = mapping.id

    cloned = resources_api.client.post(
        f"/api/v1/asset-mappings/{mapping_id}/versions",
        headers=_headers("christian.man", '"1"'),
    )
    assert cloned.status_code == 201, cloned.text
    versions = resources_api.client.get(
        f"/api/v1/asset-mappings/{mapping_id}/versions",
        headers=_headers("christian.man"),
    )
    assert versions.status_code == 200, versions.text
    assert versions.headers["etag"] == '"2"'
    assert versions.json()["total"] == 2
    assert [item["revision"] for item in versions.json()["items"]] == [2, 1]
    assert (
        versions.json()["items"][0]["predecessorVersionId"]
        == (versions.json()["items"][1]["versionId"])
    )

    workspace = resources_api.client.get(
        f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}",
        headers=_headers("christian.man"),
    )
    assert workspace.status_code == 200, workspace.text
    payload = workspace.json()
    assert payload["graph"] == payload["matrix"]
    canonical = payload["graph"]
    assert len(canonical["logicalFields"]) == 5
    # The workspace exposes the full immutable snapshot, not only already mapped columns.
    assert len(canonical["physicalColumns"]) == 9
    assert len(canonical["mappingVersions"]) == 5
    revised = next(item for item in canonical["mappingVersions"] if item["id"] == str(mapping_id))
    assert revised["revision"] == 2
    assert all(item["fieldVersionId"] for item in canonical["logicalFields"])
    assert all(item["stableKey"] for item in canonical["physicalColumns"])

    collection = resources_api.client.get(
        "/api/v1/mapping-workspaces",
        headers=_headers("christian.man"),
    )
    assert collection.status_code == 200, collection.text
    listed = next(
        item
        for item in collection.json()["items"]
        if item["logicalModelId"] == str(VEHICLE_MODEL_ID)
    )
    assert listed["graph"] == listed["matrix"] == canonical
    assert resources_api.client.get(
        f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}",
        headers=_headers("unknown-user"),
    ).status_code in {401, 403}
