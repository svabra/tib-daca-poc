"""Shared canvas presentation; callers hold the logical-model row lock on writes."""

import uuid
from typing import Annotated

from fastapi import HTTPException
from pydantic import Field

from .modeling_schemas import ApiModel
from .modeling_service import record_audit, utc_now
from .models import MappingCanvasLayout

NodeKey = Annotated[str, Field(pattern=r"^(logical|physical:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$")]


class CanvasPosition(ApiModel):
    x: float = Field(ge=15, le=100_000, allow_inf_nan=False)
    y: float = Field(ge=15, le=100_000, allow_inf_nan=False)


class CanvasLayout(ApiModel):
    revision: int = Field(ge=0)
    positions: dict[NodeKey, CanvasPosition] = Field(default_factory=dict, max_length=501)


def canvas_payload(session, model_id: uuid.UUID, table_ids: set[uuid.UUID]) -> dict:
    row = session.get(MappingCanvasLayout, model_id)
    allowed = {"logical", *(f"physical:{table_id}" for table_id in table_ids)}
    return {
        "revision": row.revision if row else 0,
        "positions": {key: value for key, value in row.positions.items() if key in allowed} if row else {},
    }


def save_canvas(session, model_id: uuid.UUID, actor: str, value: CanvasLayout, table_ids: set[uuid.UUID]) -> None:
    row = session.get(MappingCanvasLayout, model_id)
    if value.revision != (row.revision if row else 0):
        raise HTTPException(409, "Die gemeinsame Kartenanordnung wurde geändert. Laden Sie den Arbeitsplatz neu, bevor Sie speichern.")
    allowed = {"logical", *(f"physical:{table_id}" for table_id in table_ids)}
    if value.positions.keys() - allowed:
        raise HTTPException(422, "Kartenpositionen dürfen nur zugängliche Repräsentationen dieses Modells betreffen.")
    # Partial writes preserve positions of sources unavailable to this actor.
    positions = {**(row.positions if row else {}), **{
        key: position.model_dump() for key, position in value.positions.items()
    }}
    if row and positions == row.positions:
        return
    if row is None:
        row = MappingCanvasLayout(logical_model_id=model_id, revision=1, positions=positions, updated_by_user_id=actor, updated_at=utc_now())
        session.add(row)
    else:
        row.positions = positions
        row.revision += 1
        row.updated_by_user_id = actor
        row.updated_at = utc_now()
    record_audit(session, "mapping-canvas", model_id, "layout-saved", actor, row.revision,
                 {"nodeCount": len(positions)})
