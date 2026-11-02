from daca_catalog import seed
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import DataProduct, SeedMarker
from daca_catalog.rohs_cps_seed import CONTROL_PERSON, DEPUTY, MARKER, OWNER, identity
from sqlalchemy import select


def test_image_entrypoint_adds_rohs_to_existing_catalog_and_preserves_edits(session_factory, monkeypatch):
    # An older PoC already has the foundational/modeling seeds. The image CMD
    # must still install ROHS even when application startup seeding is disabled.
    monkeypatch.setenv("SEED_ON_STARTUP", "false")
    monkeypatch.setattr(seed, "default_session_factory", lambda settings: session_factory)
    with session_factory() as session:
        seed_modeling_catalog(session)
        assert session.get(SeedMarker, MARKER) is None

    seed.main()
    with session_factory() as session:
        assert session.get(SeedMarker, MARKER) is not None
        for key in ("telemetry", "analytics"):
            product = session.get(DataProduct, identity(f"product:{key}"))
            assert product.urn == f"urn:daca:ch:bit:cps:rohs-{key}"
            assert product.owner_user_id == OWNER
            assert product.deputy_owner_user_id == DEPUTY
            assert product.control_person_user_id == CONTROL_PERSON
            assert product.lifecycle == "draft"
            assert not product.endpoints and product.active_policy_revision is None
        edited = session.get(DataProduct, identity("product:telemetry"))
        edited.title = "Bearbeitetes PoC-Beispiel"
        edited.lifecycle = "retired"
        session.commit()

    seed.main()
    with session_factory() as session:
        products = list(session.scalars(select(DataProduct).where(DataProduct.urn.in_([
            "urn:daca:ch:bit:cps:rohs-telemetry", "urn:daca:ch:bit:cps:rohs-analytics",
        ]))))
        assert len(products) == 2
        edited = session.get(DataProduct, identity("product:telemetry"))
        assert edited.title == "Bearbeitetes PoC-Beispiel"
        assert edited.lifecycle == "retired"
