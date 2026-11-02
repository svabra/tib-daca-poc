from datetime import date

import pytest
from daca_catalog.models import AccessRequest
from daca_catalog.seed import ESTV_PRODUCT_ID


def payload():
    return {
        "consumerType": "person",
        "machineId": None,
        "purpose": "Synthetische kantonale Statistik und Qualitätssicherung.",
        "legalBasis": "Amtshilfe zwischen Behörden",
        "requestedProtocol": "http",
        "requestedVariant": "modified",
        "validFrom": "2026-11-02",
        "validUntil": None,
        "contactEmail": "beat.stalder@example.invalid",
        "notes": None,
        "conditionsAccepted": True,
    }


def test_open_ended_request_persists_null_and_owner_can_decide(client, session_factory):
    import uuid

    result = client.post(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests",
        headers={"X-DaCa-User": "beat.stalder"},
        json=payload(),
    )
    assert result.status_code == 201
    request = result.json()
    assert request["validUntil"] is None
    with session_factory() as session:
        row = session.get(AccessRequest, uuid.UUID(request["id"]))
        assert row.valid_until is None and row.policy_valid_until == date.max
    inbox = client.get(
        "/api/v1/access-requests/inbox", headers={"X-DaCa-User": "kassandra.valdata"}
    ).json()
    assert any(item["id"] == request["id"] and item["validUntil"] is None for item in inbox)
    result = client.post(
        f"/api/v1/access-requests/{request['id']}/decision",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={"decision": "approve", "grantedVariant": "modified"},
    )
    assert result.status_code == 200
    assert result.json()["policy"]["definition"]["grants"][0]["validUntil"] == "9999-12-31"
    assert result.json()["request"]["validUntil"] is None


@pytest.mark.parametrize("invalid_end", ["", "bad-date", "2026-11-01", "omitted"])
def test_open_end_is_explicit_and_malformed_or_reversed_dates_are_rejected(client, invalid_end):
    body = payload()
    if invalid_end == "omitted":
        body.pop("validUntil")
    else:
        body["validUntil"] = invalid_end
    response = client.post(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests",
        headers={"X-DaCa-User": "beat.stalder"},
        json=body,
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "request_end,grant_end", [(None, "2027-11-02"), ("2027-11-02", "9999-12-31")]
)
def test_fulfillment_cannot_confuse_bounded_and_open_ended_requests(client, request_end, grant_end):
    body = payload()
    body["validUntil"] = request_end
    response = client.post(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests",
        headers={"X-DaCa-User": "beat.stalder"},
        json=body,
    )
    assert response.status_code == 201
    request_id = response.json()["id"]
    before = client.get(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}", headers={"X-DaCa-User": "kassandra.valdata"}
    )
    response = client.put(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-settings",
        headers={"X-DaCa-User": "kassandra.valdata", "If-Match": before.headers["etag"]},
        json={
            "grant": {
                "subject": {"type": "person", "id": "beat.stalder"},
                "actions": ["data.read"],
                "protocols": ["http"],
                "dataVariant": "modified",
                "validFrom": body["validFrom"],
                "validUntil": grant_end,
            },
            "accessRequestFulfillments": [
                {
                    "accessRequestId": request_id,
                    "fulfillmentSubject": {"type": "person", "id": "beat.stalder"},
                }
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "The policy validity period must exactly match the access request"
    requests = client.get(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests/mine",
        headers={"X-DaCa-User": "beat.stalder"},
    ).json()
    assert next(item for item in requests if item["id"] == request_id)["status"] == "submitted"
