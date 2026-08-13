from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .api import health_router, router
from .config import Settings, get_settings
from .database import create_database_engine, create_session_factory
from .events import HealthEventBroker
from .health import poll_catalogs
from .problems import install_problem_handlers
from .seed import seed_database


def create_app(
    *,
    settings: Settings | None = None,
    session_factory: sessionmaker[Session] | None = None,
) -> FastAPI:
    active_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        owned_engine: Engine | None = None
        if session_factory is None:
            owned_engine = create_database_engine(active_settings)
            application.state.session_factory = create_session_factory(owned_engine)
        else:
            application.state.session_factory = session_factory

        if active_settings.seed_on_startup:
            seed_database(application.state.session_factory)

        stop = asyncio.Event()
        poller = asyncio.create_task(
            poll_catalogs(
                application.state.session_factory,
                active_settings,
                application.state.health_broker,
                stop,
            ),
            name="daca-catalog-health-poller",
        )
        try:
            yield
        finally:
            stop.set()
            if not poller.done():
                poller.cancel()
            with suppress(asyncio.CancelledError):
                await poller
            if owned_engine is not None:
                owned_engine.dispose()

    application = FastAPI(
        title="BIT DaCa Control Plane API",
        summary="Declarative catalog registration, trust and future sync control.",
        description=(
            "Manages desired control-plane state. It deliberately does not transfer "
            "metadata, lineage, provenance, or policies between catalogs."
        ),
        version="0.1.0",
        lifespan=lifespan,
        openapi_url="/openapi.json",
        docs_url="/docs",
    )
    application.state.settings = active_settings
    application.state.health_broker = HealthEventBroker()
    application.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
        allow_headers=[
            "Content-Type",
            "If-Match",
            "X-Request-ID",
            "X-DaCa-Actor",
        ],
        expose_headers=["ETag", "Location", "X-Request-ID"],
    )
    install_problem_handlers(application)
    application.include_router(health_router)
    application.include_router(router)
    return application


app = create_app()
