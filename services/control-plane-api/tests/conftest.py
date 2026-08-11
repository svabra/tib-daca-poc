from collections.abc import Iterator

import pytest
from didaca_control_plane.config import Settings
from didaca_control_plane.main import create_app
from didaca_control_plane.models import Base
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture
def session_factory() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, _connection_record) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(session_factory: sessionmaker[Session]) -> Iterator[TestClient]:
    settings = Settings(
        database_url="sqlite+pysqlite://",
        health_poll_interval_seconds=0,
        seed_on_startup=False,
        policy_sync_enabled=False,
        demo_auth=True,
        endpoint_host_allowlist="catalog-api,example.test,*.example.test",
    )
    application = create_app(settings=settings, session_factory=session_factory)
    with TestClient(application) as test_client:
        test_client.headers.update({"X-DiDaCa-Actor": "test-control-admin"})
        yield test_client


@pytest.fixture
def two_catalogs(client: TestClient) -> tuple[dict, dict]:
    provider = _create_catalog(client, "provider", "Provider")
    consumer = _create_catalog(client, "consumer", "Consumer")
    return provider, consumer


def _create_catalog(client: TestClient, suffix: str, name: str) -> dict:
    response = client.post(
        "/api/v1/catalogs",
        json={
            "urn": f"urn:didaca:catalog:{suffix}",
            "name": name,
            "organization": name,
            "environment": "test",
            "endpoint": f"https://{suffix}.example.test/api",
            "apiVersion": "v1",
            "capabilities": ["metadata", "lineage", "provenance"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()
