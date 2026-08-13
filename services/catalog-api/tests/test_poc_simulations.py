from __future__ import annotations

import uuid
from copy import deepcopy

from daca_catalog.models import AuditEvent, DataProduct, PocSimulationEvent, ProvenanceEvent
from sqlalchemy import select


def fixture_payload(client, owner: str = "kassandra.valdata") -> dict:
    fixture = next(
        item
        for item in client.get("/api/v1/poc/product-fixtures").json()
        if item["ownerUserId"] == owner
    )
    return deepcopy(fixture["payload"])


def publish(client, owner: str = "kassandra.valdata") -> tuple[dict, dict[str, str]]:
    headers = {"X-DaCa-User": owner}
    response = client.post("/api/v1/metadata-publications", json=fixture_payload(client, owner))
    assert response.status_code == 201
    return response.json(), headers


def test_owner_isolation_and_state_event_conflict(client):
    publication, headers = publish(client)
    product_id = publication["productId"]
    event = client.post(
        f"/api/v1/poc/data-products/{product_id}/simulation-events/quality_below_threshold",
        headers=headers,
    )
    assert event.status_code == 201
    body = event.json()
    assert body["event"]["active"] is True
    assert body["product"]["quality"]["medal"] == "bronze"
    assert body["product"]["metadata"]["simulationAlerts"][0]["measuredPercent"] == 58
    assert body["task"]["taskType"] == "simulation_quality_alert"

    forbidden = client.post(
        f"/api/v1/poc/simulation-events/{body['event']['id']}/reset",
        headers={"X-DaCa-User": "noemie.rochat"},
    )
    assert forbidden.status_code == 403
    conflict = client.post(
        f"/api/v1/poc/data-products/{product_id}/simulation-events/not_discoverable",
        headers=headers,
    )
    assert conflict.status_code == 409

    reset = client.post(
        f"/api/v1/poc/simulation-events/{body['event']['id']}/reset",
        headers=headers,
    )
    assert reset.status_code == 200
    retrigger = client.post(
        f"/api/v1/poc/data-products/{product_id}/simulation-events/not_discoverable",
        headers=headers,
    )
    assert retrigger.status_code == 201
    assert retrigger.json()["product"]["discoverable"] is False


def test_isbo_restriction_preserves_policy_and_reset_restores_state(client):
    publication, headers = publish(client)
    product_id = publication["productId"]
    event = client.post(
        f"/api/v1/poc/data-products/{product_id}/simulation-events/isbo_restricted",
        headers=headers,
    )
    assert event.status_code == 201
    product = event.json()["product"]
    assert product["discoverable"] is False
    assert product["classification"] == "restricted"
    assert event.json()["task"]["taskType"] == "simulation_isbo_restriction"
    assert product["activePolicyRevision"] is None

    reset = client.post(
        f"/api/v1/poc/simulation-events/{event.json()['event']['id']}/reset",
        headers=headers,
    )
    assert reset.status_code == 200
    restored = client.get(f"/api/v1/data-products/{product_id}", headers=headers).json()
    assert restored["classification"] == "internal"


def test_physical_fixture_reset_requires_name_and_preserves_evidence(client, session_factory):
    publication, headers = publish(client)
    product_id = publication["productId"]
    wrong = client.post(
        f"/api/v1/poc/data-products/{product_id}/reset",
        headers=headers,
        json={"confirmationName": "Wrong Name"},
    )
    assert wrong.status_code == 422

    deleted = client.post(
        f"/api/v1/poc/data-products/{product_id}/reset",
        headers=headers,
        json={"confirmationName": "Kassandra Valdata"},
    )
    assert deleted.status_code == 200
    assert deleted.json()["deletedProductId"] == product_id
    assert client.get(f"/api/v1/data-products/{product_id}", headers=headers).status_code == 404
    with session_factory() as session:
        product_uuid = uuid.UUID(product_id)
        assert session.get(DataProduct, product_uuid) is None
        reset_events = list(
            session.scalars(
                select(PocSimulationEvent).where(PocSimulationEvent.product_id == product_uuid)
            )
        )
        assert any(item.operation == "product_reset" for item in reset_events)
        assert session.scalar(
            select(ProvenanceEvent).where(ProvenanceEvent.product_urn == reset_events[0].product_urn)
        ) is not None
        assert session.scalar(
            select(AuditEvent).where(
                AuditEvent.resource_id == product_id,
                AuditEvent.action == "poc-fixture-product-reset",
            )
        ) is not None

    republished = client.post("/api/v1/metadata-publications", json=fixture_payload(client))
    assert republished.status_code == 201
    assert republished.json()["created"] is True


def test_non_fixture_product_cannot_be_physically_reset(client):
    response = client.post(
        "/api/v1/poc/data-products/11111111-1111-4111-8111-111111111111/reset",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={"confirmationName": "Kassandra Valdata"},
    )
    assert response.status_code in {403, 409}


def test_foreign_fixture_owner_cannot_trigger_or_reset(client):
    publication, _headers = publish(client, "noemie.rochat")
    product_id = publication["productId"]
    forbidden_trigger = client.post(
        f"/api/v1/poc/data-products/{product_id}/simulation-events/not_discoverable",
        headers={"X-DaCa-User": "kassandra.valdata"},
    )
    assert forbidden_trigger.status_code == 403
    forbidden_reset = client.post(
        f"/api/v1/poc/data-products/{product_id}/reset",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={"confirmationName": "Kassandra Valdata"},
    )
    assert forbidden_reset.status_code == 403
