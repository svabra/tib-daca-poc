import uuid

from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import (
    AuditEvent,
    CatalogObjectResponsibility,
    DemoUser,
    Domain,
    GlossaryTerm,
    SemanticGraphState,
)
from sqlalchemy import select


def headers(actor="christian.spider"):
    return {"X-DaCa-User": actor}


def prepare(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        domain = session.scalar(select(Domain).where(Domain.owner_user_id == "sibilla.micheli", Domain.lifecycle == "active"))
        term = session.scalar(select(GlossaryTerm).join(CatalogObjectResponsibility, CatalogObjectResponsibility.glossary_term_id == GlossaryTerm.id).where(CatalogObjectResponsibility.user_id == domain.owner_user_id, CatalogObjectResponsibility.role == "data_owner", GlossaryTerm.lifecycle == "active"))
        assert domain and term
        session.add(DemoUser(id="org-view-reader", display_name="Reader", organization="Demo", email="reader@example.test", roles=["data_consumer"], active=True))
        session.commit()
        return str(domain.id), str(term.id)


def test_organization_network_shares_layout_without_changing_semantics(client, session_factory):
    domain, term = prepare(session_factory)
    path = "/api/v1/semantic-graphs/organizations/vbs-verteidigung"
    baseline = client.get(path, headers=headers()).json()
    assert domain in baseline["scopeDomainIds"] and term in baseline["scopeTermIds"]
    assert baseline["canEditLayout"] and not baseline["canEditRelations"]
    positions = {f"domain:{domain}": {"x": 30, "y": 60}, f"term:{term}": {"x": 400, "y": 120}}
    glossary = client.get("/api/v1/glossary/terms", headers=headers()).json()
    result = client.put(path, headers=headers(), json={"revision": 0, "positions": positions})
    assert result.status_code == 200, result.text
    assert result.json()["revision"] == 1
    for actor in ("sibilla.micheli", "org-view-reader"):
        read = client.get(path, headers=headers(actor))
        assert read.status_code == 200 and read.json()["positions"] == positions
    assert not client.get(path, headers=headers("org-view-reader")).json()["canEditLayout"]
    assert client.put(path, headers=headers("org-view-reader"), json={"revision": 1, "positions": {}}).status_code == 403
    assert client.put(path, headers=headers(), json={"revision": 0, "positions": {}}).status_code == 409
    assert client.get("/api/v1/glossary/terms", headers=headers()).json() == glossary
    with session_factory() as session:
        seed_modeling_catalog(session)
        assert session.get(SemanticGraphState, "organizations:vbs-verteidigung").revision == 1
        assert session.scalar(select(AuditEvent).where(AuditEvent.resource_id == "organizations:vbs-verteidigung"))


def test_organization_scope_uses_ownership_and_explicit_scope_not_term_classification(client, session_factory):
    domain, term = prepare(session_factory)
    with session_factory() as session:
        owners = list(session.scalars(select(CatalogObjectResponsibility).where(CatalogObjectResponsibility.glossary_term_id == uuid.UUID(term), CatalogObjectResponsibility.role == "data_owner")))
        for row in owners:
            row.organization_id = "vbs-armasuisse-immobilien"
        session.commit()
    defense = client.get("/api/v1/semantic-graphs/organizations/vbs-verteidigung", headers=headers()).json()
    estate = client.get("/api/v1/semantic-graphs/organizations/vbs-armasuisse-immobilien", headers=headers()).json()
    assert domain in defense["scopeDomainIds"] and term not in defense["scopeTermIds"]
    assert term in estate["scopeTermIds"] and domain not in estate["scopeDomainIds"]
    # The organizational view never reclassifies or reassigns the object itself.
    with session_factory() as session:
        assert session.get(Domain, uuid.UUID(domain)).owner_user_id == "sibilla.micheli"


def test_organization_scope_rejects_unknown_nodes_and_domain_relation_writes(client, session_factory):
    domain, _term = prepare(session_factory)
    path = "/api/v1/semantic-graphs/organizations/vbs-armasuisse-immobilien"
    assert client.put(path, headers=headers(), json={"revision": 0, "positions": {f"domain:{domain}": {"x": 30, "y": 60}}}).status_code == 422
    result = client.put(path, headers=headers(), json={"revision": 0, "positions": {}, "relations": [{"sourceId": domain, "targetId": str(uuid.uuid4()), "relationType": "related"}]})
    assert result.status_code == 403
    assert client.get("/api/v1/semantic-graphs/organizations/missing", headers=headers()).status_code == 404
    assert client.get("/api/v1/semantic-graphs/organizations/vbs-verteidigung", headers=headers()).json()["revision"] == 0
