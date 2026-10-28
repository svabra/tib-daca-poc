import uuid

from daca_catalog.modeling_seed import PERSONNEL_DOMAIN_ID
from daca_catalog.models import (
    AuditEvent,
    CatalogObjectResponsibility,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermRelation,
)
from sqlalchemy import func, select
from test_semantic_graphs import headers, prepare


def external_term(session_factory, domain_id):
    identity = uuid.uuid4()
    with session_factory() as session:
        session.add(GlossaryTerm(id=identity, urn=f"urn:daca:glossary-term:{identity}", origin_catalog_id="urn:daca:catalog:bit-poc", revision=1, content_hash="a" * 64, lifecycle="active"))
        session.flush()
        session.add(GlossaryTermLocalization(term_id=identity, language="de", preferred_label="Referenzbegriff", alternative_labels=[], definition="Synthetic reference.", normalized_label="referenzbegriff"))
        session.add(GlossaryTermDomain(term_id=identity, domain_id=uuid.UUID(domain_id)))
        session.add(CatalogObjectResponsibility(id=uuid.uuid4(),user_id="sibilla.micheli",role="data_owner",glossary_term_id=identity))
        session.commit()
    return identity


def test_hidden_and_reference_cards_are_shared_without_assigning_a_term_to_the_domain(client, session_factory):
    domains, primary = prepare(session_factory)
    other = next(identity for identity in domains if identity != str(PERSONNEL_DOMAIN_ID))
    extra = external_term(session_factory, other)
    path = f"/api/v1/semantic-graphs/concepts/{PERSONNEL_DOMAIN_ID}"
    body = {"revision": 0, "positions": {f"term:{extra}": {"x": 700, "y": 300}}, "hiddenNodeIds": [f"term:{primary}"], "additionalNodeIds": [f"term:{extra}"]}
    response = client.put(path, headers=headers(), json=body)
    assert response.status_code == 200, response.text
    read = client.get(path, headers=headers("graph-reader")).json()
    assert read["hiddenNodeIds"] == body["hiddenNodeIds"] and read["additionalNodeIds"] == body["additionalNodeIds"]
    with session_factory() as session:
        assert session.get(GlossaryTermDomain, (extra, PERSONNEL_DOMAIN_ID)) is None
    assert client.put(path, headers=headers(), json={**body, "revision": 1, "additionalNodeIds": ["domain:not-a-term"]}).status_code == 422
    assert client.put(path, headers=headers(), json={**body, "revision": 1, "hiddenNodeIds": ["untrusted"]}).status_code == 422


def test_direct_term_deletion_requires_object_owner_and_current_revision_and_keeps_references(client, session_factory):
    domains, primary = prepare(session_factory)
    extra = external_term(session_factory, domains[0])
    with session_factory() as session:
        session.add(GlossaryTermRelation(id=uuid.uuid4(), source_term_id=uuid.UUID(primary), target_term_id=extra, relation="related"))
        session.commit()
    path = f"/api/v1/glossary/terms/{extra}/retire-direct"
    assert client.post(path, headers={**headers(), "If-Match": '"1"'}, json={}).status_code == 403
    assert client.post(path, headers={**headers("sibilla.micheli"), "If-Match": '"99"'}, json={}).status_code == 412
    response = client.post(path, headers={**headers("sibilla.micheli"), "If-Match": '"1"'}, json={})
    assert response.status_code == 200, response.text
    assert response.json()["lifecycle"] == "retired" and response.json()["revision"] == 2
    with session_factory() as session:
        assert session.get(GlossaryTerm, extra).retired_at is not None
        assert session.scalar(select(func.count()).select_from(GlossaryTermRelation).where(GlossaryTermRelation.target_term_id == extra)) == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.resource_id == str(extra), AuditEvent.action == "retired-direct")) == 1
    graph = client.get(f"/api/v1/semantic-graphs/concepts/{PERSONNEL_DOMAIN_ID}", headers=headers("sibilla.micheli")).json()
    assert f"term:{extra}" in graph["retiredNodeIds"] and f"term:{extra}" not in graph["deletableNodeIds"]


def test_direct_term_deletion_rejects_open_proposals(client, session_factory):
    _, primary = prepare(session_factory)
    proposal = client.post("/api/v1/glossary/term-proposals", headers=headers(), json={"operation": "update", "targetTermId": primary, "expectedTargetRevision": 1, "autoAttach": False, "payload": {"domainIds": [str(PERSONNEL_DOMAIN_ID)], "localizations": [{"language": "de", "preferredLabel": "Offener Vorschlag", "alternativeLabels": [], "definition": "Synthetic pending update."}], "relations": []}})
    assert proposal.status_code == 201, proposal.text
    result = client.post(f"/api/v1/glossary/terms/{primary}/retire-direct", headers={**headers("christian.spider"), "If-Match": '"1"'}, json={})
    assert result.status_code == 409 and "offene" in result.json()["detail"]
    with session_factory() as session:
        assert session.get(GlossaryTerm, uuid.UUID(primary)).lifecycle == "active"
