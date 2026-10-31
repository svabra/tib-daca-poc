from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from fastapi import Request
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .settings import Settings


def build_engine(
    database_url: str,
    *,
    database_schema: str = "public",
    **kwargs: Any,
) -> Engine:
    if not database_url.startswith("postgresql"):
        raise ValueError("The DaCa Catalog API supports PostgreSQL only")
    options: dict[str, Any] = {"pool_pre_ping": True}
    if database_schema != "public":
        options["connect_args"] = {
            "options": f"-csearch_path={database_schema},public",
        }
    options.update(kwargs)
    engine = create_engine(database_url, **options)
    return engine


def build_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def default_session_factory(settings: Settings) -> sessionmaker[Session]:
    return build_session_factory(
        build_engine(
            settings.resolved_database_url,
            database_schema=settings.daca_catalog_schema,
        )
    )


@contextmanager
def identity_session(request: Request) -> Iterator[Session]:
    """Finish identity validation before the route borrows its lazy transaction connection."""
    with request.app.state.session_factory() as session:
        yield session


def bind_demo_actor(session: Session, actor_id: str) -> None:
    # A yield dependency must not hold a pool slot while waiting for another
    # dependency or for a handler thread. Bind each actual transaction lazily.
    def after_begin(_session, _transaction, connection):
        from .models import DemoUser
        active = connection.scalar(select(DemoUser.id).where(DemoUser.id == actor_id, DemoUser.active.is_(True)))
        if active:
            connection.execute(text("SELECT set_config('daca.role_actor', :actor, true)"), {"actor": active})
    event.listen(session, "after_begin", after_begin)


def get_session(request: Request) -> Iterator[Session]:
    session_factory: sessionmaker[Session] = request.app.state.session_factory
    with session_factory() as session:
        # The local preview identity is already the authority used by ActorDep.
        # Bind the validated actor to this transaction for database triggers.
        if request.app.state.settings.daca_demo_auth:
            actor_id = (request.headers.get("X-DaCa-User") or "").strip()[:200]
            if actor_id:
                bind_demo_actor(session, actor_id)
        # Exception handlers need to roll back failed flushes before returning a
        # RFC-7807 response.  Keep the request-scoped session discoverable for
        # that narrow purpose only.
        request.state.db_session = session
        try:
            yield session
        except Exception:
            session.rollback()
            raise
        finally:
            if getattr(request.state, "db_session", None) is session:
                del request.state.db_session
