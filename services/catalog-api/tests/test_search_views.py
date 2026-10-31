import copy

import pytest
from daca_catalog import search_views_api
from daca_catalog.models import AuditEvent, DemoUser, SearchView, SearchViewShare, WorkflowTask
from sqlalchemy import func, select

PATH = "/api/v1/me/search-views"
INBOX = "/api/v1/me/search-view-shares"
A, B, C = "view.sender", "view.receiver", "view.other"
CONFIG = {"schemaVersion": 1, "query": "Gebäude", "mode": "focus", "kind": "structure",
          "organization": "vbs-armasuisse-immobilien", "domain": "domain-id", "status": "active",
          "connection": "metadata", "sort": "name"}


@pytest.fixture(autouse=True)
def people(session_factory):
    with session_factory() as session:
        for user_id in (A, B, C):
            session.add(DemoUser(id=user_id, display_name=user_id, organization="Test office",
                                email=f"{user_id}@example.test", roles=["data_consumer"], active=True, selectable=True))
        session.commit()


def headers(actor=A, revision=None):
    return {"X-DaCa-User": actor, **({"If-Match": f'"{revision}"'} if revision is not None else {})}


def create(client, actor=A, **fields):
    response = client.post(PATH, headers=headers(actor), json={"name": "Meine Gebäude", "description": "Private Auswahl",
        "configuration": CONFIG, **fields})
    assert response.status_code == 201, response.text
    return response.json()


def share(client, view, recipients=None, message="Für die gemeinsame Prüfung"):
    response = client.post(f"{PATH}/{view['id']}/share", headers=headers(A, view["revision"]),
                           json={"recipientUserIds": recipients or [B], "message": message})
    assert response.status_code == 200, response.text
    return response.json()


def test_crud_is_private_revision_checked_and_uses_only_the_existing_filter_schema(client):
    view = create(client)
    assert view["ownerUserId"] == A and view["revision"] == 1 and view["configuration"] == CONFIG
    response = client.get(PATH, headers=headers())
    assert response.headers["Cache-Control"] == "private, no-store" and response.json()[0]["id"] == view["id"]
    assert client.get(PATH, headers=headers(B)).json() == []
    for method in ("get", "put", "delete"):
        kwargs = {"json": {"name": "Hijacked", "configuration": CONFIG}} if method == "put" else {}
        assert getattr(client, method)(f"{PATH}/{view['id']}", headers=headers(B, 1), **kwargs).status_code == 404
    body = {"name": "Neue Bezeichnung", "description": "Beschreibung", "configuration": {**CONFIG, "kind": "field"}}
    assert client.put(f"{PATH}/{view['id']}", headers=headers(), json=body).status_code == 428
    updated = client.put(f"{PATH}/{view['id']}", headers=headers(A, 1), json=body)
    assert updated.status_code == 200 and updated.headers["ETag"] == '"2"'
    assert client.put(f"{PATH}/{view['id']}", headers=headers(A, 1), json=body).status_code == 412
    assert client.delete(f"{PATH}/{view['id']}", headers=headers(A, 1)).status_code == 412
    for invalid in ({"name": "   "}, {"configuration": {**CONFIG, "kind": "sql"}},
                    {"ownerUserId": B}, {"configuration": {**CONFIG, "rawSql": "anything"}}):
        assert client.post(PATH, headers=headers(), json={"name": "Test", "configuration": CONFIG, **invalid}).status_code == 422
    assert client.delete(f"{PATH}/{view['id']}", headers=headers(A, 2)).status_code == 204
    assert client.get(PATH, headers=headers()).json() == []


def test_sharing_delivers_private_messages_and_is_idempotent_for_each_recipient_revision(client, session_factory):
    view = create(client)
    sent = share(client, view, [B, C, B])
    assert sent["createdCount"] == 2 and len(sent["shares"]) == 2
    assert share(client, view, [B, C])["createdCount"] == 0
    for actor in (B, C):
        inbox = client.get(INBOX, headers=headers(actor))
        assert inbox.status_code == 200 and len(inbox.json()) == 1
        message = inbox.json()[0]
        assert message["snapshot"]["configuration"] == CONFIG and message["senderUserId"] == A
        tasks = client.get("/api/v1/tasks/mine", headers=headers(actor))
        assert tasks.status_code == 200, tasks.text
        assert any(task["taskType"] == "search_view_shared" and task["searchViewShareId"] == message["id"] for task in tasks.json())
    assert client.get(INBOX, headers=headers()).json() == []
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(SearchViewShare)) == 2
        assert session.scalar(select(func.count()).select_from(WorkflowTask).where(WorkflowTask.task_type == "search_view_shared")) == 2
        events = list(session.scalars(select(AuditEvent).where(AuditEvent.resource_type == "search-view")))
        assert all("Gebäude" not in str(event.details) and "Prüfung" not in str(event.details) for event in events)


def test_receiver_adopts_the_sent_copy_after_original_edit_and_deletion(client, session_factory):
    original = create(client)
    message = share(client, original)["shares"][0]
    original_copy = copy.deepcopy(message["snapshot"])
    assert client.get(f"{INBOX}/{message['id']}", headers=headers(C)).status_code == 404
    assert client.post(f"{INBOX}/{message['id']}/accept", headers=headers(A), json={}).status_code == 404
    changed = client.put(f"{PATH}/{original['id']}", headers=headers(A, 1),
        json={"name": "Später geändert", "configuration": {**CONFIG, "query": "ganz anders"}})
    assert changed.status_code == 200
    assert client.delete(f"{PATH}/{original['id']}", headers=headers(A, 2)).status_code == 204
    received = client.get(f"{INBOX}/{message['id']}", headers=headers(B)).json()
    assert received["snapshot"] == original_copy
    adopted = client.post(f"{INBOX}/{message['id']}/accept", headers=headers(B), json={"name": "Meine Kopie"})
    assert adopted.status_code == 200, adopted.text
    adopted = adopted.json()
    assert adopted["configuration"] == CONFIG and adopted["ownerUserId"] == B and adopted["id"] != original["id"]
    assert client.post(f"{INBOX}/{message['id']}/accept", headers=headers(B), json={}).json()["id"] == adopted["id"]
    assert client.get(INBOX, headers=headers(B)).json() == []
    with session_factory() as session:
        row = session.get(SearchViewShare, message["id"])
        assert row.source_view_id is None and row.snapshot == original_copy
        task = session.scalar(select(WorkflowTask).where(WorkflowTask.search_view_share_id == row.id))
        assert task.status == "completed"
        assert session.scalar(select(func.count()).select_from(SearchView).where(SearchView.owner_user_id == B)) == 1
    assert client.delete(f"{PATH}/{adopted['id']}", headers=headers(B, 1)).status_code == 204
    assert client.post(f"{INBOX}/{message['id']}/accept", headers=headers(B), json={}).status_code == 410


def test_source_and_adopted_views_can_be_edited_independently(client):
    source = create(client)
    message = share(client, source)["shares"][0]
    adopted = client.post(f"{INBOX}/{message['id']}/accept", headers=headers(B), json={}).json()
    body = {"name": "Empfängeränderung", "configuration": {**CONFIG, "query": "Empfänger"}}
    assert client.put(f"{PATH}/{adopted['id']}", headers=headers(B, 1), json=body).status_code == 200
    assert client.get(f"{PATH}/{source['id']}", headers=headers()).json()["configuration"] == CONFIG
    assert client.get(f"{INBOX}/{message['id']}", headers=headers(B)).json()["snapshot"]["configuration"] == CONFIG


def test_share_validates_all_recipients_before_delivering_any_message(client, session_factory):
    view = create(client)
    with session_factory() as session:
        person = session.get(DemoUser, C)
        person.active = False
        session.commit()
    for recipients in ([B, "unknown"], [B, A], [B, C], [], [B] * 31):
        result = client.post(f"{PATH}/{view['id']}/share", headers=headers(A, 1), json={"recipientUserIds": recipients})
        assert result.status_code == 422
    assert client.get(INBOX, headers=headers(B)).json() == []
    assert client.post(f"{PATH}/{view['id']}/share", headers=headers(B, 1), json={"recipientUserIds": [C]}).status_code == 404


def test_dismissal_completes_the_message_but_does_not_create_a_view(client):
    view = create(client)
    message = share(client, view)["shares"][0]
    assert client.post(f"{INBOX}/{message['id']}/dismiss", headers=headers(B)).status_code == 204
    assert client.get(INBOX, headers=headers(B)).json() == []
    assert client.get(PATH, headers=headers(B)).json() == []
    assert client.post(f"{INBOX}/{message['id']}/accept", headers=headers(B), json={}).status_code == 409
    assert not any(task["taskType"] == "search_view_shared" for task in client.get("/api/v1/tasks/mine", headers=headers(B)).json())


def test_limits_and_authentication_do_not_silently_drop_data(client, monkeypatch):
    view = create(client)
    monkeypatch.setattr(search_views_api, "INBOX_LIMIT", 0)
    assert client.post(f"{PATH}/{view['id']}/share", headers=headers(A, 1), json={"recipientUserIds": [B]}).status_code == 409
    assert client.get(INBOX, headers=headers(B)).json() == []
    monkeypatch.setattr(search_views_api, "VIEW_LIMIT", 1)
    assert client.post(PATH, headers=headers(), json={"name": "No space", "configuration": CONFIG}).status_code == 409
    assert client.get(PATH, headers={"X-DaCa-User": "missing-user"}).status_code == 401
    assert client.get(PATH, headers={"X-DaCa-User": ""}).status_code == 401
