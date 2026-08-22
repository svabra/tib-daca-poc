from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import DataProduct, DemoUser

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


def is_active_deputy(owner: DemoUser | None, candidate: DemoUser | None) -> bool:
    return bool(
        owner is not None
        and candidate is not None
        and candidate.id != owner.id
        and candidate.active
        and candidate.selectable
        and candidate.organization == owner.organization
        and candidate.avatar_url
        and "data_owner" in candidate.roles
    )


def default_deputy_owner(session: Session, owner_user_id: str | None) -> DemoUser | None:
    owner = session.get(DemoUser, owner_user_id) if owner_user_id else None
    if owner is None or not owner.active:
        return None

    preferred_id = PREFERRED_DEPUTY_USER_IDS.get(owner.id)
    preferred = session.get(DemoUser, preferred_id) if preferred_id else None
    if is_active_deputy(owner, preferred):
        return preferred

    candidates = session.scalars(
        select(DemoUser)
        .where(
            DemoUser.organization == owner.organization,
            DemoUser.active.is_(True),
            DemoUser.selectable.is_(True),
            DemoUser.id != owner.id,
        )
        .order_by(DemoUser.id)
    )
    return next((candidate for candidate in candidates if is_active_deputy(owner, candidate)), None)


def assign_default_deputy_owner(session: Session, product: DataProduct) -> None:
    deputy = default_deputy_owner(session, product.owner_user_id)
    product.deputy_owner_user_id = deputy.id if deputy else None
