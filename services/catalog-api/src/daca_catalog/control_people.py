from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import DataProduct, DemoUser


def is_active_publication_approver(user: DemoUser | None) -> bool:
    return bool(
        user is not None
        and user.active
        and "publication_approver" in (user.roles or [])
    )


def active_publication_approvers(
    session: Session, *, excluding_user_id: str | None = None
) -> list[DemoUser]:
    users = list(
        session.scalars(
            select(DemoUser)
            .where(DemoUser.active.is_(True))
            .order_by(DemoUser.id)
        )
    )
    return [
        user
        for user in users
        if user.id != excluding_user_id and "publication_approver" in (user.roles or [])
    ]


def default_control_person(
    session: Session, owner_user_id: str | None
) -> DemoUser | None:
    owner = session.get(DemoUser, owner_user_id) if owner_user_id else None
    if owner is not None and owner.supervisor_user_id:
        supervisor = session.get(DemoUser, owner.supervisor_user_id)
        if (
            is_active_publication_approver(supervisor)
            and supervisor is not None
            and supervisor.id != owner_user_id
        ):
            return supervisor

    thomas = session.get(DemoUser, "thomas.kriegli")
    if (
        is_active_publication_approver(thomas)
        and thomas is not None
        and thomas.id != owner_user_id
    ):
        return thomas

    return next(
        iter(
            active_publication_approvers(
                session, excluding_user_id=owner_user_id
            )
        ),
        None,
    )


def assign_default_control_person(
    session: Session, product: DataProduct
) -> DemoUser | None:
    control_person = default_control_person(session, product.owner_user_id)
    product.control_person_user_id = control_person.id if control_person else None
    return control_person


def safe_person(user: DemoUser | None, *, role: str) -> dict[str, str] | None:
    if user is None:
        return None
    return {
        "displayName": user.display_name,
        "organization": user.organization,
        "role": role,
    }
