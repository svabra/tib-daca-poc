"""Office ALDS metadata authority, distinct from object ownership and stewardship."""

import uuid

from fastapi import HTTPException
from sqlalchemy import select

from .domain_ownership import active_scope_organizations, domain_organization_ids
from .models import (
    AdministrativeOrganization,
    AuditEvent,
    DemoUser,
    OrganizationStewardMandate,
    utc_now,
)
from .object_governance import active_actor, governs_domain
from .schemas import reject_unsafe_service_level_text


def can_edit_domain_metadata(session, actor, domain):
    if domain is None or domain.lifecycle != "active" or not actor or not active_actor(session, actor):
        return False
    if governs_domain(session, actor, domain):
        return True
    return _mandate_domain_authority(session, actor, domain, {"alds"})


def can_transfer_domain(session, actor, domain, *, lock=False):
    if domain is None or domain.lifecycle != "active" or not actor or not active_actor(session, actor):
        return False
    return governs_domain(session, actor, domain) or _mandate_domain_authority(session, actor, domain, {"alds", "ldsd"}, lock=lock)


def _mandate_domain_authority(session, actor, domain, kinds, *, lock=False):
    from .modeling_api import _descendant_ids

    today = utc_now().date()
    query = select(OrganizationStewardMandate).join(
        AdministrativeOrganization, OrganizationStewardMandate.organization_id == AdministrativeOrganization.id,
    ).where(
        (OrganizationStewardMandate.user_id == actor) | (OrganizationStewardMandate.deputy_user_id == actor),
        OrganizationStewardMandate.mandate_type.in_(kinds),
        OrganizationStewardMandate.active.is_(True),
        AdministrativeOrganization.active.is_(True),
        (AdministrativeOrganization.valid_from.is_(None)) | (AdministrativeOrganization.valid_from <= today),
        (AdministrativeOrganization.valid_to.is_(None)) | (AdministrativeOrganization.valid_to >= today),
    ).order_by(OrganizationStewardMandate.organization_id)
    if lock:
        query = query.with_for_update(of=OrganizationStewardMandate)
    source = active_scope_organizations(session, domain_organization_ids(session, domain))
    for mandate in session.scalars(query):
        organization = session.get(AdministrativeOrganization, mandate.organization_id)
        if mandate.mandate_type == "alds" and organization.organization_type == "office" and any(row.id in _descendant_ids(session, organization.id) for row in source):
            return True
        if mandate.mandate_type == "ldsd" and organization.organization_type == "department" and any(row.department_code == organization.department_code for row in source):
            return True
    return False


def provision_steward_mandate(session, *, organization_id, user_id, mandate_type, expected_revision, operator, decision_reference, deputy_user_id=None, active=True):
    """Trusted operator provisioning of an evidenced LDS decision, not a public API."""
    office = session.get(AdministrativeOrganization, organization_id)
    person = session.get(DemoUser, user_id)
    required_type = {"alds": "office", "ldsd": "department"}.get(mandate_type)
    if not office or not office.active or not required_type or office.organization_type != required_type:
        raise HTTPException(422, "ALDS requires an active office; LDSD requires an active department")
    if deputy_user_id:
        deputy = session.get(DemoUser, deputy_user_id)
        if deputy_user_id == user_id or not deputy or (active and not deputy.active):
            raise HTTPException(422, "Deputy must be another active person")
    if not person or (active and not person.active):
        raise HTTPException(422, "An appointment requires an active person")
    reference = reject_unsafe_service_level_text(decision_reference)
    if not reference or len(reference) > 1000:
        raise HTTPException(422, "Provide an LDS appointment/withdrawal decision reference")
    row = session.scalar(select(OrganizationStewardMandate).where(
        OrganizationStewardMandate.organization_id == organization_id,
    ).with_for_update().execution_options(populate_existing=True))
    if expected_revision != (row.revision if row else 0):
        raise HTTPException(409, "Mandate changed; reload its revision before provisioning")
    previous = row.user_id if row else None
    if not row:
        row = OrganizationStewardMandate(organization_id=organization_id, revision=1)
        session.add(row)
    else:
        row.revision += 1
    row.user_id, row.active = user_id, active
    row.mandate_type, row.deputy_user_id = mandate_type, deputy_user_id
    row.appointed_by, row.decision_reference, row.updated_at = operator, reference, utc_now()
    session.add(AuditEvent(
        id=uuid.uuid4(), resource_type="organization-steward-mandate", resource_id=organization_id,
        action="appointed" if active else "revoked", actor=operator, revision=row.revision,
        details={"userId": user_id, "deputyUserId": deputy_user_id, "mandateType": mandate_type, "previousUserId": previous, "decisionReference": reference},
    ))
    session.flush()
    return row


REQUESTED_MANDATES = (
    ("vbs", "ldsd", "sibilla.micheli", None),
    ("vbs-armasuisse", "alds", "christian.spider", None),
    ("vbs-verteidigung", "alds", "christian.man", None),
    ("efd-estv", "alds", "thomas.kriegli", "joel.ruod"),
)


def seed_requested_steward_mandates(session):
    """One-time requested demo assignments; never overwrite changes or revocations."""
    for organization, kind, person, deputy in REQUESTED_MANDATES:
        if session.get(OrganizationStewardMandate, organization) is not None:
            continue
        provision_steward_mandate(session, organization_id=organization, user_id=person,
            deputy_user_id=deputy, mandate_type=kind, expected_revision=0,
            operator="daca-bootstrap", decision_reference="User-confirmed governance assignments, 2026-10-28")


def seed_rapid_prototyping_domain(session):
    """Explicitly requested new domain; preserve all subsequent edits/retirement."""
    from .domain_glossary_seed import ORIGIN_CATALOG_ID, canonical_hash, stable_id
    from .models import Domain, DomainLocalization

    identity = stable_id("domain:data-analytics-rapid-prototyping")
    existing = session.get(Domain, identity)
    if existing:
        return existing
    for actor in ("joel.ruod", "thomas.kriegli"):
        if not active_actor(session, actor):
            raise HTTPException(422, "Confirmed domain responsibilities require active people")
    labels = [
        {"language": "de", "preferred_label": "Data Analytics Rapid Prototyping",
         "definition": "Fachdomäne für die schnelle Entwicklung und Erprobung analytischer Datenanwendungen und Prototypen."},
        {"language": "en", "preferred_label": "Data Analytics Rapid Prototyping",
         "definition": "Subject domain for rapidly developing and evaluating analytical data applications and prototypes."},
    ]
    domain = Domain(id=identity, urn=f"urn:daca:domain:{identity}", origin_catalog_id=ORIGIN_CATALOG_ID,
        revision=1, lifecycle="active", owner_user_id="joel.ruod", deputy_owner_user_id="thomas.kriegli")
    domain.content_hash = canonical_hash({"urn": domain.urn, "originCatalogId": domain.origin_catalog_id,
        "lifecycle": domain.lifecycle, "ownerUserId": domain.owner_user_id,
        "deputyOwnerUserId": domain.deputy_owner_user_id, "localizations": labels})
    session.add(domain)
    session.flush()
    for label in labels:
        session.add(DomainLocalization(domain_id=identity, normalized_label="data analytics rapid prototyping", **label))
    session.add(AuditEvent(id=uuid.uuid4(), resource_type="domain", resource_id=str(identity),
        action="created", actor="daca-bootstrap", revision=1,
        details={"source": "User-confirmed owner and deputy, 2026-10-28"}))
    session.flush()
    return domain
