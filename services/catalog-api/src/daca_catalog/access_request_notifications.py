"""Recipient-private, acknowledgeable messages about product-access decisions."""

import uuid
from collections.abc import Callable

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .models import AccessRequest, DataProduct, WorkflowTask, utc_now

DECISION_TASKS = {
    "approved_policy_pending": "access_request_approved",
    "granted_original": "access_request_granted",
    "granted_modified": "access_request_granted",
    "rejected": "access_request_rejected",
}


def notify_access_request_status(
    session: Session, request: AccessRequest, product: DataProduct
) -> None:
    task_type = DECISION_TASKS.get(request.status)
    if task_type is None:
        return
    now = utc_now()
    if request.status != "approved_policy_pending":
        # Superseded approval notices must not suggest activation is still pending.
        session.execute(
            update(WorkflowTask)
            .where(
                WorkflowTask.access_request_id == request.id,
                WorkflowTask.task_type == "access_request_approved",
                WorkflowTask.status != "completed",
            )
            .values(status="completed", completed_at=now, updated_at=now)
        )
    if request.status == "approved_policy_pending":
        title = "Zugriffsantrag genehmigt – Freigabe steht noch aus"
        detail = "Ihr Antrag wurde genehmigt. Die Freigabe ist noch nicht technisch aktiviert."
    elif request.status == "rejected":
        title = "Zugriffsanfrage abgelehnt"
        detail = "Ihr Antrag wurde abgelehnt. Die Entscheidung können Sie im Antrag ansehen."
    else:
        title = "Zugriff gewährt"
        variant = "modifiziert" if request.granted_variant == "modified" else "original"
        end = (
            f"bis {request.valid_until:%d.%m.%Y}"
            if request.valid_until
            else "ohne festgelegtes Enddatum"
        )
        detail = f"Die Freigabe ({variant}) ist technisch bestätigt und gilt ab {request.valid_from:%d.%m.%Y} {end}."
    # The stable key survives reloads, concurrent polls and restarts, including acknowledgement.
    task_id = uuid.uuid5(
        uuid.NAMESPACE_URL, f"urn:daca:access-request-message:{request.id}:{task_type}"
    )
    session.execute(
        insert(WorkflowTask)
        .values(
            id=task_id,
            task_type=task_type,
            task_kind="information",
            status="open",
            assignee_user_id=request.requester_id,
            data_product_id=product.id,
            access_request_id=request.id,
            title=f"{title} · {product.title}"[:255],
            detail=f"{request.request_number} · {detail}",
            created_at=request.updated_at or now,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=[WorkflowTask.id])
    )


def reconcile_requester_messages(
    session: Session,
    actor: str,
    granted_is_confirmed: Callable[[AccessRequest, DataProduct], bool],
) -> None:
    """Also deliver decisions made before this capability was installed."""
    for request, product in session.execute(
        select(AccessRequest, DataProduct)
        .join(DataProduct, DataProduct.id == AccessRequest.data_product_id)
        .where(AccessRequest.requester_id == actor, AccessRequest.status.in_(DECISION_TASKS))
        .with_for_update(of=AccessRequest)
    ):
        if request.status.startswith("granted_") and not granted_is_confirmed(request, product):
            continue
        notify_access_request_status(session, request, product)
