from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from .models import (
    AccessRequest,
    AuditEvent,
    DataProduct,
    DemoUser,
    GovernanceSubmission,
    PolicyRevision,
)
from .schemas import (
    ProductActivityActor,
    ProductActivityFact,
    ProductActivityItem,
    ProductActivityResponse,
)


@dataclass(frozen=True)
class ActivityPresentation:
    event_type: str
    category: str
    status: str
    title: str
    description: str


FIELD_LABELS = {
    "title": "Titel",
    "description": "Beschreibung",
    "owner": "Verantwortliche Stelle",
    "domain": "Fachgebiet",
    "lifecycle": "Lebenszyklus",
    "classification": "Klassifikation",
    "keywords": "Schlagwörter",
    "contact": "Kontakt",
    "license": "Lizenz",
    "quality": "Qualitätsangaben",
    "updateFrequency": "Aktualisierungsfrequenz",
    "metadata": "Zusätzliche Metadaten",
}

POC_EVENT_LABELS = {
    "quality_below_threshold": "Qualitätsgrenze unterschritten",
    "not_discoverable": "Auffindbarkeit deaktiviert",
    "isbo_restricted": "ISBO-Einschränkung aktiviert",
}


def is_privileged_product_auditor(
    session: Session, product: DataProduct, actor: str | None
) -> bool:
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


def product_activity(
    session: Session, product: DataProduct, actor: str | None
) -> ProductActivityResponse:
    privileged = is_privileged_product_auditor(session, product, actor)
    submissions = list(
        session.scalars(
            select(GovernanceSubmission).where(
                GovernanceSubmission.data_product_id == product.id
            )
        )
    )
    access_requests = list(
        session.scalars(
            select(AccessRequest).where(AccessRequest.data_product_id == product.id)
        )
    )
    policies = list(
        session.scalars(
            select(PolicyRevision).where(PolicyRevision.data_product_id == product.id)
        )
    )

    direct_events = list(
        session.scalars(
            select(AuditEvent).where(
                AuditEvent.resource_type.in_(("data-product", "policy")),
                AuditEvent.resource_id == str(product.id),
            )
        )
    )
    submission_ids = {str(item.id) for item in submissions}
    submission_ids.update(
        value
        for event in direct_events
        if event.action == "governance-submitted"
        if isinstance((value := event.details.get("submissionId")), str)
    )
    access_request_ids = {str(item.id) for item in access_requests}
    access_request_ids.update(
        event.resource_id
        for event in session.scalars(
            select(AuditEvent).where(
                AuditEvent.resource_type == "access-request",
                AuditEvent.action == "submitted",
            )
        )
        if event.details.get("dataProductId") == str(product.id)
    )

    conditions = [
        and_(
            AuditEvent.resource_type.in_(("data-product", "policy")),
            AuditEvent.resource_id == str(product.id),
        )
    ]
    if submission_ids:
        conditions.append(
            and_(
                AuditEvent.resource_type == "governance-submission",
                AuditEvent.resource_id.in_(tuple(submission_ids)),
            )
        )
    if access_request_ids:
        conditions.append(
            and_(
                AuditEvent.resource_type == "access-request",
                AuditEvent.resource_id.in_(tuple(access_request_ids)),
            )
        )
    events = list(
        session.scalars(
            select(AuditEvent)
            .where(or_(*conditions))
            .order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
        )
    )

    actors = {
        user.id: user
        for user in session.scalars(
            select(DemoUser).where(DemoUser.id.in_({event.actor for event in events}))
        )
    }
    submission_by_id = {str(item.id): item for item in submissions}
    policy_revision_by_id = {str(item.id): item.revision for item in policies}
    access_request_by_id = {str(item.id): item for item in access_requests}
    submission_policy_revisions = {
        str(item.id): policy_revision_by_id[str(item.policy_revision_id)]
        for item in submissions
        if str(item.policy_revision_id) in policy_revision_by_id
    }
    for event in events:
        if event.resource_type != "governance-submission":
            continue
        revision = _positive_int(event.details.get("policyRevision"))
        if revision is not None:
            submission_policy_revisions[event.resource_id] = revision
    direct_submission_ids = {
        value
        for event in events
        if event.resource_type == "data-product" and event.action == "governance-submitted"
        if isinstance((value := event.details.get("submissionId")), str)
    }
    access_request_approvals = {
        (event.resource_id, event.details.get("policyRevisionId"))
        for event in events
        if event.resource_type == "access-request"
        and event.action == "approved-policy-draft-created"
        and isinstance(event.details.get("policyRevisionId"), str)
    }

    items: list[ProductActivityItem] = []
    for event in events:
        if (
            event.resource_type == "governance-submission"
            and event.action == "submitted-for-four-eyes-approval"
            and event.resource_id in direct_submission_ids
        ):
            continue
        if (
            event.resource_type == "access-request"
            and event.action == "linked-to-policy-revision"
            and (event.resource_id, event.details.get("policyRevisionId"))
            in access_request_approvals
        ):
            continue
        related_submission = submission_by_id.get(event.resource_id)
        if related_submission is None and event.resource_type == "data-product":
            submission_id = event.details.get("submissionId")
            if isinstance(submission_id, str):
                related_submission = submission_by_id.get(submission_id)
        correlated_submission_id = event.resource_id
        if related_submission is not None:
            correlated_submission_id = str(related_submission.id)
        elif event.resource_type == "data-product":
            submission_id = event.details.get("submissionId")
            if isinstance(submission_id, str):
                correlated_submission_id = submission_id
        item = _activity_item(
            event,
            privileged=privileged,
            actor_user=actors.get(event.actor),
            submission=related_submission,
            policy_revision_by_id=policy_revision_by_id,
            submission_policy_revision=submission_policy_revisions.get(
                correlated_submission_id
            ),
            access_request=access_request_by_id.get(event.resource_id),
        )
        items.append(item)

    return ProductActivityResponse(
        detail_level="privileged" if privileged else "summary",
        items=items,
    )


def _activity_item(
    event: AuditEvent,
    *,
    privileged: bool,
    actor_user: DemoUser | None,
    submission: GovernanceSubmission | None,
    policy_revision_by_id: dict[str, int],
    submission_policy_revision: int | None,
    access_request: AccessRequest | None,
) -> ProductActivityItem:
    presentation = _presentation(event)
    policy_revision = _policy_revision(
        event,
        submission=submission,
        policy_revision_by_id=policy_revision_by_id,
        submission_policy_revision=submission_policy_revision,
    )
    product_revision = (
        event.revision if event.resource_type == "data-product" else _reviewed_product_revision(submission)
    )
    facts = _facts(event, access_request=access_request)
    key = "activity-" + hashlib.sha256(
        f"{event.id}:{presentation.event_type}".encode()
    ).hexdigest()[:16]
    technical_evidence: list[ProductActivityFact] = []
    if privileged:
        target = _deployment_target(event.details.get("target"))
        if target:
            technical_evidence.append(
                ProductActivityFact(label="Deployment-Ziel", value=target)
            )
        technical_evidence.append(
            ProductActivityFact(label="Korrelations-ID", value="KOR-" + key[-12:].upper())
        )
    return ProductActivityItem(
        key=key,
        event_type=presentation.event_type,
        category=presentation.category,
        status=presentation.status,
        title=presentation.title,
        description=presentation.description,
        occurred_at=event.occurred_at,
        actor=_actor(event, actor_user=actor_user, privileged=privileged),
        product_revision=product_revision,
        policy_revision=policy_revision,
        facts=facts,
        technical_evidence=technical_evidence,
    )


def _presentation(event: AuditEvent) -> ActivityPresentation:
    action = event.action
    resource_type = event.resource_type
    if action == "metadata-publication-received":
        from_daaif = event.actor.casefold() == "daaif"
        return ActivityPresentation(
            action,
            "metadata",
            "success",
            (
                "Datenprodukt aus DAAIF übernommen"
                if from_daaif
                else "Datenprodukt aus Quellsystem übernommen"
            ),
            "DaCa hat die technischen und fachlichen Metadaten des Datenprodukts übernommen.",
        )
    if action == "metadata-updated":
        return ActivityPresentation(
            action,
            "metadata",
            "info",
            "Metadaten geändert",
            "Die Beschreibung des Datenprodukts wurde versioniert aktualisiert.",
        )
    if action == "quality-reviewed":
        status = "success" if event.details.get("medal") == "platinum" else "info"
        return ActivityPresentation(
            action,
            "quality",
            status,
            "Metadatenqualität geprüft",
            "Die Qualitätskriterien und die Einbettung in den Katalog wurden geprüft.",
        )
    if action == "semantic-mappings-updated":
        return ActivityPresentation(
            action,
            "quality",
            "success",
            "Ontologiezuordnung aktualisiert",
            "Felder und Datenprodukt wurden mit kanonischen Begriffen verknüpft.",
        )
    if action == "endpoint-created":
        return ActivityPresentation(
            action,
            "metadata",
            "success",
            "Schnittstelle registriert",
            "Eine neue technische Schnittstelle wurde für das Datenprodukt dokumentiert.",
        )
    if action == "access-governance-draft-created":
        return ActivityPresentation(
            action,
            "access",
            "pending",
            "Freigaben als Entwurf gespeichert",
            "Empfänger und Zugriffsbedingungen wurden zur Prüfung vorbereitet.",
        )
    if action == "draft-created":
        return ActivityPresentation(
            "policy-draft-created",
            "access",
            "pending",
            "Policy-Entwurf erstellt",
            "Eine neue Version der Zugriffsregeln wurde als Entwurf gespeichert.",
        )
    if action == "access-setting-draft-upserted":
        return ActivityPresentation(
            action,
            "access",
            "pending",
            "Zugriffsregel im Entwurf aktualisiert",
            "Eine Freigabe wurde im noch unveröffentlichten Policy-Entwurf aktualisiert.",
        )
    if action == "published" and resource_type == "policy":
        return ActivityPresentation(
            "policy-published",
            "governance",
            "success",
            "Zugriffspolicy publiziert",
            "Die geprüfte Policy-Revision wurde zur technischen Durchsetzung publiziert.",
        )
    if action == "revoked" and resource_type == "policy":
        return ActivityPresentation(
            "policy-revoked",
            "governance",
            "warning",
            "Zugriffspolicy widerrufen",
            "Die bisher aktive Policy wurde widerrufen und die Freigabe aufgehoben.",
        )
    if action == "submitted" and resource_type == "access-request":
        return ActivityPresentation(
            "access-request-submitted",
            "access",
            "pending",
            "Zugriff beantragt",
            "Für dieses Datenprodukt wurde eine Zugriffsanfrage eingereicht.",
        )
    if action == "rejected" and resource_type == "access-request":
        return ActivityPresentation(
            "access-request-rejected",
            "access",
            "warning",
            "Zugriffsanfrage abgelehnt",
            "Die Zugriffsanfrage wurde geprüft und abgelehnt.",
        )
    if action in {"approved-policy-draft-created", "linked-to-policy-revision"}:
        return ActivityPresentation(
            "access-request-approved",
            "access",
            "pending",
            "Zugriff genehmigt und Policy vorbereitet",
            "Die genehmigte Anfrage wurde an eine noch zu publizierende Policy gebunden.",
        )
    if action in {"governance-submitted", "submitted-for-four-eyes-approval"}:
        return ActivityPresentation(
            "governance-submitted",
            "governance",
            "pending",
            "Zur Vier-Augen-Freigabe übermittelt",
            "Metadaten, Empfänger und Zugriffsbedingungen warten auf die unabhängige Prüfung.",
        )
    if action == "rejected" and resource_type == "governance-submission":
        return ActivityPresentation(
            "governance-rejected",
            "governance",
            "warning",
            "Publikation abgelehnt",
            "Die unabhängige Prüfung wurde abgelehnt; das Produkt bleibt gesperrt.",
        )
    if action == "approved-deployment-started":
        return ActivityPresentation(
            "publication-approved-deploying",
            "governance",
            "pending",
            "Publikation genehmigt",
            "Die Vier-Augen-Prüfung ist abgeschlossen; die technische Aktivierung läuft.",
        )
    if action in {"approval-deployment-failed", "deployment-failed"}:
        return ActivityPresentation(
            "publication-deployment-failed",
            "deployment",
            "failure",
            "Technische Aktivierung fehlgeschlagen",
            "Mindestens ein Zielsystem hat die geprüfte Policy nicht bestätigt; der Zugriff bleibt gesperrt.",
        )
    if action == "deployment-confirmed-publication-activated":
        return ActivityPresentation(
            "publication-activated",
            "deployment",
            "success",
            "Datenprodukt und Zugriffe aktiviert",
            "OPA und PostgreSQL haben dieselbe Policy-Revision erfolgreich bestätigt.",
        )
    if action.startswith("poc-simulation-") and action.endswith("-triggered"):
        return ActivityPresentation(
            "poc-simulation-triggered",
            "poc_system",
            "warning",
            "PoC-Grenzfall ausgelöst",
            "Ein rücksetzbarer Demonstrationsfall wurde für das Datenprodukt aktiviert.",
        )
    if action.startswith("poc-simulation-") and action.endswith("-reset"):
        return ActivityPresentation(
            "poc-simulation-reset",
            "poc_system",
            "success",
            "PoC-Grenzfall zurückgesetzt",
            "Der Demonstrationsfall wurde beendet und der vorherige Zustand wiederhergestellt.",
        )
    if action == "poc-fixture-product-reset":
        return ActivityPresentation(
            "poc-fixture-reset",
            "poc_system",
            "warning",
            "PoC-Datenprodukt zurückgesetzt",
            "Die rücksetzbare Produkt-Fixture wurde für einen neuen Durchlauf entfernt.",
        )
    if action == "seeded":
        return ActivityPresentation(
            "catalog-seeded",
            "poc_system",
            "info",
            "Synthetisches Datenprodukt bereitgestellt",
            "Das Datenprodukt wurde als Bestandteil des PoC-Demobestands angelegt.",
        )
    return ActivityPresentation(
        "technical-catalog-event",
        "poc_system",
        "info",
        "Technisches Katalogereignis",
        "Eine nicht näher klassifizierte Zustandsänderung wurde protokolliert.",
    )


def _facts(
    event: AuditEvent,
    *,
    access_request: AccessRequest | None,
) -> list[ProductActivityFact]:
    details = event.details
    facts: list[ProductActivityFact] = []
    if event.action == "metadata-updated":
        fields = details.get("changedFields")
        if isinstance(fields, list):
            labels = [
                FIELD_LABELS[item]
                for item in fields
                if isinstance(item, str) and item in FIELD_LABELS
            ]
            if labels:
                facts.append(
                    ProductActivityFact(label="Geänderte Felder", value=", ".join(labels))
                )
    elif event.action == "quality-reviewed":
        score = _safe_int(details.get("score"), lower=0, upper=6)
        if score is not None:
            facts.append(
                ProductActivityFact(label="Qualitätskriterien", value=f"{score} von 6")
            )
        medal = details.get("medal")
        if isinstance(medal, str) and medal in {"bronze", "silver", "gold", "platinum"}:
            facts.append(ProductActivityFact(label="Qualitätsstufe", value=medal.title()))
    elif event.action == "semantic-mappings-updated":
        count = _safe_int(details.get("fieldMappings"), lower=0, upper=100_000)
        if count is not None:
            facts.append(ProductActivityFact(label="Feldzuordnungen", value=str(count)))
    elif event.action == "access-governance-draft-created":
        count = _safe_int(details.get("grants"), lower=0, upper=100_000)
        if count is not None:
            facts.append(ProductActivityFact(label="Freigaben", value=str(count)))
    elif event.action == "submitted" and event.resource_type == "access-request":
        protocol = _protocol(details.get("requestedProtocol"))
        if protocol:
            facts.append(ProductActivityFact(label="Protokoll", value=protocol))
        consumer_type = details.get("consumerType")
        if isinstance(consumer_type, str) and consumer_type in {"person", "machine"}:
            facts.append(
                ProductActivityFact(
                    label="Konsumententyp",
                    value="Person" if consumer_type == "person" else "Maschine",
                )
            )
    elif event.action in {"approved-policy-draft-created", "linked-to-policy-revision"}:
        variant = details.get("variant") or (
            access_request.granted_variant if access_request is not None else None
        )
        if isinstance(variant, str) and variant in {"original", "modified"}:
            facts.append(
                ProductActivityFact(
                    label="Datenvariante",
                    value="Original" if variant == "original" else "Angepasst",
                )
            )
    elif event.action in {"approved-deployment-started", "deployment-failed"}:
        targets = details.get("targets")
        if isinstance(targets, list):
            labels = [label for item in targets if (label := _deployment_target(item))]
            if labels:
                facts.append(ProductActivityFact(label="Zielsysteme", value=", ".join(labels)))
    elif event.action == "deployment-confirmed-publication-activated":
        discoverable = details.get("discoverable")
        if isinstance(discoverable, bool):
            facts.append(
                ProductActivityFact(
                    label="Auffindbarkeit",
                    value="Aktiviert" if discoverable else "Deaktiviert",
                )
            )
    if event.action.startswith("poc-simulation-"):
        suffix = "-triggered" if event.action.endswith("-triggered") else "-reset"
        kind = event.action.removeprefix("poc-simulation-").removesuffix(suffix)
        if kind in POC_EVENT_LABELS:
            facts.append(ProductActivityFact(label="Demonstrationsfall", value=POC_EVENT_LABELS[kind]))
    return facts


def _policy_revision(
    event: AuditEvent,
    *,
    submission: GovernanceSubmission | None,
    policy_revision_by_id: dict[str, int],
    submission_policy_revision: int | None,
) -> int | None:
    if event.resource_type == "policy":
        return event.revision
    if event.resource_type == "governance-submission" and submission is not None:
        return submission_policy_revision or policy_revision_by_id.get(
            str(submission.policy_revision_id)
        )
    if event.resource_type == "governance-submission":
        return submission_policy_revision
    if event.resource_type == "access-request":
        policy_id = event.details.get("policyRevisionId")
        if isinstance(policy_id, str) and policy_id in policy_revision_by_id:
            return policy_revision_by_id[policy_id]
        if event.action in {"approved-policy-draft-created", "linked-to-policy-revision"}:
            return _positive_int(event.revision)
        return None
    value = event.details.get("policyRevision")
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    if submission is not None:
        return submission_policy_revision or policy_revision_by_id.get(
            str(submission.policy_revision_id)
        )
    if submission_policy_revision is not None:
        return submission_policy_revision
    return None


def _reviewed_product_revision(submission: GovernanceSubmission | None) -> int | None:
    if submission is None:
        return None
    snapshot = submission.review_snapshot
    if not isinstance(snapshot, dict):
        return None
    product_snapshot = snapshot.get("dataProduct")
    if not isinstance(product_snapshot, dict):
        return None
    revision = product_snapshot.get("revision")
    return revision if isinstance(revision, int) and not isinstance(revision, bool) else None


def _actor(
    event: AuditEvent, *, actor_user: DemoUser | None, privileged: bool
) -> ProductActivityActor:
    normalized = event.actor.casefold()
    system_name = _system_actor_name(event, normalized)
    if system_name:
        return ProductActivityActor(display_name=system_name, kind="system")
    if actor_user is not None and privileged:
        return ProductActivityActor(display_name=actor_user.display_name, kind="person")
    if actor_user is not None:
        return ProductActivityActor(
            display_name=_actor_role(event.resource_type, event.action), kind="role"
        )
    return ProductActivityActor(
        display_name=_actor_role(event.resource_type, event.action), kind="role"
    )


def _system_actor_name(event: AuditEvent, normalized_actor: str) -> str | None:
    if event.action == "metadata-publication-received" and normalized_actor == "daaif":
        return "DAAIF"
    if event.action == "seeded" and normalized_actor == "daca-bootstrap":
        return "DaCa-Initialisierung"
    if (
        event.resource_type == "governance-submission"
        and event.action
        in {"deployment-failed", "deployment-confirmed-publication-activated"}
        and normalized_actor == "daca-deployment-observer"
    ):
        return "DaCa Deployment-Überwachung"
    return None


def _actor_role(resource_type: str, action: str) -> str:
    if action == "metadata-publication-received":
        return "Quellsystem"
    if resource_type == "access-request":
        return "Datenkonsument/in" if action == "submitted" else "Data Owner"
    if resource_type == "governance-submission":
        return "Publikationsfreigabe"
    if resource_type in {"data-product", "policy"}:
        return "Data Owner"
    return "Katalogrolle"


def _safe_int(value: Any, *, lower: int, upper: int) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value if lower <= value <= upper else None


def _positive_int(value: Any) -> int | None:
    return _safe_int(value, lower=1, upper=2_147_483_647)


def _protocol(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return {"http": "REST", "postgresql": "PostgreSQL", "both": "REST und PostgreSQL"}.get(
        value
    )


def _deployment_target(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return {"opa": "OPA", "postgresql": "PostgreSQL"}.get(value)
