"""Small, private workspace history. Reauthorize every reference on every read."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import model_validator
from sqlalchemy import delete, select

from .modeling_api import ActorDep, SessionDep, _require_snapshot_scope, _require_version_scope
from .modeling_service import get_logical_model, get_logical_version, utc_now
from .models import (
    DcatDatasetVersionLocalization,
    DemoUser,
    MappingWorkspaceVisit,
    PhysicalDatabase,
    PhysicalSchema,
    PhysicalSource,
    PhysicalTable,
)
from .schemas import ApiModel

HISTORY_LIMIT = 10


class WorkspaceVisitWrite(ApiModel):
    physical_snapshot_id: uuid.UUID | None = None
    physical_table_id: uuid.UUID | None = None
    view: Literal["graph", "table", "drift"] = "graph"

    @model_validator(mode="after")
    def paired_physical_selection(self):
        if bool(self.physical_snapshot_id) != bool(self.physical_table_id):
            raise ValueError("Select both a snapshot and its physical object")
        return self


class WorkspaceVisitResponse(WorkspaceVisitWrite):
    logical_model_id: uuid.UUID
    title: dict[str, str]
    physical_label: str | None = None
    visited_at: datetime


def _physical_label(session, actor, snapshot_id, table_id):
    snapshot = _require_snapshot_scope(session, actor, snapshot_id)
    source = session.get(PhysicalSource, snapshot.source_id)
    if source is None or source.lifecycle != "active":
        raise HTTPException(404, "Physical source is unavailable")
    row = session.execute(
        select(PhysicalTable, PhysicalSchema, PhysicalDatabase)
        .join(PhysicalSchema, PhysicalTable.physical_schema_id == PhysicalSchema.id)
        .join(PhysicalDatabase, PhysicalSchema.physical_database_id == PhysicalDatabase.id)
        .where(PhysicalTable.id == table_id, PhysicalDatabase.snapshot_id == snapshot_id)
    ).first()
    if row is None:
        raise HTTPException(422, "Physical object does not belong to this snapshot")
    table, schema, database = row
    return " · ".join([source.name, f"{database.name}.{schema.name}.{table.name}"])


def create_mapping_workspace_history_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1/me/mapping-workspaces", tags=["personal mapping context"])

    @router.get("", response_model=list[WorkspaceVisitResponse])
    def recent_work(session: SessionDep, actor: ActorDep, response: Response):
        response.headers["Cache-Control"] = "private, no-store"
        rows = session.scalars(select(MappingWorkspaceVisit).where(
            MappingWorkspaceVisit.user_id == actor,
        ).order_by(MappingWorkspaceVisit.visited_at.desc(), MappingWorkspaceVisit.logical_model_id).limit(HISTORY_LIMIT))
        items = []
        for row in rows:
            try:
                model = get_logical_model(session, row.logical_model_id)
                if model.lifecycle != "active":
                    continue
                version = get_logical_version(session, model.id)
                _require_version_scope(session, actor, version)
            except HTTPException as error:
                if error.status_code in {401, 403, 404, 422}:
                    continue
                raise
            snapshot_id, table_id, label = None, None, None
            if row.physical_snapshot_id and row.physical_table_id:
                try:
                    label = _physical_label(session, actor, row.physical_snapshot_id, row.physical_table_id)
                    snapshot_id, table_id = row.physical_snapshot_id, row.physical_table_id
                except HTTPException as error:
                    if error.status_code not in {401, 403, 404, 422}:
                        raise
            title = {item.language: item.title for item in session.scalars(select(DcatDatasetVersionLocalization).where(
                DcatDatasetVersionLocalization.dataset_version_id == version.dataset_version_id,
            ))}
            items.append({
                "logicalModelId": model.id, "title": title,
                "physicalSnapshotId": snapshot_id, "physicalTableId": table_id, "physicalLabel": label,
                "view": row.view, "visitedAt": row.visited_at,
            })
        return items

    @router.put("/{model_id}", status_code=204)
    def remember_work(model_id: uuid.UUID, body: WorkspaceVisitWrite, session: SessionDep, actor: ActorDep):
        model = get_logical_model(session, model_id)
        if model.lifecycle != "active":
            raise HTTPException(409, "Retired models cannot be resumed")
        _require_version_scope(session, actor, get_logical_version(session, model_id))
        if body.physical_snapshot_id:
            _physical_label(session, actor, body.physical_snapshot_id, body.physical_table_id)
        # Serialize bounded-history updates for one user, including concurrent browser tabs.
        session.execute(select(DemoUser).where(DemoUser.id == actor).with_for_update()).scalar_one()
        row = session.get(MappingWorkspaceVisit, (actor, model_id))
        if row is None:
            row = MappingWorkspaceVisit(user_id=actor, logical_model_id=model_id)
            session.add(row)
        row.physical_snapshot_id, row.physical_table_id = body.physical_snapshot_id, body.physical_table_id
        row.view, row.visited_at = body.view, utc_now()
        session.flush()
        old_ids = list(session.scalars(select(MappingWorkspaceVisit.logical_model_id).where(
            MappingWorkspaceVisit.user_id == actor,
        ).order_by(MappingWorkspaceVisit.visited_at.desc(), MappingWorkspaceVisit.logical_model_id).offset(HISTORY_LIMIT)))
        if old_ids:
            session.execute(delete(MappingWorkspaceVisit).where(
                MappingWorkspaceVisit.user_id == actor, MappingWorkspaceVisit.logical_model_id.in_(old_ids),
            ))
        session.commit()
        return Response(status_code=204, headers={"Cache-Control": "private, no-store"})

    return router
