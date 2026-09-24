"""Owner decisions on physical mapping inconsistencies."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_session
from .mapping_inconsistencies import _complete_tasks, issue_payload, sync_mapping_inconsistencies
from .modeling_api import _dataset_version, _require_scope, _require_version_scope, require_modeling_actor
from .modeling_schemas import ApiModel
from .modeling_service import get_logical_model, get_logical_version, record_audit, utc_now
from .models import (
    DataModelRoleAssignment, DemoUser, LogicalFieldVersion, LogicalMappingInconsistency,
    LogicalModelVersion, WorkflowTask,
)

SessionDep = Annotated[Session, Depends(get_session)]
ActorDep = Annotated[str, Depends(require_modeling_actor)]


class InconsistencyDecision(ApiModel):
    action: Literal["accept", "dispatch"]
    steward_user_id: str | None = None
    comment: str = Field(min_length=1, max_length=4000)


def _field_name(session: Session, issue: LogicalMappingInconsistency) -> str:
    name = session.scalar(select(LogicalFieldVersion.name).where(
        LogicalFieldVersion.logical_field_id == issue.logical_field_id,
    ).order_by(LogicalFieldVersion.revision.desc()).limit(1))
    return name or str(issue.logical_field_id)


def create_mapping_inconsistency_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["mapping inconsistencies"])

    @router.get("/logical-models/{model_id}/mapping-inconsistencies")
    def list_issues(model_id: uuid.UUID, session: SessionDep, actor: ActorDep) -> dict:
        model = get_logical_model(session, model_id)
        version = get_logical_version(session, model.id)
        _require_version_scope(session, actor, version)
        sync_mapping_inconsistencies(session, model_id)
        session.commit()
        rows = list(session.scalars(select(LogicalMappingInconsistency).where(
            LogicalMappingInconsistency.logical_model_id == model_id,
        ).order_by(LogicalMappingInconsistency.created_at)))
        dataset = _dataset_version(session, version)
        stewards = []
        for user in session.scalars(select(DemoUser).where(DemoUser.active.is_(True)).order_by(DemoUser.display_name)):
            try:
                _require_scope(session, user.id, dataset.department_code, dataset.organization_id,
                               roles={"data_steward"})
            except HTTPException:
                continue
            stewards.append({"id": user.id, "displayName": user.display_name})
        return {
            "qualityStatus": "error" if any(row.status != "resolved" for row in rows) else "ok",
            "items": [issue_payload(row, _field_name(session, row)) for row in rows],
            "total": len(rows),
            "eligibleStewards": stewards,
        }

    @router.post("/logical-models/{model_id}/mapping-inconsistencies/{issue_id}/decision")
    def decide_issue(model_id: uuid.UUID, issue_id: uuid.UUID, body: InconsistencyDecision,
                     session: SessionDep, actor: ActorDep) -> dict:
        model = get_logical_model(session, model_id, lock=True)
        version: LogicalModelVersion = get_logical_version(session, model.id)
        _require_version_scope(session, actor, version, roles={"data_owner"})
        dataset = _dataset_version(session, version)
        issue = session.get(LogicalMappingInconsistency, issue_id)
        if issue is None or issue.logical_model_id != model_id:
            raise HTTPException(404, "Mapping inconsistency not found")
        if actor != issue.owner_user_id or actor != dataset.data_owner_user_id:
            raise HTTPException(403, "Only the assigned data owner may decide")
        if issue.status not in {"open", "assigned"}:
            raise HTTPException(409, "Only an open or assigned inconsistency can be decided")
        now = utc_now()
        if body.action == "dispatch":
            if not body.steward_user_id:
                raise HTTPException(422, "stewardUserId is required for dispatch")
            _require_scope(session, body.steward_user_id, dataset.department_code,
                           dataset.organization_id, roles={"data_steward"})
            if not session.scalar(select(DataModelRoleAssignment.id).where(
                DataModelRoleAssignment.user_id == body.steward_user_id,
                DataModelRoleAssignment.active.is_(True),
            ).limit(1)):
                raise HTTPException(422, "The selected Data Steward is not active")
            _complete_tasks(session, issue.id)
            issue.status = "assigned"
            issue.assigned_steward_user_id = body.steward_user_id
            session.add(WorkflowTask(
                id=uuid.uuid4(), task_type="logical_mapping_investigation", task_kind="action",
                status="open", assignee_user_id=body.steward_user_id,
                logical_model_id=model_id, logical_mapping_issue_id=issue.id,
                title=f"Inkonsistenzfehler: {_field_name(session, issue)}",
                detail=f"Data Owner hat die Prüfung beauftragt: {body.comment.strip()}",
                created_at=now, updated_at=now,
            ))
        else:
            _complete_tasks(session, issue.id)
            issue.status = "accepted"
            issue.assigned_steward_user_id = None
        issue.decision_comment = body.comment.strip()
        issue.updated_at = now
        record_audit(session, "logical-mapping-inconsistency", issue.id,
                     "dispatched" if body.action == "dispatch" else "accepted", actor,
                     model.revision,
                     {"stewardUserId": issue.assigned_steward_user_id} if body.action == "dispatch" else {})
        session.commit()
        return issue_payload(issue, _field_name(session, issue))

    return router
