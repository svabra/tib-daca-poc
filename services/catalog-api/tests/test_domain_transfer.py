import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from daca_catalog.modeling_seed import PERSONNEL_MODEL_ID, seed_modeling_catalog
from daca_catalog.models import (
    AuditEvent,
    CatalogObjectResponsibility,
    DemoUser,
    Domain,
    GlossaryTerm,
    GlossaryTermDomain,
    LogicalModelReview,
    WorkflowTask,
)
from daca_catalog.object_governance import governs_domain, term_owner_pair
from daca_catalog.office_governance import (
    provision_steward_mandate,
    seed_requested_steward_mandates,
)
from daca_catalog.seed import seed_catalog
from sqlalchemy import select


def h(actor, revision=1):
    return {"X-DaCa-User":actor,"If-Match":f'"{revision}"'}


def prepare(client, session_factory, label="Verteidigung"):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_requested_steward_mandates(session)
        session.commit()
    return next(row for row in client.get("/api/v1/domains").json() if row["preferredLabel"]==label)


BODY={"ownerUserId":"cinthya.thor","deputyOwnerUserId":"hong.an.captain","reason":"Verantwortung für diese Domäne neu zuweisen."}


@pytest.mark.parametrize(("actor","label"),[
    ("sibilla.micheli","Verteidigung"), ("sandro.wenger","Verteidigung"),
    ("christian.man","Verteidigung"), ("sibilla.micheli","Immobilienmanagement VBS"),
    ("christian.spider","Immobilienmanagement VBS"),
])
def test_owner_deputy_alds_and_department_ldsd_can_transfer(client, session_factory, actor, label):
    domain=prepare(client,session_factory,label)
    path=f'/api/v1/domains/{domain["id"]}'
    assert client.get(path,headers=h(actor)).json()["canTransferOwnership"] is True
    result=client.post(path+"/transfer",headers=h(actor),json=BODY)
    assert result.status_code==200,result.text
    assert result.json()["ownerUserId"]==BODY["ownerUserId"] and result.json()["revision"]==2
    assert result.json()["localizations"]==domain["localizations"]
    with session_factory() as session:
        current=session.get(Domain,uuid.UUID(domain["id"]))
        assert not governs_domain(session,domain["ownerUserId"],current)
        assert governs_domain(session,"cinthya.thor",current)
        event=session.scalar(select(AuditEvent).where(AuditEvent.resource_id==domain["id"],AuditEvent.action=="ownership-transferred"))
        assert event.actor==actor and event.details["previousOwnerUserId"]==domain["ownerUserId"]
        assert event.details["reason"]==BODY["reason"]
        seed_catalog(session)
        assert current.owner_user_id=="cinthya.thor"


def test_foreign_mandates_and_stale_or_revoked_authority_do_not_transfer(client,session_factory):
    domain=prepare(client,session_factory)
    path=f'/api/v1/domains/{domain["id"]}'
    for actor in ("kassandra.valdata","christian.spider","thomas.kriegli","joel.ruod"):
        assert client.get(path,headers=h(actor)).json()["canTransferOwnership"] is False
        assert client.post(path+"/transfer",headers=h(actor),json=BODY).status_code==403
    with session_factory() as session:
        provision_steward_mandate(session,organization_id="vbs-verteidigung",user_id="christian.man",mandate_type="alds",expected_revision=1,operator="test",decision_reference="Mandate revoked",active=False)
        session.commit()
    assert client.post(path+"/transfer",headers=h("christian.man"),json=BODY).status_code==403
    assert client.get(path).json()["revision"]==1


def test_transfer_validates_people_and_revision_before_mutating(client,session_factory):
    domain=prepare(client,session_factory)
    path=f'/api/v1/domains/{domain["id"]}/transfer'
    assert client.post(path,headers={"X-DaCa-User":"sibilla.micheli"},json=BODY).status_code==428
    assert client.post(path,headers=h("sibilla.micheli"),json={**BODY,"ownerUserId":"sibilla.micheli"}).status_code==409
    assert client.post(path,headers=h("sibilla.micheli"),json={**BODY,"deputyOwnerUserId":BODY["ownerUserId"]}).status_code==422
    with session_factory() as session:
        session.get(DemoUser,"cinthya.thor").active=False
        session.commit()
    assert client.post(path,headers=h("sibilla.micheli"),json=BODY).status_code==422
    assert client.get(path.removesuffix("/transfer")).json()["revision"]==1


def test_competing_transfers_commit_only_one_decision(client,session_factory):
    domain=prepare(client,session_factory)
    barrier=Barrier(2)
    def transfer(actor):
        barrier.wait()
        return client.post(f'/api/v1/domains/{domain["id"]}/transfer',headers=h(actor),json=BODY).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(transfer,["sibilla.micheli","christian.man"]))==[200,412]
    with session_factory() as session:
        assert len(list(session.scalars(select(AuditEvent).where(AuditEvent.resource_id==domain["id"],AuditEvent.action=="ownership-transferred"))))==1


def test_office_scope_is_pinned_and_hidden_old_owner_rows_are_revoked(client,session_factory):
    domain=prepare(client,session_factory,"Immobilienmanagement VBS")
    with session_factory() as session:
        session.add(CatalogObjectResponsibility(id=uuid.uuid4(),domain_id=uuid.UUID(domain["id"]),user_id=domain["ownerUserId"],role="data_owner"))
        session.commit()
    result=client.post(f'/api/v1/domains/{domain["id"]}/transfer',headers=h("christian.spider"),json=BODY)
    assert result.status_code==200,result.text
    with session_factory() as session:
        seed_modeling_catalog(session)
    path=f'/api/v1/domains/{domain["id"]}'
    assert client.get(path,headers=h("christian.spider")).json()["canTransferOwnership"] is True
    assert client.get(path,headers=h("christian.man")).json()["canTransferOwnership"] is False
    assert client.get(path,headers=h(domain["ownerUserId"])).json()["canTransferOwnership"] is False


def test_ldsd_covers_legacy_office_without_parent_but_not_another_department(client,session_factory):
    domain=prepare(client,session_factory,"Mehrwertsteuer")
    path=f'/api/v1/domains/{domain["id"]}'
    assert client.get(path,headers=h("daniel.aebischer")).json()["canTransferOwnership"] is False
    with session_factory() as session:
        provision_steward_mandate(session,organization_id="efd",user_id="daniel.aebischer",mandate_type="ldsd",expected_revision=0,operator="test",decision_reference="Department appointment")
        session.commit()
    assert client.post(path+"/transfer",headers=h("daniel.aebischer"),json=BODY).status_code==200
    assert client.get(path,headers=h("daniel.aebischer")).json()["canTransferOwnership"] is True
    assert client.get(path,headers=h("sibilla.micheli")).json()["canTransferOwnership"] is False
    assert client.get(path,headers=h("thomas.kriegli")).json()["canTransferOwnership"] is True


def test_unscoped_handover_does_not_acquire_the_recipients_home_office(client,session_factory):
    domain=prepare(client,session_factory,"Quellensteuer")
    path=f'/api/v1/domains/{domain["id"]}'
    result=client.post(path+"/transfer",headers=h("noemie.rochat"),json=BODY)
    assert result.status_code==200,result.text
    assert client.get(path,headers=h("christian.man")).json()["canTransferOwnership"] is False
    network=client.get("/api/v1/semantic-graphs/organizations/vbs-verteidigung",headers=h("cinthya.thor")).json()
    assert domain["id"] not in network["scopeDomainIds"]


def test_model_review_task_moves_to_deputy_when_new_owner_is_submitter(client,session_factory):
    domain=prepare(client,session_factory,"Personal")
    model=client.get(f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}",headers=h("cinthya.thor")).json()
    submitted=client.post(f'/api/v1/logical-models/{PERSONNEL_MODEL_ID}/versions/{model["versionId"]}/submit',headers=h("cinthya.thor",model["lockVersion"]))
    assert submitted.status_code==200,submitted.text
    review_id=submitted.json()["reviewId"]
    result=client.post(f'/api/v1/domains/{domain["id"]}/transfer',headers=h("christian.man"),json=BODY)
    assert result.status_code==200,result.text
    with session_factory() as session:
        task=session.scalar(select(WorkflowTask).where(WorkflowTask.logical_model_review_id==uuid.UUID(review_id),WorkflowTask.status!="completed"))
        assert task.assignee_user_id=="hong.an.captain"
        assert session.get(LogicalModelReview,uuid.UUID(review_id)).reviewer_user_id=="christian.spider"
    assert client.get(f"/api/v1/logical-model-reviews/{review_id}",headers=h("cinthya.thor")).json()["canDecide"] is False
    assert client.get(f"/api/v1/logical-model-reviews/{review_id}",headers=h("hong.an.captain")).json()["canDecide"] is True


def test_term_owners_and_other_domain_tasks_do_not_transfer(client,session_factory):
    domain=prepare(client,session_factory)
    from daca_catalog.main import _create_domain
    with session_factory() as session:
        extra = _create_domain(session, {"ownerUserId":"sibilla.micheli","deputyOwnerUserId":"sandro.wenger","localizations":[{"language":"de","preferredLabel":"Weitere Domäne","definition":"Unabhängige Verantwortung."}]})
        second = {"id": str(extra.id)}
        session.commit()
    created=client.post("/api/v1/glossary/term-proposals",headers=h("sandro.wenger"),json={"payload":{"domainIds":[domain["id"],second["id"]],"localizations":[{"language":"de","preferredLabel":"Neuer Reviewbegriff","definition":"Ein Begriff in zwei Domänen."}]}})
    assert created.status_code==201,created.text
    with session_factory() as session:
        term=session.scalar(select(GlossaryTerm).join(GlossaryTermDomain).join(CatalogObjectResponsibility,CatalogObjectResponsibility.glossary_term_id==GlossaryTerm.id).where(GlossaryTermDomain.domain_id==uuid.UUID(domain["id"]),CatalogObjectResponsibility.user_id=="sibilla.micheli",CatalogObjectResponsibility.role=="data_owner"))
        identity=term.id
        owners=term_owner_pair(session,identity)
        revision=term.revision
    updated=client.post("/api/v1/glossary/term-proposals",headers=h("kassandra.valdata"),json={"operation":"update","targetTermId":str(identity),"expectedTargetRevision":revision,"payload":{"domainIds":[domain["id"]],"localizations":[{"language":"de","preferredLabel":"Bestehender Begriff","definition":"Fachliche Aktualisierung mit unveränderter Objektverantwortung."}]}})
    assert updated.status_code==201,updated.text
    result=client.post(f'/api/v1/domains/{domain["id"]}/transfer',headers=h("sibilla.micheli"),json=BODY)
    assert result.status_code==200,result.text
    with session_factory() as session:
        assert term_owner_pair(session,identity)==owners
        own_tasks=list(session.scalars(select(WorkflowTask).where(WorkflowTask.glossary_term_proposal_id==uuid.UUID(updated.json()["id"]),WorkflowTask.status!="completed")))
        assert {task.assignee_user_id for task in own_tasks}==set(owners)
        tasks=list(session.scalars(select(WorkflowTask).where(WorkflowTask.glossary_term_proposal_id==uuid.UUID(created.json()["id"]),WorkflowTask.status!="completed")))
        assert {(t.task_type,t.assignee_user_id) for t in tasks}=={
            ("glossary_term_review","sibilla.micheli"),("glossary_term_review","cinthya.thor"),
            ("glossary_term_collaboration","sandro.wenger"),("glossary_term_collaboration","hong.an.captain"),
        }
