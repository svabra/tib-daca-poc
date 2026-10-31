from daca_catalog.estv_sg_seed import PRODUCT_ID, seed_estv_sg_product
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import AuditEvent, DataProduct, DemoUser, ProvenanceEvent
from daca_catalog.organization_network import organization_network
from daca_catalog.organization_network_seed import seed_organization_explorer
from daca_catalog.seed import ESTV_PRODUCT_ID
from sqlalchemy import select


def test_second_estv_product_counts_once_and_fixture_preserves_edits(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        seed_organization_explorer(session)
        people = {user.id: list(user.roles) for user in session.scalars(select(DemoUser))}
        assert seed_estv_sg_product(session)
        product = session.get(DataProduct, PRODUCT_ID)
        assert product.owner_user_id == "kassandra.valdata"
        assert product.deputy_owner_user_id == "ariane.keller"
        assert {assignment.domain_id for assignment in product.domain_assignments} == {
            assignment.domain_id for assignment in session.get(DataProduct, ESTV_PRODUCT_ID).domain_assignments
        }
        assert product.extra_metadata["catalogUsage"]["consumerUserIds"] == ["beat.stalder", "sarah.brunner"]
        assert product.active_policy_revision is None and not product.endpoints
        graph = organization_network(session, "kassandra.valdata")
        sg = next(node for node in graph["nodes"] if node["label"] == "Kanton St. Gallen")
        edge = next(edge for edge in graph["relations"] if edge["sourceId"] == "efd-estv" and edge["targetId"] == sg["id"])
        assert edge["count"] == 2
        assert sg["consumedProductCount"] == 2
        assert f"product:{PRODUCT_ID}" in sg["objectKeys"]
        assert session.scalar(select(ProvenanceEvent).where(ProvenanceEvent.data_product_id == PRODUCT_ID))
        assert session.scalar(select(AuditEvent).where(AuditEvent.resource_id == str(PRODUCT_ID)))
        product.title = "Manuell angepasst"
        product.lifecycle = "retired"
        session.commit()
        assert not seed_estv_sg_product(session)
        assert product.title == "Manuell angepasst" and product.lifecycle == "retired"
        assert {user.id: list(user.roles) for user in session.scalars(select(DemoUser))} == people
        edge = next(edge for edge in organization_network(session, "kassandra.valdata")["relations"]
                    if edge["sourceId"] == "efd-estv" and edge["targetId"] == sg["id"])
        assert edge["count"] == 1
