"""Personal source access denial, independent of organization and demo grants."""

from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import PhysicalSourceAccessState


def returned_source_ids(session: Session, actor: str) -> set[uuid.UUID]:
    return set(
        session.scalars(
            select(PhysicalSourceAccessState.source_id).where(
                PhysicalSourceAccessState.user_id == actor,
                PhysicalSourceAccessState.restored_at.is_(None),
            )
        )
    )


def require_source_access(session: Session, actor: str, source_id: uuid.UUID) -> None:
    state = session.get(PhysicalSourceAccessState, (source_id, actor))
    if state is not None and state.restored_at is None:
        raise HTTPException(
            403, "Source access was voluntarily relinquished; request owner approval to restore it"
        )
