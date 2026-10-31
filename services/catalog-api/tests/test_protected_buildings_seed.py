from daca_catalog import seed
from daca_catalog.modeling_seed import REAL_ESTATE_DOMAIN_ID, seed_modeling_catalog
from daca_catalog.models import AuditEvent, DataProduct, DemoUser, ProvenanceEvent
from daca_catalog.organization_network import organization_network
from daca_catalog.organization_network_seed import seed_organization_explorer
from daca_catalog.protected_buildings_seed import (
    PRODUCT_ID,
    PRODUCT_URN,
    seed_protected_buildings_product,
)
from sqlalchemy import select


def assert_catalog_flow(session):
    product = session.get(DataProduct, PRODUCT_ID)
    assert product.urn == PRODUCT_URN and product.owner_user_id == "giuseppe.starwars"
    assert product.deputy_owner_user_id == "thomas.wikinger"
    assert {link.domain_id for link in product.domain_assignments} == {REAL_ESTATE_DOMAIN_ID}
    assert product.extra_metadata["catalogUsage"]["consumerUserIds"] == ["christian.man"]
    assert product.active_policy_revision is None and not product.endpoints
    graph = organization_network(session, "sibilla.micheli")
    edge = next(edge for edge in graph["relations"]
                if edge["sourceId"] == "vbs-armasuisse" and edge["targetId"] == "vbs-verteidigung")
    assert edge["count"] == 1 and not edge["inferred"]
    nodes = {node["id"]: node for node in graph["nodes"]}
    assert nodes["vbs-armasuisse"]["directProductCount"] >= 1
    assert nodes["vbs-verteidigung"]["directConsumedProductCount"] >= 1
    for identity in ("vbs-armasuisse", "vbs-verteidigung"):
        assert f"product:{PRODUCT_ID}" in nodes[identity]["objectKeys"]
    assert session.scalar(select(ProvenanceEvent).where(ProvenanceEvent.data_product_id == PRODUCT_ID))
    assert session.scalar(select(AuditEvent).where(AuditEvent.resource_id == str(PRODUCT_ID)))


def test_buildings_fixture_reuses_people_and_preserves_later_edits(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_organization_explorer(session)
        people = {user.id: list(user.roles) for user in session.scalars(select(DemoUser))}
        assert seed_protected_buildings_product(session)
        assert_catalog_flow(session)
        product = session.get(DataProduct, PRODUCT_ID)
        product.title = "Manuell bearbeitet"
        product.lifecycle = "retired"
        session.commit()
        assert not seed_protected_buildings_product(session)
        assert product.title == "Manuell bearbeitet" and product.lifecycle == "retired"
        assert {user.id: list(user.roles) for user in session.scalars(select(DemoUser))} == people
        assert not any(edge["sourceId"] == "vbs-armasuisse" and edge["targetId"] == "vbs-verteidigung"
                       for edge in organization_network(session, "sibilla.micheli")["relations"])


def test_image_seed_entrypoint_provisions_buildings_on_existing_database(session_factory, monkeypatch):
    # Dockerfile CMD runs this exact entrypoint before serving, even with SEED_ON_STARTUP=false.
    monkeypatch.setattr(seed, "default_session_factory", lambda settings: session_factory)
    seed.main()
    with session_factory() as session:
        assert_catalog_flow(session)
        session.get(DataProduct, PRODUCT_ID).title = "Bestehende PoC-Bearbeitung"
        session.commit()
    seed.main()
    with session_factory() as session:
        assert session.get(DataProduct, PRODUCT_ID).title == "Bestehende PoC-Bearbeitung"
