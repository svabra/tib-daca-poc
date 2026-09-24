from collections.abc import Iterator
from typing import Any

from fastapi import Request
from sqlalchemy import create_engine, text
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


def get_session(request: Request) -> Iterator[Session]:
    session_factory: sessionmaker[Session] = request.app.state.session_factory
    with session_factory() as session:
        # The local preview identity is already the authority used by ActorDep.
        # Bind the validated actor to this transaction for database triggers.
        if request.app.state.settings.daca_demo_auth:
            actor_id = (request.headers.get("X-DaCa-User") or "").strip()[:200]
            if actor_id:
                from .models import DemoUser

                user = session.get(DemoUser, actor_id)
                if user is not None and user.active:
                    session.execute(text("SELECT set_config('daca.role_actor', :actor, true)"), {"actor": actor_id})
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
