from __future__ import annotations

import base64
import hashlib
import json
import secrets
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date, timedelta
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter
from rdflib import DCTERMS, RDF, SKOS, Graph, URIRef
from rdflib import Literal as RdfLiteral
from rdflib.namespace import DCAT
from sqlalchemy import delete, exists, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload, sessionmaker

from . import get_runtime_version
from .access_renewals import (
    ACCESS_RENEWAL_PRODUCT_ID,
    access_request_response,
    create_renewal_request,
    effective_access_response,
    owned_access_consumers,
    renewal_policy_definition,
    zurich_today,
)
from .access_renewals import (
    fixture_response as access_renewal_fixture_response,
)
from .access_renewals import (
    prepare_fixture as prepare_access_renewal_fixture,
)
from .access_renewals import (
    reset_fixture as reset_access_renewal_fixture,
)
from .control_people import assign_default_control_person, is_active_publication_approver
from .database import default_session_factory, get_session
from .deputy_owners import assign_default_deputy_owner
from .documentation_read import catalog_responsibilities, glossary_entries, role_change_history
from .domain_glossary_seed import (
    ARMOURED_VEHICLE_PROPOSAL_ID,
    DEFENCE_DOMAIN_ID,
    DEFENCE_REQUEST_ID,
    DOMAIN_GLOSSARY_SEED_NAME,
    MOBILITY_DOMAIN_ID,
    VEHICLE_PRODUCT_ID,
)
from .glossary_reference_seed import GLOSSARY_REFERENCE_SEED_NAME
from .governance import (
    bind_access_request_fulfillments,
    can_view_private_product,
    create_renewal_submission,
    create_submission,
    decide_submission,
    finalize_submission_deployment,
)
from .governance import (
    response_payload as governance_response_payload,
)
from .i14y_public_api import I14YPublicApiPort, VerifiedI14YPublicApi
from .i14y_publication import DisabledI14YPublicationAdapter, I14YPublicationPort
from .logical_model_review_api import create_logical_model_review_router
from .mapping_inconsistency_api import create_mapping_inconsistency_router
from .modeling_api import create_modeling_router
from .modeling_assistance_api import create_modeling_assistance_router
from .modeling_lifecycle_api import create_modeling_lifecycle_router
from .modeling_resources_api import create_modeling_resources_router
from .modeling_seed import seed_modeling_catalog
from .models import (
    AccessRequest,
    AdministrativeOrganization,
    AdministrativeOrganizationLabel,
    AuditEvent,
    CanonicalOntologyTerm,
    CanonicalOntologyVersion,
    DataProduct,
    DataProductDomain,
    DataProductField,
    DataProductGlossaryTerm,
    DemoLoginSession,
    DemoUser,
    Domain,
    DomainChangeRequest,
    DomainLocalization,
    Endpoint,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermProposal,
    GlossaryTermProposalReview,
    GlossaryTermRelation,
    GovernanceSubmission,
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
    SeedMarker,
    ServiceLevelRevision,
    SiteGlossaryLocalization,
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
from .product_activity import is_privileged_product_auditor
from .product_activity import product_activity as build_product_activity
from .schemas import (
    AccessGovernanceCreate,
    AccessRenewalCreate,
    AccessRequestCreate,
    AccessRequestDecision,
    AccessRequestDecisionResponse,
    AccessRequestFulfillment,
    AccessRequestResponse,
    AccessSettingUpsert,
    AdministrativeOrganizationResponse,
    AuditEventResponse,
    ControlPersonUpdate,
    ControlPersonUpdateResponse,
    DataProductPage,
    DataProductPatch,
    DataProductQualitySummary,
    DataProductResponse,
    DataProductSummary,
    DemoUserResponse,
    DeploymentAcknowledgement,
    DomainChangeRequestCreate,
    DomainChangeRequestResponse,
    DomainChangeRequestUpdate,
    DomainDirectCreate,
    DomainDirectUpdate,
    DomainResponse,
    EndpointCreate,
    EndpointReadResponse,
    EndpointResponse,
    GlossaryTermProposalCreate,
    GlossaryTermProposalResponse,
    GlossaryTermProposalUpdate,
    GlossaryTermResponse,
    GovernanceDecision,
    GovernanceDecisionCreate,
    GovernanceSubmissionCreate,
    GovernanceSubmissionResponse,
    HealthResponse,
    IdentityDirectoryEntryResponse,
    IdentityGroupCreate,
    IdentityGroupDetailResponse,
    IdentityGroupSummaryResponse,
    LineageEdgeResponse,
    LineageResponse,
    MetadataDeliveryOutboxResponse,
    MetadataPublicationCreate,
    MetadataPublicationResponse,
    OntologyTermResponse,
    OntologyVersionResponse,
    OwnedAccessConsumerResponse,
    PocAccessRenewalFixtureResponse,
    PocDomainGlossaryAction,
    PocDomainGlossaryFixtureResponse,
    PocGuideConfigResponse,
    PocProductFixtureResponse,
    PocProductResetRequest,
    PocSimulationEventResponse,
    PocSimulationResetResponse,
    PocSimulationTriggerResponse,
    PolicyCreate,
    PolicyDeploymentResponse,
    PolicyRevisionPage,
    PolicyRevisionResponse,
    PolicySubject,
    ProductActivityResponse,
    ProductEffectiveAccessResponse,
    ProductQualityResponse,
    ProductQualityReview,
    ProductQualityWorkspaceResponse,
    ProvenanceEventResponse,
    SemanticMappingResponse,
    SemanticMappingsUpdate,
    SemanticSuggestionResponse,
    ServiceLevelDecisionCreate,
    ServiceLevelRevisionListResponse,
    ServiceLevelRevisionResponse,
    ServiceLevelRevisionWrite,
    ServiceLevelSummaryResponse,
    SourceAccessContextResponse,
    SourceAccessDecision,
    SourceAccessGrantResponse,
    SourceAccessRequestCreate,
    SourceAccessRequestResponse,
    SourceCatalogPage,
    WorkflowTaskResponse,
    to_camel,
)
from .seed import seed_catalog
from .semantic_suggestions import RapidFuzzSuggestionProvider, SuggestionCandidate
from .service_levels import (
    actor_can_view_revision as can_view_service_level_revision,
)
from .service_levels import (
    actor_is_revision_privileged as is_service_level_revision_privileged,
)
from .service_levels import (
    audit_control_person_change,
    control_person_change_blocked,
    product_control_person,
)
from .service_levels import (
    create_revision as create_service_level_revision,
)
from .service_levels import (
    decide_revision as decide_service_level_revision,
)
from .service_levels import (
    lock_product as lock_service_level_product,
)
from .service_levels import (
    lock_revision as lock_service_level_revision,
)
from .service_levels import (
    revision_etag as service_level_etag,
)
from .service_levels import (
    revision_response as service_level_revision_response,
)
from .service_levels import (
    submit_revision as submit_service_level_revision,
)
from .service_levels import (
    summary_response as service_level_summary_response,
)
from .service_levels import (
    update_revision as update_service_level_revision,
)
from .service_levels import (
    visible_revisions as visible_service_level_revisions,
)
from .service_levels import (
    withdraw_revision as withdraw_service_level_revision,
)
from .settings import Settings, get_settings
from .site_glossary_seed import seed_site_glossary_terms
from .source_access import (
    access_context as source_access_context,
)
from .source_access import (
    catalog_page as source_catalog_page,
)
from .source_access import (
    create_request as create_source_access_request,
)
from .source_access import (
    decide_request as decide_source_access_request,
)
from .source_access import (
    grants_for_actor as source_grants_for_actor,
)
from .source_access import (
    requests_for_actor as source_requests_for_actor,
)
from .source_access import (
    requests_for_owner as source_requests_for_owner,
)
from .terminology_api import create_terminology_router
from .workflow_seed import ONTOLOGY_URI, stable_id, term_uri

SessionDep = Annotated[Session, Depends(get_session)]
endpoint_adapter = TypeAdapter(EndpointResponse)
endpoint_read_adapter = TypeAdapter(EndpointReadResponse)


def require_demo_actor(
    request: Request,
    x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None,
) -> str:
    """Resolve the local demo actor without accepting caller headers in production mode."""
    settings: Settings = request.app.state.settings
    if not settings.daca_demo_auth:
        raise HTTPException(
            503, "Demo identity is disabled and no production identity provider is configured"
        )
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


def local_session_user(session: Session, request: Request) -> DemoUser:
    token = request.cookies.get("daca_session")
    if not token:
        raise HTTPException(401, "No local catalog session")
    entry = session.get(DemoLoginSession, hashlib.sha256(token.encode()).hexdigest())
    if entry is None or entry.revoked_at is not None or entry.expires_at <= utc_now():
        raise HTTPException(401, "Local catalog session expired")
    return actor_profile(session, entry.user_id)


def personal_preference_user(
    session: Session, request: Request, x_daca_user: str | None
) -> DemoUser:
    if request.cookies.get("daca_session"):
        return local_session_user(session, request)
    return actor_profile(session, require_demo_actor(request, x_daca_user))


DEMO_ACTOR_PROFILES: dict[str, tuple[str, str]] = {
    "kassandra.valdata": ("Kassandra Valdata", "ESTV"),
}


def daaif_ontology_suggestion(source_product_id: str, field_name: str | None = None) -> str | None:
    """Return reviewed PoC ontology candidates without confirming them for the owner."""
    if "kantonale-gewerbesteuer" not in source_product_id.casefold():
        return None
    if field_name is None:
        return term_uri("CorporateTaxForecastDataset")
    normalized = "".join(character for character in field_name.casefold() if character.isalnum())
    if "cantoncode" in normalized or "kantoncode" in normalized:
        return term_uri("CantonCode")
    if "taxyear" in normalized or "steuerjahr" in normalized:
        return term_uri("TaxYear")
    if "annualplan" in normalized or "jahresplan" in normalized or "planned" in normalized:
        return term_uri("PlannedAmount")
    if "forecast" in normalized or "hochrechnung" in normalized or "projection" in normalized:
        return term_uri("ForecastAmount")
    if any(
        marker in normalized
        for marker in (
            "actualreceipt",
            "actualamount",
            "effektivgemeldet",
            "istbetrag",
            "isteingang",
        )
    ):
        return term_uri("ActualAmount")
    return None


def etag_for_revision(revision: int) -> str:
    return f'"{revision}"'


def require_revision(if_match: str | None, current_revision: int) -> None:
    if if_match is None:
        raise HTTPException(428, "If-Match is required for this versioned resource")
    candidates = {candidate.strip() for candidate in if_match.split(",")}
    accepted = {etag_for_revision(current_revision), f"W/{etag_for_revision(current_revision)}"}
    if not candidates.intersection(accepted):
        raise HTTPException(
            412, f"The current revision is {current_revision}; reload the resource and retry"
        )


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
    pending_renewals: dict[uuid.UUID, PolicyRevision] = {}
    for submission in session.scalars(
        select(GovernanceSubmission).where(GovernanceSubmission.status == "approved_deploying")
    ):
        if submission.review_snapshot.get("workflowKind") != "access_renewal":
            continue
        pending = session.get(PolicyRevision, submission.policy_revision_id)
        if pending is not None and pending.status == "published":
            pending_renewals[submission.data_product_id] = pending

    active: list[ActivePolicy] = []
    for product in session.scalars(select(DataProduct).order_by(DataProduct.id)):
        policy = pending_renewals.get(product.id)
        if policy is None and product.active_policy_revision is not None:
            policy = session.scalar(
                select(PolicyRevision).where(
                    PolicyRevision.data_product_id == product.id,
                    PolicyRevision.revision == product.active_policy_revision,
                    PolicyRevision.status == "published",
                )
            )
        if policy is not None:
            active.append(ActivePolicy(policy=policy, product=product))
    fingerprint_source = {
        "compiler": "daca-pbac-compiler/2",
        "regoSha256": hashlib.sha256(generate_rego().encode()).hexdigest(),
        "data": bundle_data(active),
    }
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_source, sort_keys=True).encode()
    ).hexdigest()[:20]
    return active, fingerprint


def opa_bundle_failure(bundle_status: Any) -> str | None:
    """Extract an explicit OPA download or activation failure from a status report."""
    if not isinstance(bundle_status, dict):
        return None
    code = bundle_status.get("code")
    errors = bundle_status.get("errors")
    http_code = bundle_status.get("http_code")
    erroneous_http_code = isinstance(http_code, int) and http_code >= 400
    if not code and not errors and not erroneous_http_code:
        return None
    details = [str(code)] if code else []
    message = bundle_status.get("message")
    if message:
        details.append(str(message))
    if erroneous_http_code:
        details.append(f"HTTP {http_code}")
    if errors:
        details.append(json.dumps(errors, ensure_ascii=False, sort_keys=True))
    return "; ".join(details)[:1000] or "OPA bundle activation failed"


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
        "organizationId": group.organization_id,
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
            raise HTTPException(
                422, "The selected identity group is not available to this identity"
            )
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
        (term.uri for mapping, term in rows if mapping.mapping_type == "product_class"),
        None,
    )
    field_mappings = [
        {"field": fields[mapping.data_product_field_id].name, "property": term.uri}
        for mapping, term in rows
        if mapping.mapping_type == "field_property" and mapping.data_product_field_id in fields
    ]
    domain_ids = _product_domain_ids(session, product.id)
    domains = (
        list(
            session.scalars(
                select(Domain).where(Domain.id.in_(domain_ids), Domain.lifecycle == "active")
            )
        )
        if domain_ids
        else []
    )
    terms = list(
        session.scalars(
            select(GlossaryTerm)
            .join(
                DataProductGlossaryTerm,
                DataProductGlossaryTerm.glossary_term_id == GlossaryTerm.id,
            )
            .where(
                DataProductGlossaryTerm.data_product_id == product.id,
                GlossaryTerm.lifecycle == "active",
            )
        )
    )
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
        "dcat:theme": [{"@id": domain.urn} for domain in domains] if domains else product.domain,
        "dcterms:subject": [{"@id": term.urn} for term in terms],
        "dcat:distribution": (
            {
                "@type": "dcat:Distribution",
                "dcat:accessURL": (
                    f"{endpoint.connection.get('baseUrl', '')}{endpoint.connection.get('path', '')}"
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


def lock_policy_deployment_workflow(
    session: Session,
    policy_revision_id: uuid.UUID,
    target: str,
) -> tuple[GovernanceSubmission | None, PolicyDeployment | None]:
    """Serialize a governance deployment transition in a stable lock order."""
    submission = session.scalar(
        select(GovernanceSubmission)
        .where(GovernanceSubmission.policy_revision_id == policy_revision_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    deployment = session.scalar(
        select(PolicyDeployment)
        .where(
            PolicyDeployment.policy_revision_id == policy_revision_id,
            PolicyDeployment.target == target,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    return submission, deployment


def finalize_policy_activation(
    session: Session,
    product: DataProduct,
    policy: PolicyRevision,
    settings: Settings,
) -> bool:
    """Apply post-deployment effects only after both enforcement targets agree."""
    finalize_submission_deployment(session, product, policy, settings)
    if not policy_is_fully_deployed(session, policy):
        return False
    complete_tasks(session, product.id, "access_governance")
    pending_requests = session.scalars(
        select(AccessRequest).where(
            AccessRequest.data_product_id == product.id,
            AccessRequest.status == "approved_policy_pending",
            AccessRequest.decision_policy_revision_id == policy.id,
        )
    )
    for pending_request in pending_requests:
        if not access_request_is_covered_by_policy(pending_request, policy.definition):
            continue
        pending_request.status = (
            "granted_modified"
            if pending_request.granted_variant == "modified"
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


def access_request_is_covered_by_policy(
    access_request: AccessRequest, definition: dict[str, Any]
) -> bool:
    """Verify the immutable request-to-policy binding before granting access."""
    if not access_request.fulfillment_subject_type or not access_request.fulfillment_subject_id:
        return False
    normalized = definition_as_camel(definition)
    requested_protocols = (
        ["http", "postgresql"]
        if access_request.requested_protocol == "both"
        else [access_request.requested_protocol]
    )
    for grant in normalized.get("grants", []):
        subject = grant.get("subject", {})
        if subject.get("type") != access_request.fulfillment_subject_type:
            continue
        if subject.get("id") != access_request.fulfillment_subject_id:
            continue
        if sorted(grant.get("protocols", [])) != sorted(requested_protocols):
            continue
        if grant.get("validFrom") != access_request.valid_from.isoformat():
            continue
        if grant.get("validUntil") != access_request.valid_until.isoformat():
            continue
        if grant.get("dataVariant") != access_request.granted_variant:
            continue
        if subject.get("type") == "group":
            snapshot = grant.get("groupSnapshot") or {}
            if snapshot.get("membershipRevision") != access_request.fulfillment_group_revision:
                continue
            if access_request.requester_id not in snapshot.get("memberIds", []):
                continue
        elif (
            subject.get("type") == "person" and subject.get("id") != access_request.requester_id
        ) or (subject.get("type") == "machine" and subject.get("id") != access_request.machine_id):
            continue
        return True
    return False


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


def endpoint_read_response(endpoint: Endpoint) -> Any:
    """Describe connectivity without returning the stored secret reference."""
    public_connection_keys = (
        ("baseUrl", "path", "method", "mediaType")
        if endpoint.protocol == "http-rest"
        else ("host", "port", "database", "schema", "relation", "sslMode")
    )
    return endpoint_read_adapter.validate_python(
        {
            "id": endpoint.id,
            "dataProductId": endpoint.data_product_id,
            "name": endpoint.name,
            "description": endpoint.description,
            "protocol": endpoint.protocol,
            "connection": {
                key: endpoint.connection[key]
                for key in public_connection_keys
                if key in endpoint.connection
            },
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


def requires_four_eyes(session: Session, product: DataProduct) -> bool:
    publication = session.scalar(
        select(MetadataPublication).where(
            MetadataPublication.data_product_id == product.id,
            MetadataPublication.publication_mode == "governance_review",
        )
    )
    # Four-eyes is a property of the publication contract. A missing or
    # ineligible controller must fail closed during submission; it must never
    # reopen the legacy single-person publication path.
    return publication is not None


def reject_legacy_governance_path(session: Session, product: DataProduct) -> None:
    if requires_four_eyes(session, product):
        raise HTTPException(
            409,
            "This product requires a governance submission and four-eyes publication approval",
        )
    active_submission = session.scalar(
        select(GovernanceSubmission.id).where(
            GovernanceSubmission.data_product_id == product.id,
            GovernanceSubmission.status.in_(
                ("pending_approval", "approved_deploying", "deployment_failed")
            ),
        )
    )
    if active_submission is not None:
        raise HTTPException(
            409,
            "An active governance submission must be completed before changing policies",
        )


def require_product_view(session: Session, product: DataProduct, actor: str | None) -> None:
    """Hide non-public catalog resources from identities outside the review."""
    if not can_view_private_product(session, product, actor):
        raise HTTPException(404, "Data product not found")


def require_policy_evidence_view(session: Session, product: DataProduct, actor: str | None) -> None:
    """Restrict raw subjects, generated Rego and deployment errors to governance roles."""
    if actor == product.control_person_user_id:
        return
    if not is_privileged_product_auditor(session, product, actor):
        raise HTTPException(
            403,
            "Policy evidence is restricted to the data owner and assigned approvers",
        )


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


def quality_medal(score: int) -> Literal["bronze", "silver", "gold", "platinum"]:
    if score == 6:
        return "platinum"
    if score == 5:
        return "gold"
    if score == 4:
        return "silver"
    return "bronze"


def quality_responses(
    session: Session,
    products: list[DataProduct],
    *,
    persist: bool = False,
) -> dict[uuid.UUID, ProductQualityResponse]:
    """Calculate canonical quality for a product set with a fixed number of queries."""
    if not products:
        return {}

    product_ids = [product.id for product in products]
    assessments = {
        assessment.data_product_id: assessment
        for assessment in session.scalars(
            select(ProductQualityAssessment).where(
                ProductQualityAssessment.data_product_id.in_(product_ids)
            )
        )
    }

    fields_by_product: dict[uuid.UUID, list[DataProductField]] = {
        product_id: [] for product_id in product_ids
    }
    for field in session.scalars(
        select(DataProductField).where(DataProductField.data_product_id.in_(product_ids))
    ):
        fields_by_product[field.data_product_id].append(field)

    endpoint_product_ids = set(
        session.scalars(
            select(Endpoint.data_product_id).where(Endpoint.data_product_id.in_(product_ids))
        )
    )
    graphs = {
        graph.data_product_id: graph
        for graph in session.scalars(
            select(ProductContextGraph).where(ProductContextGraph.data_product_id.in_(product_ids))
        )
    }
    mappings_by_product: dict[uuid.UUID, list[ProductSemanticMapping]] = {
        product_id: [] for product_id in product_ids
    }
    for mapping in session.scalars(
        select(ProductSemanticMapping).where(
            ProductSemanticMapping.data_product_id.in_(product_ids)
        )
    ):
        mappings_by_product[mapping.data_product_id].append(mapping)

    active_version = session.scalar(
        select(CanonicalOntologyVersion).where(CanonicalOntologyVersion.active.is_(True)).limit(1)
    )
    active_term_ids: set[uuid.UUID] = set()
    if active_version is not None:
        active_term_ids = set(
            session.scalars(
                select(CanonicalOntologyTerm.id).where(
                    CanonicalOntologyTerm.ontology_version_id == active_version.id
                )
            )
        )

    published_policies = list(
        session.scalars(
            select(PolicyRevision)
            .where(
                PolicyRevision.data_product_id.in_(product_ids),
                PolicyRevision.status == "published",
            )
            .options(selectinload(PolicyRevision.deployments))
        )
    )
    policies_by_revision = {
        (policy.data_product_id, policy.revision): policy for policy in published_policies
    }

    responses: dict[uuid.UUID, ProductQualityResponse] = {}
    now = utc_now()
    for product in products:
        assessment = assessments.get(product.id)
        fields = fields_by_product[product.id]
        mappings = mappings_by_product[product.id]
        confirmed = [mapping for mapping in mappings if mapping.status == "confirmed"]
        product_classes = [
            mapping
            for mapping in confirmed
            if mapping.mapping_type == "product_class" and mapping.data_product_field_id is None
        ]
        key_fields = [field for field in fields if field.key_field]
        mapped_field_ids = {
            mapping.data_product_field_id
            for mapping in confirmed
            if mapping.mapping_type == "field_property"
        }
        policy = policies_by_revision.get((product.id, product.active_policy_revision))
        deployment_states = (
            {deployment.target: deployment.state for deployment in policy.deployments}
            if policy is not None
            else {}
        )

        access_management_defined = bool(
            deployment_states.get("opa") == "deployed"
            and deployment_states.get("postgresql") == "deployed"
        )
        discoverability_confirmed = bool(
            assessment is not None and assessment.discoverability_confirmed
        )
        dcat_reviewed = bool(assessment is not None and assessment.dcat_reviewed)
        technical_metadata_complete = bool(
            fields
            and product.id in endpoint_product_ids
            and all(field.name and field.data_type for field in fields)
        )
        business_metadata_complete = bool(
            dcat_reviewed
            and product.title.strip()
            and len(product.description.strip()) >= 20
            and session.scalar(
                select(DataProductDomain.domain_id)
                .join(Domain, Domain.id == DataProductDomain.domain_id)
                .where(
                    DataProductDomain.data_product_id == product.id,
                    Domain.lifecycle == "active",
                )
                .limit(1)
            )
            and product.contact.get("email")
            and product.update_frequency
            and all(
                field.business_description and field.business_description.strip()
                for field in fields
            )
        )
        graph = graphs.get(product.id)
        graph_confirmed = graph is not None and graph.status == "confirmed"
        ontology_embedded = bool(
            active_version
            and len(product_classes) == 1
            and product_classes[0].ontology_term_id in active_term_ids
            and key_fields
            and all(field.id in mapped_field_ids for field in key_fields)
            and all(mapping.ontology_term_id in active_term_ids for mapping in confirmed)
            and not any(mapping.status != "confirmed" for mapping in mappings)
        )
        criteria = [
            ("access", access_management_defined),
            (
                "discoverability",
                discoverability_confirmed
                and product.discoverable
                and product.lifecycle == "active",
            ),
            ("technical", technical_metadata_complete),
            ("business", business_metadata_complete),
            ("graph", graph_confirmed),
            ("ontology", ontology_embedded),
        ]
        score = sum(1 for _, complete in criteria if complete)
        medal = quality_medal(score)

        if persist:
            if assessment is None:
                assessment = ProductQualityAssessment(data_product_id=product.id)
                session.add(assessment)
                assessments[product.id] = assessment
            assessment.access_management_defined = access_management_defined
            assessment.technical_metadata_complete = technical_metadata_complete
            assessment.business_metadata_complete = business_metadata_complete
            assessment.graph_confirmed = graph_confirmed
            assessment.ontology_embedded = ontology_embedded
            assessment.score = score
            assessment.medal = medal
            assessment.updated_at = now

        responses[product.id] = ProductQualityResponse(
            data_product_id=product.id,
            score=score,
            medal=medal,
            criteria=[
                {"id": criterion_id, "label": QUALITY_LABELS[criterion_id], "complete": complete}
                for criterion_id, complete in criteria
            ],
            dcat_reviewed=dcat_reviewed,
        )

    if persist:
        session.flush()
    return responses


def quality_response(session: Session, product: DataProduct) -> ProductQualityResponse:
    return quality_responses(session, [product], persist=True)[product.id]


def _normalized_label(value: str) -> str:
    return " ".join(value.casefold().split())


def _canonical_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def _has_role(user: DemoUser, role: str) -> bool:
    return role in (user.roles or [])


def _require_role(session: Session, actor: str, role: str, detail: str) -> DemoUser:
    user = actor_profile(session, actor)
    if not _has_role(user, role):
        raise HTTPException(403, detail)
    return user


def _require_active_data_owner(session: Session, user_id: str) -> DemoUser:
    user = session.get(DemoUser, user_id)
    if user is None or not user.active or not _has_role(user, "data_owner"):
        raise HTTPException(422, f"{user_id} is not an active data owner")
    return user


def _preferred_localization(localizations: list[Any], language: str = "de") -> Any | None:
    return next(
        (item for item in localizations if item.language.casefold() == language.casefold()),
        localizations[0] if localizations else None,
    )


def _domain_response(session: Session, domain: Domain) -> DomainResponse:
    localizations = list(
        session.scalars(
            select(DomainLocalization)
            .where(DomainLocalization.domain_id == domain.id)
            .order_by(DomainLocalization.language)
        )
    )
    preferred = _preferred_localization(localizations)
    return DomainResponse.model_validate(
        {
            **{column.name: getattr(domain, column.name) for column in Domain.__table__.columns},
            "preferredLabel": preferred.preferred_label if preferred else domain.urn,
            "localizations": localizations,
            "productCount": session.scalar(
                select(func.count())
                .select_from(DataProductDomain)
                .where(DataProductDomain.domain_id == domain.id)
            )
            or 0,
            "termCount": session.scalar(
                select(func.count())
                .select_from(GlossaryTermDomain)
                .where(GlossaryTermDomain.domain_id == domain.id)
            )
            or 0,
        }
    )


def _term_response(session: Session, term: GlossaryTerm) -> GlossaryTermResponse:
    localizations = list(
        session.scalars(
            select(GlossaryTermLocalization)
            .where(GlossaryTermLocalization.term_id == term.id)
            .order_by(GlossaryTermLocalization.language)
        )
    )
    domain_ids = list(
        session.scalars(
            select(GlossaryTermDomain.domain_id).where(GlossaryTermDomain.term_id == term.id)
        )
    )
    relations = list(
        session.scalars(
            select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id == term.id)
        )
    )
    relation_responses: list[dict[str, Any]] = []
    for relation in relations:
        target_label = relation.target_uri or "Verknüpfter Term"
        if relation.target_term_id is not None:
            target_localizations = list(
                session.scalars(
                    select(GlossaryTermLocalization)
                    .where(GlossaryTermLocalization.term_id == relation.target_term_id)
                    .order_by(GlossaryTermLocalization.language)
                )
            )
            target_preferred = _preferred_localization(target_localizations)
            target_label = (
                target_preferred.preferred_label
                if target_preferred is not None
                else str(relation.target_term_id)
            )
        relation_responses.append(
            {
                "id": relation.id,
                "relation": relation.relation,
                "targetTermId": relation.target_term_id,
                "targetUri": relation.target_uri,
                "targetLabel": target_label,
            }
        )
    preferred = _preferred_localization(localizations)
    return GlossaryTermResponse.model_validate(
        {
            **{
                column.name: getattr(term, column.name) for column in GlossaryTerm.__table__.columns
            },
            "preferredLabel": preferred.preferred_label if preferred else term.urn,
            "localizations": localizations,
            "domainIds": domain_ids,
            "relations": relation_responses,
        }
    )


def _domain_reference(session: Session, domain: Domain) -> dict[str, Any]:
    item = _domain_response(session, domain)
    return {
        "id": item.id,
        "urn": item.urn,
        "revision": item.revision,
        "lifecycle": item.lifecycle,
        "preferredLabel": item.preferred_label,
        "labels": [entry.model_dump(by_alias=True) for entry in item.localizations],
    }


def _term_reference(session: Session, term: GlossaryTerm) -> dict[str, Any]:
    item = _term_response(session, term)
    return {
        "id": item.id,
        "urn": item.urn,
        "revision": item.revision,
        "lifecycle": item.lifecycle,
        "preferredLabel": item.preferred_label,
        "labels": [entry.model_dump(by_alias=True) for entry in item.localizations],
        "domainIds": item.domain_ids,
    }


def _product_domain_ids(session: Session, product_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        session.scalars(
            select(DataProductDomain.domain_id)
            .where(DataProductDomain.data_product_id == product_id)
            .order_by(DataProductDomain.position)
        )
    )


def _product_term_ids(session: Session, product_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        session.scalars(
            select(DataProductGlossaryTerm.glossary_term_id).where(
                DataProductGlossaryTerm.data_product_id == product_id
            )
        )
    )


def data_product_response(
    session: Session, product: DataProduct, actor: str | None = None
) -> DataProductResponse:
    domain_ids = _product_domain_ids(session, product.id)
    term_ids = _product_term_ids(session, product.id)
    domains = (
        list(session.scalars(select(Domain).where(Domain.id.in_(domain_ids)))) if domain_ids else []
    )
    domain_by_id = {item.id: item for item in domains}
    terms = (
        list(session.scalars(select(GlossaryTerm).where(GlossaryTerm.id.in_(term_ids))))
        if term_ids
        else []
    )
    pending: list[uuid.UUID] = []
    if actor and actor in {product.owner_user_id, product.deputy_owner_user_id}:
        pending = list(
            session.scalars(
                select(GlossaryTermProposal.id).where(
                    GlossaryTermProposal.source_product_id == product.id,
                    GlossaryTermProposal.status.in_(("submitted", "in_review")),
                )
            )
        )
    payload = DataProductResponse.model_validate(product).model_dump(by_alias=True)
    payload["domains"] = [
        _domain_reference(session, domain_by_id[domain_id])
        for domain_id in domain_ids
        if domain_id in domain_by_id
    ]
    payload["glossaryTerms"] = [_term_reference(session, term) for term in terms]
    payload["pendingTermProposals"] = pending
    return DataProductResponse.model_validate(payload)


def data_product_summary(
    session: Session, product: DataProduct, quality: ProductQualityResponse
) -> DataProductSummary:
    detail = data_product_response(session, product)
    return DataProductSummary(
        id=product.id,
        urn=product.urn,
        origin_catalog=product.origin_catalog,
        revision=product.revision,
        owner_user_id=product.owner_user_id,
        deputy_owner_user_id=product.deputy_owner_user_id,
        control_person_user_id=product.control_person_user_id,
        discoverable=product.discoverable,
        title=product.title,
        description=product.description,
        owner=product.owner,
        domain=product.domain,
        domains=detail.domains,
        glossary_terms=detail.glossary_terms,
        lifecycle=product.lifecycle,
        classification=product.classification,
        keywords=product.keywords,
        update_frequency=product.update_frequency,
        metadata=product.extra_metadata,
        quality=DataProductQualitySummary(score=quality.score, medal=quality.medal),
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


def complete_tasks(session: Session, product_id: uuid.UUID, task_type: str) -> None:
    now = utc_now()
    tasks = session.scalars(
        select(WorkflowTask).where(
            WorkflowTask.data_product_id == product_id,
            WorkflowTask.task_type == task_type,
            WorkflowTask.status != "completed",
        )
    )
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
        item for item in copied.get("simulationAlerts", []) if item.get("eventId") != str(event_id)
    ]
    return copied


def _domain_draft_payload(body: DomainDirectCreate | DomainDirectUpdate | Any) -> dict[str, Any]:
    return body.model_dump(mode="json", by_alias=True, exclude_none=True)


def _domain_hash_payload(domain: Domain, localizations: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "urn": domain.urn,
        "originCatalogId": domain.origin_catalog_id,
        "lifecycle": domain.lifecycle,
        "ownerUserId": domain.owner_user_id,
        "deputyOwnerUserId": domain.deputy_owner_user_id,
        "localizations": sorted(localizations, key=lambda item: item["language"]),
    }


def _localization_dicts(body: Any) -> list[dict[str, Any]]:
    return [item.model_dump(mode="json", by_alias=False) for item in body.localizations]


def _validate_domain_stewards(session: Session, owner_id: str, deputy_id: str) -> None:
    if owner_id == deputy_id:
        raise HTTPException(422, "Domain owner and deputy must differ")
    _require_active_data_owner(session, owner_id)
    _require_active_data_owner(session, deputy_id)


def _replace_domain_localizations(
    session: Session, domain_id: uuid.UUID, localizations: list[dict[str, Any]]
) -> None:
    session.execute(delete(DomainLocalization).where(DomainLocalization.domain_id == domain_id))
    for item in localizations:
        session.add(
            DomainLocalization(
                domain_id=domain_id,
                language=item["language"].strip(),
                preferred_label=item["preferred_label"].strip(),
                definition=item["definition"].strip(),
                normalized_label=_normalized_label(item["preferred_label"]),
            )
        )


def _create_domain(session: Session, payload: dict[str, Any]) -> Domain:
    owner_id = payload["ownerUserId"]
    deputy_id = payload["deputyOwnerUserId"]
    _validate_domain_stewards(session, owner_id, deputy_id)
    domain_id = uuid.uuid4()
    domain = Domain(
        id=domain_id,
        urn=f"urn:daca:domain:{domain_id}",
        origin_catalog_id="urn:daca:catalog:bit-poc",
        revision=1,
        content_hash="",
        lifecycle="active",
        owner_user_id=owner_id,
        deputy_owner_user_id=deputy_id,
    )
    localizations = [
        {
            "language": item["language"],
            "preferred_label": item["preferredLabel"],
            "definition": item["definition"],
        }
        for item in payload["localizations"]
    ]
    domain.content_hash = _canonical_hash(_domain_hash_payload(domain, localizations))
    session.add(domain)
    _replace_domain_localizations(session, domain_id, localizations)
    session.flush()
    return domain


def _update_domain(
    session: Session,
    domain: Domain,
    payload: dict[str, Any],
    *,
    retire: bool = False,
    change_actor: str | None = None,
) -> Domain:
    if domain.lifecycle == "retired":
        raise HTTPException(409, "A retired domain cannot be changed")
    owner_id = payload.get("ownerUserId", domain.owner_user_id)
    deputy_id = payload.get("deputyOwnerUserId", domain.deputy_owner_user_id)
    _validate_domain_stewards(session, owner_id, deputy_id)
    previous_owner_id = domain.owner_user_id
    previous_deputy_id = domain.deputy_owner_user_id
    domain.owner_user_id = owner_id
    domain.deputy_owner_user_id = deputy_id
    if retire:
        domain.lifecycle = "retired"
        domain.retired_at = utc_now()
    if "localizations" in payload:
        localizations = [
            {
                "language": item["language"],
                "preferred_label": item["preferredLabel"],
                "definition": item["definition"],
            }
            for item in payload["localizations"]
        ]
        _replace_domain_localizations(session, domain.id, localizations)
    else:
        localizations = [
            {
                "language": item.language,
                "preferred_label": item.preferred_label,
                "definition": item.definition,
            }
            for item in session.scalars(
                select(DomainLocalization).where(DomainLocalization.domain_id == domain.id)
            )
        ]
    domain.revision += 1
    domain.updated_at = utc_now()
    domain.content_hash = _canonical_hash(_domain_hash_payload(domain, localizations))
    if previous_owner_id != owner_id:
        open_reviews = list(
            session.scalars(
                select(GlossaryTermProposalReview)
                .join(
                    GlossaryTermProposal,
                    GlossaryTermProposal.id == GlossaryTermProposalReview.proposal_id,
                )
                .where(
                    GlossaryTermProposalReview.domain_id == domain.id,
                    GlossaryTermProposalReview.status == "pending",
                    GlossaryTermProposal.status.in_(("submitted", "in_review")),
                )
            )
        )
        for review in open_reviews:
            review.owner_user_id = owner_id
            review.updated_at = utc_now()
            for task in session.scalars(
                select(WorkflowTask).where(
                    WorkflowTask.glossary_term_proposal_id == review.proposal_id,
                    WorkflowTask.task_type == "glossary_term_review",
                    WorkflowTask.status != "completed",
                    WorkflowTask.assignee_user_id == previous_owner_id,
                )
            ):
                task.assignee_user_id = owner_id
                task.updated_at = utc_now()
            audit(
                session,
                "glossary-term-proposal",
                str(review.proposal_id),
                "review-owner-reassigned",
                change_actor or "system",
                review.proposal_revision,
                {"domainId": str(domain.id), "ownerUserId": owner_id},
            )
    if previous_deputy_id != deputy_id:
        open_proposal_ids = list(
            session.scalars(
                select(GlossaryTermProposalReview.proposal_id)
                .join(
                    GlossaryTermProposal,
                    GlossaryTermProposal.id == GlossaryTermProposalReview.proposal_id,
                )
                .where(
                    GlossaryTermProposalReview.domain_id == domain.id,
                    GlossaryTermProposalReview.status == "pending",
                    GlossaryTermProposal.status.in_(("submitted", "in_review")),
                )
            )
        )
        if open_proposal_ids:
            for task in session.scalars(
                select(WorkflowTask).where(
                    WorkflowTask.glossary_term_proposal_id.in_(open_proposal_ids),
                    WorkflowTask.task_type == "glossary_term_collaboration",
                    WorkflowTask.status != "completed",
                    WorkflowTask.assignee_user_id == previous_deputy_id,
                )
            ):
                task.assignee_user_id = deputy_id
                task.updated_at = utc_now()
    session.flush()
    return domain


def _create_workflow_task(
    session: Session,
    *,
    task_type: str,
    task_kind: str,
    assignee: str,
    title: str,
    detail: str,
    domain_request_id: uuid.UUID | None = None,
    term_proposal_id: uuid.UUID | None = None,
    product_id: uuid.UUID | None = None,
) -> WorkflowTask:
    task = WorkflowTask(
        id=uuid.uuid4(),
        task_type=task_type,
        task_kind=task_kind,
        status="open",
        assignee_user_id=assignee,
        data_product_id=product_id,
        domain_change_request_id=domain_request_id,
        glossary_term_proposal_id=term_proposal_id,
        title=title,
        detail=detail,
    )
    session.add(task)
    return task


def _complete_linked_tasks(
    session: Session,
    *,
    domain_request_id: uuid.UUID | None = None,
    term_proposal_id: uuid.UUID | None = None,
) -> None:
    statement = select(WorkflowTask).where(WorkflowTask.status != "completed")
    if domain_request_id is not None:
        statement = statement.where(WorkflowTask.domain_change_request_id == domain_request_id)
    elif term_proposal_id is not None:
        statement = statement.where(WorkflowTask.glossary_term_proposal_id == term_proposal_id)
    else:
        return
    now = utc_now()
    for task in session.scalars(statement):
        task.status = "completed"
        task.completed_at = now
        task.updated_at = now


def _active_domains(session: Session, domain_ids: list[uuid.UUID]) -> list[Domain]:
    if len(domain_ids) != len(set(domain_ids)):
        raise HTTPException(422, "domainIds must be unique")
    domains = list(
        session.scalars(
            select(Domain).where(Domain.id.in_(domain_ids), Domain.lifecycle == "active")
        )
    )
    if len(domains) != len(domain_ids):
        raise HTTPException(422, "Every domainId must reference an active domain")
    return domains


def _replace_term_content(session: Session, term: GlossaryTerm, payload: dict[str, Any]) -> None:
    domain_ids = [uuid.UUID(str(value)) for value in payload["domainIds"]]
    _active_domains(session, domain_ids)
    session.execute(
        delete(GlossaryTermLocalization).where(GlossaryTermLocalization.term_id == term.id)
    )
    session.execute(delete(GlossaryTermDomain).where(GlossaryTermDomain.term_id == term.id))
    session.execute(
        delete(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id == term.id)
    )
    for item in payload["localizations"]:
        session.add(
            GlossaryTermLocalization(
                term_id=term.id,
                language=item["language"].strip(),
                preferred_label=item["preferredLabel"].strip(),
                alternative_labels=[label.strip() for label in item.get("alternativeLabels", [])],
                definition=item["definition"].strip(),
                normalized_label=_normalized_label(item["preferredLabel"]),
            )
        )
    for domain_id in domain_ids:
        session.add(GlossaryTermDomain(term_id=term.id, domain_id=domain_id))
    for item in payload.get("relations", []):
        target_term_id = item.get("targetTermId")
        if target_term_id:
            target = session.get(GlossaryTerm, uuid.UUID(str(target_term_id)))
            if target is None or target.lifecycle != "active":
                raise HTTPException(422, "Relation targetTermId must reference an active term")
        session.add(
            GlossaryTermRelation(
                id=uuid.uuid4(),
                source_term_id=term.id,
                target_term_id=uuid.UUID(str(target_term_id)) if target_term_id else None,
                target_uri=item.get("targetUri"),
                relation=item["relation"],
            )
        )


def _accept_term_proposal(
    session: Session, proposal: GlossaryTermProposal, actor: str
) -> GlossaryTerm:
    payload = proposal.review_payload
    if proposal.operation == "create":
        term_id = uuid.uuid4()
        term = GlossaryTerm(
            id=term_id,
            urn=f"urn:daca:glossary-term:{term_id}",
            origin_catalog_id="urn:daca:catalog:bit-poc",
            revision=1,
            content_hash="0" * 64,
            lifecycle="active",
        )
        session.add(term)
    else:
        term = session.get(GlossaryTerm, proposal.target_term_id)
        if term is None:
            raise HTTPException(409, "The target glossary term no longer exists")
        if term.lifecycle == "retired":
            raise HTTPException(409, "The target glossary term is already retired")
        term.revision += 1
        term.updated_at = utc_now()
    if proposal.operation == "retire":
        term.lifecycle = "retired"
        term.retired_at = utc_now()
    else:
        _replace_term_content(session, term, payload)
    term.content_hash = _canonical_hash(
        {"urn": term.urn, "lifecycle": term.lifecycle, "payload": payload}
    )
    session.flush()
    proposal.target_term_id = term.id
    proposal.status = "accepted"
    proposal.decided_at = utc_now()
    proposal.decision_comment = "All responsible domain owners approved this revision"
    audit(
        session,
        "glossary-term",
        str(term.id),
        proposal.operation + "-approved",
        actor,
        term.revision,
        {"proposalId": str(proposal.id), "status": term.lifecycle},
    )
    _complete_linked_tasks(session, term_proposal_id=proposal.id)

    attachment_message = (
        "Der akzeptierte Term wurde nicht automatisch an das Quellprodukt angehängt. "
        "Prüfen Sie die aktuelle Domainzuordnung und ordnen Sie den Term bei Bedarf manuell zu."
    )
    if proposal.auto_attach and proposal.source_product_id and proposal.operation != "retire":
        product = session.scalar(
            select(DataProduct)
            .where(DataProduct.id == proposal.source_product_id)
            .with_for_update()
        )
        if product is not None and product.lifecycle != "retired":
            product_domains = set(_product_domain_ids(session, product.id))
            term_domains = {uuid.UUID(str(value)) for value in proposal.review_payload["domainIds"]}
            if product_domains.intersection(term_domains):
                existing = session.get(
                    DataProductGlossaryTerm,
                    {"data_product_id": product.id, "glossary_term_id": term.id},
                )
                if existing is None:
                    session.add(
                        DataProductGlossaryTerm(
                            data_product_id=product.id,
                            glossary_term_id=term.id,
                            assigned_by_user_id=proposal.requester_user_id,
                        )
                    )
                    product.revision += 1
                    product.updated_at = utc_now()
                    audit(
                        session,
                        "data-product",
                        str(product.id),
                        "glossary-term-attached",
                        actor,
                        product.revision,
                        {"termId": str(term.id), "proposalId": str(proposal.id)},
                    )
                attachment_message = (
                    "Der akzeptierte Term wurde automatisch an das Quellprodukt angehängt."
                )
    _create_workflow_task(
        session,
        task_type="glossary_term_decision",
        task_kind="information",
        assignee=proposal.requester_user_id,
        product_id=proposal.source_product_id,
        term_proposal_id=proposal.id,
        title="Glossartermvorschlag angenommen",
        detail=attachment_message,
    )
    return term


def _mark_term_proposal_stale_for_retired_domains(
    session: Session, proposal: GlossaryTermProposal, actor: str
) -> bool:
    """Finalize an otherwise approved proposal when its governance scope changed.

    Locking the reviewed domains closes the race with a concurrent register
    retirement: either the retirement commits first and this proposal becomes
    stale, or this decision commits while every reviewed domain is still active.
    """
    review_domain_ids = list(dict.fromkeys(review.domain_id for review in proposal.reviews))
    domains = list(
        session.scalars(select(Domain).where(Domain.id.in_(review_domain_ids)).with_for_update())
    )
    active_domain_ids = {domain.id for domain in domains if domain.lifecycle == "active"}
    inactive_domain_ids = [
        domain_id for domain_id in review_domain_ids if domain_id not in active_domain_ids
    ]
    if not inactive_domain_ids:
        return False

    domain_references = ", ".join(str(domain_id) for domain_id in inactive_domain_ids)
    decision_comment = (
        "Der Vorschlag ist veraltet, weil während des Reviews mindestens eine "
        f"betroffene Domain stillgelegt wurde: {domain_references}."
    )
    proposal.status = "stale"
    proposal.decision_comment = decision_comment
    proposal.decided_at = utc_now()
    proposal.updated_at = utc_now()
    _complete_linked_tasks(session, term_proposal_id=proposal.id)
    _create_workflow_task(
        session,
        task_type="glossary_term_decision",
        task_kind="information",
        assignee=proposal.requester_user_id,
        title="Glossartermvorschlag muss neu eingereicht werden",
        detail=(
            f"{decision_comment} Nächster manueller Schritt: Prüfen Sie die aktiven "
            "Domainzuordnungen und reichen Sie einen neuen Vorschlag ein."
        ),
        term_proposal_id=proposal.id,
        product_id=proposal.source_product_id,
    )
    audit(
        session,
        "glossary-term-proposal",
        str(proposal.id),
        "marked-stale",
        actor,
        proposal.revision,
        {
            "status": proposal.status,
            "inactiveDomainIds": [str(domain_id) for domain_id in inactive_domain_ids],
        },
    )
    return True


def _domain_glossary_fixture_response(
    session: Session,
) -> PocDomainGlossaryFixtureResponse:
    product = session.get(DataProduct, VEHICLE_PRODUCT_ID)
    if product is None:
        return PocDomainGlossaryFixtureResponse(
            fixture_id="domain-glossary-governance",
            state="notPrepared",
            product_id=None,
            product_title=None,
            domain_ids=[],
            term_id=None,
            open_domain_request_count=0,
            open_term_proposal_count=0,
        )
    domain_ids = _product_domain_ids(session, product.id)
    open_domain_requests = list(
        session.scalars(
            select(DomainChangeRequest).where(
                DomainChangeRequest.id == DEFENCE_REQUEST_ID,
                DomainChangeRequest.status == "submitted",
            )
        )
    )
    proposals = list(
        session.scalars(
            select(GlossaryTermProposal).where(GlossaryTermProposal.source_product_id == product.id)
        )
    )
    open_proposals = [item for item in proposals if item.status in {"submitted", "in_review"}]
    accepted = next(
        (item for item in proposals if item.status == "accepted" and item.target_term_id), None
    )
    prepared = bool(product.extra_metadata.get("domainGlossaryFixturePrepared"))
    if not prepared:
        state = "notPrepared"
    elif open_domain_requests:
        state = "domainPending"
    elif open_proposals:
        state = "termPending"
    elif accepted:
        state = "completed"
    elif session.get(DomainChangeRequest, DEFENCE_REQUEST_ID) is not None:
        state = "domainApproved"
    else:
        state = "ready"
    return PocDomainGlossaryFixtureResponse(
        fixture_id="domain-glossary-governance",
        state=state,
        product_id=product.id,
        product_title=product.title,
        domain_ids=domain_ids,
        term_id=accepted.target_term_id if accepted else None,
        open_domain_request_count=len(open_domain_requests),
        open_term_proposal_count=len(open_proposals),
    )


def _remove_vehicle_term_proposals(session: Session) -> None:
    proposals = list(
        session.scalars(
            select(GlossaryTermProposal).where(
                GlossaryTermProposal.source_product_id == VEHICLE_PRODUCT_ID
            )
        )
    )
    proposal_ids = [item.id for item in proposals]
    protected_reference_term_ids = (
        {
            item.target_term_id
            for item in proposals
            if item.id == ARMOURED_VEHICLE_PROPOSAL_ID
            and item.status == "accepted"
            and item.target_term_id is not None
        }
        if session.get(SeedMarker, GLOSSARY_REFERENCE_SEED_NAME) is not None
        else set()
    )
    term_ids = [
        item.target_term_id
        for item in proposals
        if item.operation == "create"
        and item.target_term_id
        and item.target_term_id not in protected_reference_term_ids
    ]
    if proposal_ids:
        session.execute(
            delete(WorkflowTask).where(WorkflowTask.glossary_term_proposal_id.in_(proposal_ids))
        )
        session.execute(
            delete(GlossaryTermProposalReview).where(
                GlossaryTermProposalReview.proposal_id.in_(proposal_ids)
            )
        )
        session.execute(
            delete(GlossaryTermProposal).where(GlossaryTermProposal.id.in_(proposal_ids))
        )
        session.flush()
    session.execute(
        delete(DataProductGlossaryTerm).where(
            DataProductGlossaryTerm.data_product_id == VEHICLE_PRODUCT_ID
        )
    )
    session.flush()
    for term_id in term_ids:
        remaining = session.scalar(
            select(DataProductGlossaryTerm.data_product_id)
            .where(DataProductGlossaryTerm.glossary_term_id == term_id)
            .limit(1)
        )
        term = session.get(GlossaryTerm, term_id)
        if (
            remaining is None
            and term
            and term.origin_catalog_id == "urn:daca:catalog:bit-poc"
            and term.lifecycle == "active"
        ):
            term.lifecycle = "retired"
            term.retired_at = utc_now()
            term.revision += 1
            term.updated_at = utc_now()
            term.content_hash = _canonical_hash(
                {"urn": term.urn, "lifecycle": term.lifecycle, "fixtureReset": True}
            )
    session.flush()


def _set_vehicle_baseline(session: Session, product: DataProduct, actor: str) -> None:
    session.execute(
        delete(DataProductDomain).where(DataProductDomain.data_product_id == product.id)
    )
    session.add(
        DataProductDomain(
            data_product_id=product.id,
            domain_id=MOBILITY_DOMAIN_ID,
            position=0,
            assigned_by_user_id=actor,
        )
    )
    product.domain = "Mobilität & Logistik"
    product.revision += 1
    product.updated_at = utc_now()


def _set_fixture_domain_lifecycle(session: Session, domain: Domain, lifecycle: str) -> None:
    if domain.lifecycle == lifecycle:
        return
    domain.lifecycle = lifecycle
    domain.retired_at = utc_now() if lifecycle == "retired" else None
    domain.revision += 1
    domain.updated_at = utc_now()
    localizations = [
        {
            "language": item.language,
            "preferred_label": item.preferred_label,
            "definition": item.definition,
        }
        for item in session.scalars(
            select(DomainLocalization).where(DomainLocalization.domain_id == domain.id)
        )
    ]
    domain.content_hash = _canonical_hash(_domain_hash_payload(domain, localizations))


def _prepare_domain_glossary_fixture(session: Session, product: DataProduct, actor: str) -> None:
    existing_change = session.get(DomainChangeRequest, DEFENCE_REQUEST_ID)
    existing_proposal = session.scalar(
        select(GlossaryTermProposal.id)
        .where(GlossaryTermProposal.source_product_id == product.id)
        .limit(1)
    )
    if (
        product.extra_metadata.get("domainGlossaryFixturePrepared")
        and existing_change is not None
        and existing_change.status == "submitted"
        and existing_proposal is None
        and _product_domain_ids(session, product.id) == [MOBILITY_DOMAIN_ID]
        and not _product_term_ids(session, product.id)
    ):
        return
    _remove_vehicle_term_proposals(session)
    _set_vehicle_baseline(session, product, actor)
    defence = session.get(Domain, DEFENCE_DOMAIN_ID)
    if defence is None:
        raise HTTPException(409, "The stable Defence fixture domain is missing")
    _set_fixture_domain_lifecycle(session, defence, "retired")
    metadata = json.loads(json.dumps(product.extra_metadata))
    metadata["domainGlossaryFixturePrepared"] = True
    product.extra_metadata = metadata
    change = session.get(DomainChangeRequest, DEFENCE_REQUEST_ID)
    if change is None:
        localizations = list(
            session.scalars(
                select(DomainLocalization).where(DomainLocalization.domain_id == defence.id)
            )
        )
        payload = {
            "ownerUserId": defence.owner_user_id,
            "deputyOwnerUserId": defence.deputy_owner_user_id,
            "localizations": [
                {
                    "language": item.language,
                    "preferredLabel": item.preferred_label,
                    "definition": item.definition,
                }
                for item in localizations
            ],
        }
        change = DomainChangeRequest(
            id=DEFENCE_REQUEST_ID,
            request_number="DOM-2026-0001",
            operation="create",
            target_domain_id=DEFENCE_DOMAIN_ID,
            requester_user_id="sandro.wenger",
            status="submitted",
            requested_payload=payload,
            review_payload=payload,
            revision=1,
        )
        session.add(change)
    else:
        change.status = "submitted"
        change.target_domain_id = DEFENCE_DOMAIN_ID
        change.base_revision = None
        change.reviewer_user_id = None
        change.decision_comment = None
        change.decided_at = None
        change.updated_at = utc_now()
    session.execute(
        delete(WorkflowTask).where(WorkflowTask.domain_change_request_id == DEFENCE_REQUEST_ID)
    )
    _create_workflow_task(
        session,
        task_type="domain_change_review",
        task_kind="action",
        assignee="sibilla.micheli",
        title="Domain request Verteidigung review",
        detail="Review owner, deputy and the subject-domain definition.",
        domain_request_id=DEFENCE_REQUEST_ID,
    )
    audit(
        session,
        "poc-fixture",
        DOMAIN_GLOSSARY_SEED_NAME,
        "prepared",
        actor,
        product.revision,
        {"fixtureId": "domain-glossary-governance", "status": "domainPending"},
    )


def _reset_domain_glossary_fixture(session: Session, product: DataProduct, actor: str) -> None:
    existing_proposal = session.scalar(
        select(GlossaryTermProposal.id)
        .where(GlossaryTermProposal.source_product_id == product.id)
        .limit(1)
    )
    if (
        not product.extra_metadata.get("domainGlossaryFixturePrepared")
        and existing_proposal is None
        and _product_domain_ids(session, product.id) == [MOBILITY_DOMAIN_ID]
        and not _product_term_ids(session, product.id)
    ):
        return
    _remove_vehicle_term_proposals(session)
    _set_vehicle_baseline(session, product, actor)
    defence = session.get(Domain, DEFENCE_DOMAIN_ID)
    if defence is None:
        raise HTTPException(409, "The stable Defence fixture domain is missing")
    _set_fixture_domain_lifecycle(session, defence, "active")
    metadata = json.loads(json.dumps(product.extra_metadata))
    metadata.pop("domainGlossaryFixturePrepared", None)
    product.extra_metadata = metadata
    change = session.get(DomainChangeRequest, DEFENCE_REQUEST_ID)
    if change is not None:
        change.status = "approved"
        change.target_domain_id = DEFENCE_DOMAIN_ID
        change.base_revision = None
        change.reviewer_user_id = "sibilla.micheli"
        change.decision_comment = "Fixture baseline"
        change.decided_at = utc_now()
        change.updated_at = utc_now()
    session.execute(
        delete(WorkflowTask).where(WorkflowTask.domain_change_request_id == DEFENCE_REQUEST_ID)
    )
    audit(
        session,
        "poc-fixture",
        DOMAIN_GLOSSARY_SEED_NAME,
        "reset",
        actor,
        product.revision,
        {"fixtureId": "domain-glossary-governance", "status": "notPrepared"},
    )


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    @router.get(
        "/poc/guide-config",
        response_model=PocGuideConfigResponse,
        tags=["POC"],
        summary="Return public links used by the PoC guide",
    )
    def poc_guide_config(request: Request) -> PocGuideConfigResponse:
        settings: Settings = request.app.state.settings
        return PocGuideConfigResponse(
            daaif_ui_url=settings.daaif_ui_url,
            environment=settings.environment,
        )

    @router.get("/demo-users", response_model=list[DemoUserResponse], tags=["POC"])
    def list_demo_users(session: SessionDep) -> list[DemoUser]:
        return list(
            session.scalars(
                select(DemoUser)
                .where(DemoUser.active.is_(True), DemoUser.selectable.is_(True))
                .order_by(DemoUser.display_name)
            )
        )

    @router.get("/session", tags=["POC"])
    def read_local_session(request: Request, session: SessionDep) -> dict[str, str]:
        if not request.app.state.settings.daca_demo_auth:
            raise HTTPException(503, "Local demo sessions are disabled")
        return {"userId": local_session_user(session, request).id}

    @router.post("/session/login", tags=["POC"])
    def login_local_session(
        body: dict[str, str], request: Request, response: Response, session: SessionDep
    ) -> dict[str, str]:
        if not request.app.state.settings.daca_demo_auth:
            raise HTTPException(503, "Local demo sessions are disabled")
        user = session.get(DemoUser, body.get("userId", ""))
        if user is None or not user.active or not user.selectable:
            raise HTTPException(401, "Unknown local demo identity")
        token = secrets.token_urlsafe(32)
        now = utc_now()
        session.add(DemoLoginSession(
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            user_id=user.id, created_at=now, expires_at=now + timedelta(hours=12),
        ))
        session.commit()
        response.set_cookie(
            "daca_session", token, max_age=12 * 60 * 60, httponly=True,
            secure=request.url.scheme == "https", samesite="lax", path="/",
        )
        return {"userId": user.id}

    @router.post("/session/logout", tags=["POC"])
    def logout_local_session(request: Request, response: Response, session: SessionDep) -> dict[str, bool]:
        token = request.cookies.get("daca_session")
        if token:
            entry = session.get(DemoLoginSession, hashlib.sha256(token.encode()).hexdigest())
            if entry is not None and entry.revoked_at is None:
                entry.revoked_at = utc_now()
                session.commit()
        response.delete_cookie("daca_session", path="/")
        return {"ok": True}

    @router.get("/me/preferences/{name}", tags=["POC"])
    def read_personal_preference(
        name: Literal["language", "theme"], request: Request, session: SessionDep,
        x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None,
    ) -> dict[str, str]:
        user = personal_preference_user(session, request, x_daca_user)
        defaults = {"language": "de", "theme": "light"}
        return {"value": (user.preferences or {}).get(name, defaults[name])}

    @router.put("/me/preferences/{name}", tags=["POC"])
    def save_personal_preference(
        name: Literal["language", "theme"], body: dict[str, str],
        request: Request, session: SessionDep,
        x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None,
    ) -> dict[str, str]:
        allowed = {"language": {"de", "fr", "it", "en"}, "theme": {"light", "dark"}}
        value = body.get("value")
        if value not in allowed[name]:
            raise HTTPException(422, "Invalid personal preference")
        user = personal_preference_user(session, request, x_daca_user)
        user.preferences = {**(user.preferences or {}), name: value}
        session.commit()
        return {"value": value}

    @router.get("/domains", response_model=list[DomainResponse], tags=["domains & glossary"])
    def list_domains(
        session: SessionDep,
        q: str | None = None,
        include_retired: Annotated[bool, Query(alias="includeRetired")] = False,
    ) -> list[DomainResponse]:
        statement = select(Domain)
        if not include_retired:
            statement = statement.where(Domain.lifecycle == "active")
        domains = list(session.scalars(statement.order_by(Domain.created_at)))
        responses = [_domain_response(session, item) for item in domains]
        if q and q.strip():
            needle = _normalized_label(q)
            responses = [
                item
                for item in responses
                if any(
                    needle in entry.normalized_label
                    or needle in _normalized_label(entry.definition)
                    for entry in item.localizations
                )
            ]
        return responses

    @router.get("/domains/{domain_id}", response_model=DomainResponse, tags=["domains & glossary"])
    def get_domain(domain_id: uuid.UUID, response: Response, session: SessionDep) -> DomainResponse:
        domain = session.get(Domain, domain_id)
        if domain is None:
            raise HTTPException(404, "Domain not found")
        response.headers["ETag"] = etag_for_revision(domain.revision)
        return _domain_response(session, domain)

    @router.get(
        "/domains/{domain_id}/audit-events",
        response_model=list[AuditEventResponse],
        tags=["domains & glossary"],
    )
    def get_domain_audit_events(domain_id: uuid.UUID, session: SessionDep) -> list[AuditEvent]:
        if session.get(Domain, domain_id) is None:
            raise HTTPException(404, "Domain not found")
        request_ids = list(
            session.scalars(
                select(DomainChangeRequest.id).where(
                    DomainChangeRequest.target_domain_id == domain_id
                )
            )
        )
        predicates = [
            (AuditEvent.resource_type == "domain") & (AuditEvent.resource_id == str(domain_id))
        ]
        if request_ids:
            predicates.append(
                (AuditEvent.resource_type == "domain-change-request")
                & (AuditEvent.resource_id.in_([str(value) for value in request_ids]))
            )
        return list(
            session.scalars(
                select(AuditEvent).where(or_(*predicates)).order_by(AuditEvent.occurred_at.desc())
            )
        )

    @router.post(
        "/domains", response_model=DomainResponse, status_code=201, tags=["domains & glossary"]
    )
    def create_domain_direct(
        body: DomainDirectCreate, session: SessionDep, actor: ActorDep
    ) -> DomainResponse:
        _require_role(
            session,
            actor,
            "domain_register_owner",
            "Only the domain register owner may change the register directly",
        )
        domain = _create_domain(session, _domain_draft_payload(body))
        audit(
            session,
            "domain",
            str(domain.id),
            "created",
            actor,
            domain.revision,
            {"status": domain.lifecycle},
        )
        session.commit()
        return _domain_response(session, domain)

    @router.patch(
        "/domains/{domain_id}", response_model=DomainResponse, tags=["domains & glossary"]
    )
    def update_domain_direct(
        domain_id: uuid.UUID,
        body: DomainDirectUpdate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> DomainResponse:
        _require_role(
            session,
            actor,
            "domain_register_owner",
            "Only the domain register owner may change the register directly",
        )
        domain = session.scalar(select(Domain).where(Domain.id == domain_id).with_for_update())
        if domain is None:
            raise HTTPException(404, "Domain not found")
        require_revision(if_match, domain.revision)
        domain = _update_domain(session, domain, _domain_draft_payload(body), change_actor=actor)
        audit(
            session,
            "domain",
            str(domain.id),
            "updated",
            actor,
            domain.revision,
            {"changedFields": sorted(body.model_fields_set), "status": domain.lifecycle},
        )
        session.commit()
        response.headers["ETag"] = etag_for_revision(domain.revision)
        return _domain_response(session, domain)

    @router.post(
        "/domains/{domain_id}/retire", response_model=DomainResponse, tags=["domains & glossary"]
    )
    def retire_domain_direct(
        domain_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> DomainResponse:
        _require_role(
            session,
            actor,
            "domain_register_owner",
            "Only the domain register owner may retire a domain",
        )
        domain = session.scalar(select(Domain).where(Domain.id == domain_id).with_for_update())
        if domain is None:
            raise HTTPException(404, "Domain not found")
        require_revision(if_match, domain.revision)
        domain = _update_domain(session, domain, {}, retire=True, change_actor=actor)
        audit(
            session,
            "domain",
            str(domain.id),
            "retired",
            actor,
            domain.revision,
            {"status": domain.lifecycle},
        )
        session.commit()
        response.headers["ETag"] = etag_for_revision(domain.revision)
        return _domain_response(session, domain)

    @router.post(
        "/domain-change-requests",
        response_model=DomainChangeRequestResponse,
        status_code=201,
        tags=["domains & glossary"],
    )
    def create_domain_change_request(
        body: DomainChangeRequestCreate, session: SessionDep, actor: ActorDep
    ) -> DomainChangeRequest:
        _require_role(session, actor, "data_owner", "Only a data owner may request a domain change")
        if body.target_domain_id:
            target = session.get(Domain, body.target_domain_id)
            if target is None:
                raise HTTPException(404, "Target domain not found")
            if target.lifecycle == "retired":
                raise HTTPException(409, "A retired domain cannot be changed")
            if body.base_revision != target.revision:
                raise HTTPException(412, f"The current domain revision is {target.revision}")
        payload = (
            body.payload.model_dump(mode="json", by_alias=True, exclude_none=True)
            if body.payload
            else {}
        )
        request_id = uuid.uuid4()
        change = DomainChangeRequest(
            id=request_id,
            request_number=f"DOM-{request_id.hex[:8].upper()}",
            operation=body.operation,
            target_domain_id=body.target_domain_id,
            base_revision=body.base_revision,
            requester_user_id=actor,
            status="submitted",
            requested_payload=payload,
            review_payload=payload,
            revision=1,
        )
        session.add(change)
        register_owners = [
            user
            for user in session.scalars(select(DemoUser).where(DemoUser.active.is_(True)))
            if _has_role(user, "domain_register_owner")
        ]
        if not register_owners:
            raise HTTPException(409, "No active domain register owner is configured")
        for owner in register_owners:
            _create_workflow_task(
                session,
                task_type="domain_change_review",
                task_kind="action",
                assignee=owner.id,
                title=f"Review domain request {change.request_number}",
                detail=f"A data owner requested a domain {body.operation} operation.",
                domain_request_id=change.id,
            )
        audit(
            session,
            "domain-change-request",
            str(change.id),
            "submitted",
            actor,
            change.revision,
            {"operation": change.operation, "status": change.status},
        )
        session.commit()
        return change

    @router.get(
        "/domain-change-requests",
        response_model=list[DomainChangeRequestResponse],
        tags=["domains & glossary"],
    )
    def list_domain_change_requests(
        session: SessionDep, actor: ActorDep
    ) -> list[DomainChangeRequest]:
        profile = actor_profile(session, actor)
        statement = select(DomainChangeRequest)
        if not _has_role(profile, "domain_register_owner"):
            statement = statement.where(DomainChangeRequest.requester_user_id == actor)
        return list(session.scalars(statement.order_by(DomainChangeRequest.created_at.desc())))

    @router.patch(
        "/domain-change-requests/{request_id}",
        response_model=DomainChangeRequestResponse,
        tags=["domains & glossary"],
    )
    def edit_domain_change_request(
        request_id: uuid.UUID,
        body: DomainChangeRequestUpdate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> DomainChangeRequest:
        _require_role(
            session,
            actor,
            "domain_register_owner",
            "Only the domain register owner may edit a review draft",
        )
        change = session.scalar(
            select(DomainChangeRequest)
            .where(DomainChangeRequest.id == request_id)
            .with_for_update()
        )
        if change is None:
            raise HTTPException(404, "Domain change request not found")
        if change.status != "submitted":
            raise HTTPException(409, "Only a submitted request may be edited")
        require_revision(if_match, change.revision)
        change.review_payload = body.review_payload.model_dump(
            mode="json", by_alias=True, exclude_none=True
        )
        change.revision += 1
        change.updated_at = utc_now()
        audit(
            session,
            "domain-change-request",
            str(change.id),
            "review-draft-updated",
            actor,
            change.revision,
            {"status": change.status},
        )
        session.commit()
        response.headers["ETag"] = etag_for_revision(change.revision)
        return change

    @router.post(
        "/domain-change-requests/{request_id}/decision",
        response_model=DomainChangeRequestResponse,
        tags=["domains & glossary"],
    )
    def decide_domain_change_request(
        request_id: uuid.UUID,
        body: GovernanceDecision,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> DomainChangeRequest:
        _require_role(
            session,
            actor,
            "domain_register_owner",
            "Only the domain register owner may decide a request",
        )
        change = session.scalar(
            select(DomainChangeRequest)
            .where(DomainChangeRequest.id == request_id)
            .with_for_update()
        )
        if change is None:
            raise HTTPException(404, "Domain change request not found")
        if change.status != "submitted":
            raise HTTPException(409, "The request already has a final decision")
        require_revision(if_match, change.revision)
        now = utc_now()
        affected_domain: Domain | None = None
        if body.decision == "reject":
            change.status = "rejected"
        elif change.operation == "create":
            fixture_target = (
                session.scalar(
                    select(Domain).where(Domain.id == change.target_domain_id).with_for_update()
                )
                if change.id == DEFENCE_REQUEST_ID and change.target_domain_id
                else None
            )
            if fixture_target is not None and fixture_target.lifecycle == "retired":
                fixture_target.lifecycle = "active"
                fixture_target.retired_at = None
                created = _update_domain(
                    session,
                    fixture_target,
                    change.review_payload,
                    change_actor=actor,
                )
            else:
                created = _create_domain(session, change.review_payload)
                change.target_domain_id = created.id
            affected_domain = created
            change.status = "approved"
        else:
            target = session.scalar(
                select(Domain).where(Domain.id == change.target_domain_id).with_for_update()
            )
            if target is None:
                change.status = "stale"
                session.commit()
                raise HTTPException(409, "The target domain no longer exists")
            if target.revision != change.base_revision:
                change.status = "stale"
                session.commit()
                raise HTTPException(412, f"The current domain revision is {target.revision}")
            affected_domain = _update_domain(
                session,
                target,
                change.review_payload,
                retire=change.operation == "retire",
                change_actor=actor,
            )
            change.status = "approved"
        change.reviewer_user_id = actor
        change.decision_comment = body.comment.strip()
        change.decided_at = now
        change.updated_at = now
        _complete_linked_tasks(session, domain_request_id=change.id)
        _create_workflow_task(
            session,
            task_type="domain_change_decision",
            task_kind="information",
            assignee=change.requester_user_id,
            title=f"Domain request {change.status}",
            detail=body.comment.strip(),
            domain_request_id=change.id,
        )
        if affected_domain is not None:
            audit(
                session,
                "domain",
                str(affected_domain.id),
                change.operation + "-approved",
                actor,
                affected_domain.revision,
                {"requestId": str(change.id), "status": affected_domain.lifecycle},
            )
        audit(
            session,
            "domain-change-request",
            str(change.id),
            "decided",
            actor,
            change.revision,
            {"operation": change.operation, "status": change.status},
        )
        session.commit()
        return change

    @router.get("/documentation/responsibilities", tags=["documentation"])
    def read_documentation_responsibilities(
        session: SessionDep,
        actor: ActorDep,
        lang: Literal["de", "fr", "it", "en"] = "de",
    ) -> dict[str, Any]:
        return catalog_responsibilities(session, actor, lang)

    @router.get("/documentation/role-changes", tags=["documentation"])
    def read_documentation_role_changes(
        session: SessionDep,
        actor: ActorDep,
        lang: Literal["de", "fr", "it", "en"] = "de",
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        before: Annotated[int | None, Query(ge=1)] = None,
    ) -> dict[str, Any]:
        return role_change_history(session, actor, lang, limit=limit, before=before)

    @router.get("/documentation/glossary/lookup", tags=["documentation"])
    def lookup_documentation_glossary_term(
        term: str,
        session: SessionDep,
        actor: ActorDep,
        lang: Literal["de", "fr", "it", "en"] = "de",
    ) -> dict[str, Any]:
        del actor
        needle = term.strip().casefold()
        if not needle:
            raise HTTPException(404, "Glossary term not found")
        matched_id = next((row.term_id for row in session.scalars(select(SiteGlossaryLocalization))
                           if row.preferred_label.casefold() == needle
                           or row.normalized_label.casefold() == needle), None)
        if matched_id is None:
            raise HTTPException(404, "Glossary term not found")
        item = next((entry for entry in glossary_entries(session, lang) if entry["id"] == str(matched_id)), None)
        if item is None:
            raise HTTPException(404, "Glossary term not found")
        return item

    @router.get("/documentation/glossary", tags=["documentation"])
    def list_documentation_glossary(
        session: SessionDep,
        actor: ActorDep,
        lang: Literal["de", "fr", "it", "en"] = "de",
        q: str = "",
    ) -> list[dict[str, Any]]:
        del actor
        return glossary_entries(session, lang, q)

    @router.get("/documentation/glossary/{term_id}", tags=["documentation"])
    def read_documentation_glossary_term(
        term_id: uuid.UUID,
        session: SessionDep,
        actor: ActorDep,
        lang: Literal["de", "fr", "it", "en"] = "de",
    ) -> dict[str, Any]:
        del actor
        item = next((entry for entry in glossary_entries(session, lang) if entry["id"] == str(term_id)), None)
        if item is None:
            raise HTTPException(404, "Glossary term not found")
        return item

    @router.get(
        "/glossary/terms", response_model=list[GlossaryTermResponse], tags=["domains & glossary"]
    )
    def list_glossary_terms(
        session: SessionDep,
        q: str | None = None,
        domain_id: Annotated[uuid.UUID | None, Query(alias="domainId")] = None,
        include_retired: Annotated[bool, Query(alias="includeRetired")] = False,
    ) -> list[GlossaryTermResponse]:
        statement = select(GlossaryTerm)
        if not include_retired:
            active_domain = exists(
                select(GlossaryTermDomain.term_id)
                .join(Domain, Domain.id == GlossaryTermDomain.domain_id)
                .where(
                    GlossaryTermDomain.term_id == GlossaryTerm.id,
                    Domain.lifecycle == "active",
                )
            )
            statement = statement.where(GlossaryTerm.lifecycle == "active", active_domain)
        if domain_id:
            statement = statement.join(GlossaryTermDomain).where(
                GlossaryTermDomain.domain_id == domain_id
            )
        responses = [
            _term_response(session, item)
            for item in session.scalars(statement.order_by(GlossaryTerm.created_at))
        ]
        if q and q.strip():
            needle = _normalized_label(q)
            responses = [
                item
                for item in responses
                if any(
                    needle in entry.normalized_label
                    or any(needle in _normalized_label(label) for label in entry.alternative_labels)
                    or needle in _normalized_label(entry.definition)
                    for entry in item.localizations
                )
            ]
        return responses

    @router.get(
        "/glossary/terms/{term_id}",
        response_model=GlossaryTermResponse,
        tags=["domains & glossary"],
    )
    def get_glossary_term(
        term_id: uuid.UUID, response: Response, session: SessionDep
    ) -> GlossaryTermResponse:
        term = session.get(GlossaryTerm, term_id)
        if term is None:
            raise HTTPException(404, "Glossary term not found")
        response.headers["ETag"] = etag_for_revision(term.revision)
        return _term_response(session, term)

    @router.post(
        "/glossary/term-proposals",
        response_model=GlossaryTermProposalResponse,
        status_code=201,
        tags=["domains & glossary"],
    )
    def create_term_proposal(
        body: GlossaryTermProposalCreate, session: SessionDep, actor: ActorDep
    ) -> GlossaryTermProposal:
        payload = body.payload.model_dump(mode="json", by_alias=True)
        target = None
        existing_domain_ids: list[uuid.UUID] = []
        if body.target_term_id:
            target = session.get(GlossaryTerm, body.target_term_id)
            if target is None:
                raise HTTPException(404, "Target glossary term not found")
            if target.lifecycle == "retired":
                raise HTTPException(409, "A retired term cannot be changed")
            existing_domain_ids = list(
                session.scalars(
                    select(GlossaryTermDomain.domain_id).where(
                        GlossaryTermDomain.term_id == target.id
                    )
                )
            )
        if body.operation == "retire":
            payload["domainIds"] = [str(value) for value in existing_domain_ids]
            domain_ids = existing_domain_ids
        else:
            domain_ids = list(dict.fromkeys([*existing_domain_ids, *body.payload.domain_ids]))
            _active_domains(session, body.payload.domain_ids)
        domains = list(session.scalars(select(Domain).where(Domain.id.in_(domain_ids))))
        if len(domains) != len(domain_ids):
            raise HTTPException(409, "A governed domain no longer exists")
        source_product = None
        if body.source_product_id:
            source_product = find_product(session, body.source_product_id)
            if body.auto_attach and actor not in {
                source_product.owner_user_id,
                source_product.deputy_owner_user_id,
            }:
                raise HTTPException(
                    403,
                    "Only the source product owner or deputy may request automatic attachment",
                )
            if body.auto_attach and not set(body.payload.domain_ids).intersection(
                _product_domain_ids(session, source_product.id)
            ):
                raise HTTPException(
                    422, "The source product and proposed term need at least one shared domain"
                )
        proposal_id = uuid.uuid4()
        proposal = GlossaryTermProposal(
            id=proposal_id,
            request_number=f"TERM-{proposal_id.hex[:8].upper()}",
            operation=body.operation,
            target_term_id=target.id if target else None,
            requester_user_id=actor,
            source_product_id=source_product.id if source_product else None,
            source_product_revision=source_product.revision if source_product else None,
            auto_attach=body.auto_attach,
            status="in_review",
            requested_payload=payload,
            review_payload=payload,
            revision=1,
        )
        session.add(proposal)
        for domain in domains:
            session.add(
                GlossaryTermProposalReview(
                    proposal_id=proposal.id,
                    domain_id=domain.id,
                    proposal_revision=proposal.revision,
                    owner_user_id=domain.owner_user_id,
                    status="pending",
                )
            )
            _create_workflow_task(
                session,
                task_type="glossary_term_review",
                task_kind="action",
                assignee=domain.owner_user_id,
                title=f"Review glossary proposal {proposal.request_number}",
                detail="Your domain must decide this exact proposal revision.",
                term_proposal_id=proposal.id,
                product_id=proposal.source_product_id,
            )
            _create_workflow_task(
                session,
                task_type="glossary_term_collaboration",
                task_kind="action",
                assignee=domain.deputy_owner_user_id,
                title=f"Collaborate on glossary proposal {proposal.request_number}",
                detail="You may edit the review draft, but only the primary owner may decide.",
                term_proposal_id=proposal.id,
                product_id=proposal.source_product_id,
            )
        audit(
            session,
            "glossary-term-proposal",
            str(proposal.id),
            "submitted",
            actor,
            proposal.revision,
            {"operation": proposal.operation, "status": proposal.status},
        )
        session.commit()
        session.refresh(proposal)
        return proposal

    @router.get(
        "/glossary/term-proposals",
        response_model=list[GlossaryTermProposalResponse],
        tags=["domains & glossary"],
    )
    def list_term_proposals(session: SessionDep, actor: ActorDep) -> list[GlossaryTermProposal]:
        governed_domains = list(
            session.scalars(
                select(Domain.id).where(
                    or_(Domain.owner_user_id == actor, Domain.deputy_owner_user_id == actor)
                )
            )
        )
        visible_review = exists(
            select(GlossaryTermProposalReview.proposal_id).where(
                GlossaryTermProposalReview.proposal_id == GlossaryTermProposal.id,
                GlossaryTermProposalReview.domain_id.in_(governed_domains),
            )
        )
        return list(
            session.scalars(
                select(GlossaryTermProposal)
                .where(or_(GlossaryTermProposal.requester_user_id == actor, visible_review))
                .options(selectinload(GlossaryTermProposal.reviews))
                .order_by(GlossaryTermProposal.created_at.desc())
            )
        )

    @router.get(
        "/glossary/term-proposals/{proposal_id}",
        response_model=GlossaryTermProposalResponse,
        tags=["domains & glossary"],
    )
    def get_term_proposal(
        proposal_id: uuid.UUID, response: Response, session: SessionDep, actor: ActorDep
    ) -> GlossaryTermProposal:
        proposal = session.scalar(
            select(GlossaryTermProposal)
            .where(GlossaryTermProposal.id == proposal_id)
            .options(selectinload(GlossaryTermProposal.reviews))
        )
        if proposal is None:
            raise HTTPException(404, "Glossary term proposal not found")
        domain_ids = [review.domain_id for review in proposal.reviews]
        domains = list(session.scalars(select(Domain).where(Domain.id.in_(domain_ids))))
        if proposal.requester_user_id != actor and not any(
            actor in {domain.owner_user_id, domain.deputy_owner_user_id} for domain in domains
        ):
            raise HTTPException(404, "Glossary term proposal not found")
        response.headers["ETag"] = etag_for_revision(proposal.revision)
        return proposal

    @router.patch(
        "/glossary/term-proposals/{proposal_id}",
        response_model=GlossaryTermProposalResponse,
        tags=["domains & glossary"],
    )
    def edit_term_proposal(
        proposal_id: uuid.UUID,
        body: GlossaryTermProposalUpdate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> GlossaryTermProposal:
        proposal = session.scalar(
            select(GlossaryTermProposal)
            .where(GlossaryTermProposal.id == proposal_id)
            .options(selectinload(GlossaryTermProposal.reviews))
            .with_for_update()
        )
        if proposal is None:
            raise HTTPException(404, "Glossary term proposal not found")
        if proposal.status not in {"submitted", "in_review"}:
            raise HTTPException(409, "Only an open proposal may be edited")
        require_revision(if_match, proposal.revision)
        current_domains = list(
            session.scalars(
                select(Domain).where(
                    Domain.id.in_([review.domain_id for review in proposal.reviews])
                )
            )
        )
        if not any(
            actor in {domain.owner_user_id, domain.deputy_owner_user_id}
            for domain in current_domains
        ):
            raise HTTPException(403, "Only a responsible domain owner or deputy may edit")
        new_domain_ids = body.review_payload.domain_ids
        _active_domains(session, new_domain_ids)
        existing_domain_ids = (
            list(
                session.scalars(
                    select(GlossaryTermDomain.domain_id).where(
                        GlossaryTermDomain.term_id == proposal.target_term_id
                    )
                )
            )
            if proposal.target_term_id
            else []
        )
        governance_domain_ids = list(dict.fromkeys([*existing_domain_ids, *new_domain_ids]))
        if proposal.operation == "retire":
            governance_domain_ids = existing_domain_ids
        new_domains = list(
            session.scalars(select(Domain).where(Domain.id.in_(governance_domain_ids)))
        )
        if len(new_domains) != len(governance_domain_ids):
            raise HTTPException(409, "A governed domain no longer exists")
        _complete_linked_tasks(session, term_proposal_id=proposal.id)
        session.execute(
            delete(GlossaryTermProposalReview).where(
                GlossaryTermProposalReview.proposal_id == proposal.id
            )
        )
        session.flush()
        proposal.revision += 1
        proposal.status = "in_review"
        proposal.review_payload = body.review_payload.model_dump(mode="json", by_alias=True)
        proposal.updated_at = utc_now()
        for domain in new_domains:
            session.add(
                GlossaryTermProposalReview(
                    proposal_id=proposal.id,
                    domain_id=domain.id,
                    proposal_revision=proposal.revision,
                    owner_user_id=domain.owner_user_id,
                    status="pending",
                )
            )
            _create_workflow_task(
                session,
                task_type="glossary_term_review",
                task_kind="action",
                assignee=domain.owner_user_id,
                title=f"Review glossary proposal {proposal.request_number}",
                detail=f"The review draft changed to revision {proposal.revision}.",
                term_proposal_id=proposal.id,
                product_id=proposal.source_product_id,
            )
            _create_workflow_task(
                session,
                task_type="glossary_term_collaboration",
                task_kind="action",
                assignee=domain.deputy_owner_user_id,
                title=f"Collaborate on glossary proposal {proposal.request_number}",
                detail=f"The review draft changed to revision {proposal.revision}.",
                term_proposal_id=proposal.id,
                product_id=proposal.source_product_id,
            )
        audit(
            session,
            "glossary-term-proposal",
            str(proposal.id),
            "review-draft-updated",
            actor,
            proposal.revision,
            {"status": proposal.status},
        )
        session.commit()
        session.refresh(proposal)
        response.headers["ETag"] = etag_for_revision(proposal.revision)
        return proposal

    @router.post(
        "/glossary/term-proposals/{proposal_id}/reviews/{domain_id}/decision",
        response_model=GlossaryTermProposalResponse,
        tags=["domains & glossary"],
    )
    def decide_term_proposal_review(
        proposal_id: uuid.UUID,
        domain_id: uuid.UUID,
        body: GovernanceDecision,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> GlossaryTermProposal:
        proposal = session.scalar(
            select(GlossaryTermProposal)
            .where(GlossaryTermProposal.id == proposal_id)
            .options(selectinload(GlossaryTermProposal.reviews))
            .with_for_update()
        )
        if proposal is None:
            raise HTTPException(404, "Glossary term proposal not found")
        if proposal.status not in {"submitted", "in_review"}:
            raise HTTPException(409, "The proposal already has a final decision")
        require_revision(if_match, proposal.revision)
        review = next((item for item in proposal.reviews if item.domain_id == domain_id), None)
        if review is None:
            raise HTTPException(404, "Domain review not found")
        if review.owner_user_id != actor:
            raise HTTPException(403, "Only the primary domain owner may decide this review")
        if review.proposal_revision != proposal.revision:
            raise HTTPException(409, "This review belongs to a stale proposal revision")
        if review.status != "pending":
            raise HTTPException(409, "This domain already decided the current revision")
        review.status = "approved" if body.decision == "approve" else "rejected"
        review.decision_comment = body.comment.strip()
        review.decided_at = utc_now()
        review.updated_at = utc_now()
        decided_task = session.scalar(
            select(WorkflowTask)
            .where(
                WorkflowTask.glossary_term_proposal_id == proposal.id,
                WorkflowTask.task_type == "glossary_term_review",
                WorkflowTask.assignee_user_id == actor,
                WorkflowTask.status != "completed",
            )
            .order_by(WorkflowTask.created_at, WorkflowTask.id)
            .limit(1)
        )
        if decided_task is not None:
            decided_task.status = "completed"
            decided_task.completed_at = utc_now()
            decided_task.updated_at = utc_now()
        if body.decision == "reject":
            proposal.status = "rejected"
            proposal.decision_comment = body.comment.strip()
            proposal.decided_at = utc_now()
            _complete_linked_tasks(session, term_proposal_id=proposal.id)
            _create_workflow_task(
                session,
                task_type="glossary_term_decision",
                task_kind="information",
                assignee=proposal.requester_user_id,
                title="Glossary term proposal rejected",
                detail=body.comment.strip(),
                term_proposal_id=proposal.id,
                product_id=proposal.source_product_id,
            )
        else:
            session.flush()
            if all(
                item.status == "approved" for item in proposal.reviews
            ) and not _mark_term_proposal_stale_for_retired_domains(session, proposal, actor):
                _accept_term_proposal(session, proposal, actor)
        audit(
            session,
            "glossary-term-proposal",
            str(proposal.id),
            "domain-review-decided",
            actor,
            proposal.revision,
            {
                "domainId": str(domain_id),
                "decision": review.status,
                "status": proposal.status,
            },
        )
        session.commit()
        session.refresh(proposal)
        return proposal

    @router.get(
        "/data-products/{product_id}/semantic-suggestions",
        response_model=list[SemanticSuggestionResponse],
        tags=["domains & glossary"],
    )
    def semantic_suggestions(
        product_id: uuid.UUID,
        request: Request,
        session: SessionDep,
        actor: OptionalActorDep,
        threshold: Annotated[float | None, Query(ge=0, le=100)] = None,
    ) -> list[SemanticSuggestionResponse]:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        effective_threshold = (
            threshold
            if threshold is not None
            else getattr(request.app.state.settings, "semantic_suggestion_threshold", 70.0)
        )
        fields: dict[str, str] = {
            "title": product.title,
            "description": product.description,
            "keywords": " ".join(product.keywords),
        }
        descriptions = " ".join(
            item.business_description or ""
            for item in session.scalars(
                select(DataProductField).where(DataProductField.data_product_id == product.id)
            )
        ).strip()
        if descriptions:
            fields["fieldDescriptions"] = descriptions
        candidates: list[SuggestionCandidate] = []
        for domain in session.scalars(select(Domain).where(Domain.lifecycle == "active")):
            response_item = _domain_response(session, domain)
            candidates.append(
                SuggestionCandidate(
                    kind="domain",
                    id=domain.id,
                    label=response_item.preferred_label,
                    search_values=tuple(
                        value
                        for item in response_item.localizations
                        for value in (item.preferred_label, item.definition)
                    ),
                )
            )
        for term in session.scalars(select(GlossaryTerm).where(GlossaryTerm.lifecycle == "active")):
            response_item = _term_response(session, term)
            candidates.append(
                SuggestionCandidate(
                    kind="glossaryTerm",
                    id=term.id,
                    label=response_item.preferred_label,
                    search_values=tuple(
                        value
                        for item in response_item.localizations
                        for value in (
                            item.preferred_label,
                            *item.alternative_labels,
                        )
                    ),
                )
            )
        return [
            SemanticSuggestionResponse.model_validate(item, from_attributes=True)
            for item in RapidFuzzSuggestionProvider().rank(
                candidates, fields, threshold=effective_threshold, limit=5
            )
        ]

    @router.get("/knowledge-graph", tags=["domains & glossary"])
    def knowledge_graph(
        session: SessionDep,
        domain_id: Annotated[uuid.UUID | None, Query(alias="domainId")] = None,
    ) -> Response:
        graph = Graph()
        catalog = URIRef("urn:daca:catalog:bit-poc")
        register = URIRef("urn:daca:domain-register:bit-poc")
        graph.add((catalog, RDF.type, DCAT.Catalog))
        graph.add((catalog, DCAT.themeTaxonomy, register))
        graph.add((register, RDF.type, SKOS.ConceptScheme))
        domain_statement = select(Domain).where(Domain.lifecycle == "active")
        if domain_id:
            domain_statement = domain_statement.where(Domain.id == domain_id)
        domains = list(session.scalars(domain_statement))
        selected_ids = {item.id for item in domains}
        for domain in domains:
            domain_uri = URIRef(domain.urn)
            glossary_scheme = URIRef(f"{domain.urn}:glossary")
            graph.add((domain_uri, RDF.type, SKOS.Concept))
            graph.add((domain_uri, SKOS.inScheme, register))
            graph.add((glossary_scheme, RDF.type, SKOS.ConceptScheme))
            for label in session.scalars(
                select(DomainLocalization).where(DomainLocalization.domain_id == domain.id)
            ):
                graph.add(
                    (
                        domain_uri,
                        SKOS.prefLabel,
                        RdfLiteral(label.preferred_label, lang=label.language),
                    )
                )
                graph.add(
                    (domain_uri, SKOS.definition, RdfLiteral(label.definition, lang=label.language))
                )
        term_ids = (
            set(
                session.scalars(
                    select(GlossaryTermDomain.term_id)
                    .join(Domain, Domain.id == GlossaryTermDomain.domain_id)
                    .where(
                        GlossaryTermDomain.domain_id.in_(selected_ids),
                        Domain.lifecycle == "active",
                    )
                )
            )
            if selected_ids
            else set()
        )
        terms = (
            list(
                session.scalars(
                    select(GlossaryTerm).where(
                        GlossaryTerm.id.in_(term_ids), GlossaryTerm.lifecycle == "active"
                    )
                )
            )
            if term_ids
            else []
        )
        for term in terms:
            term_uri = URIRef(term.urn)
            graph.add((term_uri, RDF.type, SKOS.Concept))
            for assignment in session.scalars(
                select(GlossaryTermDomain).where(
                    GlossaryTermDomain.term_id == term.id,
                    GlossaryTermDomain.domain_id.in_(selected_ids),
                )
            ):
                domain = session.get(Domain, assignment.domain_id)
                graph.add((term_uri, SKOS.inScheme, URIRef(f"{domain.urn}:glossary")))
            for label in session.scalars(
                select(GlossaryTermLocalization).where(GlossaryTermLocalization.term_id == term.id)
            ):
                graph.add(
                    (
                        term_uri,
                        SKOS.prefLabel,
                        RdfLiteral(label.preferred_label, lang=label.language),
                    )
                )
                graph.add(
                    (term_uri, SKOS.definition, RdfLiteral(label.definition, lang=label.language))
                )
                for alternative in label.alternative_labels:
                    graph.add(
                        (term_uri, SKOS.altLabel, RdfLiteral(alternative, lang=label.language))
                    )
            for relation in session.scalars(
                select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id == term.id)
            ):
                target = (
                    session.get(GlossaryTerm, relation.target_term_id)
                    if relation.target_term_id
                    else None
                )
                target_uri = URIRef(target.urn if target else relation.target_uri)
                predicate = {
                    "exactMatch": SKOS.exactMatch,
                    "closeMatch": SKOS.closeMatch,
                    "broader": SKOS.broader,
                    "narrower": SKOS.narrower,
                    "related": SKOS.related,
                }[relation.relation]
                graph.add((term_uri, predicate, target_uri))
        product_statement = select(DataProduct).where(
            DataProduct.discoverable.is_(True), DataProduct.lifecycle != "retired"
        )
        for product in session.scalars(product_statement):
            product_domains = set(_product_domain_ids(session, product.id)).intersection(
                selected_ids
            )
            if not product_domains:
                continue
            product_uri = URIRef(product.urn)
            graph.add((product_uri, RDF.type, DCAT.Dataset))
            graph.add((product_uri, DCTERMS.title, RdfLiteral(product.title)))
            for assigned_domain_id in product_domains:
                domain = session.get(Domain, assigned_domain_id)
                graph.add((product_uri, DCAT.theme, URIRef(domain.urn)))
            for assigned_term_id in set(_product_term_ids(session, product.id)).intersection(
                term_ids
            ):
                term = session.get(GlossaryTerm, assigned_term_id)
                if term and term.lifecycle == "active":
                    graph.add((product_uri, DCTERMS.subject, URIRef(term.urn)))
        serialized = graph.serialize(format="json-ld", indent=2, ensure_ascii=False)
        return Response(content=serialized, media_type="application/ld+json")

    @router.get(
        "/source-catalog",
        response_model=SourceCatalogPage,
        tags=["source access"],
    )
    def list_source_catalog(
        session: SessionDep,
        actor: ActorDep,
        source_type: Annotated[str, Query(alias="sourceType")] = "oracle",
        q: str | None = None,
        site: Literal["PRIMUS", "CAMPUS", "both"] | None = None,
        offset: Annotated[int, Query(ge=0)] = 0,
        limit: Annotated[int, Query(ge=1, le=50)] = 12,
    ) -> SourceCatalogPage:
        return source_catalog_page(
            session,
            actor,
            source_type=source_type,
            query=q,
            site=site,
            offset=offset,
            limit=limit,
        )

    @router.get(
        "/source-catalog/{source_id}/access-context",
        response_model=SourceAccessContextResponse,
        tags=["source access"],
    )
    def get_source_access_context(
        source_id: str,
        session: SessionDep,
        actor: ActorDep,
    ) -> SourceAccessContextResponse:
        return source_access_context(session, actor, source_id)

    @router.post(
        "/source-access-requests",
        response_model=SourceAccessRequestResponse,
        status_code=201,
        tags=["source access"],
    )
    def submit_source_access_request(
        body: SourceAccessRequestCreate,
        session: SessionDep,
        actor: ActorDep,
    ) -> SourceAccessRequestResponse:
        return create_source_access_request(session, actor, body)

    @router.get(
        "/source-access-requests/mine",
        response_model=list[SourceAccessRequestResponse],
        tags=["source access"],
    )
    def list_my_source_access_requests(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[SourceAccessRequestResponse]:
        return source_requests_for_actor(session, actor)

    @router.get(
        "/source-access-requests/inbox",
        response_model=list[SourceAccessRequestResponse],
        tags=["source access"],
    )
    def list_source_access_request_inbox(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[SourceAccessRequestResponse]:
        return source_requests_for_owner(session, actor)

    @router.post(
        "/source-access-requests/{request_id}/decision",
        response_model=SourceAccessRequestResponse,
        tags=["source access"],
    )
    def decide_source_request(
        request_id: uuid.UUID,
        body: SourceAccessDecision,
        session: SessionDep,
        actor: ActorDep,
    ) -> SourceAccessRequestResponse:
        return decide_source_access_request(session, actor, request_id, body)

    @router.get(
        "/source-access-grants/mine",
        response_model=list[SourceAccessGrantResponse],
        tags=["source access"],
    )
    def list_my_source_access_grants(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[SourceAccessGrantResponse]:
        return source_grants_for_actor(session, actor)

    @router.get(
        "/identity-directory/organizations",
        response_model=list[AdministrativeOrganizationResponse],
        tags=["identity directory"],
    )
    def list_administrative_organizations(
        session: SessionDep,
        actor: ActorDep,
        parent_id: Annotated[str | None, Query(alias="parentId")] = None,
        language: Literal["de", "fr", "it", "en", "rm"] = "de",
    ) -> list[AdministrativeOrganizationResponse]:
        del actor
        statement = select(AdministrativeOrganization).where(AdministrativeOrganization.active.is_(True))
        if parent_id is not None:
            statement = statement.where(AdministrativeOrganization.parent_id == parent_id)
        organizations = session.scalars(
            statement
            .order_by(
                AdministrativeOrganization.department_order,
                AdministrativeOrganization.office_order,
            )
        )
        result = []
        for item in organizations:
            localized = session.get(AdministrativeOrganizationLabel, (item.id, language))
            result.append(AdministrativeOrganizationResponse(
                id=item.id,
                parent_id=item.parent_id,
                department_code=item.department_code,
                office_code=item.office_code,
                display_name=localized.label if localized else item.display_name,
                organization_type=item.organization_type,
                label=(
                    f"{item.department_code} - {item.office_code}"
                    if item.office_code
                    else item.department_code
                ),
                source_id=item.source_id,
                source_uri=item.source_uri,
            ))
        return result

    @router.get(
        "/identity-directory/organizations/{organization_id}",
        response_model=AdministrativeOrganizationResponse,
        tags=["identity directory"],
    )
    def get_administrative_organization(
        organization_id: str,
        session: SessionDep,
        actor: ActorDep,
        language: Literal["de", "fr", "it", "en", "rm"] = "de",
    ) -> AdministrativeOrganizationResponse:
        del actor
        item = session.get(AdministrativeOrganization, organization_id)
        if item is None or not item.active:
            raise HTTPException(404, "Organization not found")
        breadcrumb: list[dict[str, str]] = []
        cursor: AdministrativeOrganization | None = item
        seen: set[str] = set()
        while cursor is not None:
            if cursor.id in seen:
                raise HTTPException(500, "Organization hierarchy contains a cycle")
            seen.add(cursor.id)
            localized = session.get(AdministrativeOrganizationLabel, (cursor.id, language))
            breadcrumb.append({"id": cursor.id, "label": localized.label if localized else cursor.display_name})
            cursor = session.get(AdministrativeOrganization, cursor.parent_id) if cursor.parent_id else None
        breadcrumb.reverse()
        localized = session.get(AdministrativeOrganizationLabel, (item.id, language))
        return AdministrativeOrganizationResponse(
            id=item.id, parent_id=item.parent_id, department_code=item.department_code,
            office_code=item.office_code, display_name=localized.label if localized else item.display_name,
            organization_type=item.organization_type, label=item.office_code or item.department_code,
            source_id=item.source_id, source_uri=item.source_uri, breadcrumb=breadcrumb,
        )

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
            session.scalars(statement.order_by(IdentityDirectoryEntry.display_name).limit(limit))
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
        organization_id: str | None = None,
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
        if organization_id:
            statement = statement.where(IdentityGroup.organization_id == organization_id)
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
            organization_id=actor_identity.organization_id if actor_identity else None,
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

    @router.get(
        "/poc/product-fixtures", response_model=list[PocProductFixtureResponse], tags=["POC"]
    )
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
                injected_product_id=publications.get(
                    (fixture.payload.get("sourceSystem", "DAAIF"), fixture.source_product_id)
                ),
            )
            for fixture in session.scalars(
                select(PocProductFixture).order_by(
                    PocProductFixture.owner_user_id, PocProductFixture.id
                )
            )
        ]

    @router.get(
        "/poc/access-renewal-fixture",
        response_model=PocAccessRenewalFixtureResponse,
        tags=["POC simulation"],
    )
    def get_access_renewal_fixture(
        session: SessionDep,
        actor: ActorDep,
    ) -> PocAccessRenewalFixtureResponse:
        product = find_product(session, ACCESS_RENEWAL_PRODUCT_ID)
        require_product_owner(product, actor)
        return access_renewal_fixture_response(session)

    @router.post(
        "/poc/access-renewal-fixture/prepare",
        response_model=PocAccessRenewalFixtureResponse,
        tags=["POC simulation"],
    )
    def prepare_access_renewal_fixture_route(
        request: Request,
        session: SessionDep,
        actor: ActorDep,
    ) -> PocAccessRenewalFixtureResponse:
        product = find_product(session, ACCESS_RENEWAL_PRODUCT_ID)
        require_product_owner(product, actor)
        prepare_access_renewal_fixture(
            session,
            product,
            request.app.state.settings,
            on_date=zurich_today(),
        )
        session.commit()
        return access_renewal_fixture_response(session)

    @router.post(
        "/poc/access-renewal-fixture/reset",
        response_model=PocAccessRenewalFixtureResponse,
        tags=["POC simulation"],
    )
    def reset_access_renewal_fixture_route(
        body: PocProductResetRequest,
        request: Request,
        session: SessionDep,
        actor: ActorDep,
    ) -> PocAccessRenewalFixtureResponse:
        product = find_product(session, ACCESS_RENEWAL_PRODUCT_ID)
        require_product_owner(product, actor)
        if body.confirmation_name != product.title:
            raise HTTPException(
                422, "confirmationName must exactly match the fixture product title"
            )
        today = zurich_today()
        reset_access_renewal_fixture(
            session,
            product,
            request.app.state.settings,
            on_date=today,
        )
        audit(
            session,
            "policy",
            str(product.id),
            "access-renewal-fixture-reset",
            actor,
            product.active_policy_revision,
            {
                "fixtureId": "access-renewal-expiring",
                "validUntil": (today + timedelta(days=14)).isoformat(),
            },
        )
        session.commit()
        return access_renewal_fixture_response(session, on_date=today)

    @router.get(
        "/poc/domain-glossary-fixture",
        response_model=PocDomainGlossaryFixtureResponse,
        tags=["POC simulation"],
    )
    def get_domain_glossary_fixture(
        session: SessionDep, actor: ActorDep
    ) -> PocDomainGlossaryFixtureResponse:
        product = find_product(session, VEHICLE_PRODUCT_ID)
        if actor not in {product.owner_user_id, product.deputy_owner_user_id}:
            raise HTTPException(403, "Only the fixture product stewards may manage this fixture")
        return _domain_glossary_fixture_response(session)

    @router.post(
        "/poc/domain-glossary-fixture/prepare",
        response_model=PocDomainGlossaryFixtureResponse,
        tags=["POC simulation"],
    )
    def prepare_domain_glossary_fixture_route(
        session: SessionDep, actor: ActorDep
    ) -> PocDomainGlossaryFixtureResponse:
        product = find_product(session, VEHICLE_PRODUCT_ID)
        if actor not in {product.owner_user_id, product.deputy_owner_user_id}:
            raise HTTPException(403, "Only the fixture product stewards may manage this fixture")
        _prepare_domain_glossary_fixture(session, product, actor)
        session.commit()
        return _domain_glossary_fixture_response(session)

    @router.post(
        "/poc/domain-glossary-fixture/reset",
        response_model=PocDomainGlossaryFixtureResponse,
        tags=["POC simulation"],
    )
    def reset_domain_glossary_fixture_route(
        body: PocDomainGlossaryAction,
        session: SessionDep,
        actor: ActorDep,
    ) -> PocDomainGlossaryFixtureResponse:
        product = find_product(session, VEHICLE_PRODUCT_ID)
        if actor not in {product.owner_user_id, product.deputy_owner_user_id}:
            raise HTTPException(403, "Only the fixture product stewards may manage this fixture")
        if body.confirmation_name != "DOMAIN-GLOSSARY":
            raise HTTPException(422, "confirmationName must exactly match DOMAIN-GLOSSARY")
        _reset_domain_glossary_fixture(session, product, actor)
        session.commit()
        return _domain_glossary_fixture_response(session)

    @router.post(
        "/metadata-publications",
        response_model=MetadataPublicationResponse,
        status_code=201,
        tags=["metadata publication"],
        summary="Publish REST metadata from an external curation platform",
        description=(
            "Accepts catalog metadata only. No credentials, secrets or product payloads are stored. "
            "Publication never grants data access; PBAC remains default deny until a policy is published. "
            "The endpoint is enabled only when DACA_OPEN_METADATA_PUBLICATION=true."
        ),
        responses={
            200: {
                "description": "Idempotent replay of an identical source publication.",
                "model": MetadataPublicationResponse,
            },
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
        digest = hashlib.sha256(
            json.dumps(normalized, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        existing = session.scalar(
            select(MetadataPublication).where(
                MetadataPublication.source_system == body.source_system,
                MetadataPublication.source_product_id == body.source_product_id,
            )
        )
        if existing is not None:
            if existing.payload_hash != digest:
                raise HTTPException(
                    409, "This source product was already published with different metadata"
                )
            task_ids = list(
                session.scalars(
                    select(WorkflowTask.id).where(
                        WorkflowTask.data_product_id == existing.data_product_id
                    )
                )
            )
            product = find_product(session, existing.data_product_id)
            quality = quality_response(session, product)
            session.commit()
            response.status_code = 200
            return MetadataPublicationResponse(
                publication_id=existing.id,
                product_id=existing.data_product_id,
                state=existing.state,
                created=False,
                missing_fields=[
                    criterion.label for criterion in quality.criteria if not criterion.complete
                ],
                task_ids=task_ids,
            )

        product_id = stable_id(f"product:{body.source_system}:{body.source_product_id}")
        if session.get(DataProduct, product_id) is not None:
            raise HTTPException(
                409, "The deterministic catalog product identifier is already in use"
            )
        business = body.business_metadata
        product = DataProduct(
            id=product_id,
            urn=f"urn:daca:source:{body.source_system.lower()}:{body.source_product_id}",
            origin_catalog=f"urn:daca:source:{body.source_system.lower()}",
            revision=1,
            active_policy_revision=None,
            owner_user_id=owner.id,
            discoverable=body.discoverable if body.publication_mode == "automatic" else False,
            title=business.title
            if business and business.title
            else body.technical_metadata.service_name,
            description=business.description
            if business and business.description
            else "Fachliche Beschreibung ausstehend; technische Metadaten wurden aus DAAIF übernommen.",
            owner=owner.organization,
            domain=business.domain if business and business.domain else "Nicht zugeordnet",
            lifecycle="active" if body.publication_mode == "automatic" else "draft",
            classification=business.classification
            if business and business.classification
            else "internal",
            keywords=business.keywords if business else [],
            contact={
                "name": owner.display_name,
                "email": business.contact_email
                if business and business.contact_email
                else owner.email,
            },
            license="Interadministrative Nutzung · POC",
            quality={"source": "DAAIF", "assessment": "pending"},
            update_frequency=business.update_frequency if business else None,
            extra_metadata={
                "sourceSystem": body.source_system,
                "sourceProductId": body.source_product_id,
                "publicationMode": body.publication_mode,
                "requestedDiscoverable": body.discoverable,
                "deliveryProtocols": ["REST"],
                "dataOwner": {
                    "name": owner.display_name,
                    "organization": owner.organization,
                    "avatarUrl": owner.avatar_url,
                    "phone": owner.phone,
                },
                "catalogUsage": {
                    "responsibleUserIds": [owner.id],
                    "sharedByUserIds": [],
                    "requestedByUserIds": [],
                    "sharedWithUserIds": [],
                    "consumerUserIds": [],
                    "consumerMachineIds": [],
                },
            },
        )
        session.add(product)
        session.flush()
        if business and business.domain:
            legacy_matches = list(
                session.scalars(
                    select(Domain)
                    .join(DomainLocalization)
                    .where(
                        Domain.lifecycle == "active",
                        DomainLocalization.normalized_label == _normalized_label(business.domain),
                    )
                )
            )
            unique_legacy_matches = {item.id: item for item in legacy_matches}
            if len(unique_legacy_matches) == 1:
                session.add(
                    DataProductDomain(
                        data_product_id=product.id,
                        domain_id=next(iter(unique_legacy_matches)),
                        position=0,
                        assigned_by_user_id=owner.id,
                    )
                )
        assign_default_deputy_owner(session, product)
        assign_default_control_person(session, product)
        endpoint = body.technical_metadata.endpoint
        session.add(
            Endpoint(
                id=stable_id(f"endpoint:{body.source_system}:{body.source_product_id}"),
                data_product_id=product_id,
                name=body.technical_metadata.service_name,
                description="Von DAAIF gemeldeter REST Data Service",
                protocol="http-rest",
                connection={
                    "baseUrl": endpoint.base_url,
                    "path": endpoint.path,
                    "method": endpoint.method,
                    "mediaType": "application/json",
                },
                secret_ref=None,
            )
        )
        created_fields: list[tuple[DataProductField, Any]] = []
        for source_field in body.technical_metadata.schema_fields:
            field_row = DataProductField(
                id=stable_id(
                    f"field:{body.source_system}:{body.source_product_id}:{source_field.name}"
                ),
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
            state="pending_review"
            if body.publication_mode == "governance_review"
            else "published_incomplete",
        )
        session.add(publication)
        assessment = ProductQualityAssessment(
            data_product_id=product_id,
            discoverability_confirmed="discoverable" in body.model_fields_set,
            dcat_reviewed=(
                bool(business and business.dcat_reviewed)
                if body.publication_mode != "governance_review"
                else False
            ),
        )
        session.add(assessment)
        if business and business.graph:
            review_required = body.publication_mode == "governance_review"
            session.add(
                ProductContextGraph(
                    data_product_id=product_id,
                    graph=business.graph,
                    status="suggested" if review_required else "confirmed",
                    confirmed_by=None if review_required else owner.id,
                )
            )

        active_version = session.scalar(
            select(CanonicalOntologyVersion)
            .where(CanonicalOntologyVersion.active.is_(True))
            .limit(1)
        )
        explicit_class_uri = business.product_class_uri if business else None
        suggested_class_uri = explicit_class_uri or daaif_ontology_suggestion(
            body.source_product_id
        )
        if suggested_class_uri and active_version:
            class_term = session.scalar(
                select(CanonicalOntologyTerm).where(
                    CanonicalOntologyTerm.uri == suggested_class_uri,
                    CanonicalOntologyTerm.kind == "class",
                    CanonicalOntologyTerm.ontology_version_id == active_version.id,
                )
            )
            if class_term:
                mapping_status = (
                    "suggested"
                    if body.publication_mode == "governance_review" or not explicit_class_uri
                    else "confirmed"
                )
                session.add(
                    ProductSemanticMapping(
                        id=uuid.uuid4(),
                        data_product_id=product_id,
                        data_product_field_id=None,
                        ontology_term_id=class_term.id,
                        mapping_type="product_class",
                        status=mapping_status,
                        confirmed_by=None if mapping_status == "suggested" else owner.id,
                    )
                )
        for field_row, source_field in created_fields:
            explicit_term_uri = source_field.ontology_term_uri
            suggested_term_uri = explicit_term_uri or daaif_ontology_suggestion(
                body.source_product_id, source_field.name
            )
            if suggested_term_uri and active_version:
                term = session.scalar(
                    select(CanonicalOntologyTerm).where(
                        CanonicalOntologyTerm.uri == suggested_term_uri,
                        CanonicalOntologyTerm.kind == "property",
                        CanonicalOntologyTerm.ontology_version_id == active_version.id,
                    )
                )
                if term:
                    mapping_status = (
                        "suggested"
                        if body.publication_mode == "governance_review" or not explicit_term_uri
                        else "confirmed"
                    )
                    session.add(
                        ProductSemanticMapping(
                            id=uuid.uuid4(),
                            data_product_id=product_id,
                            data_product_field_id=field_row.id,
                            ontology_term_id=term.id,
                            mapping_type="field_property",
                            status=mapping_status,
                            confirmed_by=None if mapping_status == "suggested" else owner.id,
                        )
                    )

        tasks = [
            WorkflowTask(
                id=stable_id(f"task:quality:{product_id}"),
                task_type="metadata_quality",
                status="open",
                assignee_user_id=owner.id,
                data_product_id=product_id,
                title="Metadatenqualität sicherstellen",
                detail="Technische und fachliche Metadaten, DCAT-Zuordnung, Ontologie und Kontextgraph prüfen.",
            ),
            WorkflowTask(
                id=stable_id(f"task:governance:{product_id}"),
                task_type="access_governance",
                status="open",
                assignee_user_id=owner.id,
                data_product_id=product_id,
                title="Auffindbarkeit und Zugriff regeln",
                detail="Auffindbarkeit bestätigen und eine zeitlich begrenzte PBAC-Policy oder explizites Default Deny publizieren.",
            ),
        ]
        session.add_all(tasks)
        session.add(
            ProvenanceEvent(
                id=uuid.uuid4(),
                data_product_id=product_id,
                product_urn=product.urn,
                sequence=1,
                event_type="metadata-published-from-daaif",
                actor=body.source_system,
                details={
                    "sourceProductId": body.source_product_id,
                    "publicationMode": body.publication_mode,
                },
                occurred_at=utc_now(),
            )
        )
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
        audit(
            session,
            "data-product",
            str(product_id),
            "metadata-publication-received",
            body.source_system,
            1,
            {"sourceProductId": body.source_product_id},
        )
        session.flush()
        quality = quality_response(session, product)
        product.quality = {
            "score": quality.score,
            "medal": quality.medal,
            "criteria": [item.model_dump(by_alias=True) for item in quality.criteria],
        }
        session.commit()
        response.status_code = 201
        return MetadataPublicationResponse(
            publication_id=publication.id,
            product_id=product_id,
            state=publication.state,
            created=True,
            missing_fields=[
                criterion.label for criterion in quality.criteria if not criterion.complete
            ],
            task_ids=[task.id for task in tasks],
        )

    @router.get("/tasks/mine", response_model=list[WorkflowTaskResponse], tags=["workflow"])
    def list_my_tasks(session: SessionDep, actor: ActorDep) -> list[WorkflowTask]:
        reconcile_group_membership_tasks(session, actor)
        session.commit()
        return list(
            session.scalars(
                select(WorkflowTask)
                .where(WorkflowTask.assignee_user_id == actor, WorkflowTask.status != "completed")
                .order_by(WorkflowTask.created_at.desc())
            )
        )

    @router.post(
        "/tasks/{task_id}/acknowledge",
        response_model=WorkflowTaskResponse,
        tags=["workflow"],
    )
    def acknowledge_task(task_id: uuid.UUID, session: SessionDep, actor: ActorDep) -> WorkflowTask:
        task = session.get(WorkflowTask, task_id)
        if task is None or task.assignee_user_id != actor:
            raise HTTPException(404, "Workflow task not found")
        if task.task_kind != "information":
            raise HTTPException(409, "Only information tasks may be acknowledged")
        if task.status == "completed":
            return task
        now = utc_now()
        task.status = "completed"
        task.acknowledged_at = now
        task.completed_at = now
        task.updated_at = now
        audit(
            session,
            "workflow-task",
            str(task.id),
            "acknowledged",
            actor,
            None,
            {"taskType": task.task_type, "status": task.status},
        )
        session.commit()
        return task

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
        if (
            trigger is None
            or trigger.operation != "trigger"
            or trigger.event_type not in STATE_SIMULATION_EVENTS
        ):
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
            "product": DataProductResponse.model_validate(product).model_dump(
                mode="json", by_alias=True
            ),
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
        session.execute(delete(WorkflowTask).where(WorkflowTask.data_product_id == product.id))
        session.execute(
            delete(GovernanceSubmission).where(GovernanceSubmission.data_product_id == product.id)
        )
        if policy_ids:
            session.execute(
                delete(PolicyDeployment).where(PolicyDeployment.policy_revision_id.in_(policy_ids))
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
        session.execute(
            delete(MetadataPublication).where(MetadataPublication.data_product_id == product.id)
        )
        session.execute(
            delete(DataProductField).where(DataProductField.data_product_id == product.id)
        )
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
        domain_id: Annotated[uuid.UUID | None, Query(alias="domainId")] = None,
    ) -> DataProductPage:
        approver_visibility = exists(
            select(GovernanceSubmission.id).where(
                GovernanceSubmission.data_product_id == DataProduct.id,
                GovernanceSubmission.approver_user_id == actor,
            )
        )
        visibility = (
            or_(
                DataProduct.owner_user_id == actor,
                DataProduct.discoverable.is_(True),
                approver_visibility,
            )
            if actor
            else DataProduct.discoverable.is_(True)
        )
        statement = select(DataProduct).where(visibility).order_by(DataProduct.id).limit(limit + 1)
        if domain_id is not None:
            statement = statement.where(
                exists(
                    select(DataProductDomain.data_product_id).where(
                        DataProductDomain.data_product_id == DataProduct.id,
                        DataProductDomain.domain_id == domain_id,
                    )
                )
            )
        if cursor:
            statement = statement.where(DataProduct.id > decode_cursor(cursor))
        rows = list(session.scalars(statement))
        has_more = len(rows) > limit
        items = rows[:limit]
        quality_by_product = quality_responses(session, items)
        return DataProductPage(
            items=[
                data_product_summary(session, item, quality_by_product[item.id]) for item in items
            ],
            next_cursor=encode_cursor(items[-1].id) if has_more and items else None,
        )

    @router.get(
        "/data-products/{product_id}", response_model=DataProductResponse, tags=["data products"]
    )
    def get_data_product(
        product_id: uuid.UUID, response: Response, session: SessionDep, actor: OptionalActorDep
    ) -> DataProductResponse:
        product = find_product(session, product_id)
        if not can_view_private_product(session, product, actor):
            raise HTTPException(404, "Data product not found")
        response.headers["ETag"] = etag_for_revision(product.revision)
        return data_product_response(session, product, actor)

    @router.patch(
        "/data-products/{product_id}", response_model=DataProductResponse, tags=["data products"]
    )
    def patch_data_product(
        product_id: uuid.UUID,
        patch: DataProductPatch,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> DataProductResponse:
        current = find_product(session, product_id)
        if patch.model_fields_set.intersection(
            {"domain_ids", "glossary_term_ids"}
        ) and actor not in {
            current.owner_user_id,
            current.deputy_owner_user_id,
        }:
            raise HTTPException(
                403,
                "Only the product owner or deputy may change domains or glossary terms",
            )
        if requires_four_eyes(session, current):
            require_product_owner(current, actor)
        require_revision(if_match, current.revision)
        changes = patch.model_dump(exclude_unset=True, by_alias=False)
        requested_domain_ids = changes.pop("domain_ids", None)
        requested_term_ids = changes.pop("glossary_term_ids", None)
        unmatched_legacy_domain: str | None = None
        if requested_domain_ids is not None and "domain" in changes:
            raise HTTPException(422, "Use domainIds instead of the deprecated domain field")
        if "domain" in changes:
            legacy_value = changes.pop("domain").strip()
            if _normalized_label(legacy_value) == _normalized_label("Nicht zugeordnet"):
                requested_domain_ids = []
            else:
                matches = list(
                    session.scalars(
                        select(Domain)
                        .join(DomainLocalization)
                        .where(
                            Domain.lifecycle == "active",
                            DomainLocalization.normalized_label == _normalized_label(legacy_value),
                        )
                    )
                )
                unique_matches = {item.id: item for item in matches}
                if len(unique_matches) > 1:
                    raise HTTPException(
                        422,
                        "The deprecated domain value must uniquely match an active domain label",
                    )
                if unique_matches:
                    requested_domain_ids = list(unique_matches)
                else:
                    requested_domain_ids = []
                    unmatched_legacy_domain = legacy_value
        effective_domain_ids = (
            list(requested_domain_ids)
            if requested_domain_ids is not None
            else _product_domain_ids(session, product_id)
        )
        if requested_domain_ids is not None:
            domains_for_product = _active_domains(session, effective_domain_ids)
        else:
            domains_for_product = (
                list(session.scalars(select(Domain).where(Domain.id.in_(effective_domain_ids))))
                if effective_domain_ids
                else []
            )
        domain_by_id = {item.id: item for item in domains_for_product}
        active_domain_ids = {item.id for item in domains_for_product if item.lifecycle == "active"}
        if requested_domain_ids is not None:
            first = domain_by_id.get(effective_domain_ids[0]) if effective_domain_ids else None
            if first is None:
                changes["domain"] = unmatched_legacy_domain or "Nicht zugeordnet"
            else:
                preferred = _preferred_localization(
                    list(
                        session.scalars(
                            select(DomainLocalization).where(
                                DomainLocalization.domain_id == first.id
                            )
                        )
                    )
                )
                changes["domain"] = preferred.preferred_label if preferred else first.urn
        effective_term_ids = (
            list(requested_term_ids)
            if requested_term_ids is not None
            else _product_term_ids(session, product_id)
        )
        if len(effective_term_ids) != len(set(effective_term_ids)):
            raise HTTPException(422, "glossaryTermIds must be unique")
        term_statement = select(GlossaryTerm).where(GlossaryTerm.id.in_(effective_term_ids))
        if requested_term_ids is not None:
            term_statement = term_statement.where(GlossaryTerm.lifecycle == "active")
        terms = list(session.scalars(term_statement)) if effective_term_ids else []
        if requested_term_ids is not None and len(terms) != len(effective_term_ids):
            raise HTTPException(422, "Every glossaryTermId must reference an active term")
        for term in (
            terms if requested_domain_ids is not None or requested_term_ids is not None else []
        ):
            if term.lifecycle == "retired":
                continue
            term_domains = set(
                session.scalars(
                    select(GlossaryTermDomain.domain_id).where(
                        GlossaryTermDomain.term_id == term.id
                    )
                )
            )
            if not term_domains.intersection(active_domain_ids):
                raise HTTPException(
                    422,
                    f"Glossary term {term.id} has no active domain shared with the product",
                )
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
        if requested_domain_ids is not None:
            session.execute(
                delete(DataProductDomain).where(DataProductDomain.data_product_id == product_id)
            )
            for position, domain_id in enumerate(effective_domain_ids):
                session.add(
                    DataProductDomain(
                        data_product_id=product_id,
                        domain_id=domain_id,
                        position=position,
                        assigned_by_user_id=actor,
                    )
                )
        if requested_term_ids is not None:
            session.execute(
                delete(DataProductGlossaryTerm).where(
                    DataProductGlossaryTerm.data_product_id == product_id
                )
            )
            for term_id in effective_term_ids:
                session.add(
                    DataProductGlossaryTerm(
                        data_product_id=product_id,
                        glossary_term_id=term_id,
                        assigned_by_user_id=actor,
                    )
                )
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
        return data_product_response(session, current, actor)

    @router.get(
        "/ontology/versions/current", response_model=OntologyVersionResponse, tags=["ontology"]
    )
    def get_current_ontology_version(session: SessionDep) -> CanonicalOntologyVersion:
        version = session.scalar(
            select(CanonicalOntologyVersion)
            .where(CanonicalOntologyVersion.active.is_(True))
            .limit(1)
        )
        if version is None:
            raise HTTPException(404, "No active canonical ontology version exists")
        return version

    @router.get("/ontology/terms", response_model=list[OntologyTermResponse], tags=["ontology"])
    def list_ontology_terms(
        session: SessionDep,
        kind: Literal["class", "property", "concept"] | None = None,
        q: str | None = None,
    ) -> list[OntologyTermResponse]:
        version = session.scalar(
            select(CanonicalOntologyVersion)
            .where(CanonicalOntologyVersion.active.is_(True))
            .limit(1)
        )
        if version is None:
            return []
        statement = select(CanonicalOntologyTerm).where(
            CanonicalOntologyTerm.ontology_version_id == version.id
        )
        if kind:
            statement = statement.where(CanonicalOntologyTerm.kind == kind)
        if q and q.strip():
            needle = f"%{q.strip()}%"
            statement = statement.where(
                or_(
                    CanonicalOntologyTerm.label.ilike(needle),
                    CanonicalOntologyTerm.uri.ilike(needle),
                )
            )
        return [
            OntologyTermResponse.model_validate(
                {
                    "id": term.id,
                    "ontologyVersionId": term.ontology_version_id,
                    "uri": term.uri,
                    "kind": term.kind,
                    "label": term.label,
                    "definition": term.definition,
                    "alignments": [],
                }
            )
            for term in session.scalars(
                statement.order_by(CanonicalOntologyTerm.kind, CanonicalOntologyTerm.label)
            )
        ]

    @router.get(
        "/data-products/{product_id}/quality",
        response_model=ProductQualityWorkspaceResponse,
        tags=["quality"],
    )
    def get_product_quality(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> ProductQualityWorkspaceResponse:
        product = find_product(session, product_id)
        if not can_view_private_product(session, product, actor):
            raise HTTPException(404, "Data product not found")
        fields = list(
            session.scalars(
                select(DataProductField)
                .where(DataProductField.data_product_id == product_id)
                .order_by(DataProductField.name)
            )
        )
        graph = session.get(ProductContextGraph, product_id)
        mappings = list(
            session.scalars(
                select(ProductSemanticMapping).where(
                    ProductSemanticMapping.data_product_id == product_id
                )
            )
        )
        terms = (
            {
                term.id: term
                for term in session.scalars(
                    select(CanonicalOntologyTerm).where(
                        CanonicalOntologyTerm.id.in_(
                            [mapping.ontology_term_id for mapping in mappings]
                        )
                    )
                )
            }
            if mappings
            else {}
        )
        quality = quality_responses(session, [product], persist=False)[product.id]
        return ProductQualityWorkspaceResponse.model_validate(
            {
                "quality": quality.model_dump(mode="json", by_alias=True),
                "fields": [
                    {
                        "id": str(field.id),
                        "name": field.name,
                        "dataType": field.data_type,
                        "nullable": field.nullable,
                        "keyField": field.key_field,
                        "businessDescription": field.business_description,
                    }
                    for field in fields
                ],
                "graph": graph.graph if graph else None,
                "graphStatus": graph.status if graph else "missing",
                "mappings": [
                    {
                        "id": str(mapping.id),
                        "fieldId": str(mapping.data_product_field_id)
                        if mapping.data_product_field_id
                        else None,
                        "mappingType": mapping.mapping_type,
                        "status": mapping.status,
                        "termUri": terms[mapping.ontology_term_id].uri,
                        "termLabel": terms[mapping.ontology_term_id].label,
                    }
                    for mapping in mappings
                    if mapping.ontology_term_id in terms
                ],
            }
        )

    @router.put(
        "/data-products/{product_id}/quality",
        response_model=ProductQualityResponse,
        tags=["quality"],
    )
    def review_product_quality(
        product_id: uuid.UUID,
        body: ProductQualityReview,
        session: SessionDep,
        actor: ActorDep,
    ) -> ProductQualityResponse:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        fields = {
            field.id: field
            for field in session.scalars(
                select(DataProductField).where(DataProductField.data_product_id == product_id)
            )
        }
        if {item.id for item in body.fields} != set(fields):
            raise HTTPException(
                422, "The quality review must include every schema field exactly once"
            )
        if not any(item.key_field for item in body.fields):
            raise HTTPException(422, "At least one schema field must be marked as a key field")
        version = session.scalar(
            select(CanonicalOntologyVersion)
            .where(CanonicalOntologyVersion.active.is_(True))
            .limit(1)
        )
        if version is None:
            raise HTTPException(409, "No active canonical ontology version exists")
        class_term = session.scalar(
            select(CanonicalOntologyTerm).where(
                CanonicalOntologyTerm.ontology_version_id == version.id,
                CanonicalOntologyTerm.kind == "class",
                CanonicalOntologyTerm.uri == body.product_class_uri,
            )
        )
        if class_term is None:
            raise HTTPException(
                422, "productClassUri must reference a class in the active canonical ontology"
            )

        resolved_terms: dict[uuid.UUID, CanonicalOntologyTerm] = {}
        for item in body.fields:
            field_row = fields[item.id]
            field_row.key_field = item.key_field
            field_row.business_description = (
                item.business_description.strip() if item.business_description else None
            )
            if item.key_field:
                if not item.ontology_term_uri:
                    raise HTTPException(
                        422, f"Key field {field_row.name} needs a canonical ontology mapping"
                    )
                term = session.scalar(
                    select(CanonicalOntologyTerm).where(
                        CanonicalOntologyTerm.ontology_version_id == version.id,
                        CanonicalOntologyTerm.kind == "property",
                        CanonicalOntologyTerm.uri == item.ontology_term_uri,
                    )
                )
                if term is None:
                    raise HTTPException(
                        422, f"Ontology term for key field {field_row.name} is invalid"
                    )
                resolved_terms[item.id] = term

        product.title = body.title.strip()
        product.description = body.description.strip()
        product.domain = body.domain.strip()
        product.classification = body.classification
        product.contact = {**product.contact, "email": body.contact_email.strip().lower()}
        product.update_frequency = body.update_frequency.strip()
        product.revision += 1
        product.updated_at = utc_now()
        assessment = session.get(ProductQualityAssessment, product_id) or ProductQualityAssessment(
            data_product_id=product_id
        )
        assessment.dcat_reviewed = body.dcat_reviewed
        assessment.discoverability_confirmed = body.discoverability_confirmed
        product.discoverable = body.discoverable
        if body.discoverable and body.discoverability_confirmed:
            # Catalog visibility is metadata-only. Product data remains default deny
            # until an access policy has passed the four-eyes deployment workflow.
            product.lifecycle = "active"
        session.add(assessment)
        graph = session.get(ProductContextGraph, product_id)
        if graph is None:
            graph = ProductContextGraph(data_product_id=product_id, graph=body.graph)
            session.add(graph)
        graph.graph = body.graph
        graph.status = "confirmed" if body.graph_confirmed else "suggested"
        graph.confirmed_by = actor if body.graph_confirmed else None

        session.execute(
            delete(ProductSemanticMapping).where(
                ProductSemanticMapping.data_product_id == product_id
            )
        )
        session.add(
            ProductSemanticMapping(
                id=uuid.uuid4(),
                data_product_id=product_id,
                data_product_field_id=None,
                ontology_term_id=class_term.id,
                mapping_type="product_class",
                status="confirmed",
                confirmed_by=actor,
            )
        )
        for field_id, term in resolved_terms.items():
            session.add(
                ProductSemanticMapping(
                    id=uuid.uuid4(),
                    data_product_id=product_id,
                    data_product_field_id=field_id,
                    ontology_term_id=term.id,
                    mapping_type="field_property",
                    status="confirmed",
                    confirmed_by=actor,
                )
            )
        session.flush()
        quality = quality_response(session, product)
        if quality.dcat_reviewed and all(
            item.complete
            for item in quality.criteria
            if item.id in {"technical", "business", "graph", "ontology"}
        ):
            complete_tasks(session, product_id, "metadata_quality")
        product.quality = {
            "score": quality.score,
            "medal": quality.medal,
            "criteria": [item.model_dump(by_alias=True) for item in quality.criteria],
        }
        audit(
            session,
            "data-product",
            str(product_id),
            "quality-reviewed",
            actor,
            product.revision,
            {
                "score": quality.score,
                "medal": quality.medal,
                "ontology": ONTOLOGY_URI,
                "discoverable": product.discoverable,
            },
        )
        enqueue_active_i14y_delivery(session, product)
        session.commit()
        return quality

    @router.get(
        "/data-products/{product_id}/semantic-mappings",
        response_model=list[SemanticMappingResponse],
        tags=["ontology"],
    )
    def get_semantic_mappings(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> list[SemanticMappingResponse]:
        product = find_product(session, product_id)
        if not can_view_private_product(session, product, actor):
            raise HTTPException(404, "Data product not found")
        rows = session.execute(
            select(ProductSemanticMapping, CanonicalOntologyTerm)
            .join(
                CanonicalOntologyTerm,
                CanonicalOntologyTerm.id == ProductSemanticMapping.ontology_term_id,
            )
            .where(ProductSemanticMapping.data_product_id == product_id)
        ).all()
        return [
            SemanticMappingResponse.model_validate(
                {
                    "id": mapping.id,
                    "dataProductId": mapping.data_product_id,
                    "dataProductFieldId": mapping.data_product_field_id,
                    "ontologyTermId": term.id,
                    "termUri": term.uri,
                    "termLabel": term.label,
                    "mappingType": mapping.mapping_type,
                    "status": mapping.status,
                    "confirmedBy": mapping.confirmed_by,
                }
            )
            for mapping, term in rows
        ]

    @router.put(
        "/data-products/{product_id}/semantic-mappings",
        response_model=list[SemanticMappingResponse],
        tags=["ontology"],
    )
    def put_semantic_mappings(
        product_id: uuid.UUID,
        body: SemanticMappingsUpdate,
        session: SessionDep,
        actor: ActorDep,
    ) -> list[SemanticMappingResponse]:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        version = session.scalar(
            select(CanonicalOntologyVersion)
            .where(CanonicalOntologyVersion.active.is_(True))
            .limit(1)
        )
        if version is None:
            raise HTTPException(409, "No active canonical ontology version exists")
        class_term = session.scalar(
            select(CanonicalOntologyTerm).where(
                CanonicalOntologyTerm.ontology_version_id == version.id,
                CanonicalOntologyTerm.kind == "class",
                CanonicalOntologyTerm.uri == body.product_class_uri,
            )
        )
        if class_term is None:
            raise HTTPException(
                422, "productClassUri must reference a class in the active canonical ontology"
            )
        fields = {
            field.id: field
            for field in session.scalars(
                select(DataProductField).where(DataProductField.data_product_id == product_id)
            )
        }
        field_ids = [item.field_id for item in body.field_mappings]
        if len(field_ids) != len(set(field_ids)) or any(
            field_id not in fields for field_id in field_ids
        ):
            raise HTTPException(
                422, "Each field mapping must reference a distinct field of this product"
            )
        term_by_field: dict[uuid.UUID, CanonicalOntologyTerm] = {}
        for item in body.field_mappings:
            term = session.scalar(
                select(CanonicalOntologyTerm).where(
                    CanonicalOntologyTerm.ontology_version_id == version.id,
                    CanonicalOntologyTerm.kind == "property",
                    CanonicalOntologyTerm.uri == item.term_uri,
                )
            )
            if term is None:
                raise HTTPException(
                    422,
                    f"termUri for field {fields[item.field_id].name} must reference a property in the active canonical ontology",
                )
            term_by_field[item.field_id] = term

        session.execute(
            delete(ProductSemanticMapping).where(
                ProductSemanticMapping.data_product_id == product_id
            )
        )
        session.add(
            ProductSemanticMapping(
                id=uuid.uuid4(),
                data_product_id=product_id,
                data_product_field_id=None,
                ontology_term_id=class_term.id,
                mapping_type="product_class",
                status=body.product_class_status,
                confirmed_by=actor if body.product_class_status == "confirmed" else None,
            )
        )
        for item in body.field_mappings:
            session.add(
                ProductSemanticMapping(
                    id=uuid.uuid4(),
                    data_product_id=product_id,
                    data_product_field_id=item.field_id,
                    ontology_term_id=term_by_field[item.field_id].id,
                    mapping_type="field_property",
                    status=item.status,
                    confirmed_by=actor if item.status == "confirmed" else None,
                )
            )
        product.revision += 1
        product.updated_at = utc_now()
        session.flush()
        quality = quality_response(session, product)
        product.quality = {
            "score": quality.score,
            "medal": quality.medal,
            "criteria": [item.model_dump(by_alias=True) for item in quality.criteria],
        }
        audit(
            session,
            "data-product",
            str(product_id),
            "semantic-mappings-updated",
            actor,
            product.revision,
            {"ontologyVersion": version.uri, "fieldMappings": len(body.field_mappings)},
        )
        enqueue_active_i14y_delivery(session, product)
        session.commit()
        return get_semantic_mappings(product_id, session, actor)

    @router.get("/data-products/{product_id}/semantic-profile", tags=["ontology"])
    def get_semantic_profile(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> dict[str, Any]:
        product = find_product(session, product_id)
        if not can_view_private_product(session, product, actor):
            raise HTTPException(404, "Data product not found")
        return semantic_profile_payload(session, product)

    @router.post(
        "/data-products/{product_id}/access-governance",
        response_model=PolicyRevisionResponse,
        status_code=201,
        tags=["workflow"],
    )
    def create_access_governance(
        product_id: uuid.UUID,
        body: AccessGovernanceCreate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> PolicyRevisionResponse:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        reject_legacy_governance_path(session, product)
        product.discoverable = body.discoverable
        assessment = session.get(ProductQualityAssessment, product_id) or ProductQualityAssessment(
            data_product_id=product_id
        )
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
        person_ids = [
            grant["subject"]["id"]
            for grant in resolved_grants
            if grant["subject"]["type"] == "person"
        ]
        machine_ids = [
            grant["subject"]["id"]
            for grant in resolved_grants
            if grant["subject"]["type"] == "machine"
        ]
        group_ids = [
            grant["subject"]["id"]
            for grant in resolved_grants
            if grant["subject"]["type"] == "group"
        ]
        definition = {
            "defaultEffect": "deny",
            "effect": "allow",
            "subjects": {"userIds": person_ids, "machineIds": machine_ids, "groupIds": group_ids},
            "resources": {"productUrns": [product.urn], "owners": [product.owner]},
            "actions": ["data.read"],
            "protocols": sorted(
                {protocol for grant in resolved_grants for protocol in grant["protocols"]}
            )
            or ["http"],
            "grants": resolved_grants,
        }
        policy = PolicyRevision(
            id=uuid.uuid4(),
            data_product_id=product_id,
            revision=revision,
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
            "access-governance-draft-created",
            actor,
            revision,
            {"grants": len(resolved_grants), "discoverable": body.discoverable},
        )
        session.commit()
        policy.deployments = []
        response.headers["ETag"] = etag_for_revision(revision)
        return policy_response(policy)

    @router.post(
        "/data-products/{product_id}/governance-submissions",
        response_model=GovernanceSubmissionResponse,
        status_code=201,
        tags=["governance submissions"],
    )
    def submit_governance(
        product_id: uuid.UUID,
        body: GovernanceSubmissionCreate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> GovernanceSubmissionResponse:
        product = find_product(session, product_id)
        resolved_grants = [
            resolve_policy_grant(
                session,
                grant.model_dump(mode="json", by_alias=True),
                actor=actor,
            )
            for grant in body.grants
        ]
        submission = create_submission(session, product, body, actor, resolved_grants)
        audit(
            session,
            "data-product",
            str(product.id),
            "governance-submitted",
            actor,
            product.revision,
            {
                "submissionId": str(submission.id),
                "approverUserId": submission.approver_user_id,
                "policyRevisionId": str(submission.policy_revision_id),
            },
        )
        session.commit()
        response.headers["ETag"] = etag_for_revision(submission.revision)
        return GovernanceSubmissionResponse.model_validate(
            governance_response_payload(session, submission)
        )

    @router.get(
        "/governance-submissions/{submission_id}",
        response_model=GovernanceSubmissionResponse,
        tags=["governance submissions"],
    )
    def get_governance_submission(
        submission_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> GovernanceSubmissionResponse:
        submission = session.get(GovernanceSubmission, submission_id)
        if submission is None:
            raise HTTPException(404, "Governance submission not found")
        if actor not in {submission.owner_user_id, submission.approver_user_id}:
            raise HTTPException(
                403, "Only the owner and assigned approver may view this submission"
            )
        response.headers["ETag"] = etag_for_revision(submission.revision)
        return GovernanceSubmissionResponse.model_validate(
            governance_response_payload(session, submission)
        )

    @router.post(
        "/governance-submissions/{submission_id}/decision",
        response_model=GovernanceSubmissionResponse,
        tags=["governance submissions"],
    )
    def decide_governance_submission(
        submission_id: uuid.UUID,
        body: GovernanceDecisionCreate,
        request: Request,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> GovernanceSubmissionResponse:
        submission = session.scalar(
            select(GovernanceSubmission)
            .where(GovernanceSubmission.id == submission_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        if submission is None:
            raise HTTPException(404, "Governance submission not found")
        if actor != submission.approver_user_id or actor == submission.owner_user_id:
            raise HTTPException(403, "Only the assigned publication approver may decide")
        require_revision(if_match, submission.revision)
        result = decide_submission(
            session,
            submission,
            body,
            actor,
            request.app.state.settings,
        )
        session.commit()
        if result.deployment_error:
            raise HTTPException(
                503,
                "PostgreSQL policy deployment failed; publication remains blocked: "
                f"{result.deployment_error}",
            )
        response.headers["ETag"] = etag_for_revision(result.submission.revision)
        return GovernanceSubmissionResponse.model_validate(
            governance_response_payload(session, result.submission)
        )

    @router.get(
        "/access-requests/mine",
        response_model=list[AccessRequestResponse],
        tags=["access requests"],
    )
    def list_all_my_access_requests(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[AccessRequestResponse]:
        return [
            access_request_response(session, item)
            for item in session.scalars(
                select(AccessRequest)
                .where(AccessRequest.requester_id == actor)
                .order_by(AccessRequest.created_at.desc())
            )
        ]

    @router.get(
        "/access-requests/inbox",
        response_model=list[AccessRequestResponse],
        tags=["access requests"],
    )
    def list_owner_access_request_inbox(
        session: SessionDep,
        actor: ActorDep,
    ) -> list[AccessRequestResponse]:
        open_requests = session.scalars(
            select(AccessRequest)
            .where(
                AccessRequest.status.in_(
                    (
                        "submitted",
                        "identity_review",
                        "legal_review",
                        "conditions_review",
                        "approved_policy_pending",
                    )
                )
            )
            .options(selectinload(AccessRequest.data_product))
            .order_by(AccessRequest.created_at.desc())
        )
        result: list[AccessRequestResponse] = []
        for access_request in open_requests:
            if access_request.data_product.owner_user_id == actor:
                result.append(access_request_response(session, access_request))
                continue
            usage = access_request.data_product.extra_metadata.get("catalogUsage", {})
            responsible_user_ids = (
                usage.get("responsibleUserIds", []) if isinstance(usage, dict) else []
            )
            if actor in responsible_user_ids:
                result.append(access_request_response(session, access_request))
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
        return owned_access_consumers(session, actor)

    @router.get(
        "/data-products/{product_id}/access-requests/mine",
        response_model=list[AccessRequestResponse],
        tags=["access requests"],
    )
    def list_my_access_requests(
        product_id: uuid.UUID,
        session: SessionDep,
        actor: ActorDep,
    ) -> list[AccessRequestResponse]:
        # A requester must retain access to their own workflow evidence while a
        # four-eyes submission temporarily hides the catalog entry from search.
        find_product(session, product_id)
        return [
            access_request_response(session, item)
            for item in session.scalars(
                select(AccessRequest)
                .where(
                    AccessRequest.data_product_id == product_id,
                    AccessRequest.requester_id == actor,
                )
                .order_by(AccessRequest.created_at.desc())
            )
        ]

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
    ) -> AccessRequestResponse:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        usage = product.extra_metadata.get("catalogUsage", {})
        responsible_user_ids = (
            usage.get("responsibleUserIds", []) if isinstance(usage, dict) else []
        )
        if actor in responsible_user_ids:
            raise HTTPException(
                409, "Data owners already have access and cannot request their own product"
            )

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
        return access_request_response(session, access_request)

    @router.post(
        "/data-products/{product_id}/access-renewals",
        response_model=AccessRequestResponse,
        status_code=201,
        tags=["access requests"],
    )
    def create_access_renewal(
        product_id: uuid.UUID,
        body: AccessRenewalCreate,
        session: SessionDep,
        actor: ActorDep,
    ) -> AccessRequestResponse:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        renewal = create_renewal_request(session, product, actor, body)
        try:
            session.flush()
            session.commit()
        except IntegrityError as exc:
            session.rollback()
            message = str(exc.orig)
            if (
                "uq_access_request_open_renewal" in message
                or "access_requests.renewal_of_request_id" in message
            ):
                raise HTTPException(
                    409, "A renewal for this grant is already in progress"
                ) from None
            raise
        session.refresh(renewal)
        return access_request_response(session, renewal)

    @router.post(
        "/access-requests/{access_request_id}/decision",
        response_model=AccessRequestDecisionResponse,
        tags=["access requests"],
    )
    def decide_access_request(
        access_request_id: uuid.UUID,
        body: AccessRequestDecision,
        session: SessionDep,
        actor: ActorDep,
    ) -> AccessRequestDecisionResponse:
        access_request = session.scalar(
            select(AccessRequest).where(AccessRequest.id == access_request_id).with_for_update()
        )
        if access_request is None:
            raise HTTPException(404, "Access request not found")
        product = find_product(session, access_request.data_product_id)
        require_product_owner(product, actor)
        if access_request.status not in {
            "submitted",
            "identity_review",
            "legal_review",
            "conditions_review",
        }:
            raise HTTPException(409, "Only an open access request can be decided")
        task = session.scalar(
            select(WorkflowTask).where(
                WorkflowTask.access_request_id == access_request_id,
                WorkflowTask.task_type == "access_request_review",
            )
        )
        if body.decision == "reject":
            access_request.status = "rejected"
            access_request.notes = (
                "\n".join(filter(None, [access_request.notes, body.comment])) or None
            )
            access_request.updated_at = utc_now()
            if task:
                task.status = "completed"
                task.completed_at = utc_now()
                task.updated_at = utc_now()
            audit(
                session,
                "access-request",
                str(access_request.id),
                "rejected",
                actor,
                None,
                {"comment": body.comment},
            )
            session.commit()
            return AccessRequestDecisionResponse(
                request=access_request_response(session, access_request)
            )

        if access_request.request_kind == "renewal":
            if access_request.renewal_context is None:
                raise HTTPException(409, "The renewal has lost its immutable grant context")
            expected_variant = access_request.renewal_context.get("dataVariant")
            if body.granted_variant != expected_variant:
                raise HTTPException(422, "A renewal cannot change the granted data variant")
            definition, fulfillment_subject = renewal_policy_definition(
                session, product, access_request
            )
            try:
                submission = create_renewal_submission(
                    session,
                    product,
                    access_request,
                    definition,
                    fulfillment_subject,
                    actor,
                )
                session.commit()
            except IntegrityError as exc:
                session.rollback()
                message = str(exc.orig)
                if (
                    "uq_policy_product_revision" in message
                    or "policy_revisions.data_product_id, policy_revisions.revision" in message
                ):
                    raise HTTPException(
                        409, "The access request was already decided concurrently"
                    ) from None
                raise
            policy = session.get(PolicyRevision, submission.policy_revision_id)
            if policy is None:
                raise HTTPException(409, "The renewal policy evidence is unavailable")
            policy.deployments = []
            return AccessRequestDecisionResponse(
                request=access_request_response(session, access_request),
                policy=policy_response(policy),
                governance_submission=GovernanceSubmissionResponse.model_validate(
                    governance_response_payload(session, submission)
                ),
            )

        current = latest_policy(session, product.id)
        normalized = definition_as_camel(current.definition) if current else {"grants": []}
        requested_protocols = (
            ["http", "postgresql"]
            if access_request.requested_protocol == "both"
            else [access_request.requested_protocol]
        )
        supported_protocols = {
            "http" if endpoint.protocol == "http-rest" else "postgresql"
            for endpoint in session.scalars(
                select(Endpoint).where(Endpoint.data_product_id == product.id)
            )
        }
        grant_protocols = [
            protocol for protocol in requested_protocols if protocol in supported_protocols
        ]
        if not grant_protocols:
            raise HTTPException(422, "The requested protocol is not offered by this product")
        identity_id = (
            access_request.machine_id
            if access_request.consumer_type == "machine"
            else access_request.requester_id
        )
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
        grants = [
            item
            for item in normalized.get("grants", [])
            if not (
                item.get("subject", {}).get("type") == grant["subject"]["type"]
                and item.get("subject", {}).get("id") == grant["subject"]["id"]
            )
        ]
        grants.append(grant)
        revision = (current.revision if current else 0) + 1
        definition = {
            "defaultEffect": "deny",
            "effect": "allow",
            "subjects": {
                "userIds": [
                    item["subject"]["id"] for item in grants if item["subject"]["type"] == "person"
                ],
                "machineIds": [
                    item["subject"]["id"] for item in grants if item["subject"]["type"] == "machine"
                ],
            },
            "resources": {"productUrns": [product.urn], "owners": [product.owner]},
            "actions": ["data.read"],
            "protocols": sorted({protocol for item in grants for protocol in item["protocols"]}),
            "grants": grants,
        }
        policy = PolicyRevision(
            id=uuid.uuid4(),
            data_product_id=product.id,
            revision=revision,
            status="draft",
            definition=definition,
            generated_rego=generate_rego(),
            created_by=actor,
        )
        session.add(policy)
        session.flush()
        bind_access_request_fulfillments(
            session,
            product,
            policy,
            grants,
            [
                AccessRequestFulfillment(
                    access_request_id=access_request.id,
                    fulfillment_subject=PolicySubject.model_validate(grant["subject"]),
                )
            ],
            actor,
        )
        access_request.notes = "\n".join(filter(None, [access_request.notes, body.comment])) or None
        audit(
            session,
            "access-request",
            str(access_request.id),
            "approved-policy-draft-created",
            actor,
            revision,
            {"policyRevisionId": str(policy.id), "variant": body.granted_variant},
        )
        session.commit()
        policy.deployments = []
        return AccessRequestDecisionResponse(
            request=access_request_response(session, access_request),
            policy=policy_response(policy),
        )

    @router.get(
        "/data-products/{product_id}/endpoints",
        response_model=list[EndpointReadResponse],
        tags=["endpoints"],
    )
    def list_endpoints(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> list[Any]:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        endpoints = session.scalars(
            select(Endpoint).where(Endpoint.data_product_id == product_id).order_by(Endpoint.name)
        )
        return [endpoint_read_response(endpoint) for endpoint in endpoints]

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
        if requires_four_eyes(session, product):
            require_product_owner(product, actor)
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
        audit(
            session,
            "data-product",
            str(product_id),
            "endpoint-created",
            actor,
            next_revision,
            {"endpointId": str(endpoint.id)},
        )
        session.flush()
        session.expire(product)
        session.refresh(product)
        enqueue_active_i14y_delivery(session, product)
        session.commit()
        response.headers["ETag"] = etag_for_revision(next_revision)
        return endpoint_response(endpoint)

    @router.get(
        "/data-products/{product_id}/lineage", response_model=LineageResponse, tags=["lineage"]
    )
    def get_lineage(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> LineageResponse:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        edges = list(
            session.scalars(
                select(LineageEdge)
                .where(
                    or_(
                        LineageEdge.source_urn == product.urn, LineageEdge.target_urn == product.urn
                    )
                )
                .order_by(LineageEdge.created_at, LineageEdge.id)
            )
        )
        return LineageResponse(
            product_urn=product.urn,
            edges=[LineageEdgeResponse.model_validate(edge) for edge in edges],
        )

    @router.get(
        "/data-products/{product_id}/provenance",
        response_model=list[ProvenanceEventResponse],
        tags=["provenance"],
    )
    def get_provenance(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> list[ProvenanceEvent]:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        return list(
            session.scalars(
                select(ProvenanceEvent)
                .where(ProvenanceEvent.data_product_id == product_id)
                .order_by(ProvenanceEvent.sequence)
            )
        )

    @router.get(
        "/data-products/{product_id}/service-level",
        response_model=ServiceLevelSummaryResponse,
        tags=["service level"],
    )
    def get_service_level(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> ServiceLevelSummaryResponse:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        return service_level_summary_response(session, product, actor)

    @router.get(
        "/data-products/{product_id}/service-level/revisions",
        response_model=ServiceLevelRevisionListResponse,
        tags=["service level"],
    )
    def list_service_level_revisions(
        product_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: OptionalActorDep,
    ) -> ServiceLevelRevisionListResponse:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        rows = visible_service_level_revisions(session, product, actor)
        rows_by_id = {row.id: row for row in rows}
        privileged = bool(
            actor is not None
            and (
                actor == product.owner_user_id
                or any(row.control_person_user_id == actor for row in rows)
            )
        )
        latest_visible = max((row.revision for row in rows), default=0)
        etag = service_level_etag(latest_visible)
        response.headers["ETag"] = etag
        return ServiceLevelRevisionListResponse(
            items=[
                service_level_revision_response(
                    session,
                    product,
                    row,
                    privileged=is_service_level_revision_privileged(product, row, actor),
                    rows_by_id=rows_by_id,
                )
                for row in rows
            ],
            detail_level="privileged" if privileged else "public",
            latest_revision=latest_visible,
            etag=etag,
        )

    @router.get(
        "/data-products/{product_id}/service-level/revisions/{revision_id}",
        response_model=ServiceLevelRevisionResponse,
        tags=["service level"],
    )
    def get_service_level_revision(
        product_id: uuid.UUID,
        revision_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: OptionalActorDep,
    ) -> ServiceLevelRevisionResponse:
        product = find_product(session, product_id)
        row = session.scalar(
            select(ServiceLevelRevision).where(
                ServiceLevelRevision.id == revision_id,
                ServiceLevelRevision.data_product_id == product_id,
            )
        )
        if row is None or not can_view_service_level_revision(product, row, actor):
            raise HTTPException(404, "SLA revision not found")
        require_product_view(session, product, actor)
        response.headers["ETag"] = service_level_etag(row.lock_version)
        return service_level_revision_response(
            session,
            product,
            row,
            privileged=is_service_level_revision_privileged(product, row, actor),
        )

    @router.post(
        "/data-products/{product_id}/service-level/revisions",
        response_model=ServiceLevelRevisionResponse,
        status_code=201,
        tags=["service level"],
    )
    def create_product_service_level_revision(
        product_id: uuid.UUID,
        body: ServiceLevelRevisionWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> ServiceLevelRevisionResponse:
        product = lock_service_level_product(session, product_id)
        row = create_service_level_revision(session, product, body, actor, if_match)
        session.flush()
        payload = service_level_revision_response(session, product, row, privileged=True)
        session.commit()
        response.headers["ETag"] = service_level_etag(row.lock_version)
        return payload

    @router.put(
        "/data-products/{product_id}/service-level/revisions/{revision_id}",
        response_model=ServiceLevelRevisionResponse,
        tags=["service level"],
    )
    def update_product_service_level_revision(
        product_id: uuid.UUID,
        revision_id: uuid.UUID,
        body: ServiceLevelRevisionWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> ServiceLevelRevisionResponse:
        product = lock_service_level_product(session, product_id)
        row = lock_service_level_revision(session, product_id, revision_id)
        update_service_level_revision(session, product, row, body, actor, if_match)
        session.flush()
        payload = service_level_revision_response(session, product, row, privileged=True)
        session.commit()
        response.headers["ETag"] = service_level_etag(row.lock_version)
        return payload

    @router.post(
        "/data-products/{product_id}/service-level/revisions/{revision_id}/submit",
        response_model=ServiceLevelRevisionResponse,
        tags=["service level"],
    )
    def submit_product_service_level_revision(
        product_id: uuid.UUID,
        revision_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> ServiceLevelRevisionResponse:
        product = lock_service_level_product(session, product_id)
        row = lock_service_level_revision(session, product_id, revision_id)
        submit_service_level_revision(session, product, row, actor, if_match)
        session.flush()
        payload = service_level_revision_response(session, product, row, privileged=True)
        session.commit()
        response.headers["ETag"] = service_level_etag(row.lock_version)
        return payload

    @router.post(
        "/data-products/{product_id}/service-level/revisions/{revision_id}/withdraw",
        response_model=ServiceLevelRevisionResponse,
        tags=["service level"],
    )
    def withdraw_product_service_level_revision(
        product_id: uuid.UUID,
        revision_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> ServiceLevelRevisionResponse:
        product = lock_service_level_product(session, product_id)
        row = lock_service_level_revision(session, product_id, revision_id)
        withdraw_service_level_revision(session, product, row, actor, if_match)
        session.flush()
        payload = service_level_revision_response(session, product, row, privileged=True)
        session.commit()
        response.headers["ETag"] = service_level_etag(row.lock_version)
        return payload

    @router.post(
        "/data-products/{product_id}/service-level/revisions/{revision_id}/decision",
        response_model=ServiceLevelRevisionResponse,
        tags=["service level"],
    )
    def decide_product_service_level_revision(
        product_id: uuid.UUID,
        revision_id: uuid.UUID,
        body: ServiceLevelDecisionCreate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> ServiceLevelRevisionResponse:
        product = lock_service_level_product(session, product_id)
        row = lock_service_level_revision(session, product_id, revision_id)
        decide_service_level_revision(session, product, row, body, actor, if_match)
        session.flush()
        payload = service_level_revision_response(session, product, row, privileged=True)
        session.commit()
        response.headers["ETag"] = service_level_etag(row.lock_version)
        return payload

    @router.put(
        "/data-products/{product_id}/control-person",
        response_model=ControlPersonUpdateResponse,
        tags=["service level"],
    )
    def update_product_control_person(
        product_id: uuid.UUID,
        body: ControlPersonUpdate,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> ControlPersonUpdateResponse:
        product = lock_service_level_product(session, product_id)
        require_product_owner(product, actor)
        require_revision(if_match, product.revision)
        candidate = session.get(DemoUser, body.control_person_user_id)
        if not is_active_publication_approver(candidate):
            raise HTTPException(
                422, "controlPersonUserId must identify an active publication approver"
            )
        if candidate is None or candidate.id == product.owner_user_id:
            raise HTTPException(409, "The control person must differ from the data owner")
        if candidate.id == product.control_person_user_id:
            safe_controller = product_control_person(session, product)
            if safe_controller is None:
                raise HTTPException(409, "The current control person is unavailable")
            response.headers["ETag"] = etag_for_revision(product.revision)
            return ControlPersonUpdateResponse(
                data_product_id=product.id,
                product_revision=product.revision,
                control_person=safe_controller,
            )
        if control_person_change_blocked(session, product.id):
            raise HTTPException(
                409,
                "The control person cannot change while an approval workflow is active",
            )
        product.control_person_user_id = candidate.id
        product.revision += 1
        product.updated_at = utc_now()
        audit_control_person_change(session, product, actor)
        session.flush()
        safe_controller = product_control_person(session, product)
        if safe_controller is None:
            raise HTTPException(409, "The selected control person is unavailable")
        payload = ControlPersonUpdateResponse(
            data_product_id=product.id,
            product_revision=product.revision,
            control_person=safe_controller,
        )
        session.commit()
        response.headers["ETag"] = etag_for_revision(product.revision)
        return payload

    @router.get(
        "/data-products/{product_id}/activity",
        response_model=ProductActivityResponse,
        tags=["audit"],
    )
    def get_product_activity(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> ProductActivityResponse:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        return build_product_activity(session, product, actor)

    @router.get(
        "/data-products/{product_id}/audit-events",
        response_model=list[AuditEventResponse],
        tags=["audit"],
    )
    def get_audit_events(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> list[AuditEvent]:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        if not is_privileged_product_auditor(session, product, actor):
            raise HTTPException(
                403,
                "Raw audit details are restricted to the data owner and assigned approvers",
            )
        return list(
            session.scalars(
                select(AuditEvent)
                .where(
                    AuditEvent.resource_type.in_(("data-product", "policy", "service-level")),
                    AuditEvent.resource_id == str(product_id),
                )
                .order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc())
            )
        )

    @router.get(
        "/data-products/{product_id}/metadata-deliveries",
        response_model=list[MetadataDeliveryOutboxResponse],
        tags=["metadata delivery"],
    )
    def get_metadata_deliveries(
        product_id: uuid.UUID, session: SessionDep, actor: ActorDep
    ) -> list[MetadataDeliveryOutbox]:
        product = find_product(session, product_id)
        require_product_owner(product, actor)
        return list(
            session.scalars(
                select(MetadataDeliveryOutbox)
                .where(MetadataDeliveryOutbox.data_product_id == product_id)
                .order_by(MetadataDeliveryOutbox.created_at, MetadataDeliveryOutbox.id)
            )
        )

    @router.get(
        "/data-products/{product_id}/policies",
        response_model=PolicyRevisionPage,
        tags=["policies"],
    )
    def list_policies(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> PolicyRevisionPage:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        require_policy_evidence_view(session, product, actor)
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
        "/data-products/{product_id}/effective-access",
        response_model=ProductEffectiveAccessResponse,
        tags=["access requests"],
    )
    def get_effective_access(
        product_id: uuid.UUID,
        session: SessionDep,
        actor: ActorDep,
    ) -> ProductEffectiveAccessResponse:
        """Return only the current actor's safe, active grant summary."""
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        return effective_access_response(session, product, actor)

    @router.get(
        "/data-products/{product_id}/policies/latest",
        response_model=PolicyRevisionResponse,
        tags=["policies"],
    )
    def get_latest_policy(
        product_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: OptionalActorDep,
    ) -> PolicyRevisionResponse:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        require_policy_evidence_view(session, product, actor)
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
        require_product_owner(product, actor)
        reject_legacy_governance_path(session, product)
        current = latest_policy(session, product_id)
        current_revision = current.revision if current else 0
        require_revision(if_match, current_revision)
        definition = body.definition.model_dump(by_alias=True)
        if definition["resources"]["productUrns"] != [product.urn] or definition["resources"][
            "owners"
        ] != [product.owner]:
            raise HTTPException(
                422, "Policy resource selectors must identify exactly this product URN and owner"
            )
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
        audit(
            session,
            "policy",
            str(product_id),
            "draft-created",
            actor,
            policy.revision,
            {"policyRevisionId": str(policy.id)},
        )
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
        reject_legacy_governance_path(session, product)
        current = latest_policy(session, product_id)
        current_revision = current.revision if current else 0
        require_revision(if_match, current_revision)

        incoming = resolve_policy_grant(
            session, body.grant.model_dump(mode="json", by_alias=True), actor=actor
        )
        active = active_published_policy(session, product)
        existing = definition_as_camel(active.definition).get("grants", []) if active else []
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
            "protocols": sorted({protocol for grant in grants for protocol in grant["protocols"]})
            or ["http"],
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
        session.flush()
        bind_access_request_fulfillments(
            session,
            product,
            policy,
            grants,
            body.access_request_fulfillments,
            actor,
        )
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
        require_product_owner(product, actor)
        reject_legacy_governance_path(session, product)
        source = session.get(PolicyRevision, policy_id)
        current = latest_policy(session, product_id)
        if source is None or source.data_product_id != product_id:
            raise HTTPException(404, "Policy revision not found")
        governed_submission = session.scalar(
            select(GovernanceSubmission.id).where(
                GovernanceSubmission.policy_revision_id == source.id
            )
        )
        if governed_submission is not None:
            raise HTTPException(
                409,
                "A governance submission policy can only be published by its assigned approver",
            )
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
        projection = project_to_postgresql(
            request.app.state.settings, product_id, revision, published.definition
        )
        if projection.state != "deployed":
            raise HTTPException(
                503,
                "PostgreSQL policy projection did not deploy; the active policy was retained: "
                f"{projection.error}",
            )
        opa_deployment = PolicyDeployment(
            id=uuid.uuid4(),
            policy_revision=published,
            target="opa",
            desired_revision=revision,
            state="pending",
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
        for access_request in session.scalars(
            select(AccessRequest).where(
                AccessRequest.decision_policy_revision_id == source.id,
                AccessRequest.status == "approved_policy_pending",
            )
        ):
            access_request.decision_policy_revision_id = published.id
            access_request.updated_at = utc_now()
        quality = quality_response(session, product)
        product.quality = {
            "score": quality.score,
            "medal": quality.medal,
            "criteria": [item.model_dump(by_alias=True) for item in quality.criteria],
        }
        audit(
            session,
            "policy",
            str(product_id),
            "published",
            actor,
            revision,
            {"sourceRevision": source.revision},
        )
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
        require_product_owner(product, actor)
        reject_legacy_governance_path(session, product)
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
            id=uuid.uuid4(),
            policy_revision=revoked,
            target="opa",
            desired_revision=revision,
            state="pending",
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
        audit(
            session,
            "policy",
            str(product_id),
            "revoked",
            actor,
            revision,
            {"revokedRevision": target.revision},
        )
        session.commit()

        session.refresh(revoked)
        response.headers["ETag"] = etag_for_revision(revision)
        return policy_response(revoked)

    @router.get(
        "/data-products/{product_id}/policy-deployments",
        response_model=list[PolicyDeploymentResponse],
        tags=["policies"],
    )
    def list_policy_deployments(
        product_id: uuid.UUID, session: SessionDep, actor: OptionalActorDep
    ) -> list[PolicyDeployment]:
        product = find_product(session, product_id)
        require_product_view(session, product, actor)
        require_policy_evidence_view(session, product, actor)
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
    i14y_client: I14YPublicApiPort | None = None,
    i14y_publication_port: I14YPublicationPort | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    resolved_session_factory = session_factory or default_session_factory(resolved_settings)
    resolved_i14y_client = i14y_client or VerifiedI14YPublicApi()
    resolved_i14y_publication_port = (
        i14y_publication_port
        if i14y_publication_port is not None
        else DisabledI14YPublicationAdapter()
    )
    owns_i14y_client = i14y_client is None

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if resolved_settings.seed_on_startup:
            with resolved_session_factory() as session:
                seed_catalog(session)
                seed_modeling_catalog(session)
                seed_site_glossary_terms(session)
                session.commit()
        try:
            yield
        finally:
            if owns_i14y_client:
                await resolved_i14y_client.aclose()

    runtime_version = get_runtime_version()
    app = FastAPI(
        title=resolved_settings.app_name,
        version=runtime_version,
        summary="Metadata catalog and policy administration point for BIT DaCa",
        root_path=resolved_settings.root_path,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.session_factory = resolved_session_factory
    app.state.i14y_client = resolved_i14y_client
    app.state.i14y_publication_port = resolved_i14y_publication_port
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
    app.include_router(create_modeling_router())
    app.include_router(create_modeling_assistance_router())
    app.include_router(create_terminology_router())
    app.include_router(create_modeling_lifecycle_router())
    app.include_router(create_logical_model_review_router())
    app.include_router(create_mapping_inconsistency_router())
    app.include_router(create_modeling_resources_router())

    @app.get("/health/live", response_model=HealthResponse, tags=["health"])
    def live() -> HealthResponse:
        return HealthResponse(status="ok", service="catalog-api", version=runtime_version)

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
        return HealthResponse(status="ready", service="catalog-api", version=runtime_version)

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
        submission, deployment = lock_policy_deployment_workflow(
            session,
            acknowledgement.policy_revision_id,
            acknowledgement.target,
        )
        if deployment is None:
            raise HTTPException(404, "Policy deployment not found")
        if acknowledgement.observed_revision != deployment.desired_revision:
            raise HTTPException(409, "Observed revision does not match the desired revision")
        if submission is not None and submission.status != "approved_deploying":
            return deployment
        if (
            deployment.observed_revision == acknowledgement.observed_revision
            and deployment.state == acknowledgement.state
            and deployment.error == acknowledgement.error
        ):
            return deployment
        deployment.observed_revision = acknowledgement.observed_revision
        deployment.state = acknowledgement.state
        deployment.error = acknowledgement.error
        deployment.updated_at = utc_now()
        session.flush()
        policy = session.get(PolicyRevision, deployment.policy_revision_id)
        product = session.get(DataProduct, policy.data_product_id) if policy is not None else None
        if product is not None and policy is not None:
            finalize_policy_activation(session, product, policy, resolved_settings)
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
        observed_bundle_revision = (
            bundle_status.get("active_revision") if isinstance(bundle_status, dict) else None
        )
        _active, expected_bundle_revision = active_bundle_state(session)
        bundle_failure = opa_bundle_failure(bundle_status)
        if observed_bundle_revision != expected_bundle_revision and bundle_failure:
            pending_policy_ids = list(
                session.scalars(
                    select(PolicyDeployment.policy_revision_id).where(
                        PolicyDeployment.target == "opa",
                        PolicyDeployment.state == "pending",
                    )
                )
            )
            failed = 0
            for policy_revision_id in pending_policy_ids:
                submission, deployment = lock_policy_deployment_workflow(
                    session,
                    policy_revision_id,
                    "opa",
                )
                if deployment is None or deployment.state != "pending":
                    continue
                if submission is not None and submission.status != "approved_deploying":
                    continue
                policy = session.get(PolicyRevision, deployment.policy_revision_id)
                if policy is None:
                    continue
                current = latest_policy(session, policy.data_product_id)
                if current is None or current.id != deployment.policy_revision_id:
                    continue
                deployment.state = "failed"
                deployment.error = bundle_failure
                deployment.updated_at = utc_now()
                failed += 1
                session.flush()
                product = session.get(DataProduct, policy.data_product_id)
                if product is not None:
                    finalize_submission_deployment(
                        session,
                        product,
                        policy,
                        resolved_settings,
                    )
            session.commit()
            return {
                "status": "bundle-activation-failed",
                "expectedBundleRevision": expected_bundle_revision,
                "observedBundleRevision": observed_bundle_revision,
                "deploymentsFailed": failed,
                "error": bundle_failure,
            }
        if observed_bundle_revision != expected_bundle_revision:
            return {
                "status": "awaiting-current-bundle",
                "expectedBundleRevision": expected_bundle_revision,
                "observedBundleRevision": observed_bundle_revision,
            }

        pending_policy_ids = list(
            session.scalars(
                select(PolicyDeployment.policy_revision_id).where(
                    PolicyDeployment.target == "opa", PolicyDeployment.state == "pending"
                )
            )
        )
        deployed = 0
        for policy_revision_id in pending_policy_ids:
            submission, deployment = lock_policy_deployment_workflow(
                session,
                policy_revision_id,
                "opa",
            )
            if deployment is None or deployment.state != "pending":
                continue
            if submission is not None and submission.status != "approved_deploying":
                continue
            policy = session.get(PolicyRevision, deployment.policy_revision_id)
            if policy is None:
                continue
            current = latest_policy(session, policy.data_product_id)
            if current is not None and current.id == deployment.policy_revision_id:
                deployment.state = "deployed"
                deployment.observed_revision = deployment.desired_revision
                deployment.error = None
                deployed += 1
                session.flush()
                product = session.get(DataProduct, policy.data_product_id)
                if product is not None:
                    finalize_policy_activation(
                        session,
                        product,
                        policy,
                        resolved_settings,
                    )
            else:
                deployment.state = "failed"
                deployment.error = "Superseded before this global OPA bundle was observed"
                product = session.get(DataProduct, policy.data_product_id)
                if product is not None:
                    finalize_submission_deployment(
                        session,
                        product,
                        policy,
                        resolved_settings,
                    )
            deployment.updated_at = utc_now()
        session.commit()
        return {
            "status": "observed",
            "bundleRevision": observed_bundle_revision,
            "deploymentsAcknowledged": deployed,
        }

    return app


app = create_app()
