import pytest
from daca_catalog.control_people import default_control_person
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import (
    AuditEvent,
    DataProduct,
    DemoUser,
    FederalPersonMembership,
    IdentityDirectoryEntry,
    SeedMarker,
)
from daca_catalog.poc_identity_updates import FAUSTO_PS_MARKER, seed_fausto_ps_organization
from daca_catalog.rohs_cps_seed import (
    CONTROL_PERSON,
    CONTROL_PERSON_MARKER,
    OWNER,
    identity,
    seed_rohs_cps_catalog,
)
from sqlalchemy import select


def provision(session):
    seed_modeling_catalog(session)
    seed_rohs_cps_catalog(session)
    session.commit()


def test_fausto_ps_correction_preserves_identity_roles_and_single_primary_membership(session_factory):
    with session_factory() as session:
        provision(session)
        user = session.get(DemoUser, CONTROL_PERSON)
        directory = session.get(IdentityDirectoryEntry, CONTROL_PERSON)
        membership = session.scalar(select(FederalPersonMembership).where(FederalPersonMembership.user_id == CONTROL_PERSON))
        membership_id, valid_from, roles = membership.id, membership.valid_from, list(user.roles)
        user.organization = directory.organization = "EFD BIT PS CPS"
        directory.organization_id = membership.organization_id = "efd-bit-ps-cps"
        session.delete(session.get(SeedMarker, FAUSTO_PS_MARKER))
        session.commit()
        seed_fausto_ps_organization(session)
        seed_fausto_ps_organization(session)
        session.commit()
        assert user.organization == directory.organization == "EFD BIT PS"
        assert directory.organization_id == membership.organization_id == "efd-bit-ps"
        assert (membership.id, membership.valid_from, membership.is_primary) == (membership_id, valid_from, True)
        assert list(session.scalars(select(FederalPersonMembership).where(FederalPersonMembership.user_id == CONTROL_PERSON))) == [membership]
        assert user.roles == roles == ["publication_approver"]
        assert all(session.get(DataProduct, identity(f"product:{key}")).control_person_user_id == CONTROL_PERSON for key in ("telemetry", "analytics"))


def test_fausto_is_selectable_independent_reviewer_and_new_product_default(client, session_factory):
    with session_factory() as session:
        provision(session)
        controller = default_control_person(session, OWNER)
        assert controller.id == CONTROL_PERSON
        assert controller.roles == ["publication_approver"]
        for key in ("telemetry", "analytics"):
            product = session.get(DataProduct, identity(f"product:{key}"))
            assert product.control_person_user_id == CONTROL_PERSON
            assert CONTROL_PERSON not in (product.owner_user_id, product.deputy_owner_user_id)
    users = client.get("/api/v1/demo-users").json()
    assert any(u["id"] == CONTROL_PERSON and u["displayName"] == "Fausto Marzo" for u in users)
    for key in ("telemetry", "analytics"):
        response = client.get(
            f"/api/v1/data-products/{identity(f'product:{key}')}/service-level",
            headers={"X-DaCa-User": OWNER},
        )
        assert response.status_code == 200, response.text
        assert response.json()["controlPerson"]["displayName"] == "Fausto Marzo"


def test_legacy_backfill_covers_all_marcello_products_and_preserves_later_changes(session_factory):
    with session_factory() as session:
        provision(session)
        session.delete(session.get(SeedMarker, CONTROL_PERSON_MARKER))
        products = list(session.scalars(select(DataProduct)))
        extra = next(p for p in products if p.owner_user_id != OWNER)
        extra.owner_user_id = OWNER
        owned = [p for p in products if p.owner_user_id == OWNER]
        for product in owned:
            product.control_person_user_id = None
        session.commit()
        revisions = {p.id: p.revision for p in owned}
        untouched = {p.id: (p.control_person_user_id, p.revision) for p in products if p not in owned}
        seed_rohs_cps_catalog(session)
        session.commit()
        assert all(p.control_person_user_id == CONTROL_PERSON for p in owned)
        assert all(p.revision == revisions[p.id] + 1 for p in owned)
        assert all((p.control_person_user_id, p.revision) == untouched[p.id] for p in products if p.id in untouched)
        assert session.scalar(select(AuditEvent).where(AuditEvent.action == "control-person-updated"))
        owned[0].control_person_user_id = "thomas.kriegli"
        controller = session.get(DemoUser, CONTROL_PERSON)
        controller.roles = []
        session.commit()
        seed_rohs_cps_catalog(session)
        session.commit()
        assert owned[0].control_person_user_id == "thomas.kriegli"
        assert controller.roles == []
        assert default_control_person(session, OWNER) is None


def test_backfill_respects_active_approval_gate(session_factory, monkeypatch):
    with session_factory() as session:
        provision(session)
        session.delete(session.get(SeedMarker, CONTROL_PERSON_MARKER))
        product = session.get(DataProduct, identity("product:telemetry"))
        product.control_person_user_id = "thomas.kriegli"
        session.commit()
        monkeypatch.setattr("daca_catalog.service_levels.control_person_change_blocked", lambda *_: True)
        with pytest.raises(RuntimeError, match="Finish the active approval"):
            seed_rohs_cps_catalog(session)
        session.rollback()
        assert session.get(SeedMarker, CONTROL_PERSON_MARKER) is None
        assert product.control_person_user_id == "thomas.kriegli"
