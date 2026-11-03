"""Bulk, read-only field metadata for the central catalog's expert search."""
from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import func, select

from .modeling_api import ActorDep, SessionDep
from .models import LogicalEntityVersion, LogicalFieldVersion, LogicalModel, LogicalModelVersion
from .schemas import ApiModel


class LogicalSearchField(ApiModel):
    model_id: uuid.UUID
    model_version_id: uuid.UUID
    id: uuid.UUID
    root_id: uuid.UUID
    entity_name: str
    name: str
    data_type: str
    nullable: bool
    short_description: str | None
    comment: str | None
    business_object: str | None
    source_system: str | None


class LogicalSearchFieldCollection(ApiModel):
    items: list[LogicalSearchField]
    total: int


def create_modeling_search_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["modeling"])

    @router.get("/logical-model-fields", response_model=LogicalSearchFieldCollection)
    def list_logical_fields(session: SessionDep, actor: ActorDep):
        # Match /logical-models: logical metadata is readable catalog-wide by
        # active identities. This projection has no physical access or write rights.
        del actor
        latest = select(
            LogicalModelVersion.logical_model_id,
            func.max(LogicalModelVersion.revision).label("revision"),
        ).group_by(LogicalModelVersion.logical_model_id).subquery()
        rows = session.execute(
            select(LogicalModelVersion, LogicalEntityVersion.name, LogicalFieldVersion)
            .join(latest, (latest.c.logical_model_id == LogicalModelVersion.logical_model_id)
                  & (latest.c.revision == LogicalModelVersion.revision))
            .join(LogicalModel, LogicalModel.id == LogicalModelVersion.logical_model_id)
            .join(LogicalEntityVersion, LogicalEntityVersion.logical_model_version_id == LogicalModelVersion.id)
            .join(LogicalFieldVersion, LogicalFieldVersion.logical_entity_version_id == LogicalEntityVersion.id)
            .where(LogicalModel.lifecycle == "active")
            .order_by(LogicalModel.id, LogicalEntityVersion.position, LogicalFieldVersion.position, LogicalFieldVersion.id)
        )
        items = [
            {"modelId": model.logical_model_id, "modelVersionId": model.id,
             "id": field.id, "rootId": field.logical_field_id, "entityName": entity_name,
             "name": field.name, "dataType": field.data_type, "nullable": field.nullable,
             "shortDescription": field.short_description, "comment": field.comment,
             "businessObject": field.business_object, "sourceSystem": field.source_system}
            for model, entity_name, field in rows
        ]
        return {"items": items, "total": len(items)}

    return router
