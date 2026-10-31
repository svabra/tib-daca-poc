import uuid
from concurrent.futures import ThreadPoolExecutor

import pytest
from daca_catalog.modeling_seed import PERSONNEL_DOMAIN_ID, seed_modeling_catalog
from daca_catalog.models import (
    AuditEvent,
    CatalogObjectResponsibility,
    DemoUser,
    Domain,
    GlossaryTermDomain,
    SemanticGraphState,
)
from sqlalchemy import func, select


def headers(actor="christian.man"):
    return {"X-DaCa-User": actor}


def prepare(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        domains = [str(identity) for identity in session.scalars(select(Domain.id).where(Domain.lifecycle == "active").order_by(Domain.id))]
        term = session.scalar(select(GlossaryTermDomain.term_id).where(GlossaryTermDomain.domain_id == PERSONNEL_DOMAIN_ID))
        for domain_id in domains:
            session.add(CatalogObjectResponsibility(id=uuid.uuid4(),user_id="sibilla.micheli",role="data_owner",domain_id=uuid.UUID(domain_id),provenance="test-fixture"))
        session.add(DemoUser(id="graph-reader", display_name="Graph Reader", organization="Demo", email="reader@example.test", roles=["data_consumer"], active=True))
        session.commit()
        return domains, str(term)


def test_concept_layout_is_shared_survives_seed_and_never_changes_glossary(client, session_factory):
    _, term = prepare(session_factory)
    path = f"/api/v1/semantic-graphs/concepts/{PERSONNEL_DOMAIN_ID}"
    original = client.get("/api/v1/glossary/terms", headers=headers()).json()
    positions = {f"term:{term}": {"x": 600, "y": 250}, f"domain:{PERSONNEL_DOMAIN_ID}": {"x": 50, "y": 60}}
    result = client.put(path, headers=headers(), json={"revision": 0, "positions": positions})
    assert result.status_code == 200, result.text
    assert result.json()["revision"] == 1
    for actor in ("christian.spider", "graph-reader"):
        read = client.get(path, headers=headers(actor))
        assert read.status_code == 200 and read.json()["positions"] == positions
    assert not client.get(path, headers=headers("graph-reader")).json()["canEditLayout"]
    assert client.put(path, headers=headers("graph-reader"), json={"revision": 1, "positions": {}}).status_code == 403
    with session_factory() as session:
        seed_modeling_catalog(session)
        assert session.get(SemanticGraphState, f"concepts:{PERSONNEL_DOMAIN_ID}").revision == 1
    after = client.get("/api/v1/glossary/terms", headers=headers()).json()
    before_by_id = {term["id"]: term for term in original}
    differences = {term["id"]: {key: (before_by_id.get(term["id"], {}).get(key), value) for key, value in term.items() if before_by_id.get(term["id"], {}).get(key) != value} for term in after}
    assert after == original, {identity: fields for identity, fields in differences.items() if fields}
    assert client.put(path, headers=headers(), json={"revision": 0, "positions": {}}).status_code == 409
    reset = client.put(path, headers=headers(), json={"revision": 1, "positions": {}})
    assert reset.status_code == 200 and reset.json()["positions"] == {}


def test_domain_links_need_object_owner_and_cannot_bypass_term_approval(client, session_factory):
    domains, _ = prepare(session_factory)
    payload = {"revision": 0, "positions": {}, "relations": [{"sourceId": domains[0], "targetId": domains[1], "relationType": "related"}]}
    path = "/api/v1/semantic-graphs/domains"
    assert client.put(path, headers=headers(), json=payload).status_code == 403
    response = client.put(path, headers=headers("sibilla.micheli"), json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["relations"] == payload["relations"]
    # Layout editors can retain the relationship graph, but cannot replace it.
    assert client.put(path, headers=headers(), json={"revision": 1, "positions": {f"domain:{domains[0]}": {"x": 120, "y": 90}}}).status_code == 200
    assert client.get(path, headers=headers()).json()["relations"] == payload["relations"]
    payload["revision"] = 0
    assert client.put(f"/api/v1/semantic-graphs/concepts/{PERSONNEL_DOMAIN_ID}", headers=headers("sibilla.micheli"), json=payload).status_code == 403


@pytest.mark.parametrize("relation_type", ["interfacesWith", "overlapsWith"])
def test_specific_domain_relationship_types_survive_save_seed_and_reload(client, session_factory, relation_type):
    domains, _ = prepare(session_factory)
    path = "/api/v1/semantic-graphs/domains"
    original = {"sourceId": domains[0], "targetId": domains[1], "relationType": "related"}
    assert client.put(path, headers=headers("sibilla.micheli"), json={"revision": 0, "positions": {}, "relations": [original]}).status_code == 200
    changed = {**original, "relationType": relation_type}
    payload = {"revision": 1, "positions": {}, "relations": [changed]}
    assert client.put(path, headers=headers(), json=payload).status_code == 403
    saved = client.put(path, headers=headers("sibilla.micheli"), json=payload)
    assert saved.status_code == 200 and saved.json()["relations"] == [changed], saved.text
    with session_factory() as session:
        seed_modeling_catalog(session)
        row = session.get(SemanticGraphState, "domains")
        assert row.relations == [changed] and row.revision == 2
        audit = session.scalar(select(AuditEvent).where(AuditEvent.resource_type == "semantic-graph", AuditEvent.revision == 2))
        assert audit.details["previousRelations"] == [original] and audit.details["relations"] == [changed]
    assert client.get(path, headers=headers("graph-reader")).json()["relations"] == [changed]
    duplicate = {"sourceId": domains[1], "targetId": domains[0], "relationType": relation_type}
    assert client.put(path, headers=headers("sibilla.micheli"), json={"revision": 2, "positions": {}, "relations": [changed, duplicate]}).status_code == 422
    assert client.get(path, headers=headers()).json()["revision"] == 2


@pytest.mark.parametrize("case", ["self", "duplicate", "cycle", "missing", "unknown-position", "negative"])
def test_invalid_domain_graph_has_no_partial_layout_or_audit(client, session_factory, case):
    domains, _ = prepare(session_factory)
    a, b, c = domains[:3]
    positions = {f"domain:{a}": {"x": 50, "y": 50}}
    relations = [{"sourceId": a, "targetId": b, "relationType": "partOf"}]
    if case == "self":
        relations[0]["targetId"] = a
    elif case == "duplicate":
        relations.append({"sourceId": b, "targetId": a, "relationType": "related"})
    elif case == "cycle":
        relations.extend([{"sourceId": b, "targetId": c, "relationType": "partOf"}, {"sourceId": c, "targetId": a, "relationType": "partOf"}])
    elif case == "missing":
        relations[0]["targetId"] = "00000000-0000-0000-0000-000000000000"
    elif case == "unknown-position":
        positions = {"untrusted": {"x": 50, "y": 50}}
    else:
        positions[f"domain:{a}"]["x"] = -1
    result = client.put("/api/v1/semantic-graphs/domains", headers=headers("sibilla.micheli"), json={"revision": 0, "positions": positions, "relations": relations})
    assert result.status_code == 422, result.text
    with session_factory() as session:
        assert session.get(SemanticGraphState, "domains") is None
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.resource_type == "semantic-graph")) == 0


def test_concurrent_first_layout_saves_are_serialized(client, session_factory):
    domains, _ = prepare(session_factory)

    def save(x):
        return client.put("/api/v1/semantic-graphs/domains", headers=headers(), json={"revision": 0, "positions": {f"domain:{domains[0]}": {"x": x, "y": 50}}})

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, [100, 200]))
    assert sorted(result.status_code for result in results) == [200, 409]
    with session_factory() as session:
        assert session.get(SemanticGraphState, "domains").revision == 1


def test_concept_layout_accepts_only_direct_active_domain_neighbors(client, session_factory):
    domains, _ = prepare(session_factory)
    root = str(PERSONNEL_DOMAIN_ID)
    neighbor, distant = [identity for identity in domains if identity != root][:2]
    relations = [{"sourceId": root, "targetId": neighbor, "relationType": "related"},
                 {"sourceId": neighbor, "targetId": distant, "relationType": "partOf"}]
    assert client.put("/api/v1/semantic-graphs/domains", headers=headers("sibilla.micheli"), json={"revision": 0, "positions": {}, "relations": relations}).status_code == 200
    path = f"/api/v1/semantic-graphs/concepts/{root}"
    positions = {f"domain:{neighbor}": {"x": 550, "y": 150}}
    saved = client.put(path, headers=headers(), json={"revision": 0, "positions": positions})
    assert saved.status_code == 200, saved.text
    assert client.get(path, headers=headers("graph-reader")).json()["positions"] == positions
    denied = client.put(path, headers=headers(), json={"revision": 1, "positions": {f"domain:{distant}": {"x": 800, "y": 150}}})
    assert denied.status_code == 422
    assert client.get(path, headers=headers()).json()["revision"] == 1


def test_retired_domain_links_remain_readable_and_removable_without_blocking_other_edits(client, session_factory):
    domains, _ = prepare(session_factory)
    from daca_catalog.main import _create_domain
    with session_factory() as session:
        created = _create_domain(session, {"ownerUserId": "sibilla.micheli", "deputyOwnerUserId": "sandro.wenger", "localizations": [{"language": "de", "preferredLabel": "Retirement graph fixture", "definition": "Synthetic fixture."}]})
        a = str(created.id)
        session.commit()
    b, c = domains[:2]
    path = "/api/v1/semantic-graphs/domains"
    old = {"sourceId": a, "targetId": b, "relationType": "related"}
    assert client.put(path, headers=headers("sibilla.micheli"), json={"revision": 0, "positions": {}, "relations": [old]}).status_code == 200
    domain = client.get(f"/api/v1/domains/{a}", headers=headers()).json()
    retired = client.post(f"/api/v1/domains/{a}/retire", headers={**headers("sibilla.micheli"), "If-Match": f'"{domain["revision"]}"'}, json={})
    assert retired.status_code == 200, retired.text
    assert client.get(path, headers=headers()).json()["relations"] == [old]
    new = {"sourceId": b, "targetId": c, "relationType": "related"}
    response = client.put(path, headers=headers("sibilla.micheli"), json={"revision": 1, "positions": {}, "relations": [old, new]})
    assert response.status_code == 200, response.text
    assert client.put(path, headers=headers("sibilla.micheli"), json={"revision": 2, "positions": {}, "relations": [new]}).status_code == 200
