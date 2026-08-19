from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .control_people import is_active_publication_approver, safe_person
from .models import (
    AuditEvent,
    DataProduct,
    DemoUser,
    GovernanceSubmission,
    ServiceLevelRevision,
    WorkflowTask,
    utc_now,
)
from .schemas import (
    FIXED_BEST_EFFORT_LIMITATION,
    ServiceLevelBaselineResponse,
    ServiceLevelChangeResponse,
    ServiceLevelDecisionCreate,
    ServiceLevelDefinition,
    ServiceLevelLegalReference,
    ServiceLevelPersonResponse,
    ServiceLevelRevisionResponse,
    ServiceLevelRevisionWrite,
    ServiceLevelSummaryResponse,
)
from .workflow_seed import stable_id

ZURICH = ZoneInfo("Europe/Zurich")
ACTIVE_GOVERNANCE_STATES = {"pending_approval", "approved_deploying"}

LEGAL_REFERENCES = (
    ServiceLevelLegalReference(
        code="ISG",
        title="Bundesgesetz über die Informationssicherheit beim Bund",
        reference="ISG, SR 128, Art. 6, 8–10 und 21",
        url="https://www.fedlex.admin.ch/eli/cc/2022/232/de",
        applicability=(
            "Rahmen für Informationssicherheit und den angemessenen Schutz von "
            "Informationen und Informatikmitteln des Bundes; die konkrete "
            "Anwendbarkeit ist separat zu beurteilen."
        ),
    ),
    ServiceLevelLegalReference(
        code="ISV",
        title="Verordnung über die Informationssicherheit in der Bundesverwaltung und der Armee",
        reference="ISV, SR 128.1, Art. 4, 8, 10 und 12",
        url="https://www.fedlex.admin.ch/eli/cc/2023/735/de",
        applicability=(
            "Rechtlicher Kontext für Informationssicherheit und Schutzbedarf; "
            "die konkrete Anwendbarkeit ist im Einzelfall zu prüfen."
        ),
    ),
    ServiceLevelLegalReference(
        code="DSG",
        title="Bundesgesetz über den Datenschutz",
        reference="DSG, SR 235.1, Art. 6–8 sowie Art. 34 und 36 für Bundesorgane",
        url="https://www.fedlex.admin.ch/eli/cc/2022/491/de",
        applicability=(
            "Relevant, soweit Personendaten bearbeitet werden; diese Referenz ist "
            "keine Feststellung einer Rechtsgrundlage."
        ),
    ),
    ServiceLevelLegalReference(
        code="DSV",
        title="Verordnung über den Datenschutz",
        reference="DSV, SR 235.11, Art. 1–3",
        url="https://www.fedlex.admin.ch/eli/cc/2022/568/de",
        applicability=(
            "Ergänzender Datenschutzkontext, soweit Personendaten bearbeitet werden; "
            "Schutzmassnahmen sind separat zu beurteilen."
        ),
    ),
    ServiceLevelLegalReference(
        code="EMBAG",
        title="Bundesgesetz über den Einsatz elektronischer Mittel zur Erfüllung von Behördenaufgaben",
        reference="EMBAG, SR 172.019, Art. 3, 10 und 13",
        url="https://www.fedlex.admin.ch/eli/cc/2023/682/de",
        applicability=(
            "Nur für als offene Verwaltungsdaten geeignete Daten. Die Klassifikation "
            "«public» allein begründet keine Anwendbarkeit."
        ),
    ),
    ServiceLevelLegalReference(
        code="BGÖ",
        title="Bundesgesetz über das Öffentlichkeitsprinzip der Verwaltung",
        reference="BGÖ, SR 152.3",
        url="https://www.fedlex.admin.ch/eli/cc/2006/355/de",
        applicability=(
            "Kontext für den Zugang zu amtlichen Dokumenten; daraus folgt weder "
            "eine automatische Publikationspflicht noch ein Datenzugriffsrecht."
        ),
    ),
    ServiceLevelLegalReference(
        code="VBGÖ",
        title="Verordnung über das Öffentlichkeitsprinzip der Verwaltung",
        reference="VBGÖ, SR 152.31",
        url="https://www.fedlex.admin.ch/eli/cc/2006/356/de",
        applicability=(
            "Ausführungskontext zum Öffentlichkeitsprinzip; Ausnahmen und Verfahren "
            "sind im konkreten Fall zu prüfen."
        ),
    ),
    ServiceLevelLegalReference(
        code="BGA",
        title="Bundesgesetz über die Archivierung",
        reference="BGA, SR 152.1",
        url="https://www.fedlex.admin.ch/eli/cc/1999/354/de",
        applicability=(
            "Kontext für Anbietepflicht, Archivwürdigkeit und Nachvollziehbarkeit; "
            "das SLA löst keinen Archivierungsauftrag aus."
        ),
    ),
    ServiceLevelLegalReference(
        code="VBGA",
        title="Verordnung zum Bundesgesetz über die Archivierung",
        reference="VBGA, SR 152.11",
        url="https://www.fedlex.admin.ch/eli/cc/1999/371/de",
        applicability=(
            "Ausführungskontext zur Archivierung; Aufbewahrung und Ablieferung "
            "bleiben in den zuständigen Verfahren festzulegen."
        ),
    ),
)


def zurich_today() -> date:
    return datetime.now(ZURICH).date()


def revision_etag(value: int) -> str:
    return f'"{value}"'


def require_etag(if_match: str | None, current: int) -> None:
    if if_match is None:
        raise HTTPException(428, "If-Match is required for this versioned resource")
    candidates = {candidate.strip() for candidate in if_match.split(",")}
    accepted = {revision_etag(current), f"W/{revision_etag(current)}"}
    if not candidates.intersection(accepted):
        raise HTTPException(412, "The SLA revision changed; reload and retry")


def lock_product(session: Session, product_id: uuid.UUID) -> DataProduct:
    product = session.scalar(
        select(DataProduct)
        .where(DataProduct.id == product_id)
        .with_for_update()
    )
    if product is None:
        raise HTTPException(404, "Data product not found")
    return product


def lock_revision(
    session: Session, product_id: uuid.UUID, revision_id: uuid.UUID
) -> ServiceLevelRevision:
    row = session.scalar(
        select(ServiceLevelRevision)
        .where(
            ServiceLevelRevision.id == revision_id,
            ServiceLevelRevision.data_product_id == product_id,
        )
        .with_for_update()
    )
    if row is None:
        raise HTTPException(404, "SLA revision not found")
    return row


def latest_revision_number(session: Session, product_id: uuid.UUID) -> int:
    return int(
        session.scalar(
            select(func.max(ServiceLevelRevision.revision)).where(
                ServiceLevelRevision.data_product_id == product_id
            )
        )
        or 0
    )


def published_revisions(
    session: Session, product_id: uuid.UUID
) -> list[ServiceLevelRevision]:
    return list(
        session.scalars(
            select(ServiceLevelRevision)
            .where(
                ServiceLevelRevision.data_product_id == product_id,
                ServiceLevelRevision.status == "published",
            )
            .order_by(
                ServiceLevelRevision.valid_from,
                ServiceLevelRevision.revision,
            )
        )
    )


def actor_is_revision_privileged(
    product: DataProduct, row: ServiceLevelRevision, actor: str | None
) -> bool:
    return bool(
        actor is not None
        and (
            actor == product.owner_user_id
            or actor == row.control_person_user_id
        )
    )


def actor_can_view_revision(
    product: DataProduct, row: ServiceLevelRevision, actor: str | None
) -> bool:
    return row.status == "published" or actor_is_revision_privileged(product, row, actor)


def visible_revisions(
    session: Session, product: DataProduct, actor: str | None
) -> list[ServiceLevelRevision]:
    rows = list(
        session.scalars(
            select(ServiceLevelRevision)
            .where(ServiceLevelRevision.data_product_id == product.id)
            .order_by(
                ServiceLevelRevision.revision.desc(),
                ServiceLevelRevision.id.desc(),
            )
        )
    )
    return [row for row in rows if actor_can_view_revision(product, row, actor)]


def effective_valid_until(row: ServiceLevelRevision) -> date | None:
    superseded_end = (
        row.superseded_from - timedelta(days=1)
        if row.superseded_from is not None
        else None
    )
    candidates = [value for value in (row.valid_until, superseded_end) if value is not None]
    return min(candidates) if candidates else None


def definition_from_row(row: ServiceLevelRevision) -> ServiceLevelDefinition:
    try:
        return ServiceLevelDefinition.model_validate(row.definition)
    except ValidationError:
        raise HTTPException(503, "The stored SLA definition is invalid") from None


def _freshness_tolerance(product: DataProduct) -> int:
    normalized = (product.update_frequency or "").casefold()
    if any(marker in normalized for marker in ("hour", "stünd", "daily", "täglich")):
        return 1
    if any(marker in normalized for marker in ("week", "wöch")):
        return 2
    if any(marker in normalized for marker in ("month", "monat")):
        return 5
    if any(marker in normalized for marker in ("quarter", "quart")):
        return 10
    if any(marker in normalized for marker in ("annual", "year", "jähr")):
        return 20
    return 5


def baseline_definition(product: DataProduct, *, as_of: date) -> ServiceLevelDefinition:
    return ServiceLevelDefinition(
        template_version=1,
        purpose_and_suitable_use=(
            f"Das Datenprodukt «{product.title}» darf im beschriebenen behördlichen "
            "Fachkontext und nur im Rahmen einer wirksamen Zugriffsfreigabe genutzt werden."
        ),
        availability_commitment="best_effort",
        freshness_tolerance_business_days=_freshness_tolerance(product),
        support_window={
            "weekdays": ["monday", "tuesday", "wednesday", "thursday", "friday"],
            "start": "08:00",
            "end": "17:00",
            "timezone": "Europe/Zurich",
        },
        initial_response_target_support_hours=16,
        planned_maintenance_notice_hours=48,
        usage_conditions=[
            "Nutzung nur für den genehmigten Zweck und innerhalb der publizierten Zugriffsrechte.",
            "Keine Weitergabe an nicht berechtigte Dritte.",
            "Schutzbedarf, Datenminimierung und Aufbewahrungsfristen sind durch die nutzende Stelle einzuhalten.",
            "Sicherheits- und Datenschutzvorfälle sind dem Data Owner unverzüglich zu melden.",
        ],
        known_limitations=[
            "PoC-Betrieb nach Best Effort ohne zugesicherte Mindestverfügbarkeit.",
            FIXED_BEST_EFFORT_LIMITATION,
            "Wartungsfenster und Unterbrüche sind möglich.",
            "Katalogsichtbarkeit ersetzt keine Zugriffsfreigabe; die publizierten Policies bleiben massgebend.",
        ],
        next_review_on=as_of + timedelta(days=365),
    )


def baseline_response(
    product: DataProduct, *, as_of: date
) -> ServiceLevelBaselineResponse:
    created = product.created_at
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    return ServiceLevelBaselineResponse(
        valid_from=created.astimezone(ZURICH).date(),
        definition=baseline_definition(product, as_of=as_of),
    )


def product_owner_person(session: Session, product: DataProduct) -> ServiceLevelPersonResponse:
    owner = session.get(DemoUser, product.owner_user_id) if product.owner_user_id else None
    if owner is not None:
        return ServiceLevelPersonResponse.model_validate(
            safe_person(owner, role="data_owner")
        )
    return ServiceLevelPersonResponse(
        display_name=str(product.contact.get("name") or product.owner),
        organization=product.owner,
        role="data_owner",
    )


def product_control_person(
    session: Session, product: DataProduct
) -> ServiceLevelPersonResponse | None:
    user = (
        session.get(DemoUser, product.control_person_user_id)
        if product.control_person_user_id
        else None
    )
    value = safe_person(user, role="control_person")
    return ServiceLevelPersonResponse.model_validate(value) if value else None


def _revision_control_person(
    session: Session, row: ServiceLevelRevision
) -> ServiceLevelPersonResponse | None:
    snapshot = row.control_person_snapshot or {}
    if snapshot.get("displayName") and snapshot.get("organization"):
        return ServiceLevelPersonResponse(
            display_name=str(snapshot["displayName"]),
            organization=str(snapshot["organization"]),
            role="control_person",
        )
    user = (
        session.get(DemoUser, row.control_person_user_id)
        if row.control_person_user_id
        else None
    )
    value = safe_person(user, role="control_person")
    return ServiceLevelPersonResponse.model_validate(value) if value else None


def _revision_number_by_id(
    rows_by_id: dict[uuid.UUID, ServiceLevelRevision], revision_id: uuid.UUID | None
) -> int | None:
    row = rows_by_id.get(revision_id) if revision_id else None
    return row.revision if row else None


def _flatten_definition(definition: ServiceLevelDefinition) -> dict[str, Any]:
    return definition.model_dump(mode="json", by_alias=True)


def _changes(
    product: DataProduct,
    row: ServiceLevelRevision,
    previous: ServiceLevelRevision | None,
) -> list[ServiceLevelChangeResponse]:
    current: dict[str, Any] = {
        "validFrom": row.valid_from.isoformat(),
        "validUntil": row.valid_until.isoformat() if row.valid_until else None,
        **_flatten_definition(definition_from_row(row)),
    }
    if previous is None:
        previous_values: dict[str, Any] = {
            "validFrom": None,
            "validUntil": None,
            **_flatten_definition(
                baseline_definition(product, as_of=row.valid_from)
            ),
        }
    else:
        previous_values = {
            "validFrom": previous.valid_from.isoformat(),
            "validUntil": previous.valid_until.isoformat() if previous.valid_until else None,
            **_flatten_definition(definition_from_row(previous)),
        }
    return [
        ServiceLevelChangeResponse(
            field=field,
            previous_value=previous_values.get(field),
            current_value=current.get(field),
        )
        for field in sorted(set(previous_values) | set(current))
        if previous_values.get(field) != current.get(field)
    ]


def revision_response(
    session: Session,
    product: DataProduct,
    row: ServiceLevelRevision,
    *,
    privileged: bool,
    rows_by_id: dict[uuid.UUID, ServiceLevelRevision] | None = None,
) -> ServiceLevelRevisionResponse:
    if rows_by_id is None:
        all_rows = list(
            session.scalars(
                select(ServiceLevelRevision).where(
                    ServiceLevelRevision.data_product_id == product.id
                )
            )
        )
        rows_by_id = {item.id: item for item in all_rows}
    previous = rows_by_id.get(row.supersedes_revision_id) if row.supersedes_revision_id else None
    return ServiceLevelRevisionResponse(
        revision_id=row.id,
        data_product_id=row.data_product_id,
        revision=row.revision,
        lock_version=row.lock_version,
        status=row.status,
        source="published" if row.status == "published" else "owner_draft",
        valid_from=row.valid_from,
        valid_until=row.valid_until,
        effective_valid_until=effective_valid_until(row),
        definition=definition_from_row(row),
        owner=product_owner_person(session, product),
        control_person=_revision_control_person(session, row),
        created_at=row.created_at,
        updated_at=row.updated_at,
        submitted_at=row.submitted_at,
        decided_at=row.decided_at,
        published_at=row.published_at,
        decision=row.decision if privileged or row.status == "published" else None,
        rejection_reason=row.rejection_reason if privileged else None,
        supersedes_revision=_revision_number_by_id(
            rows_by_id, row.supersedes_revision_id
        ),
        superseded_by_revision=_revision_number_by_id(
            rows_by_id, row.superseded_by_revision_id
        ),
        superseded_from=row.superseded_from,
        changes=_changes(product, row, previous),
    )


def summary_response(
    session: Session,
    product: DataProduct,
    actor: str | None,
) -> ServiceLevelSummaryResponse:
    today = zurich_today()
    rows = published_revisions(session, product.id)
    rows_by_id = {row.id: row for row in rows}
    active = [
        row
        for row in rows
        if row.valid_from <= today
        and (effective_valid_until(row) is None or today <= effective_valid_until(row))
    ]
    future = [row for row in rows if row.valid_from > today]
    expired = [
        row
        for row in rows
        if effective_valid_until(row) is not None and effective_valid_until(row) < today
    ]
    current_row = max(active, key=lambda item: (item.valid_from, item.revision), default=None)
    next_row = min(future, key=lambda item: (item.valid_from, item.revision), default=None)
    if current_row is not None:
        current: ServiceLevelBaselineResponse | ServiceLevelRevisionResponse = revision_response(
            session,
            product,
            current_row,
            privileged=False,
            rows_by_id=rows_by_id,
        )
        state = "active"
        source = "published"
    else:
        current = baseline_response(product, as_of=today)
        state = "scheduled" if next_row is not None else ("expired" if expired else "baseline")
        source = "platform_default"
    pending_review = session.scalar(
        select(ServiceLevelRevision.id)
        .where(
            ServiceLevelRevision.data_product_id == product.id,
            ServiceLevelRevision.status == "pending_approval",
            ServiceLevelRevision.control_person_user_id == actor,
        )
        .limit(1)
    )
    return ServiceLevelSummaryResponse(
        data_product_id=product.id,
        as_of=today,
        source=source,
        state=state,
        current=current,
        next_scheduled=(
            revision_response(
                session,
                product,
                next_row,
                privileged=False,
                rows_by_id=rows_by_id,
            )
            if next_row is not None
            else None
        ),
        can_edit=actor is not None and actor == product.owner_user_id,
        can_review=actor is not None and pending_review is not None,
        owner=product_owner_person(session, product),
        control_person=product_control_person(session, product),
        legal_references=list(LEGAL_REFERENCES),
    )


def _audit(
    session: Session,
    product: DataProduct,
    row: ServiceLevelRevision | None,
    action: str,
    actor: str,
    details: dict[str, Any] | None = None,
) -> None:
    safe_details: dict[str, Any] = dict(details or {})
    if row is not None:
        safe_details.update(
            {
                "serviceLevelRevision": row.revision,
                "serviceLevelStatus": row.status,
                "validFrom": row.valid_from.isoformat(),
                "validUntil": row.valid_until.isoformat() if row.valid_until else None,
                "effectiveValidUntil": (
                    effective_valid_until(row).isoformat()
                    if effective_valid_until(row)
                    else None
                ),
            }
        )
    session.add(
        AuditEvent(
            id=uuid.uuid4(),
            resource_type="service-level",
            resource_id=str(product.id),
            action=action,
            actor=actor,
            revision=row.revision if row else product.revision,
            details=safe_details,
        )
    )


def _require_owner(product: DataProduct, actor: str) -> None:
    if product.owner_user_id != actor:
        raise HTTPException(403, "Only the responsible data owner may edit this SLA")


def _require_editable_product(product: DataProduct) -> None:
    if product.lifecycle == "retired":
        raise HTTPException(409, "A retired data product cannot receive a new SLA revision")


def create_revision(
    session: Session,
    product: DataProduct,
    body: ServiceLevelRevisionWrite,
    actor: str,
    if_match: str | None,
) -> ServiceLevelRevision:
    _require_owner(product, actor)
    _require_editable_product(product)
    latest = latest_revision_number(session, product.id)
    require_etag(if_match, latest)
    existing_workflow = session.scalar(
        select(ServiceLevelRevision.id)
        .where(
            ServiceLevelRevision.data_product_id == product.id,
            ServiceLevelRevision.status.in_(("draft", "pending_approval")),
        )
        .limit(1)
    )
    if existing_workflow is not None:
        raise HTTPException(409, "Only one open SLA workflow is allowed per data product")
    now = utc_now()
    row = ServiceLevelRevision(
        id=uuid.uuid4(),
        data_product_id=product.id,
        revision=latest + 1,
        lock_version=1,
        status="draft",
        valid_from=body.valid_from,
        valid_until=body.valid_until,
        definition=body.definition.model_dump(mode="json", by_alias=True),
        created_by_owner_user_id=actor,
        updated_by_owner_user_id=actor,
        control_person_snapshot={},
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    _audit(session, product, row, "service-level-draft-created", actor)
    return row


def update_revision(
    session: Session,
    product: DataProduct,
    row: ServiceLevelRevision,
    body: ServiceLevelRevisionWrite,
    actor: str,
    if_match: str | None,
) -> ServiceLevelRevision:
    _require_owner(product, actor)
    _require_editable_product(product)
    require_etag(if_match, row.lock_version)
    if row.status != "draft":
        raise HTTPException(409, "Only a draft SLA revision can be edited")
    row.valid_from = body.valid_from
    row.valid_until = body.valid_until
    row.definition = body.definition.model_dump(mode="json", by_alias=True)
    row.updated_by_owner_user_id = actor
    row.updated_at = utc_now()
    row.lock_version += 1
    _audit(session, product, row, "service-level-draft-updated", actor)
    return row


def _validate_submission_dates(row: ServiceLevelRevision) -> None:
    today = zurich_today()
    if row.valid_from < today:
        raise HTTPException(
            409, "validFrom must not be before today in Europe/Zurich at submission"
        )
    definition = definition_from_row(row)
    if definition.next_review_on < row.valid_from or (
        row.valid_until is not None and definition.next_review_on > row.valid_until
    ):
        raise HTTPException(409, "nextReviewOn must be within the SLA validity period")


def submit_revision(
    session: Session,
    product: DataProduct,
    row: ServiceLevelRevision,
    actor: str,
    if_match: str | None,
) -> ServiceLevelRevision:
    _require_owner(product, actor)
    _require_editable_product(product)
    require_etag(if_match, row.lock_version)
    if row.status != "draft":
        raise HTTPException(409, "Only a draft SLA revision can be submitted")
    _validate_submission_dates(row)
    control_person = (
        session.get(DemoUser, product.control_person_user_id)
        if product.control_person_user_id
        else None
    )
    if not is_active_publication_approver(control_person):
        raise HTTPException(409, "The data product has no active SLA control person")
    if control_person is None or control_person.id == actor:
        raise HTTPException(409, "Four-eyes review requires a different control person")
    existing = session.scalar(
        select(ServiceLevelRevision.id)
        .where(
            ServiceLevelRevision.data_product_id == product.id,
            ServiceLevelRevision.status == "pending_approval",
        )
        .limit(1)
    )
    if existing is not None:
        raise HTTPException(409, "Another SLA revision is already pending review")
    now = utc_now()
    row.status = "pending_approval"
    row.control_person_user_id = control_person.id
    row.control_person_snapshot = {
        "userId": control_person.id,
        "displayName": control_person.display_name,
        "organization": control_person.organization,
        "role": "control_person",
    }
    row.product_revision_at_submission = product.revision
    row.submitted_at = now
    row.updated_at = now
    row.lock_version += 1
    task = WorkflowTask(
        id=stable_id(f"task:service-level-approval:{row.id}"),
        task_type="service_level_approval",
        status="open",
        assignee_user_id=control_person.id,
        data_product_id=product.id,
        service_level_revision_id=row.id,
        title=f"SLA für «{product.title}» prüfen",
        detail=(
            f"Vier-Augen-Prüfung für SLA-Revision {row.revision}; "
            "Nutzungsbedingungen, Gültigkeit und Best-Effort-Ziele kontrollieren."
        ),
        created_at=now,
        updated_at=now,
    )
    session.add(task)
    _audit(session, product, row, "service-level-submitted", actor)
    return row


def _complete_review_task(session: Session, row: ServiceLevelRevision) -> None:
    now = utc_now()
    for task in session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.service_level_revision_id == row.id,
            WorkflowTask.status != "completed",
        )
    ):
        task.status = "completed"
        task.completed_at = now
        task.updated_at = now


def withdraw_revision(
    session: Session,
    product: DataProduct,
    row: ServiceLevelRevision,
    actor: str,
    if_match: str | None,
) -> ServiceLevelRevision:
    _require_owner(product, actor)
    require_etag(if_match, row.lock_version)
    if row.status != "pending_approval":
        raise HTTPException(409, "Only a pending SLA revision can be withdrawn")
    row.status = "withdrawn"
    row.updated_by_owner_user_id = actor
    row.updated_at = utc_now()
    row.lock_version += 1
    _complete_review_task(session, row)
    _audit(session, product, row, "service-level-withdrawn", actor)
    return row


def decide_revision(
    session: Session,
    product: DataProduct,
    row: ServiceLevelRevision,
    body: ServiceLevelDecisionCreate,
    actor: str,
    if_match: str | None,
) -> ServiceLevelRevision:
    require_etag(if_match, row.lock_version)
    if row.status != "pending_approval":
        raise HTTPException(409, "Only a pending SLA revision can be decided")
    if actor != row.control_person_user_id or actor == product.owner_user_id:
        raise HTTPException(403, "Only the assigned SLA control person may decide")
    controller = session.get(DemoUser, actor)
    if not is_active_publication_approver(controller):
        raise HTTPException(409, "The assigned SLA control person is no longer eligible")
    if row.product_revision_at_submission != product.revision:
        raise HTTPException(409, "The reviewed data product revision is stale")
    now = utc_now()
    row.decided_at = now
    row.decided_by_user_id = actor
    row.decision = body.decision
    row.updated_at = now
    row.lock_version += 1
    if body.decision == "reject":
        row.status = "rejected"
        row.rejection_reason = body.reason
        _complete_review_task(session, row)
        _audit(session, product, row, "service-level-rejected", actor)
        return row

    prior = session.scalar(
        select(ServiceLevelRevision)
        .where(
            ServiceLevelRevision.data_product_id == product.id,
            ServiceLevelRevision.status == "published",
        )
        .order_by(
            ServiceLevelRevision.valid_from.desc(),
            ServiceLevelRevision.revision.desc(),
        )
        .limit(1)
        .with_for_update()
    )
    if prior is not None and row.valid_from <= prior.valid_from:
        raise HTTPException(
            409,
            "A newly approved SLA must start after every published SLA revision",
        )
    row.status = "published"
    row.published_at = now
    row.rejection_reason = None
    if prior is not None:
        row.supersedes_revision_id = prior.id
        prior.superseded_by_revision_id = row.id
        prior.superseded_from = row.valid_from
        prior.updated_at = now
        prior.lock_version += 1
    _audit(session, product, row, "service-level-approved", actor)
    if prior is not None:
        _audit(
            session,
            product,
            prior,
            "service-level-superseded",
            actor,
            {"supersededByRevision": row.revision},
        )
    _complete_review_task(session, row)
    _audit(
        session,
        product,
        row,
        "service-level-published",
        actor,
        {"supersedesRevision": prior.revision if prior else None},
    )
    return row


def control_person_change_blocked(session: Session, product_id: uuid.UUID) -> bool:
    pending_sla = session.scalar(
        select(ServiceLevelRevision.id)
        .where(
            ServiceLevelRevision.data_product_id == product_id,
            ServiceLevelRevision.status == "pending_approval",
        )
        .limit(1)
    )
    if pending_sla is not None:
        return True
    pending_governance = session.scalar(
        select(GovernanceSubmission.id)
        .where(
            GovernanceSubmission.data_product_id == product_id,
            GovernanceSubmission.status.in_(ACTIVE_GOVERNANCE_STATES),
        )
        .limit(1)
    )
    return pending_governance is not None


def audit_control_person_change(
    session: Session, product: DataProduct, actor: str
) -> None:
    _audit(
        session,
        product,
        None,
        "control-person-updated",
        actor,
        {"role": "publication_approver"},
    )
