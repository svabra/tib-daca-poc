"""Voluntary access return and Data Owner approval of renewed source access."""

from __future__ import annotations

import uuid
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import Field, field_validator
from sqlalchemy import select

from .modeling_api import (
    ActorDep,
    SessionDep,
    _assignments,
    _descendant_ids,
    _require_any_assignment,
)
from .modeling_seed import VIBDBU_PHYSICAL_SOURCE_ID
from .modeling_service import record_audit, utc_now
from .models import (
    AdministrativeOrganization,
    DataModelRoleAssignment,
    DemoUser,
    PhysicalSource,
    PhysicalSourceAccessRequest,
    PhysicalSourceAccessState,
    WorkflowTask,
)
from .schemas import ApiModel


class RestorationWrite(ApiModel):
    reason: str = Field(min_length=3, max_length=2000)

    @field_validator("reason")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if len(value.strip()) < 3:
            raise ValueError("A reason is required")
        return value.strip()


class RestorationDecision(ApiModel):
    decision: Literal["approve", "reject"]
    comment: str = Field(default="", max_length=2000)


class RestorationResponse(ApiModel):
    id: uuid.UUID
    source_id: uuid.UUID
    source_name: str
    organization: str
    requester_id: str
    requester_name: str
    reason: str
    status: Literal["submitted", "approved", "rejected"]
    decision_by: str | None
    decision_comment: str | None


class ReturnedSourceResponse(ApiModel):
    source_id: uuid.UUID
    source_name: str
    organization: str
    revision: int
    request: RestorationResponse | None


def _base_access(session, actor, source):
    user = session.get(DemoUser, actor)
    return bool(
        user
        and user.active
        and any(
            source.id == VIBDBU_PHYSICAL_SOURCE_ID
            or (
                role.department_code == source.department_code
                and source.organization_id in _descendant_ids(session, role.organization_id)
            )
            for role in _assignments(session, actor)
        )
    )


def _owners(session, source, requester):
    return {
        role.user_id
        for role in session.scalars(
            select(DataModelRoleAssignment)
            .join(DemoUser, DemoUser.id == DataModelRoleAssignment.user_id)
            .where(
                DataModelRoleAssignment.active.is_(True),
                DataModelRoleAssignment.role == "data_owner",
                DataModelRoleAssignment.department_code == source.department_code,
                DemoUser.active.is_(True),
                DataModelRoleAssignment.user_id != requester,
            )
        )
        if source.organization_id in _descendant_ids(session, role.organization_id)
    }


def _source(session, source_id):
    # All access lifecycle mutations lock the same source first, including the
    # first opt-out, for which no state row exists yet.
    source = session.scalar(
        select(PhysicalSource).where(PhysicalSource.id == source_id).with_for_update()
    )
    if source is None:
        raise HTTPException(404, "Source not found")
    if source.adapter_type == "csv" or source.lifecycle != "active":
        raise HTTPException(
            409, "Only active connected sources support access return and restoration"
        )
    return source


def _response(session, request):
    source = session.get(PhysicalSource, request.source_id)
    organization = session.get(AdministrativeOrganization, source.organization_id)
    user = session.get(DemoUser, request.requester_id)
    return RestorationResponse(
        id=request.id,
        source_id=source.id,
        source_name=source.name,
        organization=organization.display_name if organization else source.organization_id,
        requester_id=request.requester_id,
        requester_name=user.display_name,
        reason=request.reason,
        status=request.status,
        decision_by=request.decision_by,
        decision_comment=request.decision_comment,
    )


def create_physical_source_access_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["source-access"])

    @router.post("/physical-sources/{source_id}/access/relinquish", status_code=204)
    def relinquish(source_id: uuid.UUID, session: SessionDep, actor: ActorDep):
        source = _source(session, source_id)
        state = session.get(PhysicalSourceAccessState, (source_id, actor))
        if state is not None and state.restored_at is None:
            return Response(status_code=204)
        if not _base_access(session, actor, source):
            raise HTTPException(403, "No source access to relinquish")
        now = utc_now()
        if state is None:
            state = PhysicalSourceAccessState(
                source_id=source_id, user_id=actor, revision=1, relinquished_at=now
            )
            session.add(state)
        else:
            state.revision += 1
            state.relinquished_at = now
            state.restored_at = None
        record_audit(
            session,
            "physical-source-access",
            source_id,
            "relinquished",
            actor,
            state.revision,
            {"subjectId": actor},
        )
        session.commit()
        return Response(status_code=204)

    @router.get("/physical-source-access/mine", response_model=list[ReturnedSourceResponse])
    def mine(session: SessionDep, actor: ActorDep):
        result = []
        for state, source in session.execute(
            select(PhysicalSourceAccessState, PhysicalSource)
            .join(PhysicalSource, PhysicalSource.id == PhysicalSourceAccessState.source_id)
            .where(
                PhysicalSourceAccessState.user_id == actor,
                PhysicalSourceAccessState.restored_at.is_(None),
                PhysicalSource.lifecycle == "active",
                PhysicalSource.adapter_type != "csv",
            )
            .order_by(PhysicalSource.name)
        ):
            organization = session.get(AdministrativeOrganization, source.organization_id)
            request = session.scalar(
                select(PhysicalSourceAccessRequest)
                .where(
                    PhysicalSourceAccessRequest.source_id == source.id,
                    PhysicalSourceAccessRequest.requester_id == actor,
                    PhysicalSourceAccessRequest.access_revision == state.revision,
                )
                .order_by(PhysicalSourceAccessRequest.created_at.desc())
                .limit(1)
            )
            result.append(
                ReturnedSourceResponse(
                    source_id=source.id,
                    source_name=source.name,
                    organization=organization.display_name
                    if organization
                    else source.organization_id,
                    revision=state.revision,
                    request=_response(session, request) if request else None,
                )
            )
        return result

    @router.post(
        "/physical-sources/{source_id}/access/requests",
        response_model=RestorationResponse,
        status_code=201,
    )
    def request_access(
        source_id: uuid.UUID, body: RestorationWrite, session: SessionDep, actor: ActorDep
    ):
        source = _source(session, source_id)
        state = session.get(PhysicalSourceAccessState, (source_id, actor))
        if state is None or state.restored_at is not None:
            raise HTTPException(409, "No relinquished source access")
        if not _base_access(session, actor, source):
            raise HTTPException(
                403, "No underlying organization access; restoration cannot grant new roles"
            )
        if session.scalar(
            select(PhysicalSourceAccessRequest.id).where(
                PhysicalSourceAccessRequest.source_id == source_id,
                PhysicalSourceAccessRequest.requester_id == actor,
                PhysicalSourceAccessRequest.status == "submitted",
            )
        ):
            raise HTTPException(409, "A restoration request is already pending")
        owners = _owners(session, source, actor)
        if not owners:
            raise HTTPException(
                409, "No other active Data Owner is available for this source organization"
            )
        now = utc_now()
        request = PhysicalSourceAccessRequest(
            id=uuid.uuid4(),
            source_id=source_id,
            requester_id=actor,
            access_revision=state.revision,
            reason=body.reason,
            status="submitted",
            created_at=now,
        )
        session.add(request)
        session.flush()
        for owner in sorted(owners):
            session.add(
                WorkflowTask(
                    id=uuid.uuid4(),
                    task_type="physical_source_access_review",
                    status="open",
                    assignee_user_id=owner,
                    physical_source_access_request_id=request.id,
                    title="Quellenzugriff erneut freigeben",
                    detail=f"{source.name}: Zugriff für {actor} prüfen.",
                    created_at=now,
                    updated_at=now,
                )
            )
        record_audit(
            session,
            "physical-source-access-request",
            request.id,
            "submitted",
            actor,
            state.revision,
            {"sourceId": str(source_id), "subjectId": actor},
        )
        session.commit()
        return _response(session, request)

    @router.get("/physical-source-access-requests/inbox", response_model=list[RestorationResponse])
    def inbox(session: SessionDep, actor: ActorDep):
        _require_any_assignment(session, actor)
        return [
            _response(session, request)
            for request in session.scalars(
                select(PhysicalSourceAccessRequest)
                .where(PhysicalSourceAccessRequest.status == "submitted")
                .order_by(PhysicalSourceAccessRequest.created_at)
            )
            if actor
            in _owners(
                session, session.get(PhysicalSource, request.source_id), request.requester_id
            )
        ]

    @router.post(
        "/physical-source-access-requests/{request_id}/decision", response_model=RestorationResponse
    )
    def decide(
        request_id: uuid.UUID, body: RestorationDecision, session: SessionDep, actor: ActorDep
    ):
        request = session.get(PhysicalSourceAccessRequest, request_id)
        if request is None:
            raise HTTPException(404, "Restoration request not found")
        source = _source(session, request.source_id)
        session.refresh(request, with_for_update=True)
        if actor not in _owners(session, source, request.requester_id):
            raise HTTPException(403, "Only another current Data Owner may decide this request")
        if request.status != "submitted":
            raise HTTPException(409, "This request has already been decided")
        state = session.get(PhysicalSourceAccessState, (source.id, request.requester_id))
        if (
            state is None
            or state.restored_at is not None
            or state.revision != request.access_revision
        ):
            raise HTTPException(409, "The personal source access state has changed")
        comment = body.comment.strip()
        if body.decision == "reject" and len(comment) < 3:
            raise HTTPException(422, "A rejection requires a reason")
        now = utc_now()
        if body.decision == "approve":
            if not _base_access(session, request.requester_id, source):
                raise HTTPException(409, "Underlying organization access is no longer available")
            state.restored_at = now
            state.revision += 1
        request.status = "approved" if body.decision == "approve" else "rejected"
        request.decision_by = actor
        request.decision_comment = comment or None
        request.decided_at = now
        for task in session.scalars(
            select(WorkflowTask).where(
                WorkflowTask.physical_source_access_request_id == request.id,
                WorkflowTask.status != "completed",
            )
        ):
            task.status = "completed"
            task.completed_at = task.updated_at = now
        record_audit(
            session,
            "physical-source-access-request",
            request.id,
            request.status,
            actor,
            state.revision,
            {"sourceId": str(source.id), "subjectId": request.requester_id},
        )
        session.commit()
        return _response(session, request)

    return router
