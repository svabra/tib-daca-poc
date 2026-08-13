from fastapi import Request
from sqlalchemy.orm import Session

from .models import AuditEvent
from .problems import request_id


def actor_from(request: Request) -> str:
    return request.headers.get("X-DaCa-Actor", "").strip()[:200]


def record_audit(
    session: Session,
    request: Request,
    *,
    aggregate_type: str,
    aggregate_id: str,
    action: str,
    details: dict[str, object] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        action=action,
        actor=actor_from(request),
        request_id=request_id(request),
        details=details or {},
    )
    session.add(event)
    return event
