from collections.abc import Iterator
from typing import Any

from fastapi import Request
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .settings import Settings


def build_engine(
    database_url: str,
    *,
    database_schema: str = "public",
    **kwargs: Any,
) -> Engine:
    options: dict[str, Any] = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
        options["pool_pre_ping"] = False
    elif database_url.startswith("postgresql") and database_schema != "public":
        options["connect_args"] = {
            "options": f"-csearch_path={database_schema},public",
        }
    options.update(kwargs)
    engine = create_engine(database_url, **options)
    if database_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def configure_sqlite(dbapi_connection: Any, _connection_record: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()
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
        yield session
