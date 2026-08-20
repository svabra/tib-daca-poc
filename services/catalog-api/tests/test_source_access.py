from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from daca_catalog.models import AuditEvent, SourceAccessGrant, SourceAccessRequest, WorkflowTask
from sqlalchemy import select

JOEL = {"X-DaCa-User": "joel.ruod"}
SANDRO = {"X-DaCa-User": "sandro.wenger"}
NOEMIE = {"X-DaCa-User": "noemie.rochat"}
SOURCE_ID = "ora_bazg_zoll"


def today_iso() -> str:
    return datetime.now(ZoneInfo("Europe/Zurich")).date().isoformat()


def request_payload(*, client_request_id: str = "source-request-0001") -> dict:
    return {
        "clientRequestId": client_request_id,
        "sourceId": SOURCE_ID,
        "requestTitle": "Zollanmeldungen für ESTV-Analysen",
        "subject": {
            "type": "group",
            "id": "estv-business-intelligence",
        },
        "purpose": "Analyse aggregierter Zollanmeldungen für steuerstatistische Plausibilisierungen.",
        "legalBasis": "Gesetzlicher Auftrag der ESTV zur Erstellung der Steuerstatistik.",
        "validFrom": today_iso(),
        "validUntil": None,
        "conditionsAccepted": True,
    }


def test_oracle_catalog_exposes_exactly_30_of_38_sources_to_joel(client):
    response = client.get("/api/v1/source-catalog?sourceType=oracle&limit=50", headers=JOEL)
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {"total": 38, "discoverable": 30, "hidden": 8, "matched": 30}
    assert len(body["items"]) == 30
    showcase = next(item for item in body["items"] if item["id"] == SOURCE_ID)
    assert showcase["databaseName"] == "BZGZOLL1"
    assert showcase["ownerName"] == "Sandro Wenger"
    assert showcase["sites"] == ["PRIMUS", "CAMPUS"]
    assert [item["name"] for item in showcase["objects"]] == [
        "ANMELDUNGEN",
        "WARENPOSITIONEN",
        "ABGABEN_UEBERSICHT_V",
    ]


def test_catalog_search_site_pagination_and_hidden_direct_access(client):
    searched = client.get(
        "/api/v1/source-catalog?sourceType=oracle&q=ANMELDUNGEN&site=both&limit=12",
        headers=JOEL,
    )
    assert searched.status_code == 200
    assert searched.json()["summary"]["matched"] == 1
    assert searched.json()["items"][0]["id"] == SOURCE_ID

    page = client.get("/api/v1/source-catalog?sourceType=oracle&offset=12&limit=12", headers=JOEL)
    assert page.status_code == 200
    assert page.json()["offset"] == 12
    assert len(page.json()["items"]) == 12

    hidden = client.get("/api/v1/source-catalog/ora_bfs_03/access-context", headers=JOEL)
    assert hidden.status_code == 404
    assert hidden.json()["detail"] == "Data source not found"


def test_access_context_only_offers_trusted_groups_of_actor(client):
    response = client.get(f"/api/v1/source-catalog/{SOURCE_ID}/access-context", headers=JOEL)
    assert response.status_code == 200
    subjects = response.json()["subjects"]
    assert subjects[0] == {
        "type": "person",
        "id": "joel.ruod",
        "label": "Joel Ruod",
        "memberCount": None,
        "membershipRevision": None,
        "recommended": False,
    }
    assert {item["id"] for item in subjects[1:]} == {
        "estv-business-intelligence",
        "estv-advanced-analytics",
        "efd-data-community",
    }
    assert next(item for item in subjects if item["recommended"])["id"] == "estv-business-intelligence"


def test_group_request_is_idempotent_and_creates_owner_task(client, session_factory):
    payload = request_payload()
    first = client.post("/api/v1/source-access-requests", json=payload, headers=JOEL)
    second = client.post("/api/v1/source-access-requests", json=payload, headers=JOEL)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]
    assert first.json()["subject"]["label"] == "ESTV Business Intelligence"
    assert first.json()["subject"]["memberCount"] == 2
    assert first.json()["validUntil"] is None

    inbox = client.get("/api/v1/source-access-requests/inbox", headers=SANDRO)
    assert inbox.status_code == 200
    assert [item["id"] for item in inbox.json()] == [first.json()["id"]]
    tasks = client.get("/api/v1/tasks/mine", headers=SANDRO)
    source_task = next(item for item in tasks.json() if item["taskType"] == "source_access_review")
    assert source_task["dataProductId"] is None
    assert source_task["sourceAccessRequestId"] == first.json()["id"]

    with session_factory() as session:
        request_id = uuid.UUID(first.json()["id"])
        assert session.scalar(select(SourceAccessRequest).where(SourceAccessRequest.id == request_id))
        assert session.scalar(select(WorkflowTask).where(WorkflowTask.source_access_request_id == request_id))
        event = session.scalar(select(AuditEvent).where(AuditEvent.resource_id == first.json()["id"]))
        assert event is not None and event.action == "submitted"


def test_owner_approval_creates_snapshot_grant_for_original_members(client, session_factory):
    submitted = client.post(
        "/api/v1/source-access-requests", json=request_payload(client_request_id="approve-0001"), headers=JOEL
    ).json()
    forbidden = client.post(
        f"/api/v1/source-access-requests/{submitted['id']}/decision",
        json={"decision": "approve"},
        headers=NOEMIE,
    )
    assert forbidden.status_code == 403

    approved = client.post(
        f"/api/v1/source-access-requests/{submitted['id']}/decision",
        json={"decision": "approve", "comment": "Für den PoC freigegeben."},
        headers=SANDRO,
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    joel_grants = client.get("/api/v1/source-access-grants/mine", headers=JOEL).json()
    kassandra_grants = client.get(
        "/api/v1/source-access-grants/mine", headers={"X-DaCa-User": "kassandra.valdata"}
    ).json()
    assert joel_grants[0]["source"]["id"] == SOURCE_ID
    assert joel_grants[0]["state"] == "active"
    assert kassandra_grants[0]["source"]["id"] == SOURCE_ID
    assert client.get("/api/v1/source-access-grants/mine", headers=NOEMIE).json() == []

    with session_factory() as session:
        grant = session.scalar(select(SourceAccessGrant))
        assert grant is not None
        assert grant.group_snapshot["memberIds"] == ["joel.ruod", "kassandra.valdata"]
        task = session.scalar(select(WorkflowTask).where(WorkflowTask.source_access_request_id == grant.source_access_request_id))
        assert task is not None and task.status == "completed"


def test_date_subject_duplicate_and_rejection_validation(client):
    yesterday = (datetime.now(ZoneInfo("Europe/Zurich")).date() - timedelta(days=1)).isoformat()
    bad_date = request_payload(client_request_id="bad-date-0001")
    bad_date["validFrom"] = yesterday
    assert client.post("/api/v1/source-access-requests", json=bad_date, headers=JOEL).status_code == 422

    foreign_person = request_payload(client_request_id="foreign-person-0001")
    foreign_person["subject"] = {"type": "person", "id": "noemie.rochat"}
    assert client.post("/api/v1/source-access-requests", json=foreign_person, headers=JOEL).status_code == 422

    submitted = client.post(
        "/api/v1/source-access-requests", json=request_payload(client_request_id="reject-0001"), headers=JOEL
    ).json()
    duplicate = request_payload(client_request_id="duplicate-open-0001")
    assert client.post("/api/v1/source-access-requests", json=duplicate, headers=JOEL).status_code == 409
    missing_reason = client.post(
        f"/api/v1/source-access-requests/{submitted['id']}/decision",
        json={"decision": "reject"},
        headers=SANDRO,
    )
    assert missing_reason.status_code == 422
    rejected = client.post(
        f"/api/v1/source-access-requests/{submitted['id']}/decision",
        json={"decision": "reject", "comment": "Zweck ist noch nicht ausreichend präzise."},
        headers=SANDRO,
    )
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"
