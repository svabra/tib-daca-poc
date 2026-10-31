"""Scoped organizational navigation fixture, without identity/access assignments."""

from .models import AdministrativeOrganization, SeedMarker

MARKER = "organization-explorer-estv-bi-v1"


def seed_organization_explorer(session):
    if session.get(SeedMarker, MARKER) or session.get(AdministrativeOrganization, "efd-estv") is None:
        return
    if session.get(AdministrativeOrganization, "efd-estv-bi") is None:
        session.add(AdministrativeOrganization(
            id="efd-estv-bi", parent_id="efd-estv", department_code="EFD",
            office_code="ESTV-BI", display_name="Business Intelligence",
            organization_type="affiliated", department_order=6, office_order=401, active=True,
        ))
    session.add(SeedMarker(name=MARKER))
    session.flush()


if __name__ == "__main__":
    from .database import default_session_factory
    from .settings import get_settings

    with default_session_factory(get_settings())() as session:
        seed_organization_explorer(session)
        session.commit()
    print("Organization explorer unit is current; memberships and access unchanged.")
