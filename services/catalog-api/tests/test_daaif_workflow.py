from __future__ import annotations

from daca_catalog.main import daaif_ontology_suggestion
from daca_catalog.workflow_seed import term_uri


def fixture(client, fixture_id: str) -> dict:
    return next(item for item in client.get("/api/v1/poc/product-fixtures").json() if item["id"] == fixture_id)


def test_journey_ontology_suggestions_do_not_confuse_distinct_with_ist():
    source_id = "daaif:kantonale-gewerbesteuer-soll-ist-2022-2026:v1"

    assert (
        daaif_ontology_suggestion(source_id, "actual_receipts_to_date_chf")
        == term_uri("ActualAmount")
    )
    assert daaif_ontology_suggestion(source_id, "distinct_month_count") is None


def test_demo_users_and_fixture_seed_are_idempotent_and_persisted(client):
    users = client.get("/api/v1/demo-users").json()
    assert [user["id"] for user in users] == [
        "beat.stalder",
        "joel.ruod",
        "kassandra.valdata",
        "noemie.rochat",
        "thomas.kriegli",
    ]
    assert next(user for user in users if user["id"] == "joel.ruod")["supervisorUserId"] == "thomas.kriegli"
    fixtures = client.get("/api/v1/poc/product-fixtures").json()
    assert len(fixtures) == 9
    assert {item["maturityLevel"] for item in fixtures} == {"bronze", "silver", "gold"}


def test_open_publication_is_idempotent_defaults_to_discoverable_and_creates_tasks(client):
    payload = fixture(client, "kassandra-bronze")["payload"]
    payload.pop("discoverable")
    created = client.post("/api/v1/metadata-publications", json=payload)
    assert created.status_code == 201
    assert created.json()["created"] is True
    product_id = created.json()["productId"]
    assert len(created.json()["taskIds"]) == 2

    repeated = client.post("/api/v1/metadata-publications", json=payload)
    assert repeated.status_code == 200
    assert repeated.json()["productId"] == product_id
    assert repeated.json()["created"] is False

    owner_products = client.get("/api/v1/data-products", headers={"X-DaCa-User": "kassandra.valdata"}).json()["items"]
    beat_products = client.get("/api/v1/data-products", headers={"X-DaCa-User": "beat.stalder"}).json()["items"]
    assert product_id in {item["id"] for item in owner_products}
    assert product_id not in {item["id"] for item in beat_products}

    assert client.get(f"/api/v1/data-products/{product_id}/endpoints").status_code == 404
    endpoints = client.get(
        f"/api/v1/data-products/{product_id}/endpoints",
        headers={"X-DaCa-User": "kassandra.valdata"},
    )
    assert endpoints.status_code == 200
    assert endpoints.json()[0]["connection"]["mediaType"] == "application/json"

    conflicting = {**payload, "technicalMetadata": {**payload["technicalMetadata"], "serviceName": "different"}}
    assert client.post("/api/v1/metadata-publications", json=conflicting).status_code == 409


def test_automatic_publication_is_discoverable_but_default_denied(client):
    payload = fixture(client, "kassandra-silver")["payload"]
    payload["publicationMode"] = "automatic"
    created = client.post("/api/v1/metadata-publications", json=payload)
    assert created.status_code == 201
    product_id = created.json()["productId"]
    beat_products = client.get("/api/v1/data-products", headers={"X-DaCa-User": "beat.stalder"}).json()["items"]
    assert product_id in {item["id"] for item in beat_products}
    policies = client.get(f"/api/v1/data-products/{product_id}/policies").json()["items"]
    assert policies == []


def test_quality_requires_canonical_product_and_all_key_field_mappings(client):
    payload = fixture(client, "kassandra-gold")["payload"]
    payload["publicationMode"] = "automatic"
    created = client.post("/api/v1/metadata-publications", json=payload).json()
    product_id = created["productId"]
    quality_state = client.get(f"/api/v1/data-products/{product_id}/quality", headers={"X-DaCa-User": "kassandra.valdata"}).json()
    fields = quality_state["fields"]
    response = client.put(
        f"/api/v1/data-products/{product_id}/quality",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={
            "title": payload["businessMetadata"]["title"],
            "description": payload["businessMetadata"]["description"],
            "domain": payload["businessMetadata"]["domain"],
            "classification": payload["businessMetadata"]["classification"],
            "contactEmail": payload["businessMetadata"]["contactEmail"],
            "updateFrequency": payload["businessMetadata"]["updateFrequency"],
            "dcatReviewed": True,
            "productClassUri": payload["businessMetadata"]["productClassUri"],
            "fields": [
                {
                    "id": item["id"],
                    "keyField": True,
                    "businessDescription": item["businessDescription"],
                    "ontologyTermUri": term_uri("CantonCode") if item["name"] == "cantonCode" else term_uri("RefundAmount"),
                }
                for item in fields
            ],
            "graph": payload["businessMetadata"]["graph"],
            "graphConfirmed": True,
        },
    )
    assert response.status_code == 200
    quality = response.json()
    assert quality["score"] == 5
    assert quality["medal"] == "gold"
    assert next(item for item in quality["criteria"] if item["id"] == "ontology")["complete"] is True
    activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "kassandra.valdata"},
    ).json()
    assert "quality-reviewed" in {item["eventType"] for item in activity["items"]}

    semantic = client.get(f"/api/v1/data-products/{product_id}/semantic-profile", headers={"X-DaCa-User": "kassandra.valdata"})
    assert semantic.status_code == 200
    assert "dcat:Dataset" in semantic.json()["@type"]
    assert semantic.json()["dcterms:conformsTo"] == "urn:daca:ontology:tax:v1"

    mappings = client.get(f"/api/v1/data-products/{product_id}/semantic-mappings", headers={"X-DaCa-User": "kassandra.valdata"}).json()
    mapping_update = client.put(
        f"/api/v1/data-products/{product_id}/semantic-mappings",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={
            "productClassUri": payload["businessMetadata"]["productClassUri"],
            "productClassStatus": "confirmed",
            "fieldMappings": [
                {"fieldId": item["dataProductFieldId"], "termUri": item["termUri"], "status": "confirmed"}
                for item in mappings if item["mappingType"] == "field_property"
            ],
        },
    )
    assert mapping_update.status_code == 200
    assert all(item["status"] == "confirmed" for item in mapping_update.json())
    assert client.put(
        f"/api/v1/data-products/{product_id}/semantic-mappings",
        headers={"X-DaCa-User": "beat.stalder"},
        json={"productClassUri": payload["businessMetadata"]["productClassUri"], "fieldMappings": []},
    ).status_code == 403


def test_approval_creates_timed_policy_draft_and_publish_grants_request(client, monkeypatch):
    from daca_catalog.policy import ProjectionResult

    payload = fixture(client, "kassandra-bronze")["payload"]
    payload["publicationMode"] = "automatic"
    created = client.post("/api/v1/metadata-publications", json=payload).json()
    product_id = created["productId"]
    request = client.post(
        f"/api/v1/data-products/{product_id}/access-requests",
        headers={"X-DaCa-User": "beat.stalder"},
        json={
            "consumerType": "person",
            "machineId": None,
            "purpose": "Kantonale Finanzanalyse mit aggregierten Datenwerten.",
            "legalBasis": "Amtshilfe",
            "requestedProtocol": "http",
            "requestedVariant": "modified",
            "validFrom": "2026-09-01",
            "validUntil": "2027-08-31",
            "contactEmail": "beat.stalder@sg.ch",
            "notes": None,
            "conditionsAccepted": True,
        },
    )
    assert request.status_code == 201
    decided = client.post(
        f"/api/v1/access-requests/{request.json()['id']}/decision",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={"decision": "approve", "grantedVariant": "modified"},
    )
    assert decided.status_code == 200
    assert decided.json()["request"]["status"] == "approved_policy_pending"
    grant = decided.json()["policy"]["definition"]["grants"][0]
    assert grant["subject"] == {"type": "person", "id": "beat.stalder"}
    assert grant["validFrom"] == "2026-09-01"
    activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "kassandra.valdata"},
    ).json()
    activity_types = [item["eventType"] for item in activity["items"]]
    assert activity_types.count("access-request-submitted") == 1
    assert activity_types.count("access-request-approved") == 1

    monkeypatch.setattr("daca_catalog.main.project_to_postgresql", lambda settings, product_id, revision, definition: ProjectionResult("deployed", observed_revision=revision))
    published = client.post(
        f"/api/v1/data-products/{product_id}/policies/{decided.json()['policy']['id']}/publish",
        headers={"X-DaCa-User": "kassandra.valdata", "If-Match": f'"{decided.json()["policy"]["revision"]}"'},
    )
    assert published.status_code == 201
    mine = client.get(f"/api/v1/data-products/{product_id}/access-requests/mine", headers={"X-DaCa-User": "beat.stalder"}).json()
    assert mine[0]["status"] == "approved_policy_pending"
    opa_deployment = next(
        item for item in published.json()["deployments"] if item["target"] == "opa"
    )
    acknowledged = client.put(
        "/internal/v1/policy-deployments/acknowledge",
        headers={"Authorization": "Bearer test-internal-token"},
        json={
            "policyRevisionId": published.json()["id"],
            "target": "opa",
            "observedRevision": opa_deployment["desiredRevision"],
            "state": "deployed",
            "error": None,
        },
    )
    assert acknowledged.status_code == 200
    mine = client.get(f"/api/v1/data-products/{product_id}/access-requests/mine", headers={"X-DaCa-User": "beat.stalder"}).json()
    assert mine[0]["status"] == "granted_modified"

    reset = client.post(
        f"/api/v1/poc/data-products/{product_id}/reset",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={"confirmationName": "Kassandra Valdata"},
    )
    assert reset.status_code == 200
    republished = client.post("/api/v1/metadata-publications", json=payload)
    assert republished.status_code == 201
    assert republished.json()["productId"] == product_id
    historical_activity = client.get(
        f"/api/v1/data-products/{product_id}/activity",
        headers={"X-DaCa-User": "kassandra.valdata"},
    ).json()
    historical_types = [item["eventType"] for item in historical_activity["items"]]
    assert historical_types.count("access-request-submitted") == 1
    assert historical_types.count("access-request-approved") == 1
    assert "policy-published" in historical_types
    assert "poc-fixture-reset" in historical_types
