import asyncio

from didaca_control_plane.events import HealthEventBroker, sse_stream
from didaca_control_plane.models import (
    AuditEvent,
    CatalogInstance,
    HealthObservation,
    SyncConfiguration,
)
from didaca_control_plane.seed import seed_database
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker


def test_health_and_deployment_observations_update_catalog(
    client: TestClient, two_catalogs: tuple[dict, dict]
) -> None:
    catalog, _ = two_catalogs
    health = client.post(
        "/api/v1/health-observations",
        json={
            "catalogId": catalog["id"],
            "status": "healthy",
            "statusCode": 200,
            "latencyMs": 12.5,
            "message": "ready",
        },
    )
    assert health.status_code == 201
    assert health.json()["checkedAt"].endswith("Z")
    listed = client.get("/api/v1/health-observations", params={"catalogId": catalog["id"]}).json()
    assert listed["items"][0]["status"] == "healthy"
    assert client.get(f"/api/v1/catalogs/{catalog['id']}").json()["healthStatus"] == "healthy"

    deployment = client.post(
        "/api/v1/deployment-observations",
        json={
            "catalogId": catalog["id"],
            "component": "configuration",
            "desiredRevision": 3,
            "observedRevision": 2,
            "status": "drifted",
            "message": "one revision behind",
        },
    )
    assert deployment.status_code == 201
    assert client.get(f"/api/v1/catalogs/{catalog['id']}").json()["observedRevision"] == 2


def test_active_health_check_records_probe_result(
    client: TestClient,
    two_catalogs: tuple[dict, dict],
    monkeypatch,
) -> None:
    catalog, _ = two_catalogs

    async def fake_check(catalog_model, timeout_seconds, allowed_hosts):
        assert catalog_model.id == catalog["id"]
        assert timeout_seconds == 3
        assert allowed_hosts == ("catalog-api", "example.test", "*.example.test")
        return HealthObservation(
            catalog_id=catalog_model.id,
            status="degraded",
            status_code=503,
            latency_ms=4.2,
            message="maintenance",
        )

    monkeypatch.setattr("didaca_control_plane.api.check_catalog_health", fake_check)
    response = client.post(f"/api/v1/catalogs/{catalog['id']}/health-checks")
    assert response.status_code == 201
    assert response.json()["status"] == "degraded"
    assert response.json()["statusCode"] == 503

    events = client.get("/api/v1/audit-events", params={"aggregateId": catalog["id"]}).json()[
        "items"
    ]
    assert events[-1]["action"] == "catalog.health-checked"


def test_sse_stream_emits_camel_case_health_event() -> None:
    async def scenario() -> None:
        broker = HealthEventBroker()

        async def connected() -> bool:
            return False

        stream = sse_stream(broker, connected)
        assert await anext(stream) == ": connected\n\n"
        await broker.publish({"id": "event-1", "catalogId": "catalog-1", "status": "healthy"})
        event = await anext(stream)
        assert "event: health" in event
        assert '"catalogId":"catalog-1"' in event
        await stream.aclose()

    asyncio.run(scenario())


def test_seed_is_deterministic_and_documents_no_sync(
    session_factory: sessionmaker[Session],
) -> None:
    assert seed_database(session_factory) is True
    assert seed_database(session_factory) is False
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(CatalogInstance)) == 2
        configuration = session.scalar(select(SyncConfiguration))
        assert configuration is not None
        assert configuration.enabled is False
        events = session.scalars(select(AuditEvent)).all()
        assert len(events) == 1
        assert events[0].details["note"].endswith("not implemented.")


def test_openapi_exposes_control_plane_resources(client: TestClient) -> None:
    schema = client.get("/openapi.json").json()
    paths = schema["paths"]
    assert "/api/v1/catalogs" in paths
    assert "/api/v1/trust-grants" in paths
    assert "/api/v1/sync-configurations" in paths
    assert "/api/v1/events/health" in paths
    assert all("graphql" not in path.lower() for path in paths)
