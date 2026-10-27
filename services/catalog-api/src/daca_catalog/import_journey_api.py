"""Download and replay the versioned AdA CSV-import example without resetting the catalog."""
from __future__ import annotations

import base64
from functools import cache
from importlib.resources import files
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import Field
from sqlalchemy import text

from .modeling_api import (
    SessionDep,
    _require_any_assignment,
    _require_scope,
    require_modeling_actor,
)
from .modeling_core import stable_uuid
from .modeling_lifecycle_api import _physical_source_payload
from .models import PhysicalSource
from .physical_csv import parse_inventory
from .schemas import ApiModel
from .structure_inventory_api import remove_structure_inventory

ADA_FILENAME = "ada_bewirtschaftung.csv"


def require_journey_actor(request: Request, session: SessionDep,
                          x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None) -> str:
    # A normal download link cannot add the demo identity header. Prefer the
    # authenticated browser/CLI session, using the existing demo-header boundary
    # only when no session cookie exists (as for other modeling API clients).
    if not request.app.state.settings.daca_demo_auth:
        raise HTTPException(503, "Demo identity is disabled")
    if request.cookies.get("daca_session"):
        from .main import local_session_user

        return local_session_user(session, request).id
    return require_modeling_actor(request, x_daca_user)


JourneyActorDep = Annotated[str, Depends(require_journey_actor)]


@cache
def ada_inventory_bytes() -> bytes:
    return files("daca_catalog").joinpath("fixtures", ADA_FILENAME).read_bytes()


@cache
def ada_fingerprint() -> str:
    return parse_inventory(base64.b64encode(ada_inventory_bytes()).decode()).fingerprint


def ada_source_id(department: str, organization: str):
    return stable_uuid(f"csv-inventory:{department}:{organization}:{ada_fingerprint()}")


class ImportJourneyScope(ApiModel):
    department_code: str = Field(min_length=1, max_length=20)
    organization_id: str = Field(min_length=1, max_length=255)


def create_import_journey_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1/import-journeys/ada", tags=["physical import journey"])

    @router.get("/inventory.csv")
    def download(session: SessionDep, actor: JourneyActorDep):
        _require_any_assignment(session, actor)
        return Response(ada_inventory_bytes(), media_type="text/csv; charset=utf-8", headers={
            "Content-Disposition": f'attachment; filename="{ADA_FILENAME}"',
            "Cache-Control": "private, no-store",
        })

    @router.get("")
    def status(session: SessionDep, actor: JourneyActorDep, departmentCode: str, organizationId: str):
        _require_scope(session, actor, departmentCode, organizationId,
                       roles={"data_owner", "deputy_data_owner", "data_steward"})
        source = session.get(PhysicalSource, ada_source_id(departmentCode, organizationId))
        return {"source": {**_physical_source_payload(session, source), "inventoryManageable": True} if source else None}

    @router.post("/reset")
    def reset(body: ImportJourneyScope, session: SessionDep, actor: JourneyActorDep,
              if_match: Annotated[str | None, Header(alias="If-Match")] = None):
        _require_scope(session, actor, body.department_code, body.organization_id,
                       roles={"data_owner", "deputy_data_owner", "data_steward"})
        source_id = ada_source_id(body.department_code, body.organization_id)
        # Use the import's own serialization key, including when the source is absent.
        session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": str(source_id)})
        if session.get(PhysicalSource, source_id) is None:
            session.commit()
            return {"sourceId": str(source_id), "alreadyReset": True}
        remove_structure_inventory(session, actor, source_id, if_match)
        return {"sourceId": str(source_id), "alreadyReset": False}

    return router
