from __future__ import annotations

import os

import pytest
from daca_catalog.database import build_engine, build_session_factory
from daca_catalog.main import create_app
from daca_catalog.models import Base
from daca_catalog.seed import seed_catalog
from daca_catalog.settings import Settings
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool


def drop_test_schema(engine, database_url: str) -> None:
    if database_url.startswith("sqlite"):
        with engine.connect() as connection:
            connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            Base.metadata.drop_all(connection)
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        return
    Base.metadata.drop_all(engine)


@pytest.fixture
def session_factory():
    database_url = os.getenv("DACA_TEST_DATABASE_URL", "sqlite+pysqlite://")
    engine_options = {}
    if database_url.startswith("sqlite"):
        engine_options["poolclass"] = StaticPool
    engine = build_engine(database_url, **engine_options)
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
    database_url = os.getenv("DACA_TEST_DATABASE_URL", "sqlite+pysqlite://")
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
