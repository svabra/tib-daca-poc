from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import Field, model_validator
from sqlalchemy import select

from .modeling_api import ActorDep, SessionDep, _require_etag
from .modeling_resources_api import require_dcat_publish_ready
from .modeling_schemas import LogicalModelResponse
from .modeling_service import (
    create_logical_successor,
    get_logical_model,
    get_logical_version,
    logical_version_payload,
    logical_write_from_payload,
    utc_now,
)
from .models import LogicalModelReview, LogicalModelVersion, WorkflowTask
from .schemas import ApiModel, reject_unsafe_service_level_text


class LogicalModelDecision(ApiModel):
    decision: Literal["accept", "reject"]
    comment: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def rejection_needs_comment(self) -> LogicalModelDecision:
        if self.comment:
            self.comment = reject_unsafe_service_level_text(self.comment)
        if self.decision == "reject" and not self.comment:
            raise ValueError("A rejection comment is required")
        return self


def _payload(review: LogicalModelReview) -> dict[str, Any]:
    return {
        "id": review.id, "logicalModelId": review.logical_model_id,
        "submittedVersionId": review.submitted_version_id, "domainId": review.domain_id,
        "submitterUserId": review.submitter_user_id, "reviewerUserId": review.reviewer_user_id,
        "status": review.status, "reviewSnapshot": review.review_snapshot,
        "decisionComment": review.decision_comment, "decidedAt": review.decided_at,
        "resultVersionId": review.result_version_id, "createdAt": review.created_at,
    }


def create_logical_model_review_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["logical model review"])

    @router.get("/logical-model-reviews/{review_id}")
    def read_review(review_id: uuid.UUID, response: Response, session: SessionDep, actor: ActorDep) -> dict[str, Any]:
        review = session.get(LogicalModelReview, review_id)
        if review is None:
            raise HTTPException(404, "Logical model review not found")
        if actor not in {review.reviewer_user_id, review.submitter_user_id}:
            raise HTTPException(403, "This review is not assigned to the current identity")
        version = session.get(LogicalModelVersion, review.submitted_version_id)
        response.headers["ETag"] = f'"{version.lock_version}"'
        return _payload(review)

    @router.post("/logical-model-reviews/{review_id}/decision", response_model=LogicalModelResponse)
    def decide_review(
        review_id: uuid.UUID, body: LogicalModelDecision, response: Response,
        session: SessionDep, actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        review = session.scalar(select(LogicalModelReview).where(LogicalModelReview.id == review_id).with_for_update())
        if review is None:
            raise HTTPException(404, "Logical model review not found")
        if review.status != "pending":
            raise HTTPException(409, "This review already has a decision")
        if actor != review.reviewer_user_id:
            raise HTTPException(403, "Only the primary owner of the selected domain may decide")
        model = get_logical_model(session, review.logical_model_id, lock=True)
        source = get_logical_version(session, model.id, review.submitted_version_id, lock=True)
        _require_etag(if_match, source.lock_version)
        if source.status != "review_pending" or source.revision != model.revision:
            raise HTTPException(409, "The submitted model version is no longer current")
        write = logical_write_from_payload(review.review_snapshot)
        if body.decision == "accept":
            require_dcat_publish_ready(session, model, source)
            successor = create_logical_successor(
                session, model, source, write, actor, status="published", action="domain-review-accepted"
            )
            review.status = "accepted"
        else:
            successor = create_logical_successor(
                session, model, source, write, actor, status="changes_requested", action="domain-review-rejected"
            )
            review.status = "rejected"
            session.add(WorkflowTask(
                id=uuid.uuid4(), task_type="logical_model_changes_requested", task_kind="action", status="open",
                assignee_user_id=review.submitter_user_id, logical_model_review_id=review.id,
                title=f"Datenmodell überarbeiten: {review.review_snapshot['title']}",
                detail=body.comment or "Die Domänenfreigabe wurde zurückgewiesen.",
                created_at=utc_now(), updated_at=utc_now(),
            ))
        review.decision_comment = body.comment
        review.decided_at = utc_now()
        review.result_version_id = successor.id
        for task in session.scalars(select(WorkflowTask).where(
            WorkflowTask.logical_model_review_id == review.id,
            WorkflowTask.task_type == "logical_model_review",
            WorkflowTask.status != "completed",
        )):
            task.status = "completed"; task.completed_at = utc_now(); task.updated_at = utc_now()
        session.commit()
        response.headers["ETag"] = f'"{successor.lock_version}"'
        return logical_version_payload(session, model, successor)

    return router
