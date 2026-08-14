from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .models import (
    AccessRequest,
    AuditEvent,
    DataProduct,
    DemoUser,
    GovernanceSubmission,
    MetadataPublication,
    PolicyDeployment,
    PolicyRevision,
    ProductQualityAssessment,
    WorkflowTask,
    utc_now,
)
from .policy import ProjectionResult, project_to_postgresql
from .schemas import GovernanceDecisionCreate, GovernanceSubmissionCreate
from .settings import Settings
from .workflow_seed import stable_id

ACTIVE_SUBMISSION_STATES = {
    "pending_approval",
    "approved_deploying",
}

OPEN_ACCESS_REQUEST_STATES = {
    "submitted",
    "identity_review",
    "legal_review",
    "conditions_review",
}


def bind_access_request_fulfillments(
    session: Session,
    product: DataProduct,
    policy: PolicyRevision,
    resolved_grants: list[dict[str, Any]],
    fulfillments: list[Any],
    actor: str,
) -> list[dict[str, Any]]:
    """Atomically bind requests to the exact policy revision that covers them."""
    evidence: list[dict[str, Any]] = []
    seen: set[uuid.UUID] = set()
    for item in fulfillments:
        request_id = item.access_request_id
        subject = item.fulfillment_subject.model_dump(mode="json", by_alias=True)
        if request_id in seen:
            raise HTTPException(422, "An access request may only be fulfilled once per policy")
        seen.add(request_id)
        access_request = session.get(AccessRequest, request_id)
        if access_request is None:
            raise HTTPException(404, "Access request selected for fulfillment was not found")
        if access_request.data_product_id != product.id:
            raise HTTPException(422, "The access request belongs to another data product")
        if access_request.status not in OPEN_ACCESS_REQUEST_STATES:
            raise HTTPException(409, "Only an open access request can be linked to a policy")

        matching = [grant for grant in resolved_grants if grant.get("subject") == subject]
        if len(matching) != 1:
            raise HTTPException(
                422,
                "The fulfillment subject must identify exactly one grant in this policy revision",
            )
        grant = matching[0]
        subject_type = subject["type"]
        subject_id = subject["id"]
        group_revision: int | None = None
        if subject_type == "group":
            if access_request.consumer_type != "person":
                raise HTTPException(
                    422, "Machine requests cannot be fulfilled through a person group"
                )
            snapshot = grant.get("groupSnapshot") or {}
            if access_request.requester_id not in snapshot.get("memberIds", []):
                raise HTTPException(
                    422,
                    "The requester is not part of the confirmed group membership snapshot",
                )
            group_revision = snapshot.get("membershipRevision")
        elif subject_type == "person":
            if (
                access_request.consumer_type != "person"
                or subject_id != access_request.requester_id
            ):
                raise HTTPException(422, "The personal grant does not match the requester")
        elif subject_type == "machine":
            if access_request.consumer_type != "machine" or subject_id != access_request.machine_id:
                raise HTTPException(
                    422, "The machine grant does not match the requested Machine ID"
                )

        requested_protocols = (
            ["http", "postgresql"]
            if access_request.requested_protocol == "both"
            else [access_request.requested_protocol]
        )
        if sorted(grant.get("protocols", [])) != sorted(requested_protocols):
            raise HTTPException(422, "The policy protocols must exactly match the access request")
        if (
            grant.get("validFrom") != access_request.valid_from.isoformat()
            or grant.get("validUntil") != access_request.valid_until.isoformat()
        ):
            raise HTTPException(
                422, "The policy validity period must exactly match the access request"
            )
        granted_variant = grant.get("dataVariant")
        if (
            access_request.requested_variant != "either"
            and granted_variant != access_request.requested_variant
        ):
            raise HTTPException(422, "The granted data variant does not match the access request")

        access_request.fulfillment_subject_type = subject_type
        access_request.fulfillment_subject_id = subject_id
        access_request.fulfillment_group_revision = group_revision
        access_request.decision_policy_revision_id = policy.id
        access_request.granted_variant = granted_variant
        access_request.status = "approved_policy_pending"
        access_request.updated_at = utc_now()
        for task in session.scalars(
            select(WorkflowTask).where(
                WorkflowTask.access_request_id == access_request.id,
                WorkflowTask.status != "completed",
            )
        ):
            task.status = "in_progress"
            task.updated_at = utc_now()
        session.add(
            AuditEvent(
                id=uuid.uuid4(),
                resource_type="access-request",
                resource_id=str(access_request.id),
                action="linked-to-policy-revision",
                actor=actor,
                revision=policy.revision,
                details={
                    "policyRevisionId": str(policy.id),
                    "fulfillmentSubject": subject,
                    "groupMembershipRevision": group_revision,
                    "grantedVariant": granted_variant,
                },
            )
        )
        evidence.append(
            {
                "accessRequestId": str(access_request.id),
                "requestNumber": access_request.request_number,
                "requesterId": access_request.requester_id,
                "fulfillmentSubject": subject,
                "groupMembershipRevision": group_revision,
                "policyRevisionId": str(policy.id),
            }
        )
    return evidence


def latest_policy(session: Session, product_id: uuid.UUID) -> PolicyRevision | None:
    return session.scalar(
        select(PolicyRevision)
        .where(PolicyRevision.data_product_id == product_id)
        .order_by(PolicyRevision.revision.desc())
        .limit(1)
        .options(selectinload(PolicyRevision.deployments))
    )


def can_view_private_product(session: Session, product: DataProduct, actor: str | None) -> bool:
    if product.discoverable:
        return True
    if actor is None:
        return False
    if product.owner_user_id == actor:
        return True
    return (
        session.scalar(
            select(GovernanceSubmission.id)
            .where(
                GovernanceSubmission.data_product_id == product.id,
                GovernanceSubmission.approver_user_id == actor,
            )
            .limit(1)
        )
        is not None
    )


def _audit(
    session: Session,
    submission: GovernanceSubmission,
    action: str,
    actor: str,
    details: dict[str, Any],
) -> None:
    session.add(
        AuditEvent(
            id=uuid.uuid4(),
            resource_type="governance-submission",
            resource_id=str(submission.id),
            action=action,
            actor=actor,
            revision=submission.revision,
            details=details,
        )
    )


def _create_correction_task(
    session: Session,
    submission: GovernanceSubmission,
    product: DataProduct,
    detail: str,
) -> None:
    task_id = stable_id(f"task:governance-correction:{submission.id}")
    task = session.get(WorkflowTask, task_id)
    if task is None:
        session.add(
            WorkflowTask(
                id=task_id,
                task_type="governance_correction",
                status="open",
                assignee_user_id=submission.owner_user_id,
                data_product_id=product.id,
                governance_submission_id=submission.id,
                title="Governance-Einstellungen korrigieren",
                detail=detail,
            )
        )


def create_submission(
    session: Session,
    product: DataProduct,
    body: GovernanceSubmissionCreate,
    actor: str,
    resolved_grants: list[dict[str, Any]],
) -> GovernanceSubmission:
    if product.owner_user_id != actor:
        raise HTTPException(403, "Only the responsible data owner may submit governance")
    quality_task_open = session.scalar(
        select(WorkflowTask.id).where(
            WorkflowTask.data_product_id == product.id,
            WorkflowTask.task_type == "metadata_quality",
            WorkflowTask.status != "completed",
        )
    )
    if quality_task_open is not None:
        raise HTTPException(
            409,
            "Complete the metadata quality task before submitting publication governance",
        )
    existing = session.scalar(
        select(GovernanceSubmission).where(
            GovernanceSubmission.data_product_id == product.id,
            GovernanceSubmission.status.in_(ACTIVE_SUBMISSION_STATES),
        )
    )
    if existing is not None:
        raise HTTPException(409, "An active governance submission already exists")

    owner = session.get(DemoUser, actor)
    approver = session.get(DemoUser, owner.supervisor_user_id) if owner else None
    if owner is None or approver is None or not approver.active:
        raise HTTPException(409, "The data owner has no active publication approver")
    if approver.id == actor:
        raise HTTPException(409, "Four-eyes approval requires a different person")

    current = latest_policy(session, product.id)
    policy_revision = (current.revision if current else 0) + 1
    people = sorted(
        grant["subject"]["id"] for grant in resolved_grants if grant["subject"]["type"] == "person"
    )
    groups = sorted(
        grant["subject"]["id"] for grant in resolved_grants if grant["subject"]["type"] == "group"
    )
    definition = {
        "defaultEffect": "deny",
        "effect": "allow",
        "subjects": {"userIds": people, "machineIds": [], "groupIds": groups},
        "resources": {"productUrns": [product.urn], "owners": [product.owner]},
        "actions": ["data.read"],
        "protocols": ["http"],
        "grants": resolved_grants,
    }
    from .policy import generate_rego

    policy = PolicyRevision(
        id=uuid.uuid4(),
        data_product_id=product.id,
        revision=policy_revision,
        status="draft",
        definition=definition,
        generated_rego=generate_rego(),
        created_by=actor,
    )
    session.add(policy)
    session.flush()

    request_fulfillments = bind_access_request_fulfillments(
        session,
        product,
        policy,
        resolved_grants,
        body.access_request_fulfillments,
        actor,
    )

    now = utc_now()
    archive_evidence = {
        "enabled": body.bar_archive.enabled,
        "retentionYears": body.bar_archive.retention_years,
        "archiveAuthority": "BAR",
        "evidenceState": "recorded_no_external_delivery",
        "recordedAt": now.isoformat(),
        "networkCallCreated": False,
        "archiveJobCreated": False,
    }
    snapshot = {
        "snapshotVersion": 1,
        "dataProduct": {
            "id": str(product.id),
            "revision": product.revision,
            "urn": product.urn,
            "title": product.title,
            "ownerUserId": actor,
            "owner": product.owner,
            "classification": product.classification,
        },
        "approver": {
            "id": approver.id,
            "displayName": approver.display_name,
            "organization": approver.organization,
        },
        "discoverable": body.discoverable,
        "grants": json.loads(json.dumps(resolved_grants)),
        "accessRequestFulfillments": request_fulfillments,
        "barArchive": archive_evidence,
        "policy": {
            "id": str(policy.id),
            "revision": policy.revision,
            "definition": definition,
        },
        "submittedAt": now.isoformat(),
    }
    submission = GovernanceSubmission(
        id=uuid.uuid4(),
        data_product_id=product.id,
        policy_revision_id=policy.id,
        owner_user_id=actor,
        approver_user_id=approver.id,
        status="pending_approval",
        revision=1,
        review_snapshot=snapshot,
        archive_evidence=archive_evidence,
        submitted_at=now,
        updated_at=now,
    )
    session.add(submission)
    session.flush()
    assessment = session.get(ProductQualityAssessment, product.id)
    if assessment is None:
        assessment = ProductQualityAssessment(data_product_id=product.id)
        session.add(assessment)
    assessment.discoverability_confirmed = True
    product.discoverable = False
    product.lifecycle = "draft"

    for correction in session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.data_product_id == product.id,
            WorkflowTask.task_type == "governance_correction",
            WorkflowTask.status != "completed",
        )
    ):
        correction.status = "completed"
        correction.completed_at = now
        correction.updated_at = now
    for obsolete_approval in session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.data_product_id == product.id,
            WorkflowTask.task_type == "publication_approval",
            WorkflowTask.status != "completed",
        )
    ):
        obsolete_approval.status = "completed"
        obsolete_approval.completed_at = now
        obsolete_approval.updated_at = now

    approval_task = WorkflowTask(
        id=stable_id(f"task:publication-approval:{submission.id}"),
        task_type="publication_approval",
        status="open",
        assignee_user_id=approver.id,
        data_product_id=product.id,
        governance_submission_id=submission.id,
        title=f"Publikation von «{product.title}» genehmigen",
        detail=(
            f"Vier-Augen-Prüfung für Joel Ruod: {len(resolved_grants)} REST-Freigaben, "
            "I14Y und BAR-Aufbewahrung anhand des unveränderlichen Snapshots prüfen."
        ),
    )
    session.add(approval_task)
    _audit(
        session,
        submission,
        "submitted-for-four-eyes-approval",
        actor,
        {"approverUserId": approver.id, "policyRevision": policy_revision},
    )
    return submission


@dataclass(frozen=True)
class DecisionResult:
    submission: GovernanceSubmission
    deployment_error: str | None = None


def decide_submission(
    session: Session,
    submission: GovernanceSubmission,
    body: GovernanceDecisionCreate,
    actor: str,
    settings: Settings,
) -> DecisionResult:
    if actor != submission.approver_user_id:
        raise HTTPException(403, "Only the assigned publication approver may decide")
    if actor == submission.owner_user_id:
        raise HTTPException(403, "The data owner cannot approve their own publication")
    policy = session.get(PolicyRevision, submission.policy_revision_id)
    current = latest_policy(session, submission.data_product_id)
    if policy is None or current is None or current.id != policy.id:
        raise HTTPException(409, "The reviewed policy revision is stale")
    if body.policy_revision != policy.revision:
        raise HTTPException(409, "The decision does not reference the reviewed policy revision")
    if submission.status in {"approved", "approved_deploying"}:
        if body.decision == "approve":
            return DecisionResult(submission)
        raise HTTPException(409, "A contradictory decision has already been recorded")
    if submission.status == "rejected":
        if body.decision == "reject":
            return DecisionResult(submission)
        raise HTTPException(409, "A contradictory decision has already been recorded")
    if submission.status not in {"pending_approval", "deployment_failed"}:
        raise HTTPException(409, "This governance submission is not decision-ready")

    product = session.get(DataProduct, submission.data_product_id)
    if product is None:
        raise HTTPException(404, "Data product not found")
    reviewed_product_revision = submission.review_snapshot.get("dataProduct", {}).get("revision")
    if reviewed_product_revision != product.revision:
        raise HTTPException(409, "The reviewed data product revision is stale")

    now = utc_now()
    if body.decision == "reject":
        submission.status = "rejected"
        submission.decision = "reject"
        submission.decision_comment = body.comment
        submission.decided_at = now
        submission.updated_at = now
        submission.revision += 1
        product.discoverable = False
        product.lifecycle = "draft"
        for task in session.scalars(
            select(WorkflowTask).where(
                WorkflowTask.governance_submission_id == submission.id,
                WorkflowTask.task_type == "publication_approval",
                WorkflowTask.status != "completed",
            )
        ):
            task.status = "completed"
            task.completed_at = now
            task.updated_at = now
        _create_correction_task(
            session,
            submission,
            product,
            body.comment or "Die Publikation wurde abgelehnt und muss korrigiert werden.",
        )
        _audit(session, submission, "rejected", actor, {"comment": body.comment})
        return DecisionResult(submission)

    if policy.status != "draft":
        raise HTTPException(409, "Only the reviewed draft can be approved")
    projection: ProjectionResult = project_to_postgresql(
        settings, product.id, policy.revision, policy.definition
    )
    if projection.state != "deployed":
        submission.status = "deployment_failed"
        submission.decision = "approve"
        submission.decision_comment = body.comment
        submission.decided_at = now
        submission.updated_at = now
        submission.revision += 1
        _create_correction_task(
            session,
            submission,
            product,
            f"PostgreSQL-Deployment fehlgeschlagen: {projection.error or 'unbekannter Fehler'}",
        )
        _audit(
            session,
            submission,
            "approval-deployment-failed",
            actor,
            {"target": "postgresql", "error": projection.error},
        )
        return DecisionResult(submission, projection.error or "PostgreSQL deployment failed")

    policy.status = "published"
    policy.published_at = now
    product.active_policy_revision = policy.revision
    product.discoverable = False
    product.lifecycle = "draft"
    session.add_all(
        [
            PolicyDeployment(
                id=uuid.uuid4(),
                policy_revision=policy,
                target="opa",
                desired_revision=policy.revision,
                state="pending",
            ),
            PolicyDeployment(
                id=uuid.uuid4(),
                policy_revision=policy,
                target="postgresql",
                desired_revision=policy.revision,
                observed_revision=projection.observed_revision,
                state="deployed",
                error=None,
            ),
        ]
    )
    submission.status = "approved_deploying"
    submission.decision = "approve"
    submission.decision_comment = body.comment
    submission.decided_at = now
    submission.updated_at = now
    submission.revision += 1
    for task in session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.governance_submission_id == submission.id,
            WorkflowTask.task_type == "publication_approval",
            WorkflowTask.status != "completed",
        )
    ):
        task.status = "in_progress"
        task.updated_at = now
    _audit(
        session,
        submission,
        "approved-deployment-started",
        actor,
        {"policyRevision": policy.revision, "targets": ["postgresql", "opa"]},
    )
    return DecisionResult(submission)


def finalize_submission_deployment(
    session: Session, product: DataProduct, policy: PolicyRevision
) -> GovernanceSubmission | None:
    submission = session.scalar(
        select(GovernanceSubmission).where(GovernanceSubmission.policy_revision_id == policy.id)
    )
    if submission is None:
        return None
    deployments = {
        item.target: item
        for item in session.scalars(
            select(PolicyDeployment).where(PolicyDeployment.policy_revision_id == policy.id)
        )
    }
    failed = next((item for item in deployments.values() if item.state == "failed"), None)
    if failed is not None:
        submission.status = "deployment_failed"
        submission.updated_at = utc_now()
        submission.revision += 1
        product.discoverable = False
        product.lifecycle = "draft"
        product.active_policy_revision = None
        for task in session.scalars(
            select(WorkflowTask).where(
                WorkflowTask.governance_submission_id == submission.id,
                WorkflowTask.task_type == "publication_approval",
                WorkflowTask.status != "completed",
            )
        ):
            task.status = "completed"
            task.completed_at = utc_now()
            task.updated_at = utc_now()
        _create_correction_task(
            session,
            submission,
            product,
            f"Deployment nach Genehmigung fehlgeschlagen ({failed.target}): {failed.error or 'unbekannter Fehler'}",
        )
        _audit(
            session,
            submission,
            "deployment-failed",
            "daca-deployment-observer",
            {"target": failed.target, "error": failed.error},
        )
        return submission
    if set(deployments) != {"opa", "postgresql"} or any(
        item.state != "deployed" for item in deployments.values()
    ):
        return submission

    now = utc_now()
    submission.status = "approved"
    submission.updated_at = now
    submission.revision += 1
    product.discoverable = bool(submission.review_snapshot.get("discoverable", True))
    product.lifecycle = "active"
    publication = session.scalar(
        select(MetadataPublication).where(MetadataPublication.data_product_id == product.id)
    )
    if publication is not None:
        publication.state = "published"
    for task in session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.governance_submission_id == submission.id,
            WorkflowTask.task_type == "publication_approval",
            WorkflowTask.status != "completed",
        )
    ):
        task.status = "completed"
        task.completed_at = now
        task.updated_at = now
    _audit(
        session,
        submission,
        "deployment-confirmed-publication-activated",
        "daca-deployment-observer",
        {"policyRevision": policy.revision, "discoverable": product.discoverable},
    )
    return submission


def response_payload(session: Session, submission: GovernanceSubmission) -> dict[str, Any]:
    policy = session.get(PolicyRevision, submission.policy_revision_id)
    if policy is None:
        raise HTTPException(409, "The governance submission has lost its policy evidence")
    return {
        "id": submission.id,
        "dataProductId": submission.data_product_id,
        "policyRevisionId": submission.policy_revision_id,
        "policyRevision": policy.revision,
        "ownerUserId": submission.owner_user_id,
        "approverUserId": submission.approver_user_id,
        "status": submission.status,
        "revision": submission.revision,
        "reviewSnapshot": submission.review_snapshot,
        "archiveEvidence": submission.archive_evidence,
        "decision": submission.decision,
        "decisionComment": submission.decision_comment,
        "submittedAt": submission.submitted_at,
        "decidedAt": submission.decided_at,
        "updatedAt": submission.updated_at,
    }
