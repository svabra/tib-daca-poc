from __future__ import annotations

import os

import pytest
from daca_catalog.database import build_engine, build_session_factory
from daca_catalog.main import create_app
from daca_catalog.models import Base
from daca_catalog.seed import seed_catalog
from daca_catalog.settings import Settings
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url


def drop_test_schema(engine, database_url: str) -> None:
    parsed = make_url(database_url)
    if not parsed.drivername.startswith("postgresql") or not (parsed.database or "").endswith("_test"):
        raise RuntimeError("Destructive Catalog API tests require an isolated PostgreSQL database ending in _test")
    Base.metadata.drop_all(engine)


@pytest.fixture
def session_factory():
    database_url = os.getenv("DACA_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("DACA_TEST_DATABASE_URL must point to an isolated PostgreSQL *_test database")
    engine = build_engine(database_url)
    drop_test_schema(engine, database_url)
    Base.metadata.create_all(engine)
    factory = build_session_factory(engine)
    with factory() as session:
        seed_catalog(session)
    yield factory
    drop_test_schema(engine, database_url)
    engine.dispose()


@pytest.fixture
def client(session_factory):
    database_url = os.environ["DACA_TEST_DATABASE_URL"]
    settings = Settings(
        database_url=database_url,
        cors_origins=["http://testserver"],
        daca_demo_auth=True,
        daca_open_metadata_publication=True,
        sample_policy_projection_url=None,
        internal_token="test-internal-token",
    )
    app = create_app(settings=settings, session_factory=session_factory)
    with TestClient(app, headers={"X-DaCa-User": "daca-test-editor"}) as test_client:
        yield test_client
