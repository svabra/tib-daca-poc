import uuid
from datetime import UTC, datetime, timedelta

from daca_catalog.models import AccessRequest, DataProduct
from daca_catalog.seed import ESTV_PRODUCT_ID
from sqlalchemy import select


def test_product_request_history_contains_every_outcome_sorted_by_arrival(client, session_factory):
    statuses = ["submitted", "identity_review", "legal_review", "conditions_review",
                "approved_policy_pending", "granted_original", "granted_modified", "rejected", "withdrawn"]
    created_ids = []
    start = datetime(2030, 1, 1, tzinfo=UTC)
    with session_factory() as session:
        source = session.scalar(select(AccessRequest).where(AccessRequest.data_product_id == ESTV_PRODUCT_ID))
        assert source is not None
        values = {column.key: getattr(source, column.key) for column in AccessRequest.__table__.columns}
        for index, status in enumerate(statuses):
            identity = uuid.uuid4()
            session.add(AccessRequest(**{
                **values, "id": identity, "request_number": f"QA-HISTORY-{index}", "status": status,
                "request_kind": "initial", "renewal_of_request_id": None, "renewal_context": None,
                "created_at": start + timedelta(days=index), "updated_at": start + timedelta(days=20-index),
            }))
            created_ids.append(str(identity))
        session.commit()
    response = client.get(f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests", headers={"X-DaCa-User": "kassandra.valdata"})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    items = response.json()
    assert [item["id"] for item in items if item["id"] in created_ids] == created_ids[::-1]
    assert {item["status"] for item in items} == set(statuses)
    assert all(item["dataProductId"] == str(ESTV_PRODUCT_ID) and item["updatedAt"] for item in items)
    # The global task inbox stays open-only: completed requests must not reopen tasks.
    inbox = client.get("/api/v1/access-requests/inbox", headers={"X-DaCa-User": "kassandra.valdata"}).json()
    assert not any(item["status"] in {"granted_original", "granted_modified", "rejected", "withdrawn"} for item in inbox)


def test_request_history_requires_current_product_responsibility(client, session_factory):
    path = f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests"
    reader = {"X-DaCa-User": "beat.stalder"}
    rejected = client.get(path, headers=reader)
    assert rejected.status_code == 403
    assert "requesterName" not in rejected.text and "purpose" not in rejected.text
    assert client.get(f"/api/v1/data-products/{uuid.uuid4()}/access-requests", headers=reader).status_code == 404
    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        product.deputy_owner_user_id = "beat.stalder"
        session.commit()
    assert client.get(path, headers=reader).status_code == 200
    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        product.deputy_owner_user_id = None
        product.extra_metadata = {**product.extra_metadata, "catalogUsage": {"responsibleUserIds": ["beat.stalder"]}}
        session.commit()
    assert client.get(path, headers=reader).status_code == 200


def test_rejected_request_remains_on_product_history_after_leaving_task_inbox(client):
    created = client.post(f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests", headers={"X-DaCa-User": "beat.stalder"}, json={
        "consumerType": "person", "machineId": None, "purpose": "Synthetische Statistik zur kantonalen Finanzplanung.",
        "legalBasis": "Amtshilfe", "requestedProtocol": "http", "requestedVariant": "either",
        "validFrom": "2026-11-03", "validUntil": None, "contactEmail": "qa@example.invalid", "conditionsAccepted": True,
    })
    assert created.status_code == 201, created.text
    request = created.json()
    owner = {"X-DaCa-User": "kassandra.valdata"}
    decision = client.post(f"/api/v1/access-requests/{request['id']}/decision", headers=owner, json={"decision": "reject"})
    assert decision.status_code == 200, decision.text
    history = client.get(f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests", headers=owner).json()
    answered = next(item for item in history if item["id"] == request["id"])
    assert answered["status"] == "rejected" and answered["createdAt"] == request["createdAt"]
    assert answered["updatedAt"] == decision.json()["request"]["updatedAt"]
