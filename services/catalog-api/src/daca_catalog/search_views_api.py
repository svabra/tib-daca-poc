"""Private search filters, deliberately copied rather than subscribed when shared."""
from __future__ import annotations

import copy
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_session
from .models import AuditEvent, DemoUser, SearchView, SearchViewShare, WorkflowTask, utc_now
from .schemas import ApiModel

VIEW_LIMIT = 100
INBOX_LIMIT = 200


def search_actor(request: Request, x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None) -> str:
    from .main import require_demo_actor
    return require_demo_actor(request, x_daca_user)


ActorDep = Annotated[str, Depends(search_actor)]
SessionDep = Annotated[Session, Depends(get_session)]


class StrictModel(ApiModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SearchViewConfiguration(StrictModel):
    schema_version: Literal[1] = 1
    query: str = Field(default="", max_length=200)
    mode: Literal["context", "focus"] = "context"
    kind: Literal["all", "product", "logical", "structure", "field", "term", "domain", "source"] = "all"
    organization: str = Field(default="all", min_length=1, max_length=200)
    domain: str = Field(default="all", min_length=1, max_length=200)
    status: Literal["all", "active"] = "all"
    connection: Literal["all", "connected", "metadata"] = "all"
    sort: Literal["relevance", "name"] = "relevance"


class SearchViewWrite(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    configuration: SearchViewConfiguration


class SearchViewRead(SearchViewWrite):
    id: uuid.UUID
    owner_user_id: str
    revision: int
    created_at: datetime
    updated_at: datetime


class ShareWrite(StrictModel):
    recipient_user_ids: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(min_length=1, max_length=30)
    message: str = Field(default="", max_length=1000)


class AcceptWrite(StrictModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class SharedViewRead(ApiModel):
    id: uuid.UUID
    sender_user_id: str
    sender_name: str
    source_revision: int
    snapshot: SearchViewWrite
    message: str
    sent_at: datetime
    accepted_at: datetime | None
    accepted_view_id: uuid.UUID | None
    dismissed_at: datetime | None


class ShareResult(ApiModel):
    created_count: int
    shares: list[SharedViewRead]


def private(response: Response, revision: int | None = None):
    response.headers["Cache-Control"] = "private, no-store"
    if revision is not None:
        response.headers["ETag"] = f'"{revision}"'


def owned(session: Session, view_id: uuid.UUID, actor: str, lock=False) -> SearchView:
    query = select(SearchView).where(SearchView.id == view_id, SearchView.owner_user_id == actor)
    row = session.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(404, "View nicht gefunden.")
    return row


def received(session: Session, share_id: uuid.UUID, actor: str, lock=False) -> SearchViewShare:
    query = select(SearchViewShare).where(SearchViewShare.id == share_id, SearchViewShare.recipient_user_id == actor)
    row = session.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(404, "Geteilte View nicht gefunden.")
    return row


def revision_matches(row: SearchView, expected: str | None):
    if expected is None:
        raise HTTPException(428, "Die aktuelle View-Revision wird benötigt.")
    if expected != f'"{row.revision}"':
        raise HTTPException(412, "Diese View wurde inzwischen geändert. Laden Sie Ihre Views erneut.")


def capacity(session: Session, actor: str):
    session.execute(select(DemoUser.id).where(DemoUser.id == actor).with_for_update()).scalar_one()
    if session.scalar(select(func.count()).select_from(SearchView).where(SearchView.owner_user_id == actor)) >= VIEW_LIMIT:
        raise HTTPException(409, f"Maximal {VIEW_LIMIT} persönliche Views. Löschen Sie zuerst eine nicht mehr benötigte View.")


def audit(session: Session, actor: str, resource_id: uuid.UUID, action: str, revision: int | None = None, **details):
    # Filter phrases, descriptions, names and private messages do not belong in audit logs.
    session.add(AuditEvent(id=uuid.uuid4(), resource_type="search-view", resource_id=str(resource_id),
                           actor=actor, action=action, revision=revision, details=details))


def shared_payload(session: Session, row: SearchViewShare):
    sender = session.get(DemoUser, row.sender_user_id)
    return SharedViewRead(id=row.id, sender_user_id=row.sender_user_id,
                          sender_name=sender.display_name if sender else row.sender_user_id,
                          source_revision=row.source_revision, snapshot=SearchViewWrite.model_validate(row.snapshot),
                          message=row.message, sent_at=row.sent_at, accepted_at=row.accepted_at,
                          accepted_view_id=row.accepted_view_id, dismissed_at=row.dismissed_at)


def finish_message(session: Session, share: SearchViewShare):
    now = utc_now()
    for task in session.scalars(select(WorkflowTask).where(
        WorkflowTask.search_view_share_id == share.id, WorkflowTask.assignee_user_id == share.recipient_user_id,
        WorkflowTask.status != "completed",
    )):
        task.status, task.completed_at, task.updated_at = "completed", now, now


def create_search_views_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1/me", tags=["personal search views"])

    @router.get("/search-views", response_model=list[SearchViewRead])
    def list_views(session: SessionDep, actor: ActorDep, response: Response):
        private(response)
        return list(session.scalars(select(SearchView).where(SearchView.owner_user_id == actor)
                                   .order_by(SearchView.updated_at.desc(), SearchView.id)))

    @router.post("/search-views", response_model=SearchViewRead, status_code=201)
    def create_view(body: SearchViewWrite, session: SessionDep, actor: ActorDep, response: Response):
        capacity(session, actor)
        row = SearchView(id=uuid.uuid4(), owner_user_id=actor, name=body.name, description=body.description,
                         configuration=body.configuration.model_dump(mode="json", by_alias=True), revision=1)
        session.add(row)
        audit(session, actor, row.id, "created", 1)
        session.commit()
        private(response, row.revision)
        return row

    @router.get("/search-views/{view_id}", response_model=SearchViewRead)
    def read_view(view_id: uuid.UUID, session: SessionDep, actor: ActorDep, response: Response):
        row = owned(session, view_id, actor)
        private(response, row.revision)
        return row

    @router.put("/search-views/{view_id}", response_model=SearchViewRead)
    def update_view(view_id: uuid.UUID, body: SearchViewWrite, session: SessionDep, actor: ActorDep, response: Response,
                    if_match: Annotated[str | None, Header()] = None):
        row = owned(session, view_id, actor, lock=True)
        revision_matches(row, if_match)
        row.name, row.description = body.name, body.description
        row.configuration = body.configuration.model_dump(mode="json", by_alias=True)
        row.revision, row.updated_at = row.revision + 1, utc_now()
        audit(session, actor, row.id, "updated", row.revision)
        session.commit()
        private(response, row.revision)
        return row

    @router.delete("/search-views/{view_id}", status_code=204)
    def delete_view(view_id: uuid.UUID, session: SessionDep, actor: ActorDep,
                    if_match: Annotated[str | None, Header()] = None):
        row = owned(session, view_id, actor, lock=True)
        revision_matches(row, if_match)
        audit(session, actor, row.id, "deleted", row.revision)
        session.delete(row)
        session.commit()
        return Response(status_code=204, headers={"Cache-Control": "private, no-store"})

    @router.post("/search-views/{view_id}/share", response_model=ShareResult)
    def share_view(view_id: uuid.UUID, body: ShareWrite, session: SessionDep, actor: ActorDep, response: Response,
                   if_match: Annotated[str | None, Header()] = None):
        row = owned(session, view_id, actor, lock=True)
        revision_matches(row, if_match)
        recipients = sorted(set(body.recipient_user_ids))
        people = list(session.scalars(select(DemoUser).where(DemoUser.id.in_(recipients), DemoUser.active.is_(True),
                                  DemoUser.selectable.is_(True)).order_by(DemoUser.id).with_for_update()))
        if actor in recipients or {person.id for person in people} != set(recipients):
            raise HTTPException(422, "Wählen Sie aktive andere Benutzer als Empfänger.")
        snapshot = SearchViewWrite.model_validate(row).model_dump(mode="json", by_alias=True)
        shares, created_count = [], 0
        sender = session.get(DemoUser, actor)
        for person in people:
            share = session.scalar(select(SearchViewShare).where(SearchViewShare.source_view_id == row.id,
                SearchViewShare.source_revision == row.revision, SearchViewShare.recipient_user_id == person.id))
            if share is None:
                pending = session.scalar(select(func.count()).select_from(SearchViewShare).where(
                    SearchViewShare.recipient_user_id == person.id, SearchViewShare.accepted_at.is_(None),
                    SearchViewShare.dismissed_at.is_(None)))
                if pending >= INBOX_LIMIT:
                    raise HTTPException(409, "Ein Empfänger hat zu viele offene View-Nachrichten. Es wurde nichts geteilt.")
                share = SearchViewShare(id=uuid.uuid4(), source_view_id=row.id, source_revision=row.revision,
                    sender_user_id=actor, recipient_user_id=person.id, snapshot=copy.deepcopy(snapshot), message=body.message)
                session.add(share)
                session.flush()
                session.add(WorkflowTask(id=uuid.uuid4(), task_type="search_view_shared", task_kind="action",
                    assignee_user_id=person.id, search_view_share_id=share.id,
                    title=f"View erhalten: {row.name}",
                    detail=f"{sender.display_name} hat eine View mit Ihnen geteilt. Prüfen und als unabhängige eigene View übernehmen."
                           + (f" Nachricht: {body.message}" if body.message else "")))
                created_count += 1
                audit(session, actor, share.id, "shared", row.revision, recipientUserId=person.id, sourceViewId=str(row.id))
            shares.append(share)
        session.commit()
        private(response)
        return ShareResult(created_count=created_count, shares=[shared_payload(session, share) for share in shares])

    @router.get("/search-view-shares", response_model=list[SharedViewRead])
    def inbox(session: SessionDep, actor: ActorDep, response: Response):
        private(response)
        return [shared_payload(session, row) for row in session.scalars(select(SearchViewShare).where(
            SearchViewShare.recipient_user_id == actor, SearchViewShare.accepted_at.is_(None),
            SearchViewShare.dismissed_at.is_(None)).order_by(SearchViewShare.sent_at.desc(), SearchViewShare.id).limit(INBOX_LIMIT))]

    @router.get("/search-view-shares/{share_id}", response_model=SharedViewRead)
    def read_share(share_id: uuid.UUID, session: SessionDep, actor: ActorDep, response: Response):
        private(response)
        return shared_payload(session, received(session, share_id, actor))

    @router.post("/search-view-shares/{share_id}/accept", response_model=SearchViewRead)
    def accept_share(share_id: uuid.UUID, body: AcceptWrite, session: SessionDep, actor: ActorDep, response: Response):
        share = received(session, share_id, actor, lock=True)
        if share.dismissed_at:
            raise HTTPException(409, "Diese Nachricht wurde bereits verworfen.")
        if share.accepted_at:
            if not share.accepted_view_id:
                raise HTTPException(410, "Die bereits übernommene eigene View wurde inzwischen gelöscht.")
            row = owned(session, share.accepted_view_id, actor)
            private(response, row.revision)
            return row
        capacity(session, actor)
        snapshot = SearchViewWrite.model_validate(share.snapshot)
        row = SearchView(id=uuid.uuid4(), owner_user_id=actor, name=body.name or snapshot.name,
            description=snapshot.description, configuration=copy.deepcopy(snapshot.configuration.model_dump(mode="json", by_alias=True)), revision=1)
        session.add(row)
        session.flush()
        share.accepted_view_id, share.accepted_at = row.id, utc_now()
        finish_message(session, share)
        audit(session, actor, row.id, "adopted", 1, shareId=str(share.id))
        session.commit()
        private(response, row.revision)
        return row

    @router.post("/search-view-shares/{share_id}/dismiss", status_code=204)
    def dismiss_share(share_id: uuid.UUID, session: SessionDep, actor: ActorDep):
        share = received(session, share_id, actor, lock=True)
        if share.accepted_at:
            raise HTTPException(409, "Diese View wurde bereits übernommen.")
        if not share.dismissed_at:
            share.dismissed_at = utc_now()
            finish_message(session, share)
            audit(session, actor, share.id, "dismissed")
            session.commit()
        return Response(status_code=204, headers={"Cache-Control": "private, no-store"})

    return router
