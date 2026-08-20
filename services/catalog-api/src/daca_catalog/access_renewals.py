from __future__ import annotations

import hashlib
import json
import uuid
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .models import (
    AccessRequest,
    AuditEvent,
    DataProduct,
    DemoUser,
    GovernanceSubmission,
    IdentityDirectoryEntry,
    PolicyDeployment,
    PolicyRevision,
    WorkflowTask,
    utc_now,
)
from .policy import definition_as_camel, generate_rego, project_to_postgresql
from .schemas import (
    AccessRenewalCreate,
    AccessRequestResponse,
    EffectiveAccessGrantResponse,
    OwnedAccessConsumerResponse,
    PocAccessRenewalFixtureResponse,
    PolicyDefinition,
    PolicyGrant,
    ProductEffectiveAccessResponse,
    RenewalContext,
    RenewalEligibility,
)
from .settings import Settings
from .workflow_seed import stable_id

ZURICH = ZoneInfo("Europe/Zurich")
RENEWAL_WINDOW_DAYS = 30
ACCESS_RENEWAL_FIXTURE_ID = "access-renewal-expiring"
ACCESS_RENEWAL_PRODUCT_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
ACCESS_RENEWAL_BASE_POLICY_ID = uuid.UUID("51111111-1111-4111-8111-111111111111")
ACCESS_RENEWAL_POLICY_ID = uuid.UUID("53333333-3333-4333-8333-333333333333")
ACCESS_RENEWAL_SOURCE_REQUEST_ID = uuid.UUID("83333333-3333-4333-8333-333333333333")
ACCESS_RENEWAL_SOURCE_REQUEST_NUMBER = "ZA-2026-RENEW-BASE"
ACCESS_RENEWAL_PRODUCT_TITLE = "ESTV-Steuerstatistik nach Kanton"
ACCESS_RENEWAL_SOURCE_PURPOSE = (
    "Kantonale Finanzanalyse und Plausibilisierung der aggregierten Steuerstatistik."
)
OPEN_RENEWAL_STATES = {
    "submitted",
    "identity_review",
    "legal_review",
    "conditions_review",
    "approved_policy_pending",
}


def zurich_today(now: datetime | None = None) -> date:
    return (now or utc_now()).astimezone(ZURICH).date()


def fixture_validity(on_date: date) -> tuple[date, date]:
    return on_date - timedelta(days=350), on_date + timedelta(days=14)


def baseline_policy_definition(on_date: date) -> dict[str, Any]:
    valid_from, valid_until = fixture_validity(on_date)
    return {
        "defaultEffect": "deny",
        "effect": "allow",
        # Keep the original selector for backwards-compatible policy evidence.
        "subjects": {"userIds": ["kanton-st-gallen"], "machineIds": [], "groupIds": []},
        "resources": {
            "productUrns": ["urn:daca:ch:estv:tax-statistics-by-canton"],
            "owners": ["ESTV"],
        },
        "actions": ["data.read"],
        "protocols": ["http", "postgresql"],
        "grants": [
            {
                "subject": {"type": "person", "id": "kanton-st-gallen"},
                "actions": ["data.read"],
                "protocols": ["http", "postgresql"],
                "validFrom": "0001-01-01",
                "validUntil": "9999-12-31",
                "dataVariant": "original",
                "metadataChannels": {"kobyMcp": False, "i14y": False},
            },
            {
                "subject": {"type": "person", "id": "beat.stalder"},
                "actions": ["data.read"],
                "protocols": ["http"],
                "validFrom": valid_from.isoformat(),
                "validUntil": valid_until.isoformat(),
                "dataVariant": "modified",
                "metadataChannels": {"kobyMcp": False, "i14y": False},
                "weeklyAvailability": {
                    "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
                    "startTime": "06:00",
                    "endTime": "22:00",
                    "timeZone": "Europe/Zurich",
                },
            },
        ],
    }


def build_fixture_source_request(
    on_date: date,
    *,
    policy_id: uuid.UUID = ACCESS_RENEWAL_POLICY_ID,
) -> AccessRequest:
    valid_from, valid_until = fixture_validity(on_date)
    created_at = datetime.combine(valid_from, datetime.min.time(), tzinfo=ZURICH)
    return AccessRequest(
        id=ACCESS_RENEWAL_SOURCE_REQUEST_ID,
        request_number=ACCESS_RENEWAL_SOURCE_REQUEST_NUMBER,
        data_product_id=ACCESS_RENEWAL_PRODUCT_ID,
        requester_id="beat.stalder",
        requester_name="Beat Stalder",
        requester_organization="Kanton St. Gallen",
        contact_email="beat.stalder@sg.ch",
        consumer_type="person",
        machine_id=None,
        purpose=ACCESS_RENEWAL_SOURCE_PURPOSE,
        legal_basis="Amtshilfe zwischen Behörden",
        requested_protocol="http",
        requested_variant="modified",
        valid_from=valid_from,
        valid_until=valid_until,
        notes="Synthetische, resettable REST-Freigabe für Journey 07.",
        status="granted_modified",
        fulfillment_subject_type="person",
        fulfillment_subject_id="beat.stalder",
        fulfillment_group_revision=None,
        decision_policy_revision_id=policy_id,
        granted_variant="modified",
        request_kind="initial",
        renewal_of_request_id=None,
        renewal_context=None,
        created_at=created_at,
        updated_at=created_at,
    )


def active_published_policy(session: Session, product: DataProduct) -> PolicyRevision | None:
    if product.active_policy_revision is None:
        return None
    return session.scalar(
        select(PolicyRevision).where(
            PolicyRevision.data_product_id == product.id,
            PolicyRevision.revision == product.active_policy_revision,
            PolicyRevision.status == "published",
        )
    )


def normalized_policy(policy: PolicyRevision) -> PolicyDefinition:
    return PolicyDefinition.model_validate(definition_as_camel(policy.definition))


def canonical_grant(grant: PolicyGrant | dict[str, Any]) -> dict[str, Any]:
    typed = grant if isinstance(grant, PolicyGrant) else PolicyGrant.model_validate(grant)
    return typed.model_dump(mode="json", by_alias=True, exclude_none=True)


def policy_grant_id(policy: PolicyRevision, grant: PolicyGrant | dict[str, Any]) -> str:
    material = {
        "policyRevisionId": str(policy.id),
        "policyRevision": policy.revision,
        "grant": canonical_grant(grant),
    }
    digest = hashlib.sha256(
        json.dumps(material, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:24]
    return f"grant_{digest}"


def _requested_protocol(protocols: list[str]) -> str | None:
    normalized = sorted(set(protocols))
    if normalized == ["http"]:
        return "http"
    if normalized == ["postgresql"]:
        return "postgresql"
    if normalized == ["http", "postgresql"]:
        return "both"
    return None


def matching_request_evidence(
    session: Session,
    product_id: uuid.UUID,
    policy: PolicyRevision,
    grant: PolicyGrant,
    *,
    requester_id: str | None = None,
) -> AccessRequest | None:
    """Match workflow evidence without treating it as the entitlement source."""
    subject = grant.subject
    protocol = _requested_protocol(list(grant.protocols))
    if protocol is None or subject.type not in {"person", "machine"}:
        return None
    statement = select(AccessRequest).where(
        AccessRequest.data_product_id == product_id,
        AccessRequest.status.in_(("granted_original", "granted_modified")),
        AccessRequest.fulfillment_subject_type == subject.type,
        AccessRequest.fulfillment_subject_id == subject.id,
        AccessRequest.requested_protocol == protocol,
        AccessRequest.valid_from == grant.valid_from,
        AccessRequest.valid_until == grant.valid_until,
        AccessRequest.granted_variant == grant.data_variant,
        AccessRequest.decision_policy_revision_id == policy.id,
    )
    if requester_id is not None:
        statement = statement.where(AccessRequest.requester_id == requester_id)
    return session.scalar(statement.order_by(AccessRequest.updated_at.desc()).limit(1))


def access_request_response(
    session: Session, access_request: AccessRequest
) -> AccessRequestResponse:
    response = AccessRequestResponse.model_validate(access_request)
    source_number: str | None = None
    if access_request.renewal_of_request_id is not None:
        source = session.get(AccessRequest, access_request.renewal_of_request_id)
        source_number = source.request_number if source is not None else None
    return response.model_copy(update={"renewal_of_request_number": source_number})


def _pending_renewal(session: Session, source_request_id: uuid.UUID) -> AccessRequest | None:
    return session.scalar(
        select(AccessRequest)
        .where(
            AccessRequest.renewal_of_request_id == source_request_id,
            AccessRequest.request_kind == "renewal",
            AccessRequest.status.in_(tuple(OPEN_RENEWAL_STATES)),
        )
        .order_by(AccessRequest.created_at.desc())
        .limit(1)
    )


def effective_access_response(
    session: Session,
    product: DataProduct,
    actor: str,
    *,
    on_date: date | None = None,
) -> ProductEffectiveAccessResponse:
    today = on_date or zurich_today()
    policy = active_published_policy(session, product)
    if policy is None:
        if product.active_policy_revision is not None:
            raise HTTPException(503, "Effective access status is unavailable")
        return ProductEffectiveAccessResponse(granted=False, as_of_date=today)
    try:
        definition = normalized_policy(policy)
    except ValidationError:
        raise HTTPException(503, "Effective access status is unavailable") from None
    if definition.effect != "allow":
        return ProductEffectiveAccessResponse(
            granted=False, as_of_date=today, policy_revision=policy.revision
        )

    projected: list[EffectiveAccessGrantResponse] = []
    for grant in definition.grants:
        subject = grant.subject
        direct_person = subject.type == "person" and subject.id == actor
        indirect_group = (
            subject.type == "group"
            and grant.group_snapshot is not None
            and actor in grant.group_snapshot.member_ids
        )
        if not direct_person and not indirect_group:
            continue
        if "data.read" not in grant.actions or not grant.valid_from <= today <= grant.valid_until:
            continue

        source = (
            matching_request_evidence(session, product.id, policy, grant, requester_id=actor)
            if direct_person
            else None
        )
        pending = _pending_renewal(session, source.id) if source is not None else None
        expires_in_days = (grant.valid_until - today).days
        if not direct_person:
            eligibility = RenewalEligibility(
                eligible=False,
                reason="unsupportedSubject",
            )
        elif source is None:
            eligibility = RenewalEligibility(
                eligible=False,
                reason="sourceRequestUnavailable",
            )
        elif pending is not None:
            eligibility = RenewalEligibility(
                eligible=False,
                reason="pending",
                renewal_request_id=pending.id,
            )
        elif expires_in_days > RENEWAL_WINDOW_DAYS:
            eligibility = RenewalEligibility(eligible=False, reason="outsideWindow")
        else:
            eligibility = RenewalEligibility(eligible=True, reason="eligible")

        projected.append(
            EffectiveAccessGrantResponse(
                grant_id=policy_grant_id(policy, grant),
                subject_type=subject.type,
                protocols=list(dict.fromkeys(grant.protocols)),
                data_variant=grant.data_variant,
                valid_from=grant.valid_from,
                valid_until=grant.valid_until,
                weekly_availability=grant.weekly_availability,
                purpose=source.purpose if source is not None else None,
                expires_in_days=expires_in_days,
                expiry_state=(
                    "expiringSoon" if expires_in_days <= RENEWAL_WINDOW_DAYS else "active"
                ),
                source_request_id=source.id if source is not None else None,
                source_request_number=source.request_number if source is not None else None,
                renewal_eligibility=eligibility,
            )
        )
    return ProductEffectiveAccessResponse(
        granted=bool(projected),
        as_of_date=today,
        policy_revision=policy.revision,
        grants=projected,
    )


def owned_access_consumers(
    session: Session,
    actor: str,
    *,
    on_date: date | None = None,
) -> list[OwnedAccessConsumerResponse]:
    """Project owned consumers from active policy grants, enriching only with trusted evidence."""
    today = on_date or zurich_today()
    products = []
    for product in session.scalars(select(DataProduct).order_by(DataProduct.id)):
        usage = product.extra_metadata.get("catalogUsage", {})
        responsible = usage.get("responsibleUserIds", []) if isinstance(usage, dict) else []
        if product.owner_user_id == actor or actor in responsible:
            products.append(product)

    grouped: dict[tuple[uuid.UUID, str, str], dict[str, Any]] = {}
    for product in products:
        policy = active_published_policy(session, product)
        if policy is None:
            if product.active_policy_revision is not None:
                raise HTTPException(503, "Active access policy is unavailable")
            continue
        try:
            definition = normalized_policy(policy)
        except ValidationError as error:
            raise HTTPException(503, "Active access policy is unavailable") from error
        if definition.effect != "allow":
            continue
        for grant in definition.grants:
            subject = grant.subject
            if subject.type not in {"person", "machine"}:
                continue
            if (
                "data.read" not in grant.actions
                or not grant.valid_from <= today <= grant.valid_until
            ):
                continue
            evidence = matching_request_evidence(session, product.id, policy, grant)
            directory = (
                session.get(IdentityDirectoryEntry, subject.id)
                if subject.type == "person"
                else None
            )
            demo_user = session.get(DemoUser, subject.id) if subject.type == "person" else None
            display_name = (
                directory.display_name
                if directory is not None
                else demo_user.display_name
                if demo_user is not None
                else evidence.requester_name
                if evidence is not None
                else subject.id
            )
            organization = (
                directory.organization
                if directory is not None
                else demo_user.organization
                if demo_user is not None
                else evidence.requester_organization
                if evidence is not None
                else "Policy-Identität"
            )
            key = (product.id, subject.type, subject.id)
            consumer = grouped.setdefault(
                key,
                {
                    "dataProductId": product.id,
                    "consumerType": subject.type,
                    "identityId": subject.id,
                    "displayName": display_name,
                    "organization": organization,
                    "grants": [],
                },
            )
            protocols = sorted(set(grant.protocols))
            protocol = _requested_protocol(protocols)
            if protocol is None:
                continue
            expires_in_days = (grant.valid_until - today).days
            consumer["grants"].append(
                {
                    "requestNumber": evidence.request_number if evidence is not None else None,
                    "protocol": protocol,
                    "variant": grant.data_variant,
                    "validFrom": grant.valid_from,
                    "validUntil": grant.valid_until,
                    "grantId": policy_grant_id(policy, grant),
                    "policyRevision": policy.revision,
                    "purpose": evidence.purpose if evidence is not None else None,
                    "expiresInDays": expires_in_days,
                    "expiryState": (
                        "expiringSoon" if expires_in_days <= RENEWAL_WINDOW_DAYS else "active"
                    ),
                }
            )
    return [
        OwnedAccessConsumerResponse.model_validate(item)
        for item in sorted(
            grouped.values(),
            key=lambda item: (
                str(item["dataProductId"]),
                item["consumerType"],
                item["displayName"].casefold(),
            ),
        )
    ]


def create_renewal_request(
    session: Session,
    product: DataProduct,
    actor: str,
    body: AccessRenewalCreate,
    *,
    on_date: date | None = None,
) -> AccessRequest:
    today = on_date or zurich_today()
    policy = active_published_policy(session, product)
    if policy is None:
        raise HTTPException(409, "No active published grant can be renewed")
    try:
        definition = normalized_policy(policy)
    except ValidationError:
        raise HTTPException(503, "Effective access status is unavailable") from None
    matches = [
        grant
        for grant in definition.grants
        if policy_grant_id(policy, grant) == body.source_grant_id
    ]
    if len(matches) != 1:
        raise HTTPException(409, "The selected grant is no longer active")
    grant = matches[0]
    if grant.subject.type != "person" or grant.subject.id != actor:
        raise HTTPException(403, "Only a direct personal grant may be renewed by its holder")
    if "data.read" not in grant.actions or not grant.valid_from <= today <= grant.valid_until:
        raise HTTPException(409, "Only a currently active data-read grant may be renewed")
    if (grant.valid_until - today).days > RENEWAL_WINDOW_DAYS:
        raise HTTPException(409, "The grant is not yet within the renewal window")
    source = matching_request_evidence(session, product.id, policy, grant, requester_id=actor)
    if source is None:
        raise HTTPException(409, "The active grant has no matching request evidence")
    pending = _pending_renewal(session, source.id)
    if pending is not None:
        raise HTTPException(409, "A renewal for this grant is already in progress")
    if body.valid_until <= grant.valid_until:
        raise HTTPException(422, "validUntil must extend the current grant end date")

    canonical = canonical_grant(grant)
    context = RenewalContext.model_validate(
        {
            "sourceGrantId": body.source_grant_id,
            "policyRevision": policy.revision,
            **canonical,
            "purpose": source.purpose,
            "legalBasis": source.legal_basis,
        }
    )
    requested_protocol = _requested_protocol(list(grant.protocols))
    if requested_protocol is None:
        raise HTTPException(409, "The active grant protocols cannot be renewed")
    protocol_label = {
        "http": "REST",
        "postgresql": "PostgreSQL",
        "both": "REST-/PostgreSQL",
    }[requested_protocol]
    now = utc_now()
    renewal = AccessRequest(
        id=uuid.uuid4(),
        request_number=f"ZA-{today:%Y}-{uuid.uuid4().hex[:8].upper()}",
        data_product_id=product.id,
        requester_id=actor,
        requester_name=source.requester_name,
        requester_organization=source.requester_organization,
        contact_email=source.contact_email,
        consumer_type=source.consumer_type,
        machine_id=source.machine_id,
        purpose=body.purpose,
        legal_basis=source.legal_basis,
        requested_protocol=requested_protocol,
        requested_variant=grant.data_variant,
        valid_from=grant.valid_from,
        valid_until=body.valid_until,
        notes="Verlängerung einer aktiven, publizierten Freigabe.",
        status="submitted",
        request_kind="renewal",
        renewal_of_request_id=source.id,
        renewal_context=context.model_dump(mode="json", by_alias=True, exclude_none=True),
        created_at=now,
        updated_at=now,
    )
    session.add(renewal)
    if product.owner_user_id:
        session.add(
            WorkflowTask(
                id=stable_id(f"task:access-request:{renewal.id}"),
                task_type="access_request_review",
                status="open",
                assignee_user_id=product.owner_user_id,
                data_product_id=product.id,
                access_request_id=renewal.id,
                title=f"Zugriff von {source.requester_name} verlängern",
                detail=(
                    f"Bestehende {protocol_label}-Freigabe "
                    f"bis {grant.valid_until.isoformat()} mit dem "
                    "beantragten Enddatum vergleichen und zur Vier-Augen-Prüfung vorbereiten."
                ),
                created_at=now,
                updated_at=now,
            )
        )
    session.add(
        AuditEvent(
            id=uuid.uuid4(),
            resource_type="access-request",
            resource_id=str(renewal.id),
            action="renewal-submitted",
            actor=actor,
            revision=policy.revision,
            details={
                "requestNumber": renewal.request_number,
                "dataProductId": str(product.id),
                "sourceGrantId": body.source_grant_id,
                "renewalOfRequestId": str(source.id),
                "previousValidUntil": grant.valid_until.isoformat(),
                "requestedValidUntil": body.valid_until.isoformat(),
            },
            occurred_at=now,
        )
    )
    return renewal


def renewal_policy_definition(
    session: Session,
    product: DataProduct,
    renewal: AccessRequest,
) -> tuple[dict[str, Any], dict[str, str]]:
    """Return an exact-scope replacement; only purpose and end date may differ."""
    if renewal.request_kind != "renewal" or renewal.renewal_context is None:
        raise HTTPException(409, "This access request is not a renewal")
    context = RenewalContext.model_validate(renewal.renewal_context)
    policy = active_published_policy(session, product)
    if policy is None or policy.revision != context.policy_revision:
        raise HTTPException(409, "The active grant changed; create a new renewal request")
    definition = normalized_policy(policy)
    indexed = [(grant, policy_grant_id(policy, grant)) for grant in definition.grants]
    matching = [grant for grant, grant_id in indexed if grant_id == context.source_grant_id]
    if len(matching) != 1:
        raise HTTPException(409, "The source grant changed; create a new renewal request")
    source_grant = matching[0]
    source_payload = canonical_grant(source_grant)
    context_payload = context.model_dump(
        mode="json",
        by_alias=True,
        exclude={"source_grant_id", "policy_revision", "purpose", "legal_basis"},
        exclude_none=True,
    )
    if source_payload != context_payload:
        raise HTTPException(409, "The immutable source grant context no longer matches")
    if renewal.valid_until <= source_grant.valid_until:
        raise HTTPException(422, "A renewal must extend the current end date")
    if (
        renewal.valid_from != source_grant.valid_from
        or renewal.requested_protocol != _requested_protocol(list(source_grant.protocols))
        or renewal.requested_variant != source_grant.data_variant
        or renewal.consumer_type != "person"
        or renewal.requester_id != source_grant.subject.id
    ):
        raise HTTPException(422, "The renewal request contains an unauthorized scope change")

    replacement = dict(source_payload)
    replacement["validUntil"] = renewal.valid_until.isoformat()
    grants: list[dict[str, Any]] = []
    replaced = 0
    for grant, grant_id in indexed:
        if grant_id == context.source_grant_id:
            grants.append(replacement)
            replaced += 1
        else:
            grants.append(canonical_grant(grant))
    if replaced != 1:
        raise HTTPException(409, "The renewal source grant is ambiguous")
    replacement_definition = definition_as_camel(policy.definition)
    replacement_definition["grants"] = grants
    return replacement_definition, dict(source_payload["subject"])


def fixture_renewal_chain(session: Session, product_id: uuid.UUID) -> list[AccessRequest]:
    all_renewals = list(
        session.scalars(
            select(AccessRequest).where(
                AccessRequest.data_product_id == product_id,
                AccessRequest.request_kind == "renewal",
            )
        )
    )
    fixture_request_ids = {ACCESS_RENEWAL_SOURCE_REQUEST_ID}
    changed = True
    while changed:
        changed = False
        for renewal in all_renewals:
            if (
                renewal.renewal_of_request_id in fixture_request_ids
                and renewal.id not in fixture_request_ids
            ):
                fixture_request_ids.add(renewal.id)
                changed = True
    return [item for item in all_renewals if item.id in fixture_request_ids]


def _fixture_state(
    session: Session,
    product: DataProduct,
    *,
    on_date: date,
) -> PocAccessRenewalFixtureResponse:
    policy = active_published_policy(session, product)
    fixture_policy = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
    source_request = session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID)
    if fixture_policy is None or source_request is None:
        return PocAccessRenewalFixtureResponse(
            fixture_id=ACCESS_RENEWAL_FIXTURE_ID,
            product_id=product.id,
            product_title=product.title,
            state="notPrepared",
            as_of_date=on_date,
            open_renewal_count=0,
            active_policy_revision=product.active_policy_revision,
        )
    if policy is None:
        raise HTTPException(409, "The prepared access-renewal fixture has no active policy")
    definition = normalized_policy(policy)
    beat_grants = [
        grant
        for grant in definition.grants
        if grant.subject.type == "person" and grant.subject.id == "beat.stalder"
    ]
    if len(beat_grants) != 1:
        raise HTTPException(409, "The access-renewal fixture grant is inconsistent")
    grant = beat_grants[0]
    renewals = fixture_renewal_chain(session, product.id)
    open_renewals = [item for item in renewals if item.status in OPEN_RENEWAL_STATES]
    state = "ready"
    if any(item.status in {"granted_original", "granted_modified"} for item in renewals):
        state = "deployed"
    elif any(item.status == "approved_policy_pending" for item in open_renewals):
        state = "approvalPending"
    elif open_renewals:
        state = "renewalPending"
    return PocAccessRenewalFixtureResponse(
        fixture_id=ACCESS_RENEWAL_FIXTURE_ID,
        product_id=product.id,
        product_title=product.title,
        state=state,
        as_of_date=on_date,
        valid_from=grant.valid_from,
        valid_until=grant.valid_until,
        days_until_expiry=(grant.valid_until - on_date).days,
        open_renewal_count=len(open_renewals),
        active_policy_revision=policy.revision,
    )


def fixture_response(
    session: Session, *, on_date: date | None = None
) -> PocAccessRenewalFixtureResponse:
    product = session.get(DataProduct, ACCESS_RENEWAL_PRODUCT_ID)
    if product is None:
        raise HTTPException(404, "Access-renewal fixture not found")
    return _fixture_state(session, product, on_date=on_date or zurich_today())


def fixture_baseline_policy_ids(session: Session, product_id: uuid.UUID) -> set[uuid.UUID]:
    """Return immutable baseline revisions created only by the fixture workflow."""
    return set(
        session.scalars(
            select(PolicyRevision.id).where(
                PolicyRevision.data_product_id == product_id,
                PolicyRevision.created_by == "daca-fixture",
            )
        )
    )


def prepare_fixture(
    session: Session,
    product: DataProduct,
    settings: Settings,
    *,
    on_date: date,
) -> None:
    """Explicitly stage the fixture without mutating the ordinary seeded policy."""
    fixture_policy = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
    source = session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID)
    if fixture_policy is not None or source is not None:
        if fixture_policy is None or source is None:
            raise HTTPException(409, "The access-renewal fixture is only partially prepared")
        active = active_published_policy(session, product)
        if active is None:
            raise HTTPException(409, "The prepared fixture has no active policy")
        renewal_policy_ids = {
            item.decision_policy_revision_id
            for item in fixture_renewal_chain(session, product.id)
            if item.decision_policy_revision_id is not None
        }
        baseline_policy_ids = fixture_baseline_policy_ids(session, product.id)
        if active.id not in baseline_policy_ids | renewal_policy_ids:
            raise HTTPException(
                409,
                "The active policy is not owned by the access-renewal fixture",
            )
        return

    active = active_published_policy(session, product)
    if active is None or active.id != ACCESS_RENEWAL_BASE_POLICY_ID or active.revision != 1:
        raise HTTPException(
            409,
            "Fixture preparation requires the unchanged seeded policy revision 1",
        )
    latest = session.scalar(
        select(PolicyRevision)
        .where(PolicyRevision.data_product_id == product.id)
        .order_by(PolicyRevision.revision.desc())
        .limit(1)
    )
    if latest is None or latest.id != active.id:
        raise HTTPException(
            409,
            "Fixture preparation was blocked because unrelated policy work exists",
        )
    active_submission = session.scalar(
        select(GovernanceSubmission.id).where(
            GovernanceSubmission.data_product_id == product.id,
            GovernanceSubmission.status.in_(("pending_approval", "approved_deploying")),
        )
    )
    if active_submission is not None:
        raise HTTPException(
            409,
            "Fixture preparation was blocked by an active governance submission",
        )

    definition = baseline_policy_definition(on_date)
    projection = project_to_postgresql(
        settings,
        product.id,
        2,
        definition,
    )
    if projection.state != "deployed":
        raise HTTPException(
            503,
            "PostgreSQL did not confirm the access-renewal fixture projection",
        )

    now = utc_now()
    fixture_policy = PolicyRevision(
        id=ACCESS_RENEWAL_POLICY_ID,
        data_product_id=product.id,
        revision=2,
        status="published",
        definition=definition,
        generated_rego=generate_rego(),
        created_by="daca-fixture",
        created_at=now,
        published_at=now,
    )
    session.add(fixture_policy)
    # AccessRequest.decision_policy_revision_id has no ORM relationship, so make
    # the immutable policy evidence visible before inserting its source request.
    session.flush()
    session.add_all(
        [
            PolicyDeployment(
                id=stable_id("access-renewal-fixture:deployment:opa"),
                policy_revision_id=fixture_policy.id,
                target="opa",
                desired_revision=fixture_policy.revision,
                observed_revision=None,
                state="pending",
                updated_at=now,
            ),
            PolicyDeployment(
                id=stable_id("access-renewal-fixture:deployment:postgresql"),
                policy_revision_id=fixture_policy.id,
                target="postgresql",
                desired_revision=fixture_policy.revision,
                observed_revision=projection.observed_revision,
                state="deployed",
                updated_at=now,
            ),
            build_fixture_source_request(on_date),
            AuditEvent(
                id=uuid.uuid4(),
                resource_type="policy",
                resource_id=str(product.id),
                action="access-renewal-fixture-prepared",
                actor="daca-fixture",
                revision=fixture_policy.revision,
                details={
                    "fixtureId": ACCESS_RENEWAL_FIXTURE_ID,
                    "previousActivePolicyRevision": active.revision,
                    "validUntil": fixture_validity(on_date)[1].isoformat(),
                    "targets": ["opa", "postgresql"],
                },
                occurred_at=now,
            ),
        ]
    )
    product.active_policy_revision = fixture_policy.revision
    product.updated_at = now


def reset_fixture(
    session: Session,
    product: DataProduct,
    settings: Settings,
    *,
    on_date: date,
) -> None:
    """Remove only renewal workflow artifacts and restore the deterministic baseline."""
    fixture_policy = session.get(PolicyRevision, ACCESS_RENEWAL_POLICY_ID)
    source = session.get(AccessRequest, ACCESS_RENEWAL_SOURCE_REQUEST_ID)
    if fixture_policy is None or source is None:
        raise HTTPException(409, "Prepare the access-renewal fixture before resetting it")

    fixture_renewals = fixture_renewal_chain(session, product.id)
    renewal_ids = [item.id for item in fixture_renewals]
    baseline_policy_ids = fixture_baseline_policy_ids(session, product.id)
    replacement_policy_ids = {
        item.decision_policy_revision_id
        for item in fixture_renewals
        if item.decision_policy_revision_id is not None
        and item.decision_policy_revision_id not in baseline_policy_ids
    }
    fixture_owned_policy_ids = baseline_policy_ids | replacement_policy_ids
    active = active_published_policy(session, product)
    if active is None or active.id not in fixture_owned_policy_ids:
        raise HTTPException(
            409,
            "The active policy is not owned by the access-renewal fixture; reset was blocked",
        )

    foreign_open_submissions = list(
        session.scalars(
            select(GovernanceSubmission).where(
                GovernanceSubmission.data_product_id == product.id,
                GovernanceSubmission.status.in_(
                    ("pending_approval", "approved_deploying", "deployment_failed")
                ),
            )
        )
    )
    if any(
        item.policy_revision_id not in fixture_owned_policy_ids for item in foreign_open_submissions
    ):
        raise HTTPException(
            409,
            "Unrelated open governance work blocks the access-renewal fixture reset",
        )

    foreign_drafts = list(
        session.scalars(
            select(PolicyRevision).where(
                PolicyRevision.data_product_id == product.id,
                PolicyRevision.status == "draft",
                PolicyRevision.id.not_in(fixture_owned_policy_ids),
            )
        )
    )
    for draft in foreign_drafts:
        terminal_submission = session.scalar(
            select(GovernanceSubmission.id).where(
                GovernanceSubmission.policy_revision_id == draft.id,
                GovernanceSubmission.status.in_(("approved", "rejected")),
            )
        )
        if terminal_submission is None:
            raise HTTPException(
                409,
                "Unrelated draft policy work blocks the access-renewal fixture reset",
            )

    latest = session.scalar(
        select(PolicyRevision)
        .where(PolicyRevision.data_product_id == product.id)
        .order_by(PolicyRevision.revision.desc())
        .limit(1)
    )
    if latest is None:
        raise HTTPException(409, "The fixture policy history is unavailable")
    restored_revision = latest.revision + 1
    restored_definition = baseline_policy_definition(on_date)
    projection = project_to_postgresql(
        settings,
        product.id,
        restored_revision,
        restored_definition,
    )
    if projection.state != "deployed":
        raise HTTPException(
            503,
            "PostgreSQL did not confirm the access-renewal fixture reset",
        )

    if renewal_ids:
        session.execute(delete(WorkflowTask).where(WorkflowTask.access_request_id.in_(renewal_ids)))
    if replacement_policy_ids:
        submission_ids = list(
            session.scalars(
                select(GovernanceSubmission.id).where(
                    GovernanceSubmission.policy_revision_id.in_(replacement_policy_ids)
                )
            )
        )
        if submission_ids:
            session.execute(
                delete(WorkflowTask).where(
                    WorkflowTask.governance_submission_id.in_(submission_ids)
                )
            )
        session.execute(
            delete(GovernanceSubmission).where(
                GovernanceSubmission.policy_revision_id.in_(replacement_policy_ids)
            )
        )
        session.execute(
            delete(PolicyDeployment).where(
                PolicyDeployment.policy_revision_id.in_(replacement_policy_ids)
            )
        )
    if renewal_ids:
        session.execute(delete(AccessRequest).where(AccessRequest.id.in_(renewal_ids)))
    if replacement_policy_ids:
        session.execute(delete(PolicyRevision).where(PolicyRevision.id.in_(replacement_policy_ids)))

    now = utc_now()
    restored_policy = PolicyRevision(
        id=stable_id(f"access-renewal-fixture:policy:{restored_revision}"),
        data_product_id=product.id,
        revision=restored_revision,
        status="published",
        definition=restored_definition,
        generated_rego=generate_rego(),
        created_by="daca-fixture",
        created_at=now,
        published_at=now,
    )
    session.add(restored_policy)
    session.flush()
    session.add_all(
        [
            PolicyDeployment(
                id=stable_id(f"access-renewal-fixture:deployment:{restored_revision}:opa"),
                policy_revision_id=restored_policy.id,
                target="opa",
                desired_revision=restored_revision,
                observed_revision=None,
                state="pending",
                updated_at=now,
            ),
            PolicyDeployment(
                id=stable_id(f"access-renewal-fixture:deployment:{restored_revision}:postgresql"),
                policy_revision_id=restored_policy.id,
                target="postgresql",
                desired_revision=restored_revision,
                observed_revision=projection.observed_revision,
                state="deployed",
                updated_at=now,
            ),
        ]
    )

    fresh_source = build_fixture_source_request(on_date, policy_id=restored_policy.id)
    for field in (
        "request_number",
        "data_product_id",
        "requester_id",
        "requester_name",
        "requester_organization",
        "contact_email",
        "consumer_type",
        "machine_id",
        "purpose",
        "legal_basis",
        "requested_protocol",
        "requested_variant",
        "valid_from",
        "valid_until",
        "notes",
        "status",
        "fulfillment_subject_type",
        "fulfillment_subject_id",
        "fulfillment_group_revision",
        "decision_policy_revision_id",
        "granted_variant",
        "request_kind",
        "renewal_of_request_id",
        "renewal_context",
        "created_at",
        "updated_at",
    ):
        setattr(source, field, getattr(fresh_source, field))
    product.active_policy_revision = restored_revision
    product.updated_at = now
