from daca_catalog.modeling_seed import PERSONNEL_DOMAIN_ID, seed_modeling_catalog
from daca_catalog.models import GlossaryTermProposal
from sqlalchemy import func, select

HEADERS = {"X-DaCa-User": "christian.man"}


def workspace(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    terms = client.get(f"/api/v1/glossary/terms?domainId={PERSONNEL_DOMAIN_ID}", headers=HEADERS).json()
    source = next(row for row in terms if row["preferredLabel"] == "Mitarbeitende")
    target = next(row for row in terms if row["preferredLabel"] == "Anstellung")
    body = {"operation": "update", "targetTermId": source["id"], "expectedTargetRevision": source["revision"],
        "payload": {"domainIds": source["domainIds"], "localizations": [
            {key: label[key] for key in ("language", "preferredLabel", "alternativeLabels", "definition")}
            for label in source["localizations"]], "relations": [
                {"relation": row["relation"], "targetTermId": row["targetTermId"], "targetUri": row["targetUri"]}
                for row in source["relations"]] + [{"relation": "related", "targetTermId": target["id"]}]}}
    return source, target, body


def test_canvas_relationship_edit_is_a_reviewed_proposal_not_direct_publication(client, session_factory):
    source, target, body = workspace(client, session_factory)
    created = client.post("/api/v1/glossary/term-proposals", headers=HEADERS, json=body)
    assert created.status_code == 201, created.text
    proposal = created.json()
    assert proposal["status"] == "in_review"
    unchanged = client.get(f"/api/v1/glossary/terms/{source['id']}").json()
    assert unchanged["revision"] == source["revision"]
    assert target["id"] not in {row["targetTermId"] for row in unchanged["relations"]}
    review = proposal["reviews"][0]
    denied = client.post(f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{PERSONNEL_DOMAIN_ID}/decision",
        headers={**HEADERS, "If-Match": '"1"'}, json={"decision": "approve", "comment": "Nicht zuständig"})
    assert denied.status_code == 403
    accepted = client.post(f"/api/v1/glossary/term-proposals/{proposal['id']}/reviews/{PERSONNEL_DOMAIN_ID}/decision",
        headers={"X-DaCa-User": review["ownerUserId"], "If-Match": '"1"'}, json={"decision": "approve", "comment": "Fachlich geprüft"})
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "accepted"
    updated = client.get(f"/api/v1/glossary/terms/{source['id']}").json()
    assert updated["revision"] == source["revision"] + 1
    assert target["id"] in {row["targetTermId"] for row in updated["relations"]}
    assert updated["localizations"] == source["localizations"]


def test_stale_canvas_revision_creates_no_proposals_or_tasks(client, session_factory):
    source, _target, body = workspace(client, session_factory)
    with session_factory() as session:
        before = session.scalar(select(func.count()).select_from(GlossaryTermProposal))
    stale = client.post("/api/v1/glossary/term-proposals", headers=HEADERS,
        json={**body, "expectedTargetRevision": source["revision"] + 1})
    assert stale.status_code == 409, stale.text
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(GlossaryTermProposal)) == before
    # Existing callers without an explicit source revision remain compatible.
    body.pop("expectedTargetRevision")
    assert client.post("/api/v1/glossary/term-proposals", headers=HEADERS, json=body).status_code == 201
