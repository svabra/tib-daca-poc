from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .domain_ownership import person_organization_ids
from .models import (
    AdministrativeOrganization,
    DataProduct,
    DemoUser,
    FederalPersonMembership,
    IdentityDirectoryEntry,
)

# The PoC keeps deputy ownership separate from the four-eyes control person.
# Preferred pairs make the synthetic directory stable while the fallback also
# covers metadata publications by any other active data owner in the same
# organization.
PREFERRED_DEPUTY_USER_IDS = {
    "kassandra.valdata": "joel.ruod",
    "joel.ruod": "kassandra.valdata",
    "ariane.keller": "kassandra.valdata",
    "noemie.rochat": "lucien.morel",
    "lucien.morel": "noemie.rochat",
    "beat.stalder": "sarah.brunner",
    "sarah.brunner": "beat.stalder",
    "daniel.aebischer": "simone.wyss",
    "simone.wyss": "daniel.aebischer",
    "sandro.wenger": "lea.hofmann",
    "lea.hofmann": "sandro.wenger",
}


def _office_scopes(session: Session, person: DemoUser) -> set[str]:
    """Resolve a subdivision to its office without granting department-wide eligibility."""
    offices = set()
    for organization_id in person_organization_ids(session, person.id):
        seen = set()
        while organization_id and organization_id not in seen:
            seen.add(organization_id)
            organization = session.get(AdministrativeOrganization, organization_id)
            if organization is None or not organization.active:
                break
            if organization.organization_type == "office":
                offices.add(organization.id)
                break
            organization_id = organization.parent_id
    return offices


def _same_office(session: Session, owner: DemoUser, candidate: DemoUser) -> bool:
    owner_scopes, candidate_scopes = _office_scopes(session, owner), _office_scopes(session, candidate)
    if owner_scopes or candidate_scopes:
        return bool(owner_scopes & candidate_scopes)
    # Non-federal fixtures have no federal office hierarchy. Preserve their exact
    # organization pairing, but never revive an expired federal affiliation.
    for person in (owner, candidate):
        if session.scalar(select(FederalPersonMembership.id).where(
            FederalPersonMembership.user_id == person.id,
            FederalPersonMembership.is_primary.is_(True),
        ).limit(1)) or session.scalar(select(IdentityDirectoryEntry.id).where(
            IdentityDirectoryEntry.id == person.id, IdentityDirectoryEntry.source == "federal",
        )):
            return False
    return candidate.organization == owner.organization


def is_active_deputy(owner: DemoUser | None, candidate: DemoUser | None, session: Session) -> bool:
    return bool(
        owner is not None
        and candidate is not None
        and candidate.id != owner.id
        and candidate.active
        and candidate.selectable
        and _same_office(session, owner, candidate)
        and candidate.avatar_url
        and "data_owner" in candidate.roles
    )


def default_deputy_owner(session: Session, owner_user_id: str | None) -> DemoUser | None:
    owner = session.get(DemoUser, owner_user_id) if owner_user_id else None
    if owner is None or not owner.active:
        return None

    preferred_id = PREFERRED_DEPUTY_USER_IDS.get(owner.id)
    preferred = session.get(DemoUser, preferred_id) if preferred_id else None
    if is_active_deputy(owner, preferred, session):
        return preferred

    candidates = session.scalars(
        select(DemoUser)
        .where(
            DemoUser.active.is_(True),
            DemoUser.selectable.is_(True),
            DemoUser.id != owner.id,
        )
        .order_by(DemoUser.id)
    )
    return next((candidate for candidate in candidates if is_active_deputy(owner, candidate, session)), None)


def assign_default_deputy_owner(session: Session, product: DataProduct) -> None:
    deputy = default_deputy_owner(session, product.owner_user_id)
    product.deputy_owner_user_id = deputy.id if deputy else None
