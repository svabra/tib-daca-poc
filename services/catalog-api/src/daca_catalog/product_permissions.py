"""Public permission evidence and narrowly scoped, versioned grant revocation."""
from __future__ import annotations

import json
import uuid
from collections import defaultdict
from datetime import date, datetime
from functools import cache
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, selectinload

from .access_renewals import normalized_policy, policy_grant_id, zurich_today
from .governance import ACTIVE_SUBMISSION_STATES, create_access_change_submission
from .models import (
    AuditEvent,
    DataProduct,
    DemoUser,
    GovernanceSubmission,
    IdentityDirectoryEntry,
    IdentityGroup,
    PolicyDeployment,
    PolicyRevision,
    utc_now,
)
from .object_governance import product_owners
from .policy import generate_rego, project_to_postgresql
from .schemas import ApiModel, PolicyGrant
from .settings import Settings


class PermissionIdentity(ApiModel):
    id: str
    display_name: str
    organization: str


class PublicPermission(ApiModel):
    grant_id: str
    display_name: str
    organization: str
    grant: PolicyGrant
    group_members: list[PermissionIdentity]


class ProductPermissionsResponse(ApiModel):
    as_of_date: date
    product_id: uuid.UUID
    policy_revision: int | None
    latest_revision: int
    state: Literal["confirmed", "pending", "failed"]
    can_manage: bool
    can_revoke: bool
    items: list[PublicPermission]


class PermissionLogItem(ApiModel):
    id: str
    action: Literal["granted", "changed", "revoked", "revocation_requested", "revocation_rejected"]
    occurred_at: datetime
    actor_id: str
    actor_name: str
    subject_type: Literal["person", "machine", "group"]
    subject_id: str
    display_name: str
    organization: str
    policy_revision: int
    before: list[PolicyGrant]
    after: list[PolicyGrant]
    source: Literal["audit", "policy_history"]


class PermissionLogResponse(ApiModel):
    items: list[PermissionLogItem]
    total: int


class PermissionRevocationResponse(ApiModel):
    policy_id: uuid.UUID
    policy_revision: int
    state: Literal["pending_approval", "activating"]
    governance_submission_id: uuid.UUID | None = None


def policies(session: Session, product_id: uuid.UUID) -> list[PolicyRevision]:
    return list(session.scalars(select(PolicyRevision).where(
        PolicyRevision.data_product_id == product_id,
    ).order_by(PolicyRevision.revision).options(selectinload(PolicyRevision.deployments))))


def aligned(policy: PolicyRevision) -> bool:
    targets = {item.target: item for item in policy.deployments}
    return all(target in targets and targets[target].state == "deployed"
               and targets[target].desired_revision == policy.revision
               and targets[target].observed_revision == policy.revision
               for target in ("opa", "postgresql"))


def snapshot(policy: PolicyRevision | None) -> list[dict[str, Any]]:
    if policy is None or policy.status == "revoked":
        return []
    try:
        definition = normalized_policy(policy)
    except ValidationError:
        raise HTTPException(503, "Permission evidence is unavailable") from None
    return [grant.model_dump(mode="json", by_alias=True) for grant in definition.grants] if definition.effect == "allow" else []


def changes(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def grouped(grants):
        result = defaultdict(list)
        for grant in grants:
            result[(grant["subject"]["type"], grant["subject"]["id"])].append(grant)
        return {key: sorted(values, key=lambda value: json.dumps(value, sort_keys=True)) for key, values in result.items()}
    old, new = grouped(before), grouped(after)
    return [{"subjectType": key[0], "subjectId": key[1],
             "action": "granted" if key not in old else "revoked" if key not in new else "changed",
             "before": old.get(key, []), "after": new.get(key, [])}
            for key in sorted(old.keys() | new.keys()) if old.get(key) != new.get(key)]


def record_permission_activation(session: Session, product: DataProduct, policy: PolicyRevision) -> None:
    """Append one idempotent checkpoint only for a confirmed effective transition."""
    if not aligned(policy) or (policy.status == "published" and product.active_policy_revision != policy.revision):
        return
    if policy.status not in {"published", "revoked"} or (policy.status == "revoked" and product.active_policy_revision is not None):
        return
    previous = next((item for item in reversed(policies(session, product.id))
                     if item.revision < policy.revision and item.status in {"published", "revoked"} and aligned(item)), None)
    before, after = snapshot(previous), snapshot(policy)
    event_id = uuid.uuid5(uuid.NAMESPACE_URL, f"daca:permission-activation:{policy.id}")
    session.execute(insert(AuditEvent).values(
        id=event_id, resource_type="access-permission", resource_id=str(product.id),
        action="policy-activated", actor=policy.created_by, revision=policy.revision,
        details={"policyId": str(policy.id), "changes": changes(before, after)}, occurred_at=utc_now(),
    ).on_conflict_do_nothing(index_elements=[AuditEvent.id]))


def identity_label(session: Session, kind: str, identity_id: str) -> PermissionIdentity:
    directory = session.get(IdentityDirectoryEntry, identity_id) if kind == "person" else None
    person = session.get(DemoUser, identity_id) if kind == "person" else None
    group = session.get(IdentityGroup, identity_id) if kind == "group" else None
    return PermissionIdentity(
        id=identity_id,
        display_name=directory.display_name if directory else person.display_name if person else group.label if group else identity_id,
        organization=directory.organization if directory else person.organization if person else group.organization_id or "Gruppe" if group else "M2M",
    )


def registry(session: Session, product: DataProduct, actor: str | None) -> ProductPermissionsResponse:
    labels = cache(lambda kind, identity_id: identity_label(session, kind, identity_id))
    history = policies(session, product.id)
    latest = history[-1] if history else None
    selected = next((item for item in history if item.revision == product.active_policy_revision and item.status == "published"), None)
    state = "confirmed"
    if product.active_policy_revision is not None and selected is None:
        raise HTTPException(503, "Active permission evidence is unavailable")
    transitioning = selected if selected and not aligned(selected) else latest if latest and latest.status in {"published", "revoked"} and not aligned(latest) else None
    if transitioning:
        state = "failed" if any(item.state == "failed" for item in transitioning.deployments) else "pending"
        selected = next((item for item in reversed(history) if item.status in {"published", "revoked"} and aligned(item)), None)
    can_manage = actor in product_owners(session, product) if actor else False
    pending = session.scalar(select(GovernanceSubmission.id).where(
        GovernanceSubmission.data_product_id == product.id,
        GovernanceSubmission.status.in_(ACTIVE_SUBMISSION_STATES),
    ).limit(1))
    today = zurich_today()
    items = []
    for value in snapshot(selected):
        grant = PolicyGrant.model_validate(value)
        if not grant.valid_from <= today <= grant.valid_until or "data.read" not in grant.actions:
            continue
        label = labels(grant.subject.type, grant.subject.id)
        members = [labels("person", member) for member in grant.group_snapshot.member_ids] if grant.group_snapshot else []
        items.append(PublicPermission(grant_id=policy_grant_id(selected, grant),
                     display_name=label.display_name, organization=label.organization, grant=grant, group_members=members))
    return ProductPermissionsResponse(as_of_date=today, product_id=product.id, policy_revision=selected.revision if selected else None,
        latest_revision=latest.revision if latest else 0, state=state, can_manage=can_manage,
        can_revoke=can_manage and state == "confirmed" and pending is None and (latest is None or latest.status != "draft"),
        items=sorted(items, key=lambda item: (item.display_name.casefold(), item.grant_id)))


def permission_log(session: Session, product: DataProduct) -> PermissionLogResponse:
    labels = cache(lambda kind, identity_id: identity_label(session, kind, identity_id))
    audit_rows = list(session.scalars(select(AuditEvent).where(
        AuditEvent.resource_type == "access-permission", AuditEvent.resource_id == str(product.id),
    )))
    recorded = {item.revision for item in audit_rows if item.action == "policy-activated"}
    evidence = [(item, item.details.get("changes", []), "audit") for item in audit_rows]
    previous = []
    for policy in policies(session, product.id):
        if policy.status not in {"published", "revoked"} or not aligned(policy):
            continue
        after = snapshot(policy)
        if policy.revision not in recorded:
            evidence.append((AuditEvent(id=policy.id, actor=policy.created_by, revision=policy.revision,
                            occurred_at=max(item.updated_at for item in policy.deployments)), changes(previous, after), "policy_history"))
        previous = after
    # Rejected revocations leave the active policy untouched and remain visible as decisions.
    for submission in session.scalars(select(GovernanceSubmission).where(GovernanceSubmission.data_product_id == product.id)):
        value = submission.review_snapshot.get("revocation", {}).get("grant")
        if value and submission.status == "rejected":
            evidence.append((AuditEvent(id=submission.id, actor=submission.approver_user_id,
                            revision=submission.review_snapshot["policy"]["revision"], occurred_at=submission.decided_at),
                            [{"action": "revocation_rejected", "subjectType": value["subject"]["type"],
                              "subjectId": value["subject"]["id"], "before": [value], "after": [value]}], "audit"))
    result = []
    for event, entries, source in evidence:
        actor = labels("person", event.actor)
        for index, entry in enumerate(entries):
            label = labels(entry["subjectType"], entry["subjectId"])
            result.append(PermissionLogItem(id=f"{event.id}:{index}", action=entry["action"],
                occurred_at=event.occurred_at, actor_id=event.actor, actor_name=actor.display_name,
                subject_type=entry["subjectType"], subject_id=entry["subjectId"], display_name=label.display_name,
                organization=label.organization, policy_revision=event.revision,
                before=entry["before"], after=entry["after"], source=source))
    result.sort(key=lambda item: (item.occurred_at, item.id), reverse=True)
    return PermissionLogResponse(items=result, total=len(result))


def revoke_permission(session: Session, product: DataProduct, grant_id: str, actor: str,
                      settings: Settings, *, four_eyes: bool) -> PermissionRevocationResponse:
    current = registry(session, product, actor)
    if not current.can_revoke:
        raise HTTPException(409, "Complete the pending policy or approval before revoking access")
    target = next((item for item in current.items if item.grant_id == grant_id), None)
    if target is None:
        raise HTTPException(409, "The selected permission changed or is no longer active; reload the list")
    active = next(item for item in policies(session, product.id) if item.revision == current.policy_revision)
    definition = normalized_policy(active).model_dump(mode="json", by_alias=True)
    remaining = [value for value in definition["grants"] if policy_grant_id(active, value) != grant_id]
    definition["grants"] = remaining
    definition["subjects"] = {key: sorted({value["subject"]["id"] for value in remaining if value["subject"]["type"] == kind})
                              for kind, key in (("person", "userIds"), ("machine", "machineIds"), ("group", "groupIds"))}
    definition["effect"] = "allow" if remaining else "deny"
    if four_eyes:
        submission = create_access_change_submission(session, product, None, definition, None, actor,
            revoked_grant=target.grant.model_dump(mode="json", by_alias=True))
        policy = session.get(PolicyRevision, submission.policy_revision_id)
    else:
        policy = PolicyRevision(id=uuid.uuid4(), data_product_id=product.id, revision=current.latest_revision + 1,
            status="published", definition=definition, generated_rego=generate_rego(), created_by=actor, published_at=utc_now())
        projection = project_to_postgresql(settings, product.id, policy.revision, definition)
        if projection.state != "deployed" or projection.observed_revision != policy.revision:
            raise HTTPException(503, "Permission revocation could not be deployed; reload before retrying")
        session.add(policy)
        session.add_all([
            PolicyDeployment(id=uuid.uuid4(), policy_revision=policy, target="opa", desired_revision=policy.revision, state="pending"),
            PolicyDeployment(id=uuid.uuid4(), policy_revision=policy, target="postgresql", desired_revision=policy.revision,
                             observed_revision=projection.observed_revision, state="deployed"),
        ])
        product.active_policy_revision = policy.revision
    session.add(AuditEvent(id=uuid.uuid4(), resource_type="access-permission", resource_id=str(product.id),
        action="revocation-requested", actor=actor, revision=policy.revision,
        details={"changes": [{"action": "revocation_requested", "subjectType": target.grant.subject.type,
                  "subjectId": target.grant.subject.id, "before": [target.grant.model_dump(mode="json", by_alias=True)], "after": []}]}))
    session.commit()
    return PermissionRevocationResponse(policy_id=policy.id, policy_revision=policy.revision,
        state="pending_approval" if four_eyes else "activating",
        governance_submission_id=submission.id if four_eyes else None)
