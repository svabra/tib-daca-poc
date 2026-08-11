from __future__ import annotations

import asyncio
import time
from contextlib import suppress
from datetime import UTC
from urllib.parse import urlsplit, urlunsplit

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .config import Settings
from .endpoint_security import EndpointSecurityError, validate_catalog_endpoint
from .events import HealthEventBroker
from .models import CatalogInstance, HealthObservation, utcnow


def ready_url(endpoint: str) -> str:
    parts = urlsplit(endpoint)
    base_path = parts.path.rstrip("/")
    if base_path.endswith("/health/ready"):
        path = base_path
    else:
        path = f"{base_path}/health/ready"
    return urlunsplit((parts.scheme, parts.netloc, path, "", ""))


async def check_catalog_health(
    catalog: CatalogInstance,
    timeout_seconds: float,
    allowed_hosts: tuple[str, ...],
) -> HealthObservation | None:
    started = time.perf_counter()
    try:
        await asyncio.to_thread(validate_catalog_endpoint, catalog.endpoint, allowed_hosts)
    except EndpointSecurityError as exc:
        if exc.intentionally_unprobed:
            return None
        return HealthObservation(
            catalog_id=catalog.id,
            status="unreachable",
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
            message=f"Probe blocked by endpoint security policy: {exc.detail}",
            checked_at=utcnow(),
        )
    try:
        async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=False) as client:
            response = await client.get(ready_url(catalog.endpoint))
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        if 200 <= response.status_code < 300:
            status = "healthy"
            message = "Readiness endpoint accepted the probe."
        else:
            status = "degraded"
            message = f"Readiness endpoint returned HTTP {response.status_code}."
        return HealthObservation(
            catalog_id=catalog.id,
            status=status,
            status_code=response.status_code,
            latency_ms=latency_ms,
            message=message,
            checked_at=utcnow(),
        )
    except (httpx.HTTPError, OSError) as exc:
        return HealthObservation(
            catalog_id=catalog.id,
            status="unreachable",
            latency_ms=round((time.perf_counter() - started) * 1000, 2),
            message=f"Probe failed: {type(exc).__name__}",
            checked_at=utcnow(),
        )


def persist_health_observation(
    session: Session,
    catalog: CatalogInstance,
    observation: HealthObservation,
) -> None:
    session.add(observation)
    catalog.health_status = observation.status
    catalog.last_checked_at = observation.checked_at
    session.commit()
    session.refresh(observation)


def health_event(observation: HealthObservation) -> dict[str, object]:
    checked_at = observation.checked_at
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=UTC)
    return {
        "id": observation.id,
        "catalogId": observation.catalog_id,
        "status": observation.status,
        "statusCode": observation.status_code,
        "latencyMs": observation.latency_ms,
        "message": observation.message,
        "checkedAt": checked_at.isoformat(),
    }


async def poll_catalogs(
    session_factory: sessionmaker[Session],
    settings: Settings,
    broker: HealthEventBroker,
    stop: asyncio.Event,
) -> None:
    interval = settings.health_poll_interval_seconds
    if interval <= 0:
        return
    while not stop.is_set():
        with session_factory() as session:
            catalog_ids = session.scalars(
                select(CatalogInstance.id).where(CatalogInstance.lifecycle == "active")
            ).all()
        for catalog_id in catalog_ids:
            if stop.is_set():
                return
            with session_factory() as session:
                catalog = session.get(CatalogInstance, catalog_id)
                if catalog is None or catalog.lifecycle != "active":
                    continue
                observation = await check_catalog_health(
                    catalog,
                    settings.health_request_timeout_seconds,
                    settings.allowed_endpoint_hosts,
                )
                if observation is None:
                    continue
                persist_health_observation(session, catalog, observation)
                await broker.publish(health_event(observation))
        with suppress(TimeoutError):
            await asyncio.wait_for(stop.wait(), timeout=interval)
