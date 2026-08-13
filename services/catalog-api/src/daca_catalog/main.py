from __future__ import annotations

import base64
import hashlib
import json
import secrets
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter
from sqlalchemy import delete, exists, or_, select, text, update
from sqlalchemy.orm import Session, selectinload, sessionmaker

from . import __version__
from .database import default_session_factory, get_session
from .models import (
    AccessRequest,
    AdministrativeOrganization,
    AuditEvent,
    CanonicalOntologyTerm,
    CanonicalOntologyVersion,
    DataProduct,
    DataProductField,
    DemoUser,
    Endpoint,
    IdentityDirectoryEntry,
    IdentityGroup,
    IdentityGroupMembership,
    LineageEdge,
    MetadataDeliveryOutbox,
    MetadataPublication,
    PocProductFixture,
    PocSimulationEvent,
    PolicyDeployment,
    PolicyRevision,
    ProductContextGraph,
    ProductQualityAssessment,
    ProductSemanticMapping,
    ProvenanceEvent,
    WorkflowTask,
    utc_now,
)
from .policy import (
    ActivePolicy,
    build_opa_bundle,
    bundle_data,
    definition_as_camel,
    generate_rego,
    project_to_postgresql,
)
from .problems import install_problem_handlers
from .schemas import (
    AccessGovernanceCreate,
    AccessRequestCreate,
    AccessRequestDecision,
    AccessRequestResponse,
    AccessSettingUpsert,
    AdministrativeOrganizationResponse,
    AuditEventResponse,
    DataProductPage,
    DataProductPatch,
    DataProductResponse,
    DataProductSummary,
    DemoUserResponse,
    DeploymentAcknowledgement,
    EndpointCreate,
    EndpointResponse,
    HealthResponse,
    IdentityDirectoryEntryResponse,
    IdentityGroupCreate,
    IdentityGroupDetailResponse,
    IdentityGroupSummaryResponse,
    LineageEdgeResponse,
    LineageResponse,
    MetadataPublicationCreate,
    MetadataPublicationResponse,
    OntologyTermResponse,
    OntologyVersionResponse,
    OwnedAccessConsumerResponse,
    PocProductFixtureResponse,
    PocProductResetRequest,
    PocSimulationEventResponse,
    PocSimulationResetResponse,
    PocSimulationTriggerResponse,
    PolicyCreate,
    PolicyDeploymentResponse,
    PolicyRevisionPage,
    PolicyRevisionResponse,
    ProductQualityResponse,
    ProductQualityReview,
    ProvenanceEventResponse,
    SemanticMappingResponse,
    SemanticMappingsUpdate,
    WorkflowTaskResponse,
    to_camel,
)
from .seed import seed_catalog
from .settings import Settings, get_settings
from .workflow_seed import ONTOLOGY_URI, stable_id

SessionDep = Annotated[Session, Depends(get_session)]
endpoint_adapter = TypeAdapter(EndpointResponse)


def require_demo_actor(
    request: Request,
    x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None,
) -> str:
    """Resolve the local demo actor without accepting caller headers in production mode."""
    settings: Settings = request.app.state.settings
    if not settings.daca_demo_auth:
        raise HTTPException(503, "Demo identity is disabled and no production identity provider is configured")
    if x_daca_user is None or not x_daca_user.strip():
        raise HTTPException(401, "Provide X-DaCa-User for this local demo mutation")
    actor = x_daca_user.strip()[:200]
    with request.app.state.session_factory() as session:
        user = session.get(DemoUser, actor)
        if user is None or not user.active:
            raise HTTPException(401, "Unknown or inactive local demo identity")
    return actor


ActorDep = Annotated[str, Depends(require_demo_actor)]


def optional_demo_actor(
    request: Request,
    x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None,
) -> str | None:
    if x_daca_user is None or not x_daca_user.strip():
        return None
    return require_demo_actor(request, x_daca_user)


OptionalActorDep = Annotated[str | None, Depends(optional_demo_actor)]


def actor_profile(session: Session, actor: str) -> DemoUser:
    user = session.get(DemoUser, actor)
    if user is None or not user.active:
        raise HTTPException(401, "Unknown or inactive local demo identity")
    return user

DEMO_ACTOR_PROFILES: dict[str, tuple[str, str]] = {
    "kassandra.valdata": ("Kassandra Valdata", "Eidgenössische Steuerverwaltung ESTV"),
}


def etag_for_revision(revision: int) -> str:
    return f'"{revision}"'


def require_revision(if_match: str | None, current_revision: int) -> None:
    if if_match is None:
        raise HTTPException(428, "If-Match is required for this versioned resource")
    candidates = {candidate.strip() for candidate in if_match.split(",")}
    accepted = {etag_for_revision(current_revision), f'W/{etag_for_revision(current_revision)}'}
    if not candidates.intersection(accepted):
        raise HTTPException(412, f"The current revision is {current_revision}; reload the resource and retry")


def find_product(session: Session, product_id: uuid.UUID) -> DataProduct:
    product = session.get(DataProduct, product_id)
    if product is None:
        raise HTTPException(404, "Data product not found")
    return product


def latest_policy(session: Session, product_id: uuid.UUID) -> PolicyRevision | None:
    return session.scalar(
        select(PolicyRevision)
        .where(PolicyRevision.data_product_id == product_id)
        .order_by(PolicyRevision.revision.desc())
        .limit(1)
        .options(selectinload(PolicyRevision.deployments))
    )


def active_bundle_state(session: Session) -> tuple[list[ActivePolicy], str]:
    """Return the active policy set and the exact revision advertised in the OPA manifest."""
    rows = session.execute(
        select(PolicyRevision, DataProduct)
        .join(
            DataProduct,
            (PolicyRevision.data_product_id == DataProduct.id)
            & (PolicyRevision.revision == DataProduct.active_policy_revision),
        )
        .where(PolicyRevision.status == "published")
        .order_by(DataProduct.id)
    ).all()
    active = [ActivePolicy(policy=policy, product=product) for policy, product in rows]
    fingerprint_source = bundle_data(active)
    fingerprint = hashlib.sha256(json.dumps(fingerprint_source, sort_keys=True).encode()).hexdigest()[:20]
    return active, fingerprint


def policy_response(policy: PolicyRevision) -> PolicyRevisionResponse:
    return PolicyRevisionResponse.model_validate(policy)


def group_members(
    session: Session,
    group_id: str,
    *,
    on_date: date | None = None,
) -> list[IdentityDirectoryEntry]:
    effective_date = on_date or utc_now().date()
    return list(
        session.scalars(
            select(IdentityDirectoryEntry)
            .join(
                IdentityGroupMembership,
                IdentityGroupMembership.identity_id == IdentityDirectoryEntry.id,
            )
            .where(
                IdentityGroupMembership.group_id == group_id,
                IdentityDirectoryEntry.active.is_(True),
                or_(
                    IdentityGroupMembership.valid_from.is_(None),
                    IdentityGroupMembership.valid_from <= effective_date,
                ),
                or_(
                    IdentityGroupMembership.valid_until.is_(None),
                    IdentityGroupMembership.valid_until >= effective_date,
                ),
            )
            .order_by(IdentityDirectoryEntry.display_name, IdentityDirectoryEntry.id)
        )
    )


def group_summary(
    session: Session,
    group: IdentityGroup,
    *,
    include_members: bool = False,
) -> IdentityGroupSummaryResponse | IdentityGroupDetailResponse:
    members = group_members(session, group.id)
    payload = {
        "id": group.id,
        "label": group.label,
        "description": group.description,
        "source": group.source,
        "membershipRevision": group.membership_revision,
        "memberCount": len(members),
        "userManaged": not group.system_managed,
    }
    if include_members:
        payload["members"] = [
            IdentityDirectoryEntryResponse.model_validate(member).model_dump(
                mode="json", by_alias=True
            )
            for member in members
        ]
        return IdentityGroupDetailResponse.model_validate(payload)
    return IdentityGroupSummaryResponse.model_validate(payload)


def resolve_policy_grant(
    session: Session,
    grant: dict[str, Any],
    *,
    actor: str | None = None,
) -> dict[str, Any]:
    """Validate a caller-selected target and resolve trusted group membership server-side."""
    resolved = json.loads(json.dumps(grant))
    subject = resolved["subject"]
    subject_type = subject["type"]
    subject_id = subject["id"]
    resolved.pop("groupSnapshot", None)
    if subject_type == "person":
        identity = session.get(IdentityDirectoryEntry, subject_id)
        if identity is None or not identity.active:
            raise HTTPException(422, "The selected personal identity is unknown or inactive")
    elif subject_type == "group":
        group = session.get(IdentityGroup, subject_id)
        if group is None or not group.active:
            raise HTTPException(422, "The selected identity group is unknown or inactive")
        if not group.system_managed and group.owner_user_id != actor:
            raise HTTPException(422, "The selected identity group is not available to this identity")
        members = group_members(session, group.id)
        if not members:
            raise HTTPException(422, "The selected identity group has no active members")
        resolved["groupSnapshot"] = {
            "groupId": group.id,
            "membershipRevision": group.membership_revision,
            "memberIds": [member.id for member in members],
        }
    return resolved


def semantic_profile_payload(session: Session, product: DataProduct) -> dict[str, Any]:
    endpoint = session.scalar(
        select(Endpoint).where(Endpoint.data_product_id == product.id).limit(1)
    )
    fields = {
        field.id: field
        for field in session.scalars(
            select(DataProductField).where(DataProductField.data_product_id == product.id)
        )
    }
    rows = session.execute(
        select(ProductSemanticMapping, CanonicalOntologyTerm)
        .join(
            CanonicalOntologyTerm,
            CanonicalOntologyTerm.id == ProductSemanticMapping.ontology_term_id,
        )
        .where(
            ProductSemanticMapping.data_product_id == product.id,
            ProductSemanticMapping.status == "confirmed",
        )
    ).all()
    product_class = next(
        (
            term.uri
            for mapping, term in rows
            if mapping.mapping_type == "product_class"
        ),
        None,
    )
    field_mappings = [
        {"field": fields[mapping.data_product_field_id].name, "property": term.uri}
        for mapping, term in rows
        if mapping.mapping_type == "field_property"
        and mapping.data_product_field_id in fields
    ]
    return {
        "@context": {
            "dcat": "http://www.w3.org/ns/dcat#",
            "dcterms": "http://purl.org/dc/terms/",
            "daca": "urn:daca:ontology:tax:",
        },
        "@id": product.urn,
        "@type": ["dcat:Dataset", *([product_class] if product_class else [])],
        "dcterms:title": product.title,
        "dcterms:description": product.description,
        "dcterms:conformsTo": ONTOLOGY_URI,
        "dcat:theme": product.domain,
        "dcat:distribution": (
            {
                "@type": "dcat:Distribution",
                "dcat:accessURL": (
                    f"{endpoint.connection.get('baseUrl', '')}"
                    f"{endpoint.connection.get('path', '')}"
                ),
                "dcat:accessService": {
                    "@type": "dcat:DataService",
                    "dcat:endpointURL": endpoint.connection.get("baseUrl"),
                },
            }
            if endpoint
            else None
        ),
        "daca:fieldMappings": field_mappings,
    }


def eligible_i14y_period(definition: dict[str, Any], *, on_date: date) -> tuple[date, date] | None:
    periods: list[tuple[date, date]] = []
    for grant in definition_as_camel(definition).get("grants", []):
        if not grant.get("metadataChannels", {}).get("i14y"):
            continue
        valid_from = date.fromisoformat(str(grant["validFrom"]))
        valid_until = date.fromisoformat(str(grant["validUntil"]))
        if valid_until >= on_date:
            periods.append((valid_from, valid_until))
    if not periods:
        return None
    return min(period[0] for period in periods), max(period[1] for period in periods)


def enqueue_i14y_delivery(
    session: Session,
    product: DataProduct,
    policy_revision: int,
    definition: dict[str, Any],
) -> MetadataDeliveryOutbox | None:
    today = utc_now().date()
    period = eligible_i14y_period(definition, on_date=today)
    if period is None:
        return None
    existing = session.scalar(
        select(MetadataDeliveryOutbox).where(
            MetadataDeliveryOutbox.data_product_id == product.id,
            MetadataDeliveryOutbox.product_revision == product.revision,
            MetadataDeliveryOutbox.channel == "i14y",
        )
    )
    if existing is not None:
        return existing
    now = utc_now()
    is_effective = period[0] <= today
    delivery = MetadataDeliveryOutbox(
        id=uuid.uuid4(),
        data_product_id=product.id,
        product_revision=product.revision,
        policy_revision=policy_revision,
        channel="i14y",
        valid_from=period[0],
        valid_until=period[1],
        status="simulated_delivered" if is_effective else "scheduled",
        payload=semantic_profile_payload(session, product),
        created_at=now,
        delivered_at=now if is_effective else None,
    )
    session.add(delivery)
    return delivery


def enqueue_active_i14y_delivery(session: Session, product: DataProduct) -> None:
    if product.active_policy_revision is None:
        return
    policy = session.scalar(
        select(PolicyRevision).where(
            PolicyRevision.data_product_id == product.id,
            PolicyRevision.revision == product.active_policy_revision,
            PolicyRevision.status == "published",
        )
    )
    if policy is not None and policy_is_fully_deployed(session, policy):
        enqueue_i14y_delivery(session, product, policy.revision, policy.definition)


def finalize_policy_activation(
    session: Session, product: DataProduct, policy: PolicyRevision
) -> bool:
    """Apply post-deployment effects only after both enforcement targets agree."""
    if not policy_is_fully_deployed(session, policy):
        return False
    complete_tasks(session, product.id, "access_governance")
    pending_requests = session.scalars(
        select(AccessRequest).where(
            AccessRequest.data_product_id == product.id,
            AccessRequest.status == "approved_policy_pending",
        )
    )
    for pending_request in pending_requests:
        pending_request.status = (
            "granted_modified"
            if pending_request.requested_variant == "modified"
            else "granted_original"
        )
        pending_request.updated_at = utc_now()
        for task in session.scalars(
            select(WorkflowTask).where(
                WorkflowTask.access_request_id == pending_request.id,
                WorkflowTask.status != "completed",
            )
        ):
            task.status = "completed"
            task.completed_at = utc_now()
            task.updated_at = utc_now()
    quality_task_open = session.scalar(
        select(WorkflowTask.id).where(
            WorkflowTask.data_product_id == product.id,
            WorkflowTask.task_type == "metadata_quality",
            WorkflowTask.status != "completed",
        )
    )
    if quality_task_open is None and product.discoverable:
        product.lifecycle = "active"
    quality = quality_response(session, product)
    product.quality = {
        "score": quality.score,
        "medal": quality.medal,
        "criteria": [item.model_dump(by_alias=True) for item in quality.criteria],
    }
    enqueue_i14y_delivery(session, product, policy.revision, policy.definition)
    return True


def endpoint_response(endpoint: Endpoint) -> Any:
    return endpoint_adapter.validate_python(
        {
            "id": endpoint.id,
            "dataProductId": endpoint.data_product_id,
            "name": endpoint.name,
            "description": endpoint.description,
            "protocol": endpoint.protocol,
            "connection": endpoint.connection,
            "secretRef": endpoint.secret_ref,
            "createdAt": endpoint.created_at,
        }
    )


def encode_cursor(value: uuid.UUID) -> str:
    return base64.urlsafe_b64encode(value.bytes).decode().rstrip("=")


def decode_cursor(value: str) -> uuid.UUID:
    try:
        raw = base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
        return uuid.UUID(bytes=raw)
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, "cursor is invalid") from exc


def audit(
    session: Session,
    resource_type: str,
    resource_id: str,
    action: str,
    actor: str,
    revision: int | None,
    details: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditEvent(
            id=uuid.uuid4(),
            resource_type=resource_type,
            resource_id=resource_id,
            action=action,
            actor=actor,
            revision=revision,
            details=details or {},
        )
    )


QUALITY_LABELS = {
    "access": "Zugriffsmanagement publiziert",
    "discoverability": "Bewusst angeboten und auffindbar",
    "technical": "Technische Metadaten vollständig",
    "business": "Fachliche Metadaten vollständig",
    "graph": "KOBY Graphify bestätigt",
    "ontology": "In kanonische Ontologie eingebettet",
}


def require_product_owner(product: DataProduct, actor: str) -> None:
    if product.owner_user_id != actor:
        raise HTTPException(403, "Only the responsible data owner may perform this action")


def policy_is_fully_deployed(session: Session, policy: PolicyRevision | None) -> bool:
    if policy is None or policy.status != "published":
        return False
    states = {
        deployment.target: deployment.state
        for deployment in session.scalars(
            select(PolicyDeployment).where(PolicyDeployment.policy_revision_id == policy.id)
        )
    }
    return states.get("opa") == "deployed" and states.get("postgresql") == "deployed"


def active_published_policy(session: Session, product: DataProduct) -> PolicyRevision | None:
    if product.active_policy_revision is None:
        return None
    return session.scalar(
        select(PolicyRevision)
        .where(
            PolicyRevision.data_product_id == product.id,
            PolicyRevision.revision == product.active_policy_revision,
            PolicyRevision.status == "published",
        )
        .options(selectinload(PolicyRevision.deployments))
    )


def quality_response(session: Session, product: DataProduct) -> ProductQualityResponse:
    assessment = session.get(ProductQualityAssessment, product.id)
    if assessment is None:
        assessment = ProductQualityAssessment(data_product_id=product.id)
        session.add(assessment)
        session.flush()
    fields = list(session.scalars(select(DataProductField).where(DataProductField.data_product_id == product.id)))
    endpoints = list(session.scalars(select(Endpoint).where(Endpoint.data_product_id == product.id)))
    graph = session.get(ProductContextGraph, product.id)
    active_version = session.scalar(select(CanonicalOntologyVersion).where(CanonicalOntologyVersion.active.is_(True)).limit(1))
    mappings = list(session.scalars(select(ProductSemanticMapping).where(ProductSemanticMapping.data_product_id == product.id)))
    confirmed = [mapping for mapping in mappings if mapping.status == "confirmed"]
    product_classes = [mapping for mapping in confirmed if mapping.mapping_type == "product_class" and mapping.data_product_field_id is None]
    key_fields = [field for field in fields if field.key_field]
    mapped_field_ids = {mapping.data_product_field_id for mapping in confirmed if mapping.mapping_type == "field_property"}
    active_term_ids = set()
    if active_version is not None:
        active_term_ids = set(session.scalars(select(CanonicalOntologyTerm.id).where(CanonicalOntologyTerm.ontology_version_id == active_version.id)))

    assessment.technical_metadata_complete = bool(fields and endpoints and all(field.name and field.data_type for field in fields))
    assessment.business_metadata_complete = bool(
        assessment.dcat_reviewed
        and product.title.strip()
        and len(product.description.strip()) >= 20
        and product.domain.strip()
        and product.contact.get("email")
        and product.update_frequency
        and all(field.business_description and field.business_description.strip() for field in fields)
    )
    assessment.graph_confirmed = graph is not None and graph.status == "confirmed"
    assessment.ontology_embedded = bool(
        active_version
        and len(product_classes) == 1
        and product_classes[0].ontology_term_id in active_term_ids
        and key_fields
        and all(field.id in mapped_field_ids for field in key_fields)
        and all(mapping.ontology_term_id in active_term_ids for mapping in confirmed)
        and not any(mapping.status != "confirmed" for mapping in mappings)
    )
    assessment.access_management_defined = policy_is_fully_deployed(
        session, active_published_policy(session, product)
    )
    criteria = [
        ("access", assessment.access_management_defined),
        ("discoverability", assessment.discoverability_confirmed and product.discoverable and product.lifecycle == "active"),
        ("technical", assessment.technical_metadata_complete),
        ("business", assessment.business_metadata_complete),
        ("graph", assessment.graph_confirmed),
        ("ontology", assessment.ontology_embedded),
    ]
    assessment.score = sum(1 for _, complete in criteria if complete)
    assessment.medal = "platinum" if assessment.score == 6 else "gold" if assessment.score == 5 else "silver" if assessment.score == 4 else "bronze"
    assessment.updated_at = utc_now()
    session.flush()
    return ProductQualityResponse(
        data_product_id=product.id,
        score=assessment.score,
        medal=assessment.medal,
        criteria=[{"id": criterion_id, "label": QUALITY_LABELS[criterion_id], "complete": complete} for criterion_id, complete in criteria],
        dcat_reviewed=assessment.dcat_reviewed,
    )


def complete_tasks(session: Session, product_id: uuid.UUID, task_type: str) -> None:
    now = utc_now()
    tasks = session.scalars(select(WorkflowTask).where(WorkflowTask.data_product_id == product_id, WorkflowTask.task_type == task_type, WorkflowTask.status != "completed"))
    for task in tasks:
        task.status = "completed"
        task.completed_at = now
        task.updated_at = now


def reconcile_group_membership_tasks(session: Session, actor: str) -> None:
    """Surface group-directory drift without silently widening an active grant."""
    owned_products = list(
        session.scalars(select(DataProduct).where(DataProduct.owner_user_id == actor))
    )
    active_warning_ids: set[uuid.UUID] = set()
    for product in owned_products:
        policy = active_published_policy(session, product)
        if policy is None:
            continue
        for grant in definition_as_camel(policy.definition).get("grants", []):
            if grant.get("subject", {}).get("type") != "group":
                continue
            snapshot = grant.get("groupSnapshot") or {}
            group_id = snapshot.get("groupId") or grant["subject"]["id"]
            group = session.get(IdentityGroup, group_id)
            if group is None or group.membership_revision == snapshot.get("membershipRevision"):
                continue
            task_id = stable_id(f"task:group-membership:{product.id}:{group_id}")
            active_warning_ids.add(task_id)
            task = session.get(WorkflowTask, task_id)
            if task is None:
                task = WorkflowTask(
                    id=task_id,
                    task_type="group_membership_changed",
                    status="open",
                    assignee_user_id=actor,
                    data_product_id=product.id,
                    title=f"Gruppenzugriff «{group.label}» prüfen",
                    detail=(
                        "Die vertrauenswürdige Gruppenmitgliedschaft hat sich geändert. "
                        "Der aktive Snapshot bleibt unverändert, bis Sie eine neue "
                        "Zugriffseinstellung aktivieren."
                    ),
                )
                session.add(task)
            elif task.status == "completed":
                task.status = "open"
                task.completed_at = None
                task.updated_at = utc_now()
    for task in session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.assignee_user_id == actor,
            WorkflowTask.task_type == "group_membership_changed",
            WorkflowTask.status != "completed",
        )
    ):
        if task.id not in active_warning_ids:
            task.status = "completed"
            task.completed_at = utc_now()
            task.updated_at = utc_now()


STATE_SIMULATION_EVENTS = {
    "quality_below_threshold": {
        "taskType": "simulation_quality_alert",
        "title": "Datenqualität liegt unter dem Mindestwert",
        "detail": "Die simulierte Qualitätsmessung liegt bei 58 % und damit unter dem Mindestwert von 80 %.",
        "alertTitle": "Datenqualität zu tief",
        "alertDetail": "Simulierter Qualitätswert: 58 % · Mindestwert: 80 %",
    },
    "not_discoverable": {
        "taskType": "simulation_discoverability_alert",
        "title": "Datenprodukt ist nicht auffindbar",
        "detail": "Prüfen Sie die Auffindbarkeit und publizieren Sie die Katalogsichtbarkeit erneut.",
        "alertTitle": "Datenprodukt nicht auffindbar",
        "alertDetail": "Die Katalogmetadaten sind für andere Benutzerinnen und Benutzer nicht sichtbar.",
    },
    "isbo_restricted": {
        "taskType": "simulation_isbo_restriction",
        "title": "ISBO hat das Datenprodukt eingeschränkt",
        "detail": "Dringende Sicherheitsprüfung: Klassifikation und Auffindbarkeit wurden eingeschränkt. Aktive Freigaben wurden nicht automatisch widerrufen.",
        "alertTitle": "Durch den ISBO eingeschränkt",
        "alertDetail": "Sicherheitsprüfung erforderlich · bestehende Freigaben bleiben bis zur bewussten Entscheidung aktiv.",
    },
}


def fixture_for_product(session: Session, product: DataProduct) -> PocProductFixture:
    publication = session.scalar(
        select(MetadataPublication).where(MetadataPublication.data_product_id == product.id)
    )
    if publication is None:
        raise HTTPException(409, "Only products injected from a PoC fixture can be simulated")
    fixture = session.scalar(
        select(PocProductFixture).where(
            PocProductFixture.source_product_id == publication.source_product_id,
            PocProductFixture.owner_user_id == product.owner_user_id,
        )
    )
    if fixture is None:
        raise HTTPException(409, "The data product is not backed by a resettable PoC fixture")
    return fixture


def active_simulation_events(
    session: Session,
    *,
    product_id: uuid.UUID | None = None,
) -> list[PocSimulationEvent]:
    # Use aliases so the correlated reset lookup remains unambiguous.
    from sqlalchemy.orm import aliased

    trigger = aliased(PocSimulationEvent)
    reset = aliased(PocSimulationEvent)
    statement = select(trigger).where(
        trigger.operation == "trigger",
        trigger.event_type.in_(tuple(STATE_SIMULATION_EVENTS)),
        ~exists(select(reset.id).where(reset.trigger_event_id == trigger.id)),
    )
    if product_id is not None:
        statement = statement.where(trigger.product_id == product_id)
    return list(session.scalars(statement.order_by(trigger.created_at.desc())))


def simulation_event_response(
    event: PocSimulationEvent,
    *,
    active: bool,
) -> PocSimulationEventResponse:
    data = PocSimulationEventResponse.model_validate(event).model_copy(update={"active": active})
    return data


def metadata_without_alert(metadata: dict[str, Any], event_id: uuid.UUID) -> dict[str, Any]:
    copied = json.loads(json.dumps(metadata))
    copied["simulationAlerts"] = [
        item
        for item in copied.get("simulationAlerts", [])
        if item.get("eventId") != str(event_id)
    ]
    return copied


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    @router.get("/demo-users", response_model=list[DemoUserResponse], tags=["POC"])
    def list_demo_users(session: SessionDep) -> list[DemoUser]:
        return list(session.scalars(select(DemoUser).where(DemoUser.active.is_(True), DemoUser.selectable.is_(True)).order_by(DemoUser.display_name)))

    @router.get(
        "/identity-directory/organizations",
        response_model=list[AdministrativeOrganizationResponse],
        tags=["identity directory"],
    )
    def list_administrative_organizations(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[AdministrativeOrganizationResponse]:
        del actor
        organizations = session.scalars(
            select(AdministrativeOrganization)
            .where(AdministrativeOrganization.active.is_(True))
            .order_by(
                AdministrativeOrganization.department_order,
                AdministrativeOrganization.office_order,
            )
        )
        return [
            AdministrativeOrganizationResponse(
                id=item.id,
                department_code=item.department_code,
                office_code=item.office_code,
                display_name=item.display_name,
                organization_type=item.organization_type,
                label=(
                    f"{item.department_code} - {item.office_code}"
                    if item.office_code
                    else item.department_code
                ),
            )
            for item in organizations
        ]

    @router.get(
        "/identity-directory/people",
        response_model=list[IdentityDirectoryEntryResponse],
        tags=["identity directory"],
    )
    def search_identity_directory(
        session: SessionDep,
        actor: ActorDep,
        q: str | None = None,
        source: Literal["federal", "cantonal", "municipal", "federal_related"] | None = None,
        organization_id: str | None = None,
        limit: Annotated[int, Query(ge=1, le=50)] = 20,
    ) -> list[IdentityDirectoryEntry]:
        del actor
        statement = select(IdentityDirectoryEntry).where(IdentityDirectoryEntry.active.is_(True))
        if source:
            statement = statement.where(IdentityDirectoryEntry.source == source)
        if organization_id:
            statement = statement.where(IdentityDirectoryEntry.organization_id == organization_id)
        if q and q.strip():
            needle = f"%{q.strip()}%"
            statement = statement.where(
                or_(
                    IdentityDirectoryEntry.id.ilike(needle),
                    IdentityDirectoryEntry.display_name.ilike(needle),
                    IdentityDirectoryEntry.organization.ilike(needle),
                    IdentityDirectoryEntry.email.ilike(needle),
                )
            )
        return list(
            session.scalars(
                statement.order_by(IdentityDirectoryEntry.display_name).limit(limit)
            )
        )

    @router.get(
        "/identity-directory/groups",
        response_model=list[IdentityGroupSummaryResponse],
        tags=["identity directory"],
    )
    def search_identity_groups(
        session: SessionDep,
        actor: ActorDep,
        q: str | None = None,
        source: Literal["federal", "cantonal", "municipal", "federal_related"] | None = None,
        limit: Annotated[int, Query(ge=1, le=50)] = 20,
    ) -> list[IdentityGroupSummaryResponse]:
        statement = select(IdentityGroup).where(
            IdentityGroup.active.is_(True),
            or_(
                IdentityGroup.system_managed.is_(True),
                IdentityGroup.owner_user_id == actor,
            ),
        )
        if source:
            statement = statement.where(IdentityGroup.source == source)
        if q and q.strip():
            needle = f"%{q.strip()}%"
            statement = statement.where(
                or_(
                    IdentityGroup.id.ilike(needle),
                    IdentityGroup.label.ilike(needle),
                    IdentityGroup.description.ilike(needle),
                )
            )
        groups = list(session.scalars(statement.order_by(IdentityGroup.label).limit(limit)))
        return [group_summary(session, group) for group in groups]

    @router.post(
        "/identity-directory/groups",
        response_model=IdentityGroupDetailResponse,
        status_code=201,
        tags=["identity directory"],
    )
    def create_identity_group(
        body: IdentityGroupCreate,
        session: SessionDep,
        actor: ActorDep,
    ) -> IdentityGroupDetailResponse:
        member_ids = sorted(set(body.member_ids))
        members = list(
            session.scalars(
                select(IdentityDirectoryEntry).where(
                    IdentityDirectoryEntry.id.in_(member_ids),
                    IdentityDirectoryEntry.active.is_(True),
                )
            )
        )
        if {member.id for member in members} != set(member_ids):
            raise HTTPException(422, "Every group member must be an active trusted identity")
        actor_identity = session.get(IdentityDirectoryEntry, actor)
        group = IdentityGroup(
            id=f"custom-{uuid.uuid4().hex}",
            label=body.label.strip(),
            description=body.description.strip(),
            source=actor_identity.source if actor_identity else "federal",
            owner_user_id=actor,
            system_managed=False,
            membership_revision=1,
            active=True,
        )
        session.add(group)
        session.flush()
        for member_id in member_ids:
            session.add(IdentityGroupMembership(group_id=group.id, identity_id=member_id))
        audit(
            session,
            "identity-group",
            group.id,
            "created",
            actor,
            1,
            {"memberCount": len(member_ids)},
        )
        session.commit()
        return group_summary(session, group, include_members=True)

    @router.get(
        "/identity-directory/groups/{group_id}",
        response_model=IdentityGroupDetailResponse,
        tags=["identity directory"],
    )
    def get_identity_group(
        group_id: str,
        session: SessionDep,
        actor: ActorDep,
    ) -> IdentityGroupDetailResponse:
        group = session.get(IdentityGroup, group_id)
        if (
            group is None
            or not group.active
            or (not group.system_managed and group.owner_user_id != actor)
        ):
            raise HTTPException(404, "Identity group not found")
        return group_summary(session, group, include_members=True)

    @router.get("/poc/product-fixtures", response_model=list[PocProductFixtureResponse], tags=["POC"])
    def list_product_fixtures(session: SessionDep) -> list[PocProductFixtureResponse]:
        publications = {
            (row.source_system, row.source_product_id): row.data_product_id
            for row in session.scalars(select(MetadataPublication))
        }
        return [
            PocProductFixtureResponse(
                id=fixture.id,
                owner_user_id=fixture.owner_user_id,
                source_product_id=fixture.source_product_id,
                title=fixture.title,
                maturity_level=fixture.maturity_level,
                payload=fixture.payload,
                injected_product_id=publications.get((fixture.payload.get("sourceSystem", "DAAIF"), fixture.source_product_id)),
            )
            for fixture in session.scalars(select(PocProductFixture).order_by(PocProductFixture.owner_user_id, PocProductFixture.id))
        ]

    @router.post(
        "/metadata-publications",
        response_model=MetadataPublicationResponse,
        tags=["metadata publication"],
        summary="Publish REST metadata from an external curation platform",
        description=(
            "Accepts catalog metadata only. No credentials, secrets or product payloads are stored. "
            "Publication never grants data access; PBAC remains default deny until a policy is published. "
            "The endpoint is enabled only when DACA_OPEN_METADATA_PUBLICATION=true."
        ),
        responses={
            404: {"description": "Open metadata publication is disabled."},
            409: {"description": "The source identity exists with different metadata."},
            422: {"description": "The REST metadata or owner identity is invalid."},
            503: {"description": "The catalog persistence service is unavailable."},
        },
    )
    def publish_metadata(
        body: MetadataPublicationCreate,
        request: Request,
        response: Response,
        session: SessionDep,
    ) -> MetadataPublicationResponse:
        if not request.app.state.settings.daca_open_metadata_publication:
            raise HTTPException(404, "The open metadata publication POC endpoint is disabled")
        owner = session.get(DemoUser, body.owner_user_id)
        if owner is None or not owner.active:
            raise HTTPException(422, "ownerUserId must identify an active demo user")
        normalized = body.model_dump(mode="json", by_alias=True)
        digest = hashlib.sha256(json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        existing = session.scalar(
            select(MetadataPublication).where(
                MetadataPublication.source_system == body.source_system,
                MetadataPublication.source_product_id == body.source_product_id,
            )
        )
        if existing is not None:
            if existing.payload_hash != digest:
                raise HTTPException(409, "This source product was already published with different metadata")
            task_ids = list(session.scalars(select(WorkflowTask.id).where(WorkflowTask.data_product_id == existing.data_product_id)))
            product = find_product(session, existing.data_product_id)
            quality = quality_response(session, product)
            session.commit()
            return MetadataPublicationResponse(
                publication_id=existing.id,
                product_id=existing.data_product_id,
                state=existing.state,
                created=False,
                missing_fields=[criterion.label for criterion in quality.criteria if not criterion.complete],
                task_ids=task_ids,
            )

        product_id = stable_id(f"product:{body.source_system}:{body.source_product_id}")
        if session.get(DataProduct, product_id) is not None:
            raise HTTPException(409, "The deterministic catalog product identifier is already in use")
        business = body.business_metadata
        product = DataProduct(
            id=product_id,
            urn=f"urn:daca:source:{body.source_system.lower()}:{body.source_product_id}",
            origin_catalog=f"urn:daca:source:{body.source_system.lower()}",
            revision=1,
            active_policy_revision=None,
            owner_user_id=owner.id,
            discoverable=body.discoverable if body.publication_mode == "automatic" else False,
            title=business.title if business and business.title else body.technical_metadata.service_name,
            description=business.description if business and business.description else "Fachliche Beschreibung ausstehend; technische Metadaten wurden aus DAAIF übernommen.",
            owner=owner.organization,
            domain=business.domain if business and business.domain else "Nicht zugeordnet",
            lifecycle="active" if body.publication_mode == "automatic" else "draft",
            classification=business.classification if business and business.classification else "internal",
            keywords=business.keywords if business else [],
            contact={"name": owner.display_name, "email": business.contact_email if business and business.contact_email else owner.email},
            license="Interadministrative Nutzung · POC",
            quality={"source": "DAAIF", "assessment": "pending"},
            update_frequency=business.update_frequency if business else None,
            extra_metadata={
                "sourceSystem": body.source_system,
                "sourceProductId": body.source_product_id,
                "publicationMode": body.publication_mode,
                "requestedDiscoverable": body.discoverable,
                "deliveryProtocols": ["REST"],
                "dataOwner": {"name": owner.display_name, "organization": owner.organization, "avatarUrl": owner.avatar_url, "phone": owner.phone},
                "catalogUsage": {"responsibleUserIds": [owner.id], "sharedByUserIds": [], "requestedByUserIds": [], "sharedWithUserIds": [], "consumerUserIds": [], "consumerMachineIds": []},
            },
        )
        session.add(product)
        session.flush()
        endpoint = body.technical_metadata.endpoint
        session.add(Endpoint(
            id=stable_id(f"endpoint:{body.source_system}:{body.source_product_id}"),
            data_product_id=product_id,
            name=body.technical_metadata.service_name,
            description="Von DAAIF gemeldeter REST Data Service",
            protocol="http-rest",
            connection={"baseUrl": endpoint.base_url, "path": endpoint.path, "method": endpoint.method, "mediaType": "application/json"},
            secret_ref=None,
        ))
        created_fields: list[tuple[DataProductField, Any]] = []
        for source_field in body.technical_metadata.schema_fields:
            field_row = DataProductField(
                id=stable_id(f"field:{body.source_system}:{body.source_product_id}:{source_field.name}"),
                data_product_id=product_id,
                name=source_field.name,
                data_type=source_field.data_type,
                nullable=source_field.nullable,
                key_field=source_field.key_field,
                business_description=source_field.business_description,
            )
            session.add(field_row)
            created_fields.append((field_row, source_field))

        publication = MetadataPublication(
            id=stable_id(f"publication:{body.source_system}:{body.source_product_id}"),
            source_system=body.source_system,
            source_product_id=body.source_product_id,
            data_product_id=product_id,
            publication_mode=body.publication_mode,
            discoverable_explicit="discoverable" in body.model_fields_set,
            payload_hash=digest,
            normalized_payload=normalized,
            state="pending_review" if body.publication_mode == "governance_review" else "published_incomplete",
        )
        session.add(publication)
        assessment = ProductQualityAssessment(
            data_product_id=product_id,
            discoverability_confirmed="discoverable" in body.model_fields_set,
            dcat_reviewed=bool(business and business.dcat_reviewed),
        )
        session.add(assessment)
        if business and business.graph:
            session.add(ProductContextGraph(data_product_id=product_id, graph=business.graph, status="confirmed", confirmed_by=owner.id))

        active_version = session.scalar(select(CanonicalOntologyVersion).where(CanonicalOntologyVersion.active.is_(True)).limit(1))
        if business and business.product_class_uri and active_version:
            class_term = session.scalar(select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.uri == business.product_class_uri, CanonicalOntologyTerm.kind == "class", CanonicalOntologyTerm.ontology_version_id == active_version.id))
            if class_term:
                session.add(ProductSemanticMapping(id=uuid.uuid4(), data_product_id=product_id, data_product_field_id=None, ontology_term_id=class_term.id, mapping_type="product_class", status="confirmed", confirmed_by=owner.id))
        for field_row, source_field in created_fields:
            if source_field.ontology_term_uri and active_version:
                term = session.scalar(select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.uri == source_field.ontology_term_uri, CanonicalOntologyTerm.kind == "property", CanonicalOntologyTerm.ontology_version_id == active_version.id))
                if term:
                    session.add(ProductSemanticMapping(id=uuid.uuid4(), data_product_id=product_id, data_product_field_id=field_row.id, ontology_term_id=term.id, mapping_type="field_property", status="confirmed", confirmed_by=owner.id))

        tasks = [
            WorkflowTask(id=stable_id(f"task:quality:{product_id}"), task_type="metadata_quality", status="open", assignee_user_id=owner.id, data_product_id=product_id, title="Metadatenqualität sicherstellen", detail="Technische und fachliche Metadaten, DCAT-Zuordnung, Ontologie und Kontextgraph prüfen."),
            WorkflowTask(id=stable_id(f"task:governance:{product_id}"), task_type="access_governance", status="open", assignee_user_id=owner.id, data_product_id=product_id, title="Auffindbarkeit und Zugriff regeln", detail="Auffindbarkeit bestätigen und eine zeitlich begrenzte PBAC-Policy oder explizites Default Deny publizieren."),
        ]
        session.add_all(tasks)
        session.add(ProvenanceEvent(id=uuid.uuid4(), data_product_id=product_id, product_urn=product.urn, sequence=1, event_type="metadata-published-from-daaif", actor=body.source_system, details={"sourceProductId": body.source_product_id, "publicationMode": body.publication_mode}, occurred_at=utc_now()))
        fixture = session.scalar(
            select(PocProductFixture).where(
                PocProductFixture.source_product_id == body.source_product_id,
                PocProductFixture.owner_user_id == owner.id,
            )
        )
        session.add(
            PocSimulationEvent(
                id=uuid.uuid4(),
                event_type="product_submitted",
                operation="trigger",
                product_id=product_id,
                product_urn=product.urn,
                fixture_id=fixture.id if fixture else None,
                actor_user_id=owner.id,
                before_state={},
                after_state={
                    "publicationMode": body.publication_mode,
                    "discoverable": product.discoverable,
                    "state": publication.state,
                },
            )
        )
        audit(session, "data-product", str(product_id), "metadata-publication-received", body.source_system, 1, {"sourceProductId": body.source_product_id})
        session.flush()
        quality = quality_response(session, product)
        product.quality = {"score": quality.score, "medal": quality.medal, "criteria": [item.model_dump(by_alias=True) for item in quality.criteria]}
        session.commit()
        response.status_code = 201
        return MetadataPublicationResponse(
            publication_id=publication.id,
            product_id=product_id,
            state=publication.state,
            created=True,
            missing_fields=[criterion.label for criterion in quality.criteria if not criterion.complete],
            task_ids=[task.id for task in tasks],
        )

    @router.get("/tasks/mine", response_model=list[WorkflowTaskResponse], tags=["workflow"])
    def list_my_tasks(session: SessionDep, actor: ActorDep) -> list[WorkflowTask]:
        reconcile_group_membership_tasks(session, actor)
        session.commit()
        return list(session.scalars(select(WorkflowTask).where(WorkflowTask.assignee_user_id == actor, WorkflowTask.status != "completed").order_by(WorkflowTask.created_at.desc())))

    @router.get(
        "/poc/simulation-events/mine",
        response_model=list[PocSimulationEventResponse],
        tags=["POC simulation"],
    )
    def list_my_simulation_events(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[PocSimulationEventResponse]:
        rows = list(
            session.scalars(
                select(PocSimulationEvent)
                .where(PocSimulationEvent.actor_user_id == actor)
                .order_by(PocSimulationEvent.created_at.desc())
            )
        )
        reset_ids = {
            row.trigger_event_id
            for row in rows
            if row.trigger_event_id is not None and row.operation in {"reset", "product_reset"}
        }
        return [
            simulation_event_response(
                row,
                active=(
                    row.operation == "trigger"
                    and row.event_type in STATE_SIMULATION_EVENTS
                    and row.id not in reset_ids
                    and session.get(DataProduct, row.product_id) is not None
                ),
            )
            for row in rows
        ]

    @router.post(
        "/poc/data-products/{product_id}/simulation-events/{event_type}",
        response_model=PocSimulationTriggerResponse,
        status_code=201,
        tags=["POC simulation"],
    )
    def trigger_simulation_event(
        product_id: uuid.UUID,
        event_type: Literal[
            "quality_below_threshold",
            "not_discoverable",
            "isbo_restricted",
        ],
        session: SessionDep,
        actor: ActorDep,
    ) -> PocSimulationTriggerResponse:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        fixture = fixture_for_product(session, product)
        active = active_simulation_events(session, product_id=product_id)
        if active:
            raise HTTPException(
                409,
                "Reset the active state-changing simulation event before triggering another one",
            )
        definition = STATE_SIMULATION_EVENTS[event_type]
        before_state = {
            "discoverable": product.discoverable,
            "classification": product.classification,
            "metadata": json.loads(json.dumps(product.extra_metadata)),
        }
        event = PocSimulationEvent(
            id=uuid.uuid4(),
            event_type=event_type,
            operation="trigger",
            product_id=product.id,
            product_urn=product.urn,
            fixture_id=fixture.id,
            actor_user_id=actor,
            before_state=before_state,
            after_state={},
        )
        session.add(event)
        session.flush()
        metadata = json.loads(json.dumps(product.extra_metadata))
        alerts = list(metadata.get("simulationAlerts", []))
        alerts.append(
            {
                "eventId": str(event.id),
                "type": event_type,
                "severity": "urgent" if event_type == "isbo_restricted" else "attention",
                "title": definition["alertTitle"],
                "detail": definition["alertDetail"],
                **(
                    {"measuredPercent": 58, "thresholdPercent": 80}
                    if event_type == "quality_below_threshold"
                    else {}
                ),
            }
        )
        metadata["simulationAlerts"] = alerts
        product.extra_metadata = metadata
        if event_type in {"not_discoverable", "isbo_restricted"}:
            product.discoverable = False
        if event_type == "isbo_restricted":
            product.classification = "restricted"
        product.revision += 1
        product.updated_at = utc_now()
        event.after_state = {
            "discoverable": product.discoverable,
            "classification": product.classification,
            "metadata": metadata,
        }
        task = WorkflowTask(
            id=stable_id(f"task:simulation:{event.id}"),
            task_type=definition["taskType"],
            status="open",
            assignee_user_id=actor,
            data_product_id=product.id,
            simulation_event_id=event.id,
            title=definition["title"],
            detail=definition["detail"],
        )
        session.add(task)
        audit(
            session,
            "data-product",
            str(product.id),
            f"poc-simulation-{event_type}-triggered",
            actor,
            product.revision,
            {"simulationEventId": str(event.id), "fixtureId": fixture.id},
        )
        if event_type in {"not_discoverable", "isbo_restricted"}:
            quality = quality_response(session, product)
            product.quality = {
                "score": quality.score,
                "medal": quality.medal,
                "criteria": [item.model_dump(by_alias=True) for item in quality.criteria],
            }
        session.commit()
        session.refresh(product)
        session.refresh(task)
        session.refresh(event)
        return PocSimulationTriggerResponse(
            event=simulation_event_response(event, active=True),
            product=DataProductResponse.model_validate(product),
            task=WorkflowTaskResponse.model_validate(task),
        )

    @router.post(
        "/poc/simulation-events/{event_id}/reset",
        response_model=PocSimulationResetResponse,
        tags=["POC simulation"],
    )
    def reset_simulation_event(
        event_id: uuid.UUID,
        session: SessionDep,
        actor: ActorDep,
    ) -> PocSimulationResetResponse:
        trigger = session.get(PocSimulationEvent, event_id)
        if trigger is None or trigger.operation != "trigger" or trigger.event_type not in STATE_SIMULATION_EVENTS:
            raise HTTPException(404, "Active simulation event not found")
        product = find_product(session, trigger.product_id)
        require_product_owner(product, actor)
        already_reset = session.scalar(
            select(PocSimulationEvent).where(PocSimulationEvent.trigger_event_id == trigger.id)
        )
        if already_reset is not None:
            raise HTTPException(409, "The simulation event has already been reset")
        before = trigger.before_state
        product.discoverable = bool(before["discoverable"])
        product.classification = str(before["classification"])
        product.extra_metadata = metadata_without_alert(
            dict(before.get("metadata", {})),
            trigger.id,
        )
        product.revision += 1
        product.updated_at = utc_now()
        reset_event = PocSimulationEvent(
            id=uuid.uuid4(),
            event_type=trigger.event_type,
            operation="reset",
            product_id=product.id,
            product_urn=product.urn,
            fixture_id=trigger.fixture_id,
            actor_user_id=actor,
            trigger_event_id=trigger.id,
            before_state=trigger.after_state,
            after_state={
                "discoverable": product.discoverable,
                "classification": product.classification,
                "metadata": product.extra_metadata,
            },
        )
        session.add(reset_event)
        task = session.scalar(
            select(WorkflowTask).where(WorkflowTask.simulation_event_id == trigger.id)
        )
        if task is not None:
            task.status = "completed"
            task.completed_at = utc_now()
            task.updated_at = task.completed_at
        audit(
            session,
            "data-product",
            str(product.id),
            f"poc-simulation-{trigger.event_type}-reset",
            actor,
            product.revision,
            {"simulationEventId": str(trigger.id)},
        )
        if trigger.event_type in {"not_discoverable", "isbo_restricted"}:
            quality = quality_response(session, product)
            product.quality = {
                "score": quality.score,
                "medal": quality.medal,
                "criteria": [item.model_dump(by_alias=True) for item in quality.criteria],
            }
        session.commit()
        session.refresh(reset_event)
        return PocSimulationResetResponse(
            reset_event=simulation_event_response(reset_event, active=False)
        )

    @router.post(
        "/poc/data-products/{product_id}/reset",
        response_model=PocSimulationResetResponse,
        tags=["POC simulation"],
    )
    def reset_fixture_product(
        product_id: uuid.UUID,
        body: PocProductResetRequest,
        session: SessionDep,
        actor: ActorDep,
    ) -> PocSimulationResetResponse:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        user = actor_profile(session, actor)
        if body.confirmation_name != user.display_name:
            raise HTTPException(422, "confirmationName must exactly match the active demo identity")
        fixture = fixture_for_product(session, product)
        publication = session.scalar(
            select(MetadataPublication).where(MetadataPublication.data_product_id == product.id)
        )
        if publication is None:
            raise HTTPException(409, "The fixture publication cannot be reset")
        submitted = session.scalar(
            select(PocSimulationEvent)
            .where(
                PocSimulationEvent.product_id == product.id,
                PocSimulationEvent.event_type == "product_submitted",
                PocSimulationEvent.operation == "trigger",
            )
            .order_by(PocSimulationEvent.created_at.desc())
        )
        snapshot = {
            "product": DataProductResponse.model_validate(product).model_dump(mode="json", by_alias=True),
            "publication": publication.normalized_payload,
        }
        for active in active_simulation_events(session, product_id=product.id):
            session.add(
                PocSimulationEvent(
                    id=uuid.uuid4(),
                    event_type=active.event_type,
                    operation="reset",
                    product_id=product.id,
                    product_urn=product.urn,
                    fixture_id=fixture.id,
                    actor_user_id=actor,
                    trigger_event_id=active.id,
                    before_state=active.after_state,
                    after_state={"reason": "physical_fixture_reset"},
                )
            )
        reset_event = PocSimulationEvent(
            id=uuid.uuid4(),
            event_type="product_submitted",
            operation="product_reset",
            product_id=product.id,
            product_urn=product.urn,
            fixture_id=fixture.id,
            actor_user_id=actor,
            trigger_event_id=submitted.id if submitted else None,
            confirmation_name=body.confirmation_name,
            before_state=snapshot,
            after_state={"deleted": True, "reinjectable": True},
        )
        session.add(reset_event)
        audit(
            session,
            "data-product",
            str(product.id),
            "poc-fixture-product-reset",
            actor,
            product.revision,
            {
                "fixtureId": fixture.id,
                "productUrn": product.urn,
                "resetEventId": str(reset_event.id),
            },
        )
        session.execute(
            update(ProvenanceEvent)
            .where(ProvenanceEvent.data_product_id == product.id)
            .values(data_product_id=None)
        )
        # Keep the reset deterministic even when an isolated test connection has
        # foreign-key cascades disabled. Order matters for semantic mappings.
        session.execute(
            delete(ProductSemanticMapping).where(
                ProductSemanticMapping.data_product_id == product.id
            )
        )
        policy_ids = list(
            session.scalars(
                select(PolicyRevision.id).where(PolicyRevision.data_product_id == product.id)
            )
        )
        if policy_ids:
            session.execute(
                delete(PolicyDeployment).where(
                    PolicyDeployment.policy_revision_id.in_(policy_ids)
                )
            )
        session.execute(delete(PolicyRevision).where(PolicyRevision.data_product_id == product.id))
        session.execute(delete(AccessRequest).where(AccessRequest.data_product_id == product.id))
        session.execute(
            delete(MetadataDeliveryOutbox).where(
                MetadataDeliveryOutbox.data_product_id == product.id
            )
        )
        session.execute(delete(Endpoint).where(Endpoint.data_product_id == product.id))
        session.execute(
            delete(ProductContextGraph).where(ProductContextGraph.data_product_id == product.id)
        )
        session.execute(
            delete(ProductQualityAssessment).where(
                ProductQualityAssessment.data_product_id == product.id
            )
        )
        session.execute(delete(WorkflowTask).where(WorkflowTask.data_product_id == product.id))
        session.execute(
            delete(MetadataPublication).where(MetadataPublication.data_product_id == product.id)
        )
        session.execute(delete(DataProductField).where(DataProductField.data_product_id == product.id))
        session.flush()
        session.delete(product)
        session.commit()
        session.refresh(reset_event)
        return PocSimulationResetResponse(
            reset_event=simulation_event_response(reset_event, active=False),
            deleted_product_id=product_id,
        )

    @router.get("/data-products", response_model=DataProductPage, tags=["data products"])
    def list_data_products(
        session: SessionDep,
        actor: OptionalActorDep,
        limit: Annotated[int, Query(ge=1, le=100)] = 25,
        cursor: str | None = None,
    ) -> DataProductPage:
        visibility = (
            or_(DataProduct.owner_user_id == actor, DataProduct.discoverable.is_(True))
            if actor
            else DataProduct.discoverable.is_(True)
        )
        statement = select(DataProduct).where(visibility).order_by(DataProduct.id).limit(limit + 1)
        if cursor:
            statement = statement.where(DataProduct.id > decode_cursor(cursor))
        rows = list(session.scalars(statement))
        has_more = len(rows) > limit
        items = rows[:limit]
        return DataProductPage(
            items=[DataProductSummary.model_validate(item) for item in items],
            next_cursor=encode_cursor(items[-1].id) if has_more and items else None,
        )

    @router.get("/data-products/{product_id}", response_model=DataProductResponse, tags=["data products"])
    def get_data_product(product_id: uuid.UUID, response: Response, session: SessionDep, actor: OptionalActorDep) -> DataProduct:
        product = find_product(session, product_id)
        if not product.discoverable and product.owner_user_id != actor:
            raise HTTPException(404, "Data product not found")
        response.headers["ETag"] = etag_for_revision(product.revision)
        return product

    @router.patch("/data-products/{product_id}", response_model=DataProductResponse, tags=["data products"])
    def patch_data_product(
        product_id: uuid.UUID,
        patch: DataProductPatch,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> DataProduct:
        current = find_product(session, product_id)
        require_revision(if_match, current.revision)
        changes = patch.model_dump(exclude_unset=True, by_alias=False)
        if "metadata" in changes:
            changes["extra_metadata"] = changes.pop("metadata")
        next_revision = current.revision + 1
        values = {**changes, "revision": next_revision, "updated_at": utc_now()}
        result = session.execute(
            update(DataProduct)
            .where(DataProduct.id == product_id, DataProduct.revision == current.revision)
            .values(**values)
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            session.rollback()
            raise HTTPException(412, "The product was changed by another editor")
        audit(
            session,
            "data-product",
            str(product_id),
            "metadata-updated",
            actor,
            next_revision,
            {"changedFields": sorted(to_camel(field) for field in patch.model_fields_set)},
        )
        session.expire(current)
        session.refresh(current)
        enqueue_active_i14y_delivery(session, current)
        session.commit()
        response.headers["ETag"] = etag_for_revision(next_revision)
        return current

    @router.get("/ontology/versions/current", response_model=OntologyVersionResponse, tags=["ontology"])
    def get_current_ontology_version(session: SessionDep) -> CanonicalOntologyVersion:
        version = session.scalar(select(CanonicalOntologyVersion).where(CanonicalOntologyVersion.active.is_(True)).limit(1))
        if version is None:
            raise HTTPException(404, "No active canonical ontology version exists")
        return version

    @router.get("/ontology/terms", response_model=list[OntologyTermResponse], tags=["ontology"])
    def list_ontology_terms(
        session: SessionDep,
        kind: Literal["class", "property", "concept"] | None = None,
        q: str | None = None,
    ) -> list[OntologyTermResponse]:
        version = session.scalar(select(CanonicalOntologyVersion).where(CanonicalOntologyVersion.active.is_(True)).limit(1))
        if version is None:
            return []
        statement = select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.ontology_version_id == version.id)
        if kind:
            statement = statement.where(CanonicalOntologyTerm.kind == kind)
        if q and q.strip():
            needle = f"%{q.strip()}%"
            statement = statement.where(or_(CanonicalOntologyTerm.label.ilike(needle), CanonicalOntologyTerm.uri.ilike(needle)))
        return [OntologyTermResponse.model_validate({"id": term.id, "ontologyVersionId": term.ontology_version_id, "uri": term.uri, "kind": term.kind, "label": term.label, "definition": term.definition, "alignments": []}) for term in session.scalars(statement.order_by(CanonicalOntologyTerm.kind, CanonicalOntologyTerm.label))]

    @router.get("/data-products/{product_id}/quality", tags=["quality"])
    def get_product_quality(product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep) -> dict[str, Any]:
        product = find_product(session, product_id)
        if not product.discoverable and product.owner_user_id != actor:
            raise HTTPException(404, "Data product not found")
        fields = list(session.scalars(select(DataProductField).where(DataProductField.data_product_id == product_id).order_by(DataProductField.name)))
        graph = session.get(ProductContextGraph, product_id)
        mappings = list(session.scalars(select(ProductSemanticMapping).where(ProductSemanticMapping.data_product_id == product_id)))
        terms = {term.id: term for term in session.scalars(select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.id.in_([mapping.ontology_term_id for mapping in mappings])))} if mappings else {}
        quality = quality_response(session, product)
        session.commit()
        return {
            "quality": quality.model_dump(mode="json", by_alias=True),
            "fields": [{"id": str(field.id), "name": field.name, "dataType": field.data_type, "nullable": field.nullable, "keyField": field.key_field, "businessDescription": field.business_description} for field in fields],
            "graph": graph.graph if graph else None,
            "graphStatus": graph.status if graph else "missing",
            "mappings": [{"id": str(mapping.id), "fieldId": str(mapping.data_product_field_id) if mapping.data_product_field_id else None, "mappingType": mapping.mapping_type, "status": mapping.status, "termUri": terms[mapping.ontology_term_id].uri, "termLabel": terms[mapping.ontology_term_id].label} for mapping in mappings if mapping.ontology_term_id in terms],
        }

    @router.put("/data-products/{product_id}/quality", response_model=ProductQualityResponse, tags=["quality"])
    def review_product_quality(
        product_id: uuid.UUID,
        body: ProductQualityReview,
        session: SessionDep,
        actor: ActorDep,
    ) -> ProductQualityResponse:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        fields = {field.id: field for field in session.scalars(select(DataProductField).where(DataProductField.data_product_id == product_id))}
        if {item.id for item in body.fields} != set(fields):
            raise HTTPException(422, "The quality review must include every schema field exactly once")
        if not any(item.key_field for item in body.fields):
            raise HTTPException(422, "At least one schema field must be marked as a key field")
        version = session.scalar(select(CanonicalOntologyVersion).where(CanonicalOntologyVersion.active.is_(True)).limit(1))
        if version is None:
            raise HTTPException(409, "No active canonical ontology version exists")
        class_term = session.scalar(select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.ontology_version_id == version.id, CanonicalOntologyTerm.kind == "class", CanonicalOntologyTerm.uri == body.product_class_uri))
        if class_term is None:
            raise HTTPException(422, "productClassUri must reference a class in the active canonical ontology")

        resolved_terms: dict[uuid.UUID, CanonicalOntologyTerm] = {}
        for item in body.fields:
            field_row = fields[item.id]
            field_row.key_field = item.key_field
            field_row.business_description = item.business_description.strip() if item.business_description else None
            if item.key_field:
                if not item.ontology_term_uri:
                    raise HTTPException(422, f"Key field {field_row.name} needs a canonical ontology mapping")
                term = session.scalar(select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.ontology_version_id == version.id, CanonicalOntologyTerm.kind == "property", CanonicalOntologyTerm.uri == item.ontology_term_uri))
                if term is None:
                    raise HTTPException(422, f"Ontology term for key field {field_row.name} is invalid")
                resolved_terms[item.id] = term

        product.title = body.title.strip()
        product.description = body.description.strip()
        product.domain = body.domain.strip()
        product.classification = body.classification
        product.contact = {**product.contact, "email": body.contact_email.strip().lower()}
        product.update_frequency = body.update_frequency.strip()
        product.revision += 1
        product.updated_at = utc_now()
        assessment = session.get(ProductQualityAssessment, product_id) or ProductQualityAssessment(data_product_id=product_id)
        assessment.dcat_reviewed = body.dcat_reviewed
        session.add(assessment)
        graph = session.get(ProductContextGraph, product_id)
        if graph is None:
            graph = ProductContextGraph(data_product_id=product_id, graph=body.graph)
            session.add(graph)
        graph.graph = body.graph
        graph.status = "confirmed" if body.graph_confirmed else "suggested"
        graph.confirmed_by = actor if body.graph_confirmed else None

        session.execute(delete(ProductSemanticMapping).where(ProductSemanticMapping.data_product_id == product_id))
        session.add(ProductSemanticMapping(id=uuid.uuid4(), data_product_id=product_id, data_product_field_id=None, ontology_term_id=class_term.id, mapping_type="product_class", status="confirmed", confirmed_by=actor))
        for field_id, term in resolved_terms.items():
            session.add(ProductSemanticMapping(id=uuid.uuid4(), data_product_id=product_id, data_product_field_id=field_id, ontology_term_id=term.id, mapping_type="field_property", status="confirmed", confirmed_by=actor))
        session.flush()
        quality = quality_response(session, product)
        if quality.dcat_reviewed and all(item.complete for item in quality.criteria if item.id in {"technical", "business", "graph", "ontology"}):
            complete_tasks(session, product_id, "metadata_quality")
        access_task_open = session.scalar(select(WorkflowTask.id).where(WorkflowTask.data_product_id == product_id, WorkflowTask.task_type == "access_governance", WorkflowTask.status != "completed"))
        if access_task_open is None and product.discoverable:
            product.lifecycle = "active"
            quality = quality_response(session, product)
        product.quality = {"score": quality.score, "medal": quality.medal, "criteria": [item.model_dump(by_alias=True) for item in quality.criteria]}
        audit(session, "data-product", str(product_id), "quality-reviewed", actor, product.revision, {"score": quality.score, "medal": quality.medal, "ontology": ONTOLOGY_URI})
        enqueue_active_i14y_delivery(session, product)
        session.commit()
        return quality

    @router.get("/data-products/{product_id}/semantic-mappings", response_model=list[SemanticMappingResponse], tags=["ontology"])
    def get_semantic_mappings(product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep) -> list[SemanticMappingResponse]:
        product = find_product(session, product_id)
        if not product.discoverable and product.owner_user_id != actor:
            raise HTTPException(404, "Data product not found")
        rows = session.execute(select(ProductSemanticMapping, CanonicalOntologyTerm).join(CanonicalOntologyTerm, CanonicalOntologyTerm.id == ProductSemanticMapping.ontology_term_id).where(ProductSemanticMapping.data_product_id == product_id)).all()
        return [SemanticMappingResponse.model_validate({"id": mapping.id, "dataProductId": mapping.data_product_id, "dataProductFieldId": mapping.data_product_field_id, "ontologyTermId": term.id, "termUri": term.uri, "termLabel": term.label, "mappingType": mapping.mapping_type, "status": mapping.status, "confirmedBy": mapping.confirmed_by}) for mapping, term in rows]

    @router.put("/data-products/{product_id}/semantic-mappings", response_model=list[SemanticMappingResponse], tags=["ontology"])
    def put_semantic_mappings(
        product_id: uuid.UUID,
        body: SemanticMappingsUpdate,
        session: SessionDep,
        actor: ActorDep,
    ) -> list[SemanticMappingResponse]:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        version = session.scalar(select(CanonicalOntologyVersion).where(CanonicalOntologyVersion.active.is_(True)).limit(1))
        if version is None:
            raise HTTPException(409, "No active canonical ontology version exists")
        class_term = session.scalar(select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.ontology_version_id == version.id, CanonicalOntologyTerm.kind == "class", CanonicalOntologyTerm.uri == body.product_class_uri))
        if class_term is None:
            raise HTTPException(422, "productClassUri must reference a class in the active canonical ontology")
        fields = {field.id: field for field in session.scalars(select(DataProductField).where(DataProductField.data_product_id == product_id))}
        field_ids = [item.field_id for item in body.field_mappings]
        if len(field_ids) != len(set(field_ids)) or any(field_id not in fields for field_id in field_ids):
            raise HTTPException(422, "Each field mapping must reference a distinct field of this product")
        term_by_field: dict[uuid.UUID, CanonicalOntologyTerm] = {}
        for item in body.field_mappings:
            term = session.scalar(select(CanonicalOntologyTerm).where(CanonicalOntologyTerm.ontology_version_id == version.id, CanonicalOntologyTerm.kind == "property", CanonicalOntologyTerm.uri == item.term_uri))
            if term is None:
                raise HTTPException(422, f"termUri for field {fields[item.field_id].name} must reference a property in the active canonical ontology")
            term_by_field[item.field_id] = term

        session.execute(delete(ProductSemanticMapping).where(ProductSemanticMapping.data_product_id == product_id))
        session.add(ProductSemanticMapping(id=uuid.uuid4(), data_product_id=product_id, data_product_field_id=None, ontology_term_id=class_term.id, mapping_type="product_class", status=body.product_class_status, confirmed_by=actor if body.product_class_status == "confirmed" else None))
        for item in body.field_mappings:
            session.add(ProductSemanticMapping(id=uuid.uuid4(), data_product_id=product_id, data_product_field_id=item.field_id, ontology_term_id=term_by_field[item.field_id].id, mapping_type="field_property", status=item.status, confirmed_by=actor if item.status == "confirmed" else None))
        product.revision += 1
        product.updated_at = utc_now()
        session.flush()
        quality = quality_response(session, product)
        product.quality = {"score": quality.score, "medal": quality.medal, "criteria": [item.model_dump(by_alias=True) for item in quality.criteria]}
        audit(session, "data-product", str(product_id), "semantic-mappings-updated", actor, product.revision, {"ontologyVersion": version.uri, "fieldMappings": len(body.field_mappings)})
        enqueue_active_i14y_delivery(session, product)
        session.commit()
        return get_semantic_mappings(product_id, session, actor)

    @router.get("/data-products/{product_id}/semantic-profile", tags=["ontology"])
    def get_semantic_profile(product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep) -> dict[str, Any]:
        product = find_product(session, product_id)
        if not product.discoverable and product.owner_user_id != actor:
            raise HTTPException(404, "Data product not found")
        return semantic_profile_payload(session, product)

    @router.post("/data-products/{product_id}/access-governance", response_model=PolicyRevisionResponse, status_code=201, tags=["workflow"])
    def create_access_governance(
        product_id: uuid.UUID,
        body: AccessGovernanceCreate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> PolicyRevisionResponse:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        product.discoverable = body.discoverable
        assessment = session.get(ProductQualityAssessment, product_id) or ProductQualityAssessment(data_product_id=product_id)
        assessment.discoverability_confirmed = True
        session.add(assessment)
        current = latest_policy(session, product_id)
        revision = (current.revision if current else 0) + 1
        resolved_grants = [
            resolve_policy_grant(
                session,
                grant.model_dump(mode="json", by_alias=True),
                actor=actor,
            )
            for grant in body.grants
        ]
        person_ids = [grant["subject"]["id"] for grant in resolved_grants if grant["subject"]["type"] == "person"]
        machine_ids = [grant["subject"]["id"] for grant in resolved_grants if grant["subject"]["type"] == "machine"]
        group_ids = [grant["subject"]["id"] for grant in resolved_grants if grant["subject"]["type"] == "group"]
        definition = {
            "defaultEffect": "deny",
            "effect": "allow",
            "subjects": {"userIds": person_ids, "machineIds": machine_ids, "groupIds": group_ids},
            "resources": {"productUrns": [product.urn], "owners": [product.owner]},
            "actions": ["data.read"],
            "protocols": sorted({protocol for grant in resolved_grants for protocol in grant["protocols"]}) or ["http"],
            "grants": resolved_grants,
        }
        policy = PolicyRevision(id=uuid.uuid4(), data_product_id=product_id, revision=revision, status="draft", definition=definition, generated_rego=generate_rego(), created_by=actor)
        session.add(policy)
        audit(session, "policy", str(product_id), "access-governance-draft-created", actor, revision, {"grants": len(resolved_grants), "discoverable": body.discoverable})
        session.commit()
        policy.deployments = []
        response.headers["ETag"] = etag_for_revision(revision)
        return policy_response(policy)

    @router.get(
        "/access-requests/mine",
        response_model=list[AccessRequestResponse],
        tags=["access requests"],
    )
    def list_all_my_access_requests(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[AccessRequest]:
        return list(
            session.scalars(
                select(AccessRequest)
                .where(AccessRequest.requester_id == actor)
                .order_by(AccessRequest.created_at.desc())
            )
        )

    @router.get(
        "/access-requests/inbox",
        response_model=list[AccessRequestResponse],
        tags=["access requests"],
    )
    def list_owner_access_request_inbox(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[AccessRequest]:
        open_requests = session.scalars(
            select(AccessRequest)
            .where(
                AccessRequest.status.in_(("submitted", "identity_review", "legal_review", "conditions_review", "approved_policy_pending"))
            )
            .options(selectinload(AccessRequest.data_product))
            .order_by(AccessRequest.created_at.desc())
        )
        result: list[AccessRequest] = []
        for access_request in open_requests:
            if access_request.data_product.owner_user_id == actor:
                result.append(access_request)
                continue
            usage = access_request.data_product.extra_metadata.get("catalogUsage", {})
            responsible_user_ids = usage.get("responsibleUserIds", []) if isinstance(usage, dict) else []
            if actor in responsible_user_ids:
                result.append(access_request)
        return result

    @router.get(
        "/access-consumers/owned",
        response_model=list[OwnedAccessConsumerResponse],
        tags=["access requests"],
    )
    def list_owned_access_consumers(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[OwnedAccessConsumerResponse]:
        """Return active, deduplicated consumers for products owned by the demo actor."""
        today = utc_now().date()
        active_requests = session.scalars(
            select(AccessRequest)
            .where(
                AccessRequest.status.in_(("granted_modified", "granted_original")),
                AccessRequest.valid_from <= today,
                AccessRequest.valid_until >= today,
            )
            .options(selectinload(AccessRequest.data_product))
            .order_by(AccessRequest.data_product_id, AccessRequest.requester_name, AccessRequest.created_at)
        )
        grouped: dict[tuple[uuid.UUID, str, str], dict[str, Any]] = {}
        for access_request in active_requests:
            usage = access_request.data_product.extra_metadata.get("catalogUsage", {})
            responsible_user_ids = usage.get("responsibleUserIds", []) if isinstance(usage, dict) else []
            if actor not in responsible_user_ids:
                continue

            identity_id = (
                access_request.machine_id
                if access_request.consumer_type == "machine"
                else access_request.requester_id
            )
            if not identity_id:
                continue
            key = (access_request.data_product_id, access_request.consumer_type, identity_id)
            consumer = grouped.setdefault(
                key,
                {
                    "data_product_id": access_request.data_product_id,
                    "consumer_type": access_request.consumer_type,
                    "identity_id": identity_id,
                    "display_name": (
                        identity_id
                        if access_request.consumer_type == "machine"
                        else access_request.requester_name
                    ),
                    "organization": access_request.requester_organization,
                    "grants": [],
                },
            )
            consumer["grants"].append(
                {
                    "request_number": access_request.request_number,
                    "protocol": access_request.requested_protocol,
                    "variant": (
                        "original" if access_request.status == "granted_original" else "modified"
                    ),
                    "valid_from": access_request.valid_from,
                    "valid_until": access_request.valid_until,
                }
            )

        return [
            OwnedAccessConsumerResponse.model_validate(consumer)
            for consumer in sorted(
                grouped.values(),
                key=lambda item: (
                    str(item["data_product_id"]),
                    item["consumer_type"],
                    item["display_name"].casefold(),
                ),
            )
        ]

    @router.get(
        "/data-products/{product_id}/access-requests/mine",
        response_model=list[AccessRequestResponse],
        tags=["access requests"],
    )
    def list_my_access_requests(
        product_id: uuid.UUID,
        session: SessionDep,
        actor: ActorDep,
    ) -> list[AccessRequest]:
        find_product(session, product_id)
        return list(
            session.scalars(
                select(AccessRequest)
                .where(
                    AccessRequest.data_product_id == product_id,
                    AccessRequest.requester_id == actor,
                )
                .order_by(AccessRequest.created_at.desc())
            )
        )

    @router.post(
        "/data-products/{product_id}/access-requests",
        response_model=AccessRequestResponse,
        status_code=201,
        tags=["access requests"],
    )
    def create_access_request(
        product_id: uuid.UUID,
        body: AccessRequestCreate,
        session: SessionDep,
        actor: ActorDep,
    ) -> AccessRequest:
        product = find_product(session, product_id)
        usage = product.extra_metadata.get("catalogUsage", {})
        responsible_user_ids = usage.get("responsibleUserIds", []) if isinstance(usage, dict) else []
        if actor in responsible_user_ids:
            raise HTTPException(409, "Data owners already have access and cannot request their own product")

        identity = actor_profile(session, actor)
        access_request = AccessRequest(
            id=uuid.uuid4(),
            request_number=f"ZA-{utc_now():%Y}-{uuid.uuid4().hex[:8].upper()}",
            data_product_id=product.id,
            requester_id=actor,
            requester_name=identity.display_name,
            requester_organization=identity.organization,
            contact_email=body.contact_email,
            consumer_type=body.consumer_type,
            machine_id=body.machine_id,
            purpose=body.purpose,
            legal_basis=body.legal_basis,
            requested_protocol=body.requested_protocol,
            requested_variant=body.requested_variant,
            valid_from=body.valid_from,
            valid_until=body.valid_until,
            notes=body.notes,
            status="submitted",
        )
        session.add(access_request)
        if product.owner_user_id:
            session.add(
                WorkflowTask(
                    id=stable_id(f"task:access-request:{access_request.id}"),
                    task_type="access_request_review",
                    status="open",
                    assignee_user_id=product.owner_user_id,
                    data_product_id=product.id,
                    access_request_id=access_request.id,
                    title=f"Zugriffsanfrage von {identity.display_name}",
                    detail="Zugriffsantrag prüfen und bei Genehmigung eine PBAC-Policy vorbereiten.",
                )
            )
        audit(
            session,
            "access-request",
            str(access_request.id),
            "submitted",
            actor,
            None,
            {
                "requestNumber": access_request.request_number,
                "dataProductId": str(product.id),
                "consumerType": body.consumer_type,
                "requestedProtocol": body.requested_protocol,
            },
        )
        session.commit()
        session.refresh(access_request)
        return access_request

    @router.post("/access-requests/{access_request_id}/decision", tags=["access requests"])
    def decide_access_request(
        access_request_id: uuid.UUID,
        body: AccessRequestDecision,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        access_request = session.get(AccessRequest, access_request_id)
        if access_request is None:
            raise HTTPException(404, "Access request not found")
        product = find_product(session, access_request.data_product_id)
        require_product_owner(product, actor)
        if access_request.status not in {"submitted", "identity_review", "legal_review", "conditions_review"}:
            raise HTTPException(409, "Only an open access request can be decided")
        task = session.scalar(select(WorkflowTask).where(WorkflowTask.access_request_id == access_request_id, WorkflowTask.task_type == "access_request_review"))
        if body.decision == "reject":
            access_request.status = "rejected"
            access_request.notes = "\n".join(filter(None, [access_request.notes, body.comment])) or None
            access_request.updated_at = utc_now()
            if task:
                task.status = "completed"
                task.completed_at = utc_now()
                task.updated_at = utc_now()
            audit(session, "access-request", str(access_request.id), "rejected", actor, None, {"comment": body.comment})
            session.commit()
            return {"request": AccessRequestResponse.model_validate(access_request).model_dump(mode="json", by_alias=True), "policy": None}

        current = latest_policy(session, product.id)
        normalized = definition_as_camel(current.definition) if current else {"grants": []}
        requested_protocols = ["http", "postgresql"] if access_request.requested_protocol == "both" else [access_request.requested_protocol]
        supported_protocols = {
            "http" if endpoint.protocol == "http-rest" else "postgresql"
            for endpoint in session.scalars(select(Endpoint).where(Endpoint.data_product_id == product.id))
        }
        grant_protocols = [protocol for protocol in requested_protocols if protocol in supported_protocols]
        if not grant_protocols:
            raise HTTPException(422, "The requested protocol is not offered by this product")
        identity_id = access_request.machine_id if access_request.consumer_type == "machine" else access_request.requester_id
        if not identity_id:
            raise HTTPException(422, "The access request has no usable identity")
        grant = {
            "subject": {"type": access_request.consumer_type, "id": identity_id},
            "actions": ["data.read"],
            "protocols": grant_protocols,
            "validFrom": access_request.valid_from.isoformat(),
            "validUntil": access_request.valid_until.isoformat(),
            "dataVariant": body.granted_variant,
        }
        grants = [item for item in normalized.get("grants", []) if not (item.get("subject", {}).get("type") == grant["subject"]["type"] and item.get("subject", {}).get("id") == grant["subject"]["id"])]
        grants.append(grant)
        revision = (current.revision if current else 0) + 1
        definition = {
            "defaultEffect": "deny",
            "effect": "allow",
            "subjects": {
                "userIds": [item["subject"]["id"] for item in grants if item["subject"]["type"] == "person"],
                "machineIds": [item["subject"]["id"] for item in grants if item["subject"]["type"] == "machine"],
            },
            "resources": {"productUrns": [product.urn], "owners": [product.owner]},
            "actions": ["data.read"],
            "protocols": sorted({protocol for item in grants for protocol in item["protocols"]}),
            "grants": grants,
        }
        policy = PolicyRevision(id=uuid.uuid4(), data_product_id=product.id, revision=revision, status="draft", definition=definition, generated_rego=generate_rego(), created_by=actor)
        session.add(policy)
        access_request.requested_variant = body.granted_variant or access_request.requested_variant
        access_request.status = "approved_policy_pending"
        access_request.notes = "\n".join(filter(None, [access_request.notes, body.comment])) or None
        access_request.updated_at = utc_now()
        if task:
            task.status = "in_progress"
            task.updated_at = utc_now()
        audit(session, "access-request", str(access_request.id), "approved-policy-draft-created", actor, revision, {"policyRevisionId": str(policy.id), "variant": body.granted_variant})
        session.commit()
        policy.deployments = []
        return {
            "request": AccessRequestResponse.model_validate(access_request).model_dump(mode="json", by_alias=True),
            "policy": policy_response(policy).model_dump(mode="json", by_alias=True),
        }

    @router.get(
        "/data-products/{product_id}/endpoints",
        response_model=list[EndpointResponse],
        tags=["endpoints"],
    )
    def list_endpoints(product_id: uuid.UUID, session: SessionDep) -> list[Any]:
        find_product(session, product_id)
        endpoints = session.scalars(
            select(Endpoint).where(Endpoint.data_product_id == product_id).order_by(Endpoint.name)
        )
        return [endpoint_response(endpoint) for endpoint in endpoints]

    @router.post(
        "/data-products/{product_id}/endpoints",
        response_model=EndpointResponse,
        status_code=201,
        tags=["endpoints"],
    )
    def create_endpoint(
        product_id: uuid.UUID,
        body: EndpointCreate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> Any:
        product = find_product(session, product_id)
        require_revision(if_match, product.revision)
        next_revision = product.revision + 1
        result = session.execute(
            update(DataProduct)
            .where(DataProduct.id == product_id, DataProduct.revision == product.revision)
            .values(revision=next_revision, updated_at=utc_now())
            .execution_options(synchronize_session=False)
        )
        if result.rowcount != 1:
            session.rollback()
            raise HTTPException(412, "The product was changed by another editor")
        endpoint = Endpoint(
            id=uuid.uuid4(),
            data_product_id=product_id,
            name=body.name,
            description=body.description,
            protocol=body.protocol,
            connection=body.connection.model_dump(by_alias=True),
            secret_ref=body.secret_ref,
        )
        session.add(endpoint)
        audit(session, "data-product", str(product_id), "endpoint-created", actor, next_revision, {"endpointId": str(endpoint.id)})
        session.flush()
        session.expire(product)
        session.refresh(product)
        enqueue_active_i14y_delivery(session, product)
        session.commit()
        response.headers["ETag"] = etag_for_revision(next_revision)
        return endpoint_response(endpoint)

    @router.get("/data-products/{product_id}/lineage", response_model=LineageResponse, tags=["lineage"])
    def get_lineage(product_id: uuid.UUID, session: SessionDep) -> LineageResponse:
        product = find_product(session, product_id)
        edges = list(
            session.scalars(
                select(LineageEdge)
                .where(or_(LineageEdge.source_urn == product.urn, LineageEdge.target_urn == product.urn))
                .order_by(LineageEdge.created_at, LineageEdge.id)
            )
        )
        return LineageResponse(product_urn=product.urn, edges=[LineageEdgeResponse.model_validate(edge) for edge in edges])

    @router.get(
        "/data-products/{product_id}/provenance",
        response_model=list[ProvenanceEventResponse],
        tags=["provenance"],
    )
    def get_provenance(product_id: uuid.UUID, session: SessionDep) -> list[ProvenanceEvent]:
        find_product(session, product_id)
        return list(
            session.scalars(
                select(ProvenanceEvent)
                .where(ProvenanceEvent.data_product_id == product_id)
                .order_by(ProvenanceEvent.sequence)
            )
        )

    @router.get(
        "/data-products/{product_id}/audit-events",
        response_model=list[AuditEventResponse],
        tags=["audit"],
    )
    def get_audit_events(product_id: uuid.UUID, session: SessionDep) -> list[AuditEvent]:
        find_product(session, product_id)
        return list(
            session.scalars(
                select(AuditEvent)
                .where(AuditEvent.resource_id == str(product_id))
                .order_by(AuditEvent.occurred_at.desc())
            )
        )

    @router.get(
        "/data-products/{product_id}/policies",
        response_model=PolicyRevisionPage,
        tags=["policies"],
    )
    def list_policies(product_id: uuid.UUID, session: SessionDep) -> PolicyRevisionPage:
        find_product(session, product_id)
        policies = list(
            session.scalars(
                select(PolicyRevision)
                .where(PolicyRevision.data_product_id == product_id)
                .order_by(PolicyRevision.revision.desc())
                .options(selectinload(PolicyRevision.deployments))
            )
        )
        return PolicyRevisionPage(items=[policy_response(policy) for policy in policies])

    @router.get(
        "/data-products/{product_id}/policies/latest",
        response_model=PolicyRevisionResponse,
        tags=["policies"],
    )
    def get_latest_policy(product_id: uuid.UUID, response: Response, session: SessionDep) -> PolicyRevisionResponse:
        find_product(session, product_id)
        policy = latest_policy(session, product_id)
        if policy is None:
            raise HTTPException(404, "No policy exists for this product")
        response.headers["ETag"] = etag_for_revision(policy.revision)
        return policy_response(policy)

    @router.post(
        "/data-products/{product_id}/policies",
        response_model=PolicyRevisionResponse,
        status_code=201,
        tags=["policies"],
    )
    def create_policy_draft(
        product_id: uuid.UUID,
        body: PolicyCreate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> PolicyRevisionResponse:
        product = find_product(session, product_id)
        current = latest_policy(session, product_id)
        current_revision = current.revision if current else 0
        require_revision(if_match, current_revision)
        definition = body.definition.model_dump(by_alias=True)
        if definition["resources"]["productUrns"] != [product.urn] or definition["resources"]["owners"] != [
            product.owner
        ]:
            raise HTTPException(422, "Policy resource selectors must identify exactly this product URN and owner")
        if definition.get("grants"):
            definition["grants"] = [
                resolve_policy_grant(session, grant, actor=actor) for grant in definition["grants"]
            ]
            definition["subjects"] = {
                "userIds": sorted(
                    grant["subject"]["id"]
                    for grant in definition["grants"]
                    if grant["subject"]["type"] == "person"
                ),
                "machineIds": sorted(
                    grant["subject"]["id"]
                    for grant in definition["grants"]
                    if grant["subject"]["type"] == "machine"
                ),
                "groupIds": sorted(
                    grant["subject"]["id"]
                    for grant in definition["grants"]
                    if grant["subject"]["type"] == "group"
                ),
            }
        policy = PolicyRevision(
            id=uuid.uuid4(),
            data_product_id=product_id,
            revision=current_revision + 1,
            status="draft",
            definition=definition,
            generated_rego=generate_rego(),
            created_by=actor,
        )
        session.add(policy)
        audit(session, "policy", str(product_id), "draft-created", actor, policy.revision, {"policyRevisionId": str(policy.id)})
        session.commit()
        policy.deployments = []
        response.headers["ETag"] = etag_for_revision(policy.revision)
        return policy_response(policy)

    @router.put(
        "/data-products/{product_id}/access-settings",
        response_model=PolicyRevisionResponse,
        status_code=201,
        tags=["policies"],
    )
    def upsert_access_setting(
        product_id: uuid.UUID,
        body: AccessSettingUpsert,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> PolicyRevisionResponse:
        """Create one draft grant while preserving the currently active grants."""
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        current = latest_policy(session, product_id)
        current_revision = current.revision if current else 0
        require_revision(if_match, current_revision)

        incoming = resolve_policy_grant(
            session, body.grant.model_dump(mode="json", by_alias=True), actor=actor
        )
        active = active_published_policy(session, product)
        existing = (
            definition_as_camel(active.definition).get("grants", []) if active else []
        )
        incoming_key = (incoming["subject"]["type"], incoming["subject"]["id"])
        grants = [
            grant
            for grant in existing
            if (grant["subject"]["type"], grant["subject"]["id"]) != incoming_key
        ]
        grants.append(incoming)
        person_ids = sorted(
            {grant["subject"]["id"] for grant in grants if grant["subject"]["type"] == "person"}
        )
        machine_ids = sorted(
            {grant["subject"]["id"] for grant in grants if grant["subject"]["type"] == "machine"}
        )
        group_ids = sorted(
            {grant["subject"]["id"] for grant in grants if grant["subject"]["type"] == "group"}
        )
        definition = {
            "defaultEffect": "deny",
            "effect": "allow",
            "subjects": {
                "userIds": person_ids,
                "machineIds": machine_ids,
                "groupIds": group_ids,
            },
            "resources": {"productUrns": [product.urn], "owners": [product.owner]},
            "actions": ["data.read"],
            "protocols": sorted(
                {protocol for grant in grants for protocol in grant["protocols"]}
            ) or ["http"],
            "grants": grants,
        }
        policy = PolicyRevision(
            id=uuid.uuid4(),
            data_product_id=product_id,
            revision=current_revision + 1,
            status="draft",
            definition=definition,
            generated_rego=generate_rego(),
            created_by=actor,
        )
        session.add(policy)
        audit(
            session,
            "policy",
            str(product_id),
            "access-setting-draft-upserted",
            actor,
            policy.revision,
            {"subjectType": incoming_key[0], "subjectId": incoming_key[1]},
        )
        session.commit()
        policy.deployments = []
        response.headers["ETag"] = etag_for_revision(policy.revision)
        return policy_response(policy)

    @router.post(
        "/data-products/{product_id}/policies/{policy_id}/publish",
        response_model=PolicyRevisionResponse,
        status_code=201,
        tags=["policies"],
    )
    def publish_policy(
        request: Request,
        product_id: uuid.UUID,
        policy_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> PolicyRevisionResponse:
        product = find_product(session, product_id)
        source = session.get(PolicyRevision, policy_id)
        current = latest_policy(session, product_id)
        if source is None or source.data_product_id != product_id:
            raise HTTPException(404, "Policy revision not found")
        if current is None or current.id != source.id:
            raise HTTPException(409, "Only the latest policy revision can be published")
        require_revision(if_match, current.revision)
        if source.status != "draft":
            raise HTTPException(409, "Only a draft policy can be published")
        revision = source.revision + 1
        published = PolicyRevision(
            id=uuid.uuid4(),
            data_product_id=product_id,
            revision=revision,
            status="published",
            definition=source.definition,
            generated_rego=generate_rego(),
            created_by=actor,
            published_at=utc_now(),
        )
        projection = project_to_postgresql(request.app.state.settings, product_id, revision, published.definition)
        if projection.state != "deployed":
            raise HTTPException(
                503,
                "PostgreSQL policy projection did not deploy; the active policy was retained: "
                f"{projection.error}",
            )
        opa_deployment = PolicyDeployment(
            id=uuid.uuid4(), policy_revision=published, target="opa", desired_revision=revision, state="pending"
        )
        pg_deployment = PolicyDeployment(
            id=uuid.uuid4(),
            policy_revision=published,
            target="postgresql",
            desired_revision=revision,
            observed_revision=projection.observed_revision,
            state=projection.state,
            error=projection.error,
        )
        product.active_policy_revision = revision
        session.add_all([published, opa_deployment, pg_deployment])
        session.flush()
        quality = quality_response(session, product)
        product.quality = {"score": quality.score, "medal": quality.medal, "criteria": [item.model_dump(by_alias=True) for item in quality.criteria]}
        audit(session, "policy", str(product_id), "published", actor, revision, {"sourceRevision": source.revision})
        session.commit()

        session.refresh(published)
        response.headers["ETag"] = etag_for_revision(revision)
        return policy_response(published)

    @router.post(
        "/data-products/{product_id}/policies/{policy_id}/revoke",
        response_model=PolicyRevisionResponse,
        status_code=201,
        tags=["policies"],
    )
    def revoke_policy(
        request: Request,
        product_id: uuid.UUID,
        policy_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> PolicyRevisionResponse:
        product = find_product(session, product_id)
        target = session.get(PolicyRevision, policy_id)
        current = latest_policy(session, product_id)
        if target is None or target.data_product_id != product_id:
            raise HTTPException(404, "Policy revision not found")
        if current is None:
            raise HTTPException(409, "No policy can be revoked")
        require_revision(if_match, current.revision)
        if target.status != "published" or product.active_policy_revision != target.revision:
            raise HTTPException(409, "Only the active published policy can be revoked")
        revision = current.revision + 1
        projection = project_to_postgresql(request.app.state.settings, product_id, revision, None)
        if projection.state != "deployed":
            raise HTTPException(
                503,
                f"PostgreSQL revocation projection did not deploy; the active policy was retained: {projection.error}",
            )
        revoked = PolicyRevision(
            id=uuid.uuid4(),
            data_product_id=product_id,
            revision=revision,
            status="revoked",
            definition=target.definition,
            generated_rego=generate_rego(),
            created_by=actor,
            published_at=utc_now(),
        )
        opa_deployment = PolicyDeployment(
            id=uuid.uuid4(), policy_revision=revoked, target="opa", desired_revision=revision, state="pending"
        )
        pg_deployment = PolicyDeployment(
            id=uuid.uuid4(),
            policy_revision=revoked,
            target="postgresql",
            desired_revision=revision,
            observed_revision=projection.observed_revision,
            state=projection.state,
            error=projection.error,
        )
        product.active_policy_revision = None
        session.add_all([revoked, opa_deployment, pg_deployment])
        audit(session, "policy", str(product_id), "revoked", actor, revision, {"revokedRevision": target.revision})
        session.commit()

        session.refresh(revoked)
        response.headers["ETag"] = etag_for_revision(revision)
        return policy_response(revoked)

    @router.get(
        "/data-products/{product_id}/policy-deployments",
        response_model=list[PolicyDeploymentResponse],
        tags=["policies"],
    )
    def list_policy_deployments(product_id: uuid.UUID, session: SessionDep) -> list[PolicyDeployment]:
        find_product(session, product_id)
        return list(
            session.scalars(
                select(PolicyDeployment)
                .join(PolicyRevision)
                .where(PolicyRevision.data_product_id == product_id)
                .order_by(PolicyDeployment.updated_at.desc())
            )
        )

    @router.get("/opa/bundles/catalog.tar.gz", tags=["OPA"], include_in_schema=True)
    def get_opa_bundle(
        response: Response,
        session: SessionDep,
        if_none_match: Annotated[str | None, Header(alias="If-None-Match")] = None,
    ) -> Response:
        active, fingerprint = active_bundle_state(session)
        etag = f'"{fingerprint}"'
        if if_none_match == etag:
            return Response(status_code=304, headers={"ETag": etag})
        content = build_opa_bundle(active, fingerprint)
        return Response(
            content=content,
            media_type="application/vnd.openpolicyagent.bundles",
            headers={"ETag": etag, "Cache-Control": "no-cache"},
        )

    return router


def create_app(
    *,
    settings: Settings | None = None,
    session_factory: sessionmaker[Session] | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    resolved_session_factory = session_factory or default_session_factory(resolved_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if resolved_settings.seed_on_startup:
            with resolved_session_factory() as session:
                seed_catalog(session)
        yield

    app = FastAPI(
        title=resolved_settings.app_name,
        version=__version__,
        summary="Metadata catalog and policy administration point for BIT DaCa",
        root_path=resolved_settings.root_path,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.session_factory = resolved_session_factory
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "OPTIONS"],
        allow_headers=["Content-Type", "If-Match", "If-None-Match", "X-DaCa-User", "X-Request-ID"],
        expose_headers=["ETag", "X-Request-ID"],
    )

    @app.middleware("http")
    async def request_context(request: Request, call_next: Any) -> Response:
        supplied = request.headers.get("X-Request-ID", "")
        request.state.request_id = supplied[:128] if supplied else str(uuid.uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    install_problem_handlers(app)
    app.include_router(create_router())

    @app.get("/health/live", response_model=HealthResponse, tags=["health"])
    def live() -> HealthResponse:
        return HealthResponse(status="ok", service="catalog-api", version=__version__)

    @app.get(
        "/health/ready",
        response_model=HealthResponse,
        tags=["health"],
        responses={503: {"description": "The catalog persistence service is unavailable."}},
    )
    def ready(session: SessionDep) -> HealthResponse:
        try:
            session.execute(text("SELECT 1"))
        except Exception as exc:
            raise HTTPException(503, "Catalog database is unavailable") from exc
        return HealthResponse(status="ready", service="catalog-api", version=__version__)

    @app.put(
        "/internal/v1/policy-deployments/acknowledge",
        response_model=PolicyDeploymentResponse,
        tags=["internal"],
        include_in_schema=False,
    )
    def acknowledge_deployment(
        acknowledgement: DeploymentAcknowledgement,
        session: SessionDep,
        authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    ) -> PolicyDeployment:
        expected = f"Bearer {resolved_settings.internal_token}"
        if authorization is None or not secrets.compare_digest(authorization, expected):
            raise HTTPException(401, "A valid internal deployment token is required")
        deployment = session.scalar(
            select(PolicyDeployment).where(
                PolicyDeployment.policy_revision_id == acknowledgement.policy_revision_id,
                PolicyDeployment.target == acknowledgement.target,
            )
        )
        if deployment is None:
            raise HTTPException(404, "Policy deployment not found")
        if acknowledgement.observed_revision != deployment.desired_revision:
            raise HTTPException(409, "Observed revision does not match the desired revision")
        deployment.observed_revision = acknowledgement.observed_revision
        deployment.state = acknowledgement.state
        deployment.error = acknowledgement.error
        deployment.updated_at = utc_now()
        session.flush()
        if deployment.state == "deployed":
            policy = session.get(PolicyRevision, deployment.policy_revision_id)
            product = (
                session.get(DataProduct, policy.data_product_id) if policy is not None else None
            )
            if product is not None and policy is not None:
                finalize_policy_activation(session, product, policy)
        session.commit()
        return deployment

    @app.post(
        "/api/v1/internal/opa/status",
        tags=["internal"],
        include_in_schema=False,
    )
    def observe_opa_status(
        status_payload: dict[str, Any],
        session: SessionDep,
        authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    ) -> dict[str, Any]:
        """Map OPA's global bundle fingerprint back to the current numeric policy revisions."""
        expected_token = f"Bearer {resolved_settings.internal_token}"
        if authorization is None or not secrets.compare_digest(authorization, expected_token):
            raise HTTPException(401, "A valid internal status token is required")

        bundle_status = status_payload.get("bundles", {}).get("daca", {})
        observed_bundle_revision = bundle_status.get("active_revision")
        _active, expected_bundle_revision = active_bundle_state(session)
        if observed_bundle_revision != expected_bundle_revision:
            return {
                "status": "awaiting-current-bundle",
                "expectedBundleRevision": expected_bundle_revision,
                "observedBundleRevision": observed_bundle_revision,
            }

        pending = list(
            session.scalars(
                select(PolicyDeployment)
                .options(selectinload(PolicyDeployment.policy_revision))
                .where(PolicyDeployment.target == "opa", PolicyDeployment.state == "pending")
            )
        )
        deployed = 0
        for deployment in pending:
            current = latest_policy(session, deployment.policy_revision.data_product_id)
            if current is not None and current.id == deployment.policy_revision_id:
                deployment.state = "deployed"
                deployment.observed_revision = deployment.desired_revision
                deployment.error = None
                deployed += 1
                session.flush()
                product = session.get(
                    DataProduct, deployment.policy_revision.data_product_id
                )
                if product is not None:
                    finalize_policy_activation(session, product, deployment.policy_revision)
            else:
                deployment.state = "failed"
                deployment.error = "Superseded before this global OPA bundle was observed"
            deployment.updated_at = utc_now()
        session.commit()
        return {
            "status": "observed",
            "bundleRevision": observed_bundle_revision,
            "deploymentsAcknowledged": deployed,
        }

    return app


app = create_app()
