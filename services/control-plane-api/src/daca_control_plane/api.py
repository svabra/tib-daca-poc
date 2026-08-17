from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .audit import record_audit
from .auth import require_mutation_actor
from .database import get_session
from .endpoint_security import EndpointSecurityError, validate_catalog_endpoint
from .events import sse_stream
from .health import check_catalog_health, health_event
from .models import (
    AuditEvent,
    CatalogInstance,
    DeploymentObservation,
    HealthObservation,
    SyncConfiguration,
    TrustGrant,
    utcnow,
)
from .pagination import make_page, page_query
from .problems import ApiProblem
from .schemas import (
    AuditEventRead,
    CatalogCreate,
    CatalogPatch,
    CatalogRead,
    CursorPage,
    DeploymentObservationCreate,
    DeploymentObservationRead,
    HealthObservationCreate,
    HealthObservationRead,
    SyncConfigurationCreate,
    SyncConfigurationPatch,
    SyncConfigurationRead,
    TrustGrantCreate,
    TrustGrantPatch,
    TrustGrantRead,
)
from .services import (
    disable_invalid_syncs_for_grant,
    etag,
    get_catalog,
    get_sync_configuration,
    get_trust_grant,
    require_revision,
    validate_enabled_sync,
    validate_grant_window,
)

SessionDependency = Annotated[Session, Depends(get_session)]
Limit = Annotated[int, Query(ge=1, le=100)]

router = APIRouter(prefix="/api/v1")
health_router = APIRouter()


@router.post(
    "/catalogs",
    response_model=CatalogRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_mutation_actor)],
)
def create_catalog(
    payload: CatalogCreate,
    request: Request,
    response: Response,
    session: SessionDependency,
) -> CatalogInstance:
    _validate_catalog_endpoint_for_request(payload.endpoint, request)
    catalog = CatalogInstance(**payload.model_dump())
    session.add(catalog)
    _flush_or_conflict(session, "A catalog with this URN already exists in the control plane.")
    record_audit(
        session,
        request,
        aggregate_type="catalog",
        aggregate_id=catalog.id,
        action="catalog.created",
        details={"urn": catalog.urn},
    )
    _commit_or_conflict(session)
    session.refresh(catalog)
    response.headers["ETag"] = etag(catalog.desired_revision)
    response.headers["Location"] = f"/api/v1/catalogs/{catalog.id}"
    return catalog


@router.get("/catalogs", response_model=CursorPage[CatalogRead])
def list_catalogs(
    session: SessionDependency,
    limit: Limit = 50,
    cursor: str | None = None,
    lifecycle: str | None = None,
) -> CursorPage[CatalogRead]:
    statement = select(CatalogInstance)
    if lifecycle is not None:
        if lifecycle not in {"active", "suspended", "retired"}:
            raise ApiProblem(400, "Invalid filter", "Unknown catalog lifecycle filter.")
        statement = statement.where(CatalogInstance.lifecycle == lifecycle)
    statement = page_query(
        statement,
        timestamp_column=CatalogInstance.created_at,
        id_column=CatalogInstance.id,
        cursor=cursor,
        limit=limit,
    )
    rows = list(session.scalars(statement).all())
    items, next_cursor = make_page(rows, limit, "created_at")
    return CursorPage[CatalogRead](items=items, next_cursor=next_cursor)


@router.get("/catalogs/{catalog_id}", response_model=CatalogRead)
def read_catalog(
    catalog_id: str, response: Response, session: SessionDependency
) -> CatalogInstance:
    catalog = get_catalog(session, catalog_id)
    response.headers["ETag"] = etag(catalog.desired_revision)
    return catalog


@router.patch(
    "/catalogs/{catalog_id}",
    response_model=CatalogRead,
    dependencies=[Depends(require_mutation_actor)],
)
def patch_catalog(
    catalog_id: str,
    payload: CatalogPatch,
    request: Request,
    response: Response,
    session: SessionDependency,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> CatalogInstance:
    catalog = get_catalog(session, catalog_id)
    require_revision(if_match, catalog.desired_revision)
    changes = payload.model_dump(exclude_unset=True)
    _reject_nulls(changes, set())
    if "endpoint" in changes:
        _validate_catalog_endpoint_for_request(str(changes["endpoint"]), request)
    for name, value in changes.items():
        setattr(catalog, name, value)
    if changes:
        catalog.desired_revision += 1
        record_audit(
            session,
            request,
            aggregate_type="catalog",
            aggregate_id=catalog.id,
            action="catalog.updated",
            details={"fields": sorted(changes)},
        )
        _commit_or_conflict(session)
        session.refresh(catalog)
    response.headers["ETag"] = etag(catalog.desired_revision)
    return catalog


@router.post(
    "/catalogs/{catalog_id}/health-checks",
    response_model=HealthObservationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_mutation_actor)],
)
async def run_health_check(
    catalog_id: str,
    request: Request,
    session: SessionDependency,
) -> HealthObservation:
    catalog = get_catalog(session, catalog_id)
    settings = request.app.state.settings
    observation = await check_catalog_health(
        catalog,
        settings.health_request_timeout_seconds,
        settings.allowed_endpoint_hosts,
    )
    if observation is None:
        raise ApiProblem(
            422,
            "Catalog endpoint is intentionally unprobed",
            "The reserved .invalid catalog endpoint is a placeholder and cannot be health-checked.",
            problem_type="urn:daca:problem:catalog-endpoint-unprobed",
        )
    session.add(observation)
    catalog.health_status = observation.status
    catalog.last_checked_at = observation.checked_at
    record_audit(
        session,
        request,
        aggregate_type="catalog",
        aggregate_id=catalog.id,
        action="catalog.health-checked",
        details={"status": observation.status},
    )
    _commit_or_conflict(session)
    session.refresh(observation)
    await request.app.state.health_broker.publish(health_event(observation))
    return observation


@router.post(
    "/health-observations",
    response_model=HealthObservationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_mutation_actor)],
)
async def report_health_observation(
    payload: HealthObservationCreate,
    request: Request,
    session: SessionDependency,
) -> HealthObservation:
    catalog = get_catalog(session, payload.catalog_id)
    values = payload.model_dump(exclude={"checked_at"})
    observation = HealthObservation(**values, checked_at=payload.checked_at or utcnow())
    session.add(observation)
    catalog.health_status = observation.status
    catalog.last_checked_at = observation.checked_at
    record_audit(
        session,
        request,
        aggregate_type="catalog",
        aggregate_id=catalog.id,
        action="catalog.health-reported",
        details={"status": observation.status},
    )
    _commit_or_conflict(session)
    session.refresh(observation)
    await request.app.state.health_broker.publish(health_event(observation))
    return observation


@router.get("/health-observations", response_model=CursorPage[HealthObservationRead])
def list_health_observations(
    session: SessionDependency,
    limit: Limit = 50,
    cursor: str | None = None,
    catalog_id: Annotated[str | None, Query(alias="catalogId")] = None,
) -> CursorPage[HealthObservationRead]:
    statement = select(HealthObservation)
    if catalog_id:
        get_catalog(session, catalog_id)
        statement = statement.where(HealthObservation.catalog_id == catalog_id)
    statement = page_query(
        statement,
        timestamp_column=HealthObservation.checked_at,
        id_column=HealthObservation.id,
        cursor=cursor,
        limit=limit,
    )
    rows = list(session.scalars(statement).all())
    items, next_cursor = make_page(rows, limit, "checked_at")
    return CursorPage[HealthObservationRead](items=items, next_cursor=next_cursor)


@router.get("/events/health")
async def health_events(request: Request) -> StreamingResponse:
    return StreamingResponse(
        sse_stream(request.app.state.health_broker, request.is_disconnected),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/trust-grants",
    response_model=TrustGrantRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_mutation_actor)],
)
def create_trust_grant(
    payload: TrustGrantCreate,
    request: Request,
    response: Response,
    session: SessionDependency,
) -> TrustGrant:
    get_catalog(session, payload.provider_id)
    get_catalog(session, payload.consumer_id)
    validate_grant_window(payload.valid_from, payload.valid_until)
    grant = TrustGrant(**payload.model_dump())
    session.add(grant)
    _flush_or_conflict(
        session, "A directed trust grant already exists for this provider and consumer."
    )
    record_audit(
        session,
        request,
        aggregate_type="trustGrant",
        aggregate_id=grant.id,
        action="trust-grant.created",
        details={"providerId": grant.provider_id, "consumerId": grant.consumer_id},
    )
    _commit_or_conflict(session)
    session.refresh(grant)
    response.headers["ETag"] = etag(grant.revision)
    response.headers["Location"] = f"/api/v1/trust-grants/{grant.id}"
    return grant


@router.get("/trust-grants", response_model=CursorPage[TrustGrantRead])
def list_trust_grants(
    session: SessionDependency,
    limit: Limit = 50,
    cursor: str | None = None,
    provider_id: Annotated[str | None, Query(alias="providerId")] = None,
    consumer_id: Annotated[str | None, Query(alias="consumerId")] = None,
    grant_state: Annotated[str | None, Query(alias="state")] = None,
) -> CursorPage[TrustGrantRead]:
    statement = select(TrustGrant)
    if provider_id:
        statement = statement.where(TrustGrant.provider_id == provider_id)
    if consumer_id:
        statement = statement.where(TrustGrant.consumer_id == consumer_id)
    if grant_state:
        statement = statement.where(TrustGrant.state == grant_state)
    statement = page_query(
        statement,
        timestamp_column=TrustGrant.created_at,
        id_column=TrustGrant.id,
        cursor=cursor,
        limit=limit,
    )
    rows = list(session.scalars(statement).all())
    items, next_cursor = make_page(rows, limit, "created_at")
    return CursorPage[TrustGrantRead](items=items, next_cursor=next_cursor)


@router.get("/trust-grants/{grant_id}", response_model=TrustGrantRead)
def read_trust_grant(grant_id: str, response: Response, session: SessionDependency) -> TrustGrant:
    grant = get_trust_grant(session, grant_id)
    response.headers["ETag"] = etag(grant.revision)
    return grant


@router.patch(
    "/trust-grants/{grant_id}",
    response_model=TrustGrantRead,
    dependencies=[Depends(require_mutation_actor)],
)
def patch_trust_grant(
    grant_id: str,
    payload: TrustGrantPatch,
    request: Request,
    response: Response,
    session: SessionDependency,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> TrustGrant:
    grant = get_trust_grant(session, grant_id)
    require_revision(if_match, grant.revision)
    changes = payload.model_dump(exclude_unset=True)
    _reject_nulls(
        changes,
        {"valid_from", "valid_until"},
    )
    next_state = changes.get("state", grant.state)
    if grant.state in {"revoked", "expired"} and next_state not in {
        grant.state,
        None,
    }:
        raise ApiProblem(
            409,
            "Terminal trust state",
            "A revoked or expired trust grant cannot be reopened; create a new grant.",
            problem_type="urn:daca:problem:terminal-trust-state",
        )
    next_from = changes.get("valid_from", grant.valid_from)
    next_until = changes.get("valid_until", grant.valid_until)
    validate_grant_window(next_from, next_until)
    for name, value in changes.items():
        setattr(grant, name, value)
    disabled: list[str] = []
    if changes:
        grant.revision += 1
        session.flush()
        disabled = disable_invalid_syncs_for_grant(session, grant, request.app.state.settings)
        record_audit(
            session,
            request,
            aggregate_type="trustGrant",
            aggregate_id=grant.id,
            action="trust-grant.updated",
            details={"fields": sorted(changes), "disabledSyncIds": disabled},
        )
        for sync_id in disabled:
            record_audit(
                session,
                request,
                aggregate_type="syncConfiguration",
                aggregate_id=sync_id,
                action="sync-configuration.auto-disabled",
                details={"reason": "trust-grant-invalidated"},
            )
        _commit_or_conflict(session)
        session.refresh(grant)
    response.headers["ETag"] = etag(grant.revision)
    return grant


@router.post(
    "/sync-configurations",
    response_model=SyncConfigurationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_mutation_actor)],
)
def create_sync_configuration(
    payload: SyncConfigurationCreate,
    request: Request,
    response: Response,
    session: SessionDependency,
) -> SyncConfiguration:
    get_catalog(session, payload.source_id)
    get_catalog(session, payload.target_id)
    configuration = SyncConfiguration(**payload.model_dump())
    if configuration.enabled:
        validate_enabled_sync(session, configuration, request.app.state.settings)
    session.add(configuration)
    _flush_or_conflict(session, "A sync configuration with this name already exists for the route.")
    record_audit(
        session,
        request,
        aggregate_type="syncConfiguration",
        aggregate_id=configuration.id,
        action="sync-configuration.created",
        details={
            "enabled": configuration.enabled,
            "syncImplemented": False,
        },
    )
    _commit_or_conflict(session)
    session.refresh(configuration)
    response.headers["ETag"] = etag(configuration.revision)
    response.headers["Location"] = f"/api/v1/sync-configurations/{configuration.id}"
    return configuration


@router.get("/sync-configurations", response_model=CursorPage[SyncConfigurationRead])
def list_sync_configurations(
    session: SessionDependency,
    limit: Limit = 50,
    cursor: str | None = None,
    source_id: Annotated[str | None, Query(alias="sourceId")] = None,
    target_id: Annotated[str | None, Query(alias="targetId")] = None,
    enabled: bool | None = None,
) -> CursorPage[SyncConfigurationRead]:
    statement = select(SyncConfiguration)
    if source_id:
        statement = statement.where(SyncConfiguration.source_id == source_id)
    if target_id:
        statement = statement.where(SyncConfiguration.target_id == target_id)
    if enabled is not None:
        statement = statement.where(SyncConfiguration.enabled.is_(enabled))
    statement = page_query(
        statement,
        timestamp_column=SyncConfiguration.created_at,
        id_column=SyncConfiguration.id,
        cursor=cursor,
        limit=limit,
    )
    rows = list(session.scalars(statement).all())
    items, next_cursor = make_page(rows, limit, "created_at")
    return CursorPage[SyncConfigurationRead](items=items, next_cursor=next_cursor)


@router.get(
    "/sync-configurations/{configuration_id}",
    response_model=SyncConfigurationRead,
)
def read_sync_configuration(
    configuration_id: str, response: Response, session: SessionDependency
) -> SyncConfiguration:
    configuration = get_sync_configuration(session, configuration_id)
    response.headers["ETag"] = etag(configuration.revision)
    return configuration


@router.patch(
    "/sync-configurations/{configuration_id}",
    response_model=SyncConfigurationRead,
    dependencies=[Depends(require_mutation_actor)],
)
def patch_sync_configuration(
    configuration_id: str,
    payload: SyncConfigurationPatch,
    request: Request,
    response: Response,
    session: SessionDependency,
    if_match: Annotated[str | None, Header(alias="If-Match")] = None,
) -> SyncConfiguration:
    configuration = get_sync_configuration(session, configuration_id)
    require_revision(if_match, configuration.revision)
    changes = payload.model_dump(exclude_unset=True)
    _reject_nulls(changes, {"trust_grant_id"})
    for name, value in changes.items():
        setattr(configuration, name, value)
    if configuration.enabled:
        validate_enabled_sync(session, configuration, request.app.state.settings)
    if changes:
        configuration.revision += 1
        record_audit(
            session,
            request,
            aggregate_type="syncConfiguration",
            aggregate_id=configuration.id,
            action="sync-configuration.updated",
            details={"fields": sorted(changes), "syncImplemented": False},
        )
        _commit_or_conflict(session)
        session.refresh(configuration)
    response.headers["ETag"] = etag(configuration.revision)
    return configuration


@router.post(
    "/deployment-observations",
    response_model=DeploymentObservationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_mutation_actor)],
)
def create_deployment_observation(
    payload: DeploymentObservationCreate,
    request: Request,
    session: SessionDependency,
) -> DeploymentObservation:
    catalog = get_catalog(session, payload.catalog_id)
    values = payload.model_dump(exclude={"observed_at"})
    observation = DeploymentObservation(**values, observed_at=payload.observed_at or utcnow())
    session.add(observation)
    if observation.component == "configuration":
        catalog.observed_revision = observation.observed_revision
    record_audit(
        session,
        request,
        aggregate_type="catalog",
        aggregate_id=catalog.id,
        action="catalog.deployment-observed",
        details={
            "component": observation.component,
            "status": observation.status,
        },
    )
    _commit_or_conflict(session)
    session.refresh(observation)
    return observation


@router.get(
    "/deployment-observations",
    response_model=CursorPage[DeploymentObservationRead],
)
def list_deployment_observations(
    session: SessionDependency,
    limit: Limit = 50,
    cursor: str | None = None,
    catalog_id: Annotated[str | None, Query(alias="catalogId")] = None,
) -> CursorPage[DeploymentObservationRead]:
    statement = select(DeploymentObservation)
    if catalog_id:
        get_catalog(session, catalog_id)
        statement = statement.where(DeploymentObservation.catalog_id == catalog_id)
    statement = page_query(
        statement,
        timestamp_column=DeploymentObservation.observed_at,
        id_column=DeploymentObservation.id,
        cursor=cursor,
        limit=limit,
    )
    rows = list(session.scalars(statement).all())
    items, next_cursor = make_page(rows, limit, "observed_at")
    return CursorPage[DeploymentObservationRead](items=items, next_cursor=next_cursor)


@router.get("/audit-events", response_model=CursorPage[AuditEventRead])
def list_audit_events(
    session: SessionDependency,
    limit: Limit = 50,
    cursor: str | None = None,
    aggregate_type: Annotated[str | None, Query(alias="aggregateType")] = None,
    aggregate_id: Annotated[str | None, Query(alias="aggregateId")] = None,
) -> CursorPage[AuditEventRead]:
    statement = select(AuditEvent)
    if aggregate_type:
        statement = statement.where(AuditEvent.aggregate_type == aggregate_type)
    if aggregate_id:
        statement = statement.where(AuditEvent.aggregate_id == aggregate_id)
    statement = page_query(
        statement,
        timestamp_column=AuditEvent.occurred_at,
        id_column=AuditEvent.id,
        cursor=cursor,
        limit=limit,
    )
    rows = list(session.scalars(statement).all())
    items, next_cursor = make_page(rows, limit, "occurred_at")
    return CursorPage[AuditEventRead](items=items, next_cursor=next_cursor)


@health_router.get("/health/live")
def liveness() -> dict[str, str]:
    return {"status": "ok", "service": "daca-control-plane-api"}


@health_router.get("/health/ready")
def readiness(session: SessionDependency) -> dict[str, str]:
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise ApiProblem(
            503,
            "Service unavailable",
            "The control-plane database is not ready.",
            problem_type="urn:daca:problem:not-ready",
        ) from exc
    return {"status": "ready", "database": "available"}


@health_router.get("/")
def service_document(request: Request) -> dict[str, object]:
    return {
        "title": "BIT DaCa Control Plane",
        "version": request.app.version,
        "api": "/api/v1",
        "openapi": "/docs",
        "federationSyncImplemented": False,
    }


def _flush_or_conflict(session: Session, detail: str) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise ApiProblem(
            409,
            "Conflict",
            detail,
            problem_type="urn:daca:problem:conflict",
        ) from exc


def _commit_or_conflict(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise ApiProblem(
            409,
            "Conflict",
            "The update conflicts with another control-plane resource.",
            problem_type="urn:daca:problem:conflict",
        ) from exc


def _reject_nulls(changes: dict[str, object], nullable: set[str]) -> None:
    invalid = sorted(key for key, value in changes.items() if value is None and key not in nullable)
    if invalid:
        raise ApiProblem(
            422,
            "Validation failed",
            f"These fields cannot be null: {', '.join(invalid)}.",
            problem_type="urn:daca:problem:validation",
        )


def _validate_catalog_endpoint_for_request(endpoint: str, request: Request) -> None:
    try:
        validate_catalog_endpoint(endpoint, request.app.state.settings.allowed_endpoint_hosts)
    except EndpointSecurityError as exc:
        raise ApiProblem(
            422,
            "Unsafe catalog endpoint",
            exc.detail,
            problem_type="urn:daca:problem:unsafe-catalog-endpoint",
        ) from exc
