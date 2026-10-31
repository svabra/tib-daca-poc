from daca_catalog import seed
from daca_catalog.building_demand_seed import PRODUCT_ID, seed_building_demand_product
from daca_catalog.domain_glossary_seed import DEFENCE_DOMAIN_ID
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import AuditEvent, DataProduct, DemoUser, ProvenanceEvent
from daca_catalog.organization_network import organization_network
from daca_catalog.protected_buildings_seed import PRODUCT_ID as INVENTORY_ID
from daca_catalog.protected_buildings_seed import seed_protected_buildings_product
from sqlalchemy import func, select


def reciprocal_edges(session):
    return {(edge["sourceId"], edge["targetId"]): edge for edge in organization_network(session, "sibilla.micheli")["relations"]
            if {edge["sourceId"], edge["targetId"]} == {"vbs-armasuisse", "vbs-verteidigung"}}


def test_demand_adds_one_reverse_product_and_preserves_existing_users_and_inventory(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_protected_buildings_product(session)
        original = session.get(DataProduct, INVENTORY_ID)
        original.title = "Bestehende Gebäudedaten"
        people = {user.id: list(user.roles) for user in session.scalars(select(DemoUser))}
        assert seed_building_demand_product(session)
        product = session.get(DataProduct, PRODUCT_ID)
        assert product.owner_user_id == "lawrence.hill" and product.deputy_owner_user_id == "hong.an.captain"
        assert {link.domain_id for link in product.domain_assignments} == {DEFENCE_DOMAIN_ID}
        assert product.extra_metadata["catalogUsage"]["consumerUserIds"] == ["giuseppe.starwars"]
        assert product.active_policy_revision is None and not product.endpoints
        edges = reciprocal_edges(session)
        assert set(edges) == {("vbs-armasuisse", "vbs-verteidigung"), ("vbs-verteidigung", "vbs-armasuisse")}
        assert all(edge["count"] == 1 and not edge["inferred"] for edge in edges.values())
        assert original.title == "Bestehende Gebäudedaten"
        assert {user.id: list(user.roles) for user in session.scalars(select(DemoUser))} == people
        assert session.scalar(select(ProvenanceEvent).where(ProvenanceEvent.data_product_id == PRODUCT_ID))
        assert session.scalar(select(AuditEvent).where(AuditEvent.resource_id == str(PRODUCT_ID)))
        product.title = "Bearbeiteter Bedarf"
        product.lifecycle = "retired"
        session.commit()
        assert not seed_building_demand_product(session)
        assert product.title == "Bearbeiteter Bedarf" and product.lifecycle == "retired"
        assert set(reciprocal_edges(session)) == {("vbs-armasuisse", "vbs-verteidigung")}


def test_image_seed_upgrades_existing_one_way_fixture_idempotently(session_factory, monkeypatch):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_protected_buildings_product(session)
        session.commit()
        assert session.get(DataProduct, PRODUCT_ID) is None
    monkeypatch.setattr(seed, "default_session_factory", lambda settings: session_factory)
    seed.main()
    seed.main()
    with session_factory() as session:
        assert len(reciprocal_edges(session)) == 2
        assert session.get(DataProduct, PRODUCT_ID).revision == 1
        assert session.scalar(select(func.count()).select_from(ProvenanceEvent).where(ProvenanceEvent.data_product_id == PRODUCT_ID)) == 1
