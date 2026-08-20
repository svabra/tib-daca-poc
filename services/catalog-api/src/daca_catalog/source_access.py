from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import (
    AuditEvent,
    DemoUser,
    IdentityGroup,
    IdentityGroupMembership,
    SourceAccessGrant,
    SourceAccessRequest,
    SourceCatalogEntry,
    WorkflowTask,
    utc_now,
)
from .schemas import (
    DemoUserResponse,
    SourceAccessContextResponse,
    SourceAccessDecision,
    SourceAccessGrantResponse,
    SourceAccessRequestCreate,
    SourceAccessRequestResponse,
    SourceAccessSubject,
    SourceAccessSubjectRef,
    SourceCatalogEntryResponse,
    SourceCatalogPage,
    SourceCatalogSummary,
)
from .workflow_seed import SOURCE_DISCOVERY_GROUPS, stable_id

ZURICH = ZoneInfo("Europe/Zurich")


def zurich_today() -> date:
    return datetime.now(ZURICH).date()


def _active_group_ids(session: Session, actor: str, *, effective_date: date) -> set[str]:
    return set(
        session.scalars(
            select(IdentityGroupMembership.group_id)
            .join(IdentityGroup, IdentityGroup.id == IdentityGroupMembership.group_id)
            .where(
                IdentityGroupMembership.identity_id == actor,
                IdentityGroup.active.is_(True),
                or_(
                    IdentityGroupMembership.valid_from.is_(None),
                    IdentityGroupMembership.valid_from <= effective_date,
                ),
                or_(
                    IdentityGroupMembership.valid_until.is_(None),
                    IdentityGroupMembership.valid_until >= effective_date,
                ),
            )
        )
    )


def _is_discoverable(source: SourceCatalogEntry, actor: str, group_ids: set[str]) -> bool:
    return source.owner_user_id == actor or bool(
        group_ids.intersection(source.discoverability_group_ids or [])
    )


def _grant_state(valid_from: date, valid_until: date | None, today: date) -> Literal[
    "scheduled", "active", "expired"
]:
    if valid_from > today:
        return "scheduled"
    if valid_until is not None and valid_until < today:
        return "expired"
    return "active"


def _grant_applies(grant: SourceAccessGrant, actor: str) -> bool:
    if grant.subject_type == "person":
        return grant.subject_id == actor
    snapshot = grant.group_snapshot or {}
    return actor in snapshot.get("memberIds", [])


def _access_status(session: Session, source_id: str, actor: str) -> str:
    today = zurich_today()
    grants = list(
        session.scalars(
            select(SourceAccessGrant)
            .where(SourceAccessGrant.source_id == source_id)
            .order_by(SourceAccessGrant.created_at.desc())
        )
    )
    applicable_states = [
        _grant_state(grant.valid_from, grant.valid_until, today)
        for grant in grants
        if _grant_applies(grant, actor)
    ]
    for state in ("active", "scheduled", "expired"):
        if state in applicable_states:
            return state
    request = session.scalar(
        select(SourceAccessRequest)
        .where(
            SourceAccessRequest.source_id == source_id,
            SourceAccessRequest.requester_id == actor,
        )
        .order_by(SourceAccessRequest.created_at.desc())
        .limit(1)
    )
    return request.status if request is not None else "none"


def source_response(
    session: Session,
    source: SourceCatalogEntry,
    *,
    actor: str | None = None,
) -> SourceCatalogEntryResponse:
    owner = session.get(DemoUser, source.owner_user_id)
    return SourceCatalogEntryResponse(
        id=source.id,
        source_type="oracle",
        database_name=source.database_name,
        display_name=source.display_name,
        description=source.description,
        organization=source.organization,
        owner_user_id=source.owner_user_id,
        owner_name=owner.display_name if owner is not None else source.owner_user_id,
        sites=list(source.sites),
        objects=list(source.search_objects),
        mock_profile=dict(source.mock_profile),
        access_status=_access_status(session, source.id, actor) if actor else "none",
    )


def catalog_page(
    session: Session,
    actor: str,
    *,
    source_type: str,
    query: str | None,
    site: str | None,
    offset: int,
    limit: int,
) -> SourceCatalogPage:
    if source_type.casefold() != "oracle":
        raise HTTPException(422, "Only BIT Oracle RDBMS is available in this PoC")
    all_sources = list(
        session.scalars(
            select(SourceCatalogEntry)
            .where(SourceCatalogEntry.active.is_(True), SourceCatalogEntry.source_type == "oracle")
            .order_by(SourceCatalogEntry.display_name, SourceCatalogEntry.id)
        )
    )
    group_ids = _active_group_ids(session, actor, effective_date=zurich_today())
    discoverable = [item for item in all_sources if _is_discoverable(item, actor, group_ids)]
    needle = (query or "").strip().casefold()
    normalized_site = (site or "").strip().upper()

    def matches(item: SourceCatalogEntry) -> bool:
        if normalized_site in {"PRIMUS", "CAMPUS"} and normalized_site not in item.sites:
            return False
        if normalized_site == "BOTH" and not {"PRIMUS", "CAMPUS"}.issubset(set(item.sites)):
            return False
        if not needle:
            return True
        object_text = " ".join(
            f"{entry.get('schema', '')} {entry.get('name', '')} {entry.get('kind', '')}"
            for entry in item.search_objects
        )
        owner = session.get(DemoUser, item.owner_user_id)
        haystack = " ".join(
            (
                item.id,
                item.database_name,
                item.display_name,
                item.organization,
                item.description,
                owner.display_name if owner else "",
                object_text,
            )
        ).casefold()
        return needle in haystack

    matched = [item for item in discoverable if matches(item)]
    return SourceCatalogPage(
        summary=SourceCatalogSummary(
            total=len(all_sources),
            discoverable=len(discoverable),
            hidden=len(all_sources) - len(discoverable),
            matched=len(matched),
        ),
        offset=offset,
        limit=limit,
        items=[
            source_response(session, item, actor=actor)
            for item in matched[offset : offset + limit]
        ],
    )


def find_discoverable_source(session: Session, actor: str, source_id: str) -> SourceCatalogEntry:
    source = session.get(SourceCatalogEntry, source_id)
    groups = _active_group_ids(session, actor, effective_date=zurich_today())
    if source is None or not source.active or not _is_discoverable(source, actor, groups):
        raise HTTPException(404, "Data source not found")
    return source


def access_context(session: Session, actor: str, source_id: str) -> SourceAccessContextResponse:
    source = find_discoverable_source(session, actor, source_id)
    requester = session.get(DemoUser, actor)
    if requester is None or not requester.active:
        raise HTTPException(401, "Unknown or inactive local demo identity")
    subjects = [
        SourceAccessSubject(type="person", id=actor, label=requester.display_name)
    ]
    today = zurich_today()
    group_ids = _active_group_ids(session, actor, effective_date=today)
    for group_id in SOURCE_DISCOVERY_GROUPS:
        if group_id not in group_ids:
            continue
        group = session.get(IdentityGroup, group_id)
        if group is None or not group.active:
            continue
        members = list(
            session.scalars(
                select(IdentityGroupMembership.identity_id).where(
                    IdentityGroupMembership.group_id == group_id,
                    or_(
                        IdentityGroupMembership.valid_from.is_(None),
                        IdentityGroupMembership.valid_from <= today,
                    ),
                    or_(
                        IdentityGroupMembership.valid_until.is_(None),
                        IdentityGroupMembership.valid_until >= today,
                    ),
                )
            )
        )
        subjects.append(
            SourceAccessSubject(
                type="group",
                id=group.id,
                label=group.label,
                member_count=len(members),
                membership_revision=group.membership_revision,
                recommended=group.id == "estv-business-intelligence",
            )
        )
    return SourceAccessContextResponse(
        requester=DemoUserResponse.model_validate(requester),
        source=source_response(session, source, actor=actor),
        subjects=subjects,
    )


def _subject_snapshot(
    session: Session, actor: str, subject: SourceAccessSubjectRef
) -> tuple[str, str, int | None, dict[str, object] | None]:
    if subject.type == "person":
        if subject.id != actor:
            raise HTTPException(422, "Personal source access can only be requested for yourself")
        user = session.get(DemoUser, actor)
        if user is None or not user.active:
            raise HTTPException(401, "Unknown or inactive local demo identity")
        return actor, user.display_name, None, None
    group = session.get(IdentityGroup, subject.id)
    today = zurich_today()
    active_groups = _active_group_ids(session, actor, effective_date=today)
    if group is None or not group.active or group.id not in active_groups:
        raise HTTPException(422, "The selected group is not an active group of the requester")
    member_ids = sorted(
        session.scalars(
            select(IdentityGroupMembership.identity_id).where(
                IdentityGroupMembership.group_id == group.id,
                or_(
                    IdentityGroupMembership.valid_from.is_(None),
                    IdentityGroupMembership.valid_from <= today,
                ),
                or_(
                    IdentityGroupMembership.valid_until.is_(None),
                    IdentityGroupMembership.valid_until >= today,
                ),
            )
        )
    )
    return (
        group.id,
        group.label,
        group.membership_revision,
        {
            "groupId": group.id,
            "label": group.label,
            "membershipRevision": group.membership_revision,
            "memberIds": member_ids,
        },
    )


def request_response(
    session: Session, request: SourceAccessRequest
) -> SourceAccessRequestResponse:
    source = session.get(SourceCatalogEntry, request.source_id)
    if source is None:
        raise HTTPException(500, "The source linked to this request is unavailable")
    owner = session.get(DemoUser, request.owner_user_id)
    member_count = None
    if request.group_snapshot:
        member_count = len(request.group_snapshot.get("memberIds", []))
    return SourceAccessRequestResponse(
        id=request.id,
        request_number=request.request_number,
        client_request_id=request.client_request_id,
        source=source_response(session, source, actor=request.requester_id),
        requester_id=request.requester_id,
        requester_name=request.requester_name,
        requester_organization=request.requester_organization,
        owner_user_id=request.owner_user_id,
        owner_name=owner.display_name if owner else request.owner_user_id,
        request_title=request.request_title,
        subject=SourceAccessSubject(
            type=request.subject_type,
            id=request.subject_id,
            label=request.subject_label,
            member_count=member_count,
            membership_revision=request.group_revision,
            recommended=request.subject_id == "estv-business-intelligence",
        ),
        group_snapshot=request.group_snapshot,
        purpose=request.purpose,
        legal_basis=request.legal_basis,
        valid_from=request.valid_from,
        valid_until=request.valid_until,
        conditions_accepted=request.conditions_accepted,
        status=request.status,
        decision_by=request.decision_by,
        decision_comment=request.decision_comment,
        decided_at=request.decided_at,
        created_at=request.created_at,
        updated_at=request.updated_at,
    )


def create_request(
    session: Session,
    actor: str,
    body: SourceAccessRequestCreate,
) -> SourceAccessRequestResponse:
    existing = session.scalar(
        select(SourceAccessRequest).where(
            SourceAccessRequest.requester_id == actor,
            SourceAccessRequest.client_request_id == body.client_request_id,
        )
    )
    if existing is not None:
        return request_response(session, existing)
    source = find_discoverable_source(session, actor, body.source_id)
    today = zurich_today()
    if body.valid_from < today:
        raise HTTPException(422, "validFrom cannot be before today's Swiss date")
    if body.valid_until is not None and body.valid_until < body.valid_from:
        raise HTTPException(422, "validUntil must be on or after validFrom")
    if not body.conditions_accepted:
        raise HTTPException(422, "The source access conditions must be accepted")
    subject_id, subject_label, revision, snapshot = _subject_snapshot(
        session, actor, body.subject
    )
    open_request = session.scalar(
        select(SourceAccessRequest).where(
            SourceAccessRequest.source_id == source.id,
            SourceAccessRequest.subject_type == body.subject.type,
            SourceAccessRequest.subject_id == subject_id,
            SourceAccessRequest.status == "submitted",
        )
    )
    if open_request is not None:
        raise HTTPException(409, "An open request already exists for this source and subject")
    requester = session.get(DemoUser, actor)
    if requester is None or not requester.active:
        raise HTTPException(401, "Unknown or inactive local demo identity")
    now = utc_now()
    request_id = uuid.uuid4()
    request = SourceAccessRequest(
        id=request_id,
        request_number=f"DS-{today.year}-{request_id.hex[:6].upper()}",
        client_request_id=body.client_request_id,
        source_id=source.id,
        requester_id=actor,
        requester_name=requester.display_name,
        requester_organization=requester.organization,
        owner_user_id=source.owner_user_id,
        request_title=body.request_title.strip(),
        subject_type=body.subject.type,
        subject_id=subject_id,
        subject_label=subject_label,
        group_revision=revision,
        group_snapshot=snapshot,
        purpose=body.purpose.strip(),
        legal_basis=body.legal_basis.strip(),
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        conditions_accepted=True,
        status="submitted",
        created_at=now,
        updated_at=now,
    )
    session.add(request)
    session.add(
        WorkflowTask(
            id=stable_id(f"task:source-access:{request_id}"),
            task_type="source_access_review",
            status="open",
            assignee_user_id=source.owner_user_id,
            data_product_id=None,
            source_access_request_id=request_id,
            title=f"Datenquellen-Zugriff von {requester.display_name}",
            detail=f"Zugriff auf {source.display_name} für {subject_label} prüfen.",
            created_at=now,
            updated_at=now,
        )
    )
    session.add(
        AuditEvent(
            id=uuid.uuid4(),
            resource_type="source-access-request",
            resource_id=str(request_id),
            action="submitted",
            actor=actor,
            details={
                "sourceId": source.id,
                "subjectType": body.subject.type,
                "subjectId": subject_id,
                "groupRevision": revision,
            },
            occurred_at=now,
        )
    )
    session.commit()
    return request_response(session, request)


def requests_for_actor(session: Session, actor: str) -> list[SourceAccessRequestResponse]:
    requests = session.scalars(
        select(SourceAccessRequest)
        .where(SourceAccessRequest.requester_id == actor)
        .order_by(SourceAccessRequest.created_at.desc())
    )
    return [request_response(session, item) for item in requests]


def requests_for_owner(session: Session, actor: str) -> list[SourceAccessRequestResponse]:
    requests = session.scalars(
        select(SourceAccessRequest)
        .where(SourceAccessRequest.owner_user_id == actor, SourceAccessRequest.status == "submitted")
        .order_by(SourceAccessRequest.created_at)
    )
    return [request_response(session, item) for item in requests]


def decide_request(
    session: Session,
    actor: str,
    request_id: uuid.UUID,
    body: SourceAccessDecision,
) -> SourceAccessRequestResponse:
    request = session.get(SourceAccessRequest, request_id)
    if request is None:
        raise HTTPException(404, "Source access request not found")
    if request.owner_user_id != actor:
        raise HTTPException(403, "Only the configured source owner can decide this request")
    expected_status = "approved" if body.decision == "approve" else "rejected"
    if request.status != "submitted":
        if request.status == expected_status:
            return request_response(session, request)
        raise HTTPException(409, "This source access request has already been decided")
    comment = (body.comment or "").strip()
    if body.decision == "reject" and len(comment) < 3:
        raise HTTPException(422, "A rejection requires a reason")
    now = utc_now()
    request.status = expected_status
    request.decision_by = actor
    request.decision_comment = comment or None
    request.decided_at = now
    request.updated_at = now
    if body.decision == "approve":
        existing_grant = session.scalar(
            select(SourceAccessGrant).where(
                SourceAccessGrant.source_access_request_id == request.id
            )
        )
        if existing_grant is None:
            session.add(
                SourceAccessGrant(
                    id=uuid.uuid4(),
                    source_access_request_id=request.id,
                    source_id=request.source_id,
                    subject_type=request.subject_type,
                    subject_id=request.subject_id,
                    subject_label=request.subject_label,
                    group_revision=request.group_revision,
                    group_snapshot=request.group_snapshot,
                    valid_from=request.valid_from,
                    valid_until=request.valid_until,
                    granted_by=actor,
                    created_at=now,
                )
            )
    task = session.scalar(
        select(WorkflowTask).where(WorkflowTask.source_access_request_id == request.id)
    )
    if task is not None:
        task.status = "completed"
        task.completed_at = now
        task.updated_at = now
    session.add(
        AuditEvent(
            id=uuid.uuid4(),
            resource_type="source-access-request",
            resource_id=str(request.id),
            action=expected_status,
            actor=actor,
            details={"sourceId": request.source_id, "comment": comment or None},
            occurred_at=now,
        )
    )
    session.commit()
    return request_response(session, request)


def grants_for_actor(session: Session, actor: str) -> list[SourceAccessGrantResponse]:
    today = zurich_today()
    responses: list[SourceAccessGrantResponse] = []
    for grant in session.scalars(select(SourceAccessGrant).order_by(SourceAccessGrant.created_at)):
        if not _grant_applies(grant, actor):
            continue
        source = session.get(SourceCatalogEntry, grant.source_id)
        if source is None or not source.active:
            continue
        member_count = len((grant.group_snapshot or {}).get("memberIds", [])) or None
        responses.append(
            SourceAccessGrantResponse(
                id=grant.id,
                source_access_request_id=grant.source_access_request_id,
                source=source_response(session, source, actor=actor),
                subject=SourceAccessSubject(
                    type=grant.subject_type,
                    id=grant.subject_id,
                    label=grant.subject_label,
                    member_count=member_count,
                    membership_revision=grant.group_revision,
                    recommended=grant.subject_id == "estv-business-intelligence",
                ),
                group_snapshot=grant.group_snapshot,
                valid_from=grant.valid_from,
                valid_until=grant.valid_until,
                granted_by=grant.granted_by,
                state=_grant_state(grant.valid_from, grant.valid_until, today),
                created_at=grant.created_at,
            )
        )
    return responses
