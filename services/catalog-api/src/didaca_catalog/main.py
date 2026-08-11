from __future__ import annotations

import base64
import hashlib
import json
import secrets
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter
from sqlalchemy import or_, select, text, update
from sqlalchemy.orm import Session, selectinload, sessionmaker

from . import __version__
from .database import default_session_factory, get_session
from .models import (
    AccessRequest,
    AuditEvent,
    DataProduct,
    Endpoint,
    LineageEdge,
    PolicyDeployment,
    PolicyRevision,
    ProvenanceEvent,
    utc_now,
)
from .policy import (
    ActivePolicy,
    build_opa_bundle,
    bundle_data,
    generate_rego,
    project_to_postgresql,
)
from .problems import install_problem_handlers
from .schemas import (
    AccessRequestCreate,
    AccessRequestResponse,
    AuditEventResponse,
    DataProductPage,
    DataProductPatch,
    DataProductResponse,
    DataProductSummary,
    DeploymentAcknowledgement,
    EndpointCreate,
    EndpointResponse,
    HealthResponse,
    LineageEdgeResponse,
    LineageResponse,
    OwnedAccessConsumerResponse,
    PolicyCreate,
    PolicyDeploymentResponse,
    PolicyRevisionPage,
    PolicyRevisionResponse,
    ProvenanceEventResponse,
    to_camel,
)
from .seed import seed_catalog
from .settings import Settings, get_settings

SessionDep = Annotated[Session, Depends(get_session)]
endpoint_adapter = TypeAdapter(EndpointResponse)


def require_demo_actor(
    request: Request,
    x_didaca_user: Annotated[str | None, Header(alias="X-DiDaCa-User")] = None,
) -> str:
    """Resolve the local demo actor without accepting caller headers in production mode."""
    settings: Settings = request.app.state.settings
    if not settings.didaca_demo_auth:
        raise HTTPException(503, "Demo identity is disabled and no production identity provider is configured")
    if x_didaca_user is None or not x_didaca_user.strip():
        raise HTTPException(401, "Provide X-DiDaCa-User for this local demo mutation")
    return x_didaca_user.strip()[:200]


ActorDep = Annotated[str, Depends(require_demo_actor)]

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


def create_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1")

    @router.get("/data-products", response_model=DataProductPage, tags=["data products"])
    def list_data_products(
        session: SessionDep,
        limit: Annotated[int, Query(ge=1, le=100)] = 25,
        cursor: str | None = None,
    ) -> DataProductPage:
        statement = select(DataProduct).order_by(DataProduct.id).limit(limit + 1)
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
    def get_data_product(product_id: uuid.UUID, response: Response, session: SessionDep) -> DataProduct:
        product = find_product(session, product_id)
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
        session.commit()
        session.expire(current)
        session.refresh(current)
        response.headers["ETag"] = etag_for_revision(next_revision)
        return current

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
                AccessRequest.status.in_(("submitted", "identity_review", "legal_review", "conditions_review"))
            )
            .options(selectinload(AccessRequest.data_product))
            .order_by(AccessRequest.created_at.desc())
        )
        result: list[AccessRequest] = []
        for access_request in open_requests:
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

        identity = DEMO_ACTOR_PROFILES.get(actor, (actor, "Nicht zugeordnete Demo-Organisation"))
        access_request = AccessRequest(
            id=uuid.uuid4(),
            request_number=f"ZA-{utc_now():%Y}-{uuid.uuid4().hex[:8].upper()}",
            data_product_id=product.id,
            requester_id=actor,
            requester_name=identity[0],
            requester_organization=identity[1],
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
        summary="Metadata catalog and policy administration point for BIT DiDaCa",
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.session_factory = resolved_session_factory
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved_settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "OPTIONS"],
        allow_headers=["Content-Type", "If-Match", "If-None-Match", "X-DiDaCa-User", "X-Request-ID"],
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

    @app.get("/health/ready", response_model=HealthResponse, tags=["health"])
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

        bundle_status = status_payload.get("bundles", {}).get("didaca", {})
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
