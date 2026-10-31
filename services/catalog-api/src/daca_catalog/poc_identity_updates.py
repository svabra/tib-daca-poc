"""Scoped operator updates to existing PoC identity labels and organization scopes."""

import uuid

from sqlalchemy import select

from .modeling_core import stable_uuid
from .models import (
    AdministrativeOrganization,
    DemoUser,
    FederalPersonMembership,
    IdentityDirectoryEntry,
    SeedMarker,
    utc_now,
)

SIBILLA_ID = "sibilla.micheli"
SIBILLA_NAME = "Sibilla Di Ciesa"
SIBILLA_RENAME_MARKER = "poc-sibilla-di-ciesa-display-name-v1"
FAUSTO_PS_MARKER = "poc-fausto-ps-organization-v1"
FAUSTO_ORGANIZATION = "efd-bit-ps"
PERSONA_SCOPE_MARKER = "poc-persona-governance-scopes-2026-10-31-v1"
PERSONA_SCOPES = {
    "sibilla.micheli": ("Sibilla Di Ciesa", "vbs-gs", "VBS GS-VBS", "sibilla.di.ciesa@vbs.admin.ch"),
    "christian.spider": ("Christiano Stadello", "vbs-armasuisse", "VBS armasuisse", "christiano.stadello@ar.admin.ch"),
    "thomas.kriegli": ("Thomas Kriegli", "efd-estv-bi", "EFD ESTV BI", "thomas.kriegli@estv.admin.ch"),
    "joel.ruod": ("Joel Ruod", "efd-estv-bi", "EFD ESTV BI", "joel.ruod@estv.admin.ch"),
    "thomas.wikinger": ("Thomas Wikinger", "vbs-armasuisse", "VBS armasuisse", "thomas.wikinger@ar.admin.ch"),
}


def seed_requested_persona_scopes(session):
    """Correct confirmed fixtures once, retaining object duties and later operator edits."""
    from .domain_glossary_seed import DEFENCE_DOMAIN_ID
    from .modeling_seed import PERSONNEL_DOMAIN_ID
    from .models import AuditEvent, CatalogObjectResponsibility, Domain
    from .office_governance import seed_requested_steward_mandates
    from .organization_network_seed import seed_organization_explorer

    if session.get(SeedMarker, PERSONA_SCOPE_MARKER):
        return
    seed_organization_explorer(session)
    if any(session.get(DemoUser, person) is None for person in PERSONA_SCOPES):
        return
    if any(session.get(AdministrativeOrganization, scope[1]) is None for scope in PERSONA_SCOPES.values()):
        return
    # Personal employment must not silently move the existing VBS teaching domains.
    for domain_id in (DEFENCE_DOMAIN_ID, PERSONNEL_DOMAIN_ID):
        domain = session.get(Domain, domain_id)
        if domain is None:
            continue
        if session.scalar(select(CatalogObjectResponsibility.id).where(
            CatalogObjectResponsibility.domain_id == domain_id,
            CatalogObjectResponsibility.active.is_(True),
            (CatalogObjectResponsibility.organization_id.is_not(None))
            | (CatalogObjectResponsibility.provenance == "domain-handover"),
        ).limit(1)):
            continue
        for role, person in (("data_owner", domain.owner_user_id), ("deputy_data_owner", domain.deputy_owner_user_id)):
            session.add(CatalogObjectResponsibility(
                id=stable_uuid(f"persona-scope:{domain_id}:{role}"), domain_id=domain_id,
                user_id=person, role=role, organization_id="vbs-verteidigung",
                active=True, provenance="poc-persona-scope-correction",
            ))
    for person, (name, organization_id, label, email) in PERSONA_SCOPES.items():
        user = session.get(DemoUser, person, with_for_update=True)
        previous = user.organization
        user.display_name, user.organization, user.email = name, label, email
        directory = session.get(IdentityDirectoryEntry, person, with_for_update=True)
        if directory is None:
            directory = IdentityDirectoryEntry(
                id=person, display_name=name, organization=label, email=email,
                source="federal", source_system="Bundespersonalverzeichnis", active=user.active,
            )
            session.add(directory)
        if directory:
            directory.display_name, directory.organization, directory.email = name, label, email
            directory.organization_id, directory.updated_at = organization_id, utc_now()
        memberships = list(session.scalars(select(FederalPersonMembership).where(
            FederalPersonMembership.user_id == person, FederalPersonMembership.is_primary.is_(True),
            FederalPersonMembership.valid_from <= utc_now().date(),
            (FederalPersonMembership.valid_to.is_(None)) | (FederalPersonMembership.valid_to >= utc_now().date()),
        ).with_for_update()))
        for membership in memberships:
            membership.organization_id = organization_id
        if not memberships:
            session.add(FederalPersonMembership(
                id=stable_uuid(f"confirmed-persona-primary:{person}"), user_id=person,
                organization_id=organization_id, is_primary=True, valid_from=utc_now().date(),
            ))
        session.add(AuditEvent(
            id=uuid.uuid4(), resource_type="demo-user",
            resource_id=person, action="poc-persona-corrected", actor="daca-bootstrap",
            details={"previousOrganization": previous, "organizationId": organization_id,
                     "source": "User-confirmed PoC assignments, 2026-10-31"},
        ))
    seed_requested_steward_mandates(session)
    session.add(SeedMarker(name=PERSONA_SCOPE_MARKER))
    session.flush()


def seed_poc_identity_names(session):
    if session.get(SeedMarker, SIBILLA_RENAME_MARKER):
        return
    user = session.get(DemoUser, SIBILLA_ID, with_for_update=True)
    if user is None:
        return
    user.display_name = SIBILLA_NAME
    directory = session.get(IdentityDirectoryEntry, SIBILLA_ID, with_for_update=True)
    if directory is not None:
        directory.display_name = SIBILLA_NAME
        directory.updated_at = utc_now()
    session.add(SeedMarker(name=SIBILLA_RENAME_MARKER))
    session.flush()


def seed_fausto_ps_organization(session):
    if session.get(SeedMarker, FAUSTO_PS_MARKER):
        return
    user = session.get(DemoUser, "fausto.marzo", with_for_update=True)
    if user is None or session.get(AdministrativeOrganization, FAUSTO_ORGANIZATION) is None:
        return
    user.organization = "EFD BIT PS"
    directory = session.get(IdentityDirectoryEntry, user.id, with_for_update=True)
    if directory is not None:
        directory.organization = user.organization
        directory.organization_id = FAUSTO_ORGANIZATION
        directory.updated_at = utc_now()
    membership = session.scalar(select(FederalPersonMembership).where(
        FederalPersonMembership.user_id == user.id,
        FederalPersonMembership.is_primary.is_(True),
        FederalPersonMembership.valid_to.is_(None),
    ).with_for_update())
    if membership is None:
        session.add(FederalPersonMembership(
            id=stable_uuid("fausto-ps-primary-membership"), user_id=user.id,
            organization_id=FAUSTO_ORGANIZATION, is_primary=True, valid_from=utc_now().date(),
        ))
    else:
        # Correct the original fixture assignment in place; do not create a second affiliation.
        membership.organization_id = FAUSTO_ORGANIZATION
    session.add(SeedMarker(name=FAUSTO_PS_MARKER))
    session.flush()


if __name__ == "__main__":
    from .database import default_session_factory
    from .settings import get_settings

    with default_session_factory(get_settings())() as session:
        seed_poc_identity_names(session)
        seed_fausto_ps_organization(session)
        seed_requested_persona_scopes(session)
        from .office_governance import seed_data_analytics_domain
        seed_data_analytics_domain(session)
        session.commit()
    print("PoC identity labels and organization scopes are current.")
