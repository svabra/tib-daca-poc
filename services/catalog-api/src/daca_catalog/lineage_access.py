"""Owner-only access receipts, separate from grants and provenance metadata."""
from __future__ import annotations

import base64
import json
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import ConfigDict, Field, field_validator
from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .database import get_session
from .models import (
    AuditEvent,
    DataProduct,
    DemoUser,
    LineageEdge,
    PhysicalSource,
    SourceCatalogEntry,
    utc_now,
)
from .schemas import ApiModel

RESOURCE_TYPE = "lineage-access"


def access_actor(request: Request, x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None) -> str:
    from .main import require_demo_actor
    return require_demo_actor(request, x_daca_user)


ActorDep = Annotated[str, Depends(access_actor)]
SessionDep = Annotated[Session, Depends(get_session)]


def can_read_access(session: Session, edge: LineageEdge, actor: str | None) -> bool:
    """Only the current source/resource Owner, never a generic owner role or deputy."""
    user = session.get(DemoUser, actor) if actor else None
    if user is None or not user.active:
        return False
    product = session.scalar(select(DataProduct).where(DataProduct.urn == edge.source_urn))
    if product is not None:
        return product.owner_user_id == actor
    source = session.scalar(select(PhysicalSource).where(PhysicalSource.urn == edge.source_urn))
    if source is not None:
        from .physical_source_access_api import _owners
        return actor in _owners(session, source, "")
    entry = session.get(SourceCatalogEntry, edge.source_urn)
    return bool(entry and entry.active and entry.owner_user_id == actor)


class AccessReceiptWrite(ApiModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: uuid.UUID
    occurred_at: datetime
    subject_id: str = Field(min_length=1, max_length=200, pattern=r"^[\w.@:/-]+$")
    subject_type: Literal["person", "machine"]
    protocol: Literal["http-rest", "postgresql"]
    outcome: Literal["success", "denied", "error"]

    @field_validator("occurred_at")
    @classmethod
    def aware_timestamp(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value > utc_now() + timedelta(minutes=5):
            raise ValueError("An aware timestamp no more than five minutes in the future is required")
        return value.astimezone(UTC)


class AccessReceiptResponse(ApiModel):
    id: uuid.UUID
    occurred_at: datetime
    subject_id: str
    subject_name: str
    subject_type: Literal["person", "machine"]
    protocol: Literal["http-rest", "postgresql"]
    outcome: Literal["success", "denied", "error"]


class AccessReceiptPage(ApiModel):
    resource_urn: str
    resource_label: str
    consumer_urn: str
    consumer_label: str
    items: list[AccessReceiptResponse]
    next_cursor: str | None


def _label(session: Session, urn: str) -> str:
    product = session.scalar(select(DataProduct).where(DataProduct.urn == urn))
    source = session.scalar(select(PhysicalSource).where(PhysicalSource.urn == urn)) if product is None else None
    return product.title if product else source.name if source else urn.rsplit(":", 1)[-1].replace("-", " ")


def _context(session: Session, product_id: uuid.UUID, edge_id: uuid.UUID, actor: str) -> LineageEdge:
    product = session.get(DataProduct, product_id)
    edge = session.get(LineageEdge, edge_id)
    if product is None or edge is None or product.urn not in (edge.source_urn, edge.target_urn):
        raise HTTPException(404, "Lineage edge not found in this product")
    if not can_read_access(session, edge, actor):
        raise HTTPException(403, "Only the current Data Owner of the source or product may read access logs")
    from .main import require_product_view
    require_product_view(session, product, actor)
    return edge


def _decode_cursor(value: str) -> tuple[datetime, uuid.UUID]:
    try:
        timestamp, identity = json.loads(base64.urlsafe_b64decode(value.encode()))
        timestamp = datetime.fromisoformat(timestamp)
        if timestamp.tzinfo is None:
            raise ValueError()
        return timestamp, uuid.UUID(identity)
    except (ValueError, TypeError, UnicodeError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "Invalid access log cursor") from exc


def create_lineage_access_router() -> APIRouter:
    router = APIRouter(tags=["lineage access"])

    @router.post("/internal/v1/lineage/{edge_id}/access-events", status_code=201, include_in_schema=False)
    def record_access(edge_id: uuid.UUID, body: AccessReceiptWrite, request: Request, response: Response,
                      session: SessionDep, authorization: Annotated[str | None, Header()] = None) -> dict[str, str]:
        token = request.app.state.settings.internal_token
        if not token or not authorization or not secrets.compare_digest(authorization, f"Bearer {token}"):
            raise HTTPException(401, "A valid internal reporting identity is required")
        edge = session.get(LineageEdge, edge_id)
        if edge is None:
            raise HTTPException(404, "Lineage edge not found")
        if edge.state == "deprecated":
            raise HTTPException(409, "The lineage edge is retired")
        details = {"schemaVersion": 1, "resourceUrn": edge.source_urn, "consumerUrn": edge.target_urn,
                   "subjectType": body.subject_type, "protocol": body.protocol, "outcome": body.outcome}
        # Event IDs are reporter-generated, independent of caller-provided request headers.
        inserted = session.execute(insert(AuditEvent).values(
            id=body.id, resource_type=RESOURCE_TYPE, resource_id=str(edge.id), action="data-read",
            actor=body.subject_id, revision=None, details=details, occurred_at=body.occurred_at,
        ).on_conflict_do_nothing(index_elements=[AuditEvent.id]).returning(AuditEvent.id)).scalar_one_or_none()
        if not inserted:
            current = session.get(AuditEvent, body.id)
            if (current.resource_type, current.resource_id, current.actor, current.details, current.occurred_at) != (
                RESOURCE_TYPE, str(edge.id), body.subject_id, details, body.occurred_at
            ):
                raise HTTPException(409, "An access receipt ID cannot be reused for another event")
            response.status_code = 200
        session.commit()
        return {"id": str(body.id)}

    @router.get("/api/v1/data-products/{product_id}/lineage/{edge_id}/access-events", response_model=AccessReceiptPage)
    def access_events(product_id: uuid.UUID, edge_id: uuid.UUID, session: SessionDep, actor: ActorDep,
                      response: Response,
                      subject_type: Annotated[Literal["person", "machine"] | None, Query(alias="subjectType")] = None,
                      outcome: Literal["success", "denied", "error"] | None = None,
                      after: datetime | None = None, before: datetime | None = None,
                      cursor: Annotated[str | None, Query(max_length=300)] = None,
                      limit: Annotated[int, Query(ge=1, le=100)] = 50) -> AccessReceiptPage:
        edge = _context(session, product_id, edge_id, actor)
        response.headers["Cache-Control"] = "no-store"
        if any(value is not None and value.tzinfo is None for value in (after, before)) or (
            after is not None and before is not None and after > before
        ):
            raise HTTPException(422, "An aware, ordered date range is required")
        statement = select(AuditEvent).where(
            AuditEvent.resource_type == RESOURCE_TYPE, AuditEvent.resource_id == str(edge.id),
            AuditEvent.details["resourceUrn"].as_string() == edge.source_urn,
            AuditEvent.details["consumerUrn"].as_string() == edge.target_urn,
        )
        if subject_type:
            statement = statement.where(AuditEvent.details["subjectType"].as_string() == subject_type)
        if outcome:
            statement = statement.where(AuditEvent.details["outcome"].as_string() == outcome)
        if after:
            statement = statement.where(AuditEvent.occurred_at >= after)
        if before:
            statement = statement.where(AuditEvent.occurred_at <= before)
        if cursor:
            timestamp, identity = _decode_cursor(cursor)
            statement = statement.where(or_(AuditEvent.occurred_at < timestamp,
                and_(AuditEvent.occurred_at == timestamp, AuditEvent.id < identity)))
        rows = list(session.scalars(statement.order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).limit(limit + 1)))
        next_cursor = None
        if len(rows) > limit:
            last = rows[limit - 1]
            next_cursor = base64.urlsafe_b64encode(json.dumps([last.occurred_at.isoformat(), str(last.id)]).encode()).decode()
        items = []
        for event in rows[:limit]:
            person = session.get(DemoUser, event.actor) if event.details["subjectType"] == "person" else None
            items.append(AccessReceiptResponse(id=event.id, occurred_at=event.occurred_at,
                subject_id=event.actor, subject_name=person.display_name if person else event.actor,
                subject_type=event.details["subjectType"], protocol=event.details["protocol"], outcome=event.details["outcome"]))
        return AccessReceiptPage(resource_urn=edge.source_urn, resource_label=_label(session, edge.source_urn),
            consumer_urn=edge.target_urn, consumer_label=_label(session, edge.target_urn), items=items, next_cursor=next_cursor)

    return router
