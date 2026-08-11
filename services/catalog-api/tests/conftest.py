from __future__ import annotations

import pytest
from didaca_catalog.database import build_session_factory
from didaca_catalog.main import create_app
from didaca_catalog.models import Base
from didaca_catalog.seed import seed_catalog
from didaca_catalog.settings import Settings
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool


@pytest.fixture
def session_factory():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    factory = build_session_factory(engine)
    with factory() as session:
        seed_catalog(session)
    yield factory
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(session_factory):
    settings = Settings(
        database_url="sqlite+pysqlite://",
        cors_origins=["http://testserver"],
        didaca_demo_auth=True,
        sample_policy_projection_url=None,
        internal_token="test-internal-token",
    )
    app = create_app(settings=settings, session_factory=session_factory)
    with TestClient(app, headers={"X-DiDaCa-User": "didaca-test-editor"}) as test_client:
        yield test_client
