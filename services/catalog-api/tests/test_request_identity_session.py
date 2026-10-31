import os

from daca_catalog.database import build_engine, build_session_factory, get_session
from daca_catalog.main import create_app
from daca_catalog.settings import Settings
from fastapi.testclient import TestClient
from sqlalchemy import text
from starlette.requests import Request


def test_demo_identity_checks_work_with_a_single_database_connection(session_factory):
    """A request already holding its DB session must not wait for a second pool slot."""
    url = os.environ["DACA_TEST_DATABASE_URL"]
    engine = build_engine(url, pool_size=1, max_overflow=0, pool_timeout=0.3)
    settings = Settings(database_url=url, daca_demo_auth=True, sample_policy_projection_url=None)
    app = create_app(settings=settings, session_factory=build_session_factory(engine))
    try:
        request = Request({"type": "http", "app": app, "headers": [(b"x-daca-user", b"daca-test-editor")]})
        dependency = get_session(request)
        session = next(dependency)
        assert engine.pool.checkedout() == 0
        assert session.scalar(text("select current_setting('daca.role_actor', true)")) == "daca-test-editor"
        dependency.close()
        assert engine.pool.checkedout() == 0
        with TestClient(app) as client:
            for path in ("/api/v1/domain-network/view", "/api/v1/semantic-graphs/domains"):
                response = client.get(path, headers={"X-DaCa-User": "daca-test-editor"})
                assert response.status_code == 200, response.text
                assert client.get(path, headers={"X-DaCa-User": "unknown-user"}).status_code == 401
    finally:
        engine.dispose()
