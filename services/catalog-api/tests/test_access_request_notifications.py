import uuid

from daca_catalog.models import AccessRequest, WorkflowTask
from daca_catalog.seed import ESTV_PRODUCT_ID
from sqlalchemy import delete, select


def test_rejection_message_survives_reload_and_backfills_once(client, session_factory):
    consumer = {"X-DaCa-User": "beat.stalder"}
    result = client.post(
        f"/api/v1/data-products/{ESTV_PRODUCT_ID}/access-requests",
        headers=consumer,
        json={
            "consumerType": "person",
            "machineId": None,
            "purpose": "Synthetische kantonale Statistik zur Qualitätssicherung.",
            "legalBasis": "Amtshilfe",
            "requestedProtocol": "http",
            "requestedVariant": "either",
            "validFrom": "2026-11-02",
            "validUntil": None,
            "contactEmail": "beat@example.invalid",
            "conditionsAccepted": True,
        },
    )
    assert result.status_code == 201
    request_id = result.json()["id"]
    rejected = client.post(
        f"/api/v1/access-requests/{request_id}/decision",
        headers={"X-DaCa-User": "kassandra.valdata"},
        json={"decision": "reject", "comment": "Auftrag bitte präzisieren."},
    )
    assert rejected.status_code == 200
    with session_factory() as session:
        task = session.scalar(
            select(WorkflowTask).where(
                WorkflowTask.access_request_id == uuid.UUID(request_id),
                WorkflowTask.task_type == "access_request_rejected",
            )
        )
        assert task is not None and task.assignee_user_id == "beat.stalder"
        message_id = str(task.id)
        # Simulate a decision from before requester messages were implemented.
        session.execute(delete(WorkflowTask).where(WorkflowTask.id == task.id))
        session.commit()
    for _ in range(2):
        response = client.get("/api/v1/tasks/mine", headers=consumer)
        assert response.status_code == 200
        messages = [task for task in response.json() if task["accessRequestId"] == request_id]
        assert len(messages) == 1
        assert messages[0]["id"] == message_id
        assert messages[0]["taskKind"] == "information"
    assert (
        client.post(f"/api/v1/tasks/{message_id}/acknowledge", headers=consumer).status_code == 200
    )
    assert not any(
        task["id"] == message_id
        for task in client.get("/api/v1/tasks/mine", headers=consumer).json()
    )
    with session_factory() as session:
        assert session.get(AccessRequest, uuid.UUID(request_id)).status == "rejected"


def test_backfill_does_not_advertise_unconfirmed_legacy_grants(client, session_factory):
    with session_factory() as session:
        request = session.scalar(
            select(AccessRequest).where(AccessRequest.requester_id == "beat.stalder")
        )
        assert request is not None
        request.status = "granted_original"
        request.decision_policy_revision_id = None
        request_id = str(request.id)
        session.commit()
    response = client.get("/api/v1/tasks/mine", headers={"X-DaCa-User": "beat.stalder"})
    assert response.status_code == 200
    assert not any(
        task["accessRequestId"] == request_id and task["taskType"] == "access_request_granted"
        for task in response.json()
    )
