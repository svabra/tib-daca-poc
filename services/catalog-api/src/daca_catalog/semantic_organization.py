"""Organization views use trusted object responsibilities, never label matching."""

from fastapi import HTTPException
from sqlalchemy import exists, select

from .modeling_api import _assignments, _descendant_ids
from .modeling_service import utc_now
from .models import (
    AdministrativeOrganization,
    CatalogObjectResponsibility,
    DemoUser,
    Domain,
    FederalPersonMembership,
    GlossaryTerm,
    IdentityDirectoryEntry,
)
from .object_governance import governs_domain, governs_term


def organization_objects(session, organization_id):
    organization = session.get(AdministrativeOrganization, organization_id)
    if organization is None or not organization.active:
        raise HTTPException(404, "Organisation nicht gefunden.")
    scope = _descendant_ids(session, organization_id)
    today = utc_now().date()
    members = set(session.scalars(select(FederalPersonMembership.user_id).join(DemoUser).where(
        FederalPersonMembership.organization_id.in_(scope), FederalPersonMembership.is_primary.is_(True),
        FederalPersonMembership.valid_from <= today,
        (FederalPersonMembership.valid_to.is_(None)) | (FederalPersonMembership.valid_to >= today), DemoUser.active.is_(True),
    )))
    # Older federal directory fixtures have a trusted registry organization ID
    # but no imported membership rows. Never resurrect an expired membership by
    # falling back to that directory: any primary membership history wins.
    members.update(session.scalars(select(IdentityDirectoryEntry.id).join(
        DemoUser, DemoUser.id == IdentityDirectoryEntry.id,
    ).where(
        IdentityDirectoryEntry.source == "federal", IdentityDirectoryEntry.active.is_(True),
        IdentityDirectoryEntry.organization_id.in_(scope), DemoUser.active.is_(True),
        ~exists(select(FederalPersonMembership.id).where(
            FederalPersonMembership.user_id == IdentityDirectoryEntry.id,
            FederalPersonMembership.is_primary.is_(True),
        )),
    )))
    domains = set(session.scalars(select(Domain.id).where(Domain.lifecycle == "active", Domain.owner_user_id.in_(members))))
    terms = set()
    # An explicit object scope takes precedence over the owner's home organization.
    explicit_domains, explicit_terms = set(), set()
    for row in session.scalars(select(CatalogObjectResponsibility).join(DemoUser).where(CatalogObjectResponsibility.active.is_(True), DemoUser.active.is_(True))):
        if row.domain_id and row.provenance == "domain-handover":
            explicit_domains.add(row.domain_id)
        if row.organization_id:
            if row.domain_id:
                explicit_domains.add(row.domain_id)
                if row.organization_id in scope:
                    domains.add(row.domain_id)
            if row.glossary_term_id:
                explicit_terms.add(row.glossary_term_id)
                if row.organization_id in scope:
                    terms.add(row.glossary_term_id)
        elif row.role == "data_owner" and row.user_id in members and row.glossary_term_id:
            terms.add(row.glossary_term_id)
    # A domain with an explicit organization outside this view is not inherited
    # through its owner's membership. Terms retain their independent ownership.
    scoped_domains = set(session.scalars(select(CatalogObjectResponsibility.domain_id).where(
        CatalogObjectResponsibility.active.is_(True), CatalogObjectResponsibility.organization_id.in_(scope),
        CatalogObjectResponsibility.domain_id.is_not(None),
    )))
    scoped_terms = set(session.scalars(select(CatalogObjectResponsibility.glossary_term_id).where(
        CatalogObjectResponsibility.active.is_(True), CatalogObjectResponsibility.organization_id.in_(scope),
        CatalogObjectResponsibility.glossary_term_id.is_not(None),
    )))
    domains = (domains - explicit_domains) | scoped_domains
    terms = (terms - explicit_terms) | scoped_terms
    domains &= set(session.scalars(select(Domain.id).where(Domain.lifecycle == "active")))
    terms &= set(session.scalars(select(GlossaryTerm.id).where(GlossaryTerm.lifecycle == "active")))
    return organization, domains, terms


def can_edit_organization_layout(session, actor, organization, domain_ids, term_ids):
    if any(organization.id in _descendant_ids(session, assignment.organization_id) for assignment in _assignments(session, actor)):
        return True
    return any(governs_domain(session, actor, session.get(Domain, identity)) for identity in domain_ids) or any(
        governs_term(session, actor, identity) for identity in term_ids
    )
