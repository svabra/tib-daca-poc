import uuid
from datetime import date

import pytest
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import (
    Domain,
    FederalPersonMembership,
    OrganizationStewardMandate,
    WorkflowTask,
)
from daca_catalog.office_governance import seed_requested_steward_mandates
from sqlalchemy import func, select


def headers(actor, revision=None):
    return {"X-DaCa-User": actor, **({"If-Match": f'"{revision}"'} if revision else {})}


BODY = {"operation": "create", "payload": {"ownerUserId": "daniel.wenger", "deputyOwnerUserId": "eliane.rossi",
        "localizations": [{"language": "de", "preferredLabel": "Approval test domain", "definition": "Synthetic domain proposal."}]}}


@pytest.fixture(autouse=True)
def install(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_requested_steward_mandates(session)
        session.commit()


def submit(client, actor="mirjam.keller", body=BODY):
    response = client.post("/api/v1/domain-change-requests", headers=headers(actor), json=body)
    assert response.status_code == 201, response.text
    return response.json()


def decide(client, request, actor, decision="approve", revision=1):
    return client.post(f'/api/v1/domain-change-requests/{request["id"]}/decision',
                       headers=headers(actor, revision), json={"decision": decision, "comment": "Synthetic ALDS decision."})


def test_proposal_is_not_active_and_only_its_office_alds_receives_review(client, session_factory):
    with session_factory() as session:
        count = session.scalar(select(func.count()).select_from(Domain))
    request = submit(client)
    assert request["status"] == "submitted" and request["targetDomainId"] is None
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(Domain)) == count
        tasks = list(session.scalars(select(WorkflowTask).where(WorkflowTask.domain_change_request_id == uuid.UUID(request["id"]))))
        assert {task.assignee_user_id for task in tasks} == {"christian.spider"}
    for actor in ("mirjam.keller", "daniel.wenger", "eliane.rossi", "christian.man", "thomas.kriegli"):
        assert decide(client, request, actor).status_code == 403
    inbox = client.get("/api/v1/domain-change-requests", headers=headers("christian.spider")).json()
    assert next(item for item in inbox if item["id"] == request["id"])["canReview"] is True


def test_alds_approval_requires_revision_and_creates_domain_atomically(client, session_factory):
    request = submit(client)
    assert decide(client, request, "christian.spider", revision=None).status_code == 428
    assert decide(client, request, "christian.spider", revision=2).status_code == 412
    accepted = decide(client, request, "christian.spider")
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "approved" and accepted.json()["reviewerUserId"] == "christian.spider"
    domain = client.get('/api/v1/domains/' + accepted.json()["targetDomainId"]).json()
    assert domain["lifecycle"] == "active" and domain["ownerUserId"] == "daniel.wenger"
    assert decide(client, request, "christian.spider").status_code == 409
    with session_factory() as session:
        tasks = list(session.scalars(select(WorkflowTask).where(WorkflowTask.domain_change_request_id == uuid.UUID(request["id"]))))
        assert all(task.status == "completed" for task in tasks if task.task_type == "domain_change_review")
        assert any(task.task_type == "domain_change_decision" and task.assignee_user_id == "mirjam.keller" for task in tasks)


def test_no_self_approval_no_direct_creation_and_no_profile_role_substitute(client, session_factory):
    assert client.post("/api/v1/domains", headers=headers("daniel.wenger"), json=BODY["payload"]).status_code == 409
    response = client.post("/api/v1/domain-change-requests", headers=headers("christian.spider"), json=BODY)
    assert response.status_code == 409
    request = submit(client)
    with session_factory() as session:
        from daca_catalog.models import DemoUser
        person = session.get(DemoUser, "daniel.wenger")
        person.roles = [*person.roles, "alds"]
        session.commit()
    assert decide(client, request, "daniel.wenger").status_code == 403


def test_current_mandate_is_rechecked_and_rejection_creates_no_domain(client, session_factory):
    request = submit(client)
    with session_factory() as session:
        mandate = session.get(OrganizationStewardMandate, "vbs-armasuisse")
        mandate.active = False
        session.commit()
    assert decide(client, request, "christian.spider").status_code == 403
    tasks = client.get('/api/v1/tasks/mine', headers=headers('christian.spider')).json()
    assert not any(task.get('domainChangeRequestId') == request['id'] for task in tasks)
    with session_factory() as session:
        session.get(OrganizationStewardMandate, "vbs-armasuisse").active = True
        session.commit()
    tasks = client.get('/api/v1/tasks/mine', headers=headers('christian.spider')).json()
    assert any(task.get('domainChangeRequestId') == request['id'] for task in tasks)
    rejected = decide(client, request, "christian.spider", decision="reject")
    assert rejected.status_code == 200 and rejected.json()["targetDomainId"] is None


def test_mandated_deputy_can_decide_and_review_cannot_move_to_another_office(client):
    body = {"operation": "create", "payload": {**BODY["payload"], "ownerUserId": "ariane.keller", "deputyOwnerUserId": "kassandra.valdata"}}
    request = submit(client, body=body)
    assert decide(client, request, "joel.ruod").status_code == 200
    request = submit(client)
    edit = client.patch(f'/api/v1/domain-change-requests/{request["id"]}', headers=headers("christian.spider", 1),
                        json={"reviewPayload": body["payload"]})
    assert edit.status_code == 403
    assert decide(client, request, "christian.spider").status_code == 200


def test_expired_primary_scope_never_uses_directory_fallback(client, session_factory):
    with session_factory() as session:
        for membership in session.scalars(select(FederalPersonMembership).where(FederalPersonMembership.user_id == "daniel.wenger")):
            membership.valid_to = date(2021, 1, 1)
        session.add(FederalPersonMembership(id=uuid.uuid4(), user_id="daniel.wenger", organization_id="vbs-armasuisse-immobilien",
                    is_primary=True, valid_from=date(2020, 1, 1), valid_to=date(2021, 1, 1)))
        session.commit()
    response = client.post("/api/v1/domain-change-requests", headers=headers("mirjam.keller"), json=BODY)
    assert response.status_code == 409
