"""Lifecycle of declared structure inventories; audit evidence outlives deletion."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query, Response
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.exc import IntegrityError

from .modeling_api import (
    ActorDep,
    SessionDep,
    _descendant_ids,
    _etag,
    _require_any_assignment,
    _require_etag,
    _require_scope,
)
from .modeling_core import canonical_hash
from .modeling_schemas import PhysicalSourceResponse
from .modeling_service import record_audit, utc_now
from .models import (
    AssetMapping,
    AssetMappingVersion,
    AuditEvent,
    LogicalModelRepresentation,
    PhysicalDatabase,
    PhysicalDriftReport,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
)
from .schemas import AuditEventResponse


def inventory_audit_details(source: PhysicalSource) -> dict:
    return {"name": source.name, "urn": source.urn, "departmentCode": source.department_code,
            "organizationId": source.organization_id, "lifecycle": source.lifecycle}


def _inventory(session, actor: str, source_id: uuid.UUID, if_match: str | None) -> PhysicalSource:
    source = session.scalar(select(PhysicalSource).where(PhysicalSource.id == source_id).with_for_update())
    if source is None:
        raise HTTPException(404, "Das Strukturinventar wurde nicht gefunden.")
    _require_scope(session, actor, source.department_code, source.organization_id,
                   roles={"data_owner", "deputy_data_owner", "data_steward"})
    if source.adapter_type != "csv":
        raise HTTPException(422, "Diese Aktion ist nur für Strukturinventare verfügbar.")
    _require_etag(if_match, source.revision)
    return source


def remove_structure_inventory(session, actor: str, source_id: uuid.UUID, if_match: str | None) -> Response:
    """Shared guarded removal used by inventory deletion and the example-import reset."""
    source = _inventory(session, actor, source_id, if_match)
    snapshots = select(PhysicalSchemaSnapshot.id).where(PhysicalSchemaSnapshot.source_id == source.id)
    used = (session.scalar(select(AssetMapping.id).where(AssetMapping.physical_source_id == source.id).limit(1))
            or session.scalar(select(AssetMappingVersion.id).where(AssetMappingVersion.physical_snapshot_id.in_(snapshots)).limit(1))
            or session.scalar(select(LogicalModelRepresentation.id).where(LogicalModelRepresentation.physical_snapshot_id.in_(snapshots)).limit(1)))
    if used:
        raise HTTPException(409, "Das Strukturinventar wird von Modellverknüpfungen oder historischen Mappings verwendet. Bitte stattdessen archivieren.")
    details = inventory_audit_details(source)
    details["snapshotCount"] = session.scalar(select(func.count()).select_from(PhysicalSchemaSnapshot).where(PhysicalSchemaSnapshot.source_id == source.id))
    details["tableCount"] = session.scalar(select(func.count()).select_from(PhysicalTable).join(PhysicalSchema).join(PhysicalDatabase).where(PhysicalDatabase.snapshot_id.in_(snapshots)))
    record_audit(session, "structure-inventory", source.id, "deleted", actor, source.revision + 1, details)
    try:
        # Immutable mapping/representation FKs guard concurrent references too.
        session.execute(delete(PhysicalDriftReport).where(PhysicalDriftReport.source_id == source.id))
        session.execute(delete(PhysicalSchemaSnapshot).where(PhysicalSchemaSnapshot.source_id == source.id))
        session.delete(source)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Das Strukturinventar wurde inzwischen verknüpft. Bitte neu laden und stattdessen archivieren.") from None
    return Response(status_code=204)


def create_structure_inventory_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1/structure-inventories", tags=["structure inventories"])

    @router.get("/audit-events", response_model=list[AuditEventResponse])
    def audit_events(session: SessionDep, actor: ActorDep,
                     limit: Annotated[int, Query(ge=1, le=500)] = 200):
        scopes = _require_any_assignment(session, actor)
        permitted = [and_(AuditEvent.details["departmentCode"].as_string() == scope.department_code,
                          AuditEvent.details["organizationId"].as_string().in_(_descendant_ids(session, scope.organization_id)))
                     for scope in scopes]
        return list(session.scalars(select(AuditEvent).where(
            AuditEvent.resource_type == "structure-inventory", or_(*permitted)
        ).order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).limit(limit)))

    @router.post("/{source_id}/archive", response_model=PhysicalSourceResponse)
    def archive(source_id: uuid.UUID, session: SessionDep, actor: ActorDep, response: Response,
                if_match: Annotated[str | None, Header(alias="If-Match")] = None):
        from .modeling_lifecycle_api import _physical_source_payload

        source = _inventory(session, actor, source_id, if_match)
        if source.lifecycle != "active":
            raise HTTPException(409, "Nur aktive Strukturinventare können archiviert werden.")
        source.lifecycle = "archived"
        source.revision += 1
        source.updated_at = source.retired_at = utc_now()
        source.content_hash = canonical_hash(inventory_audit_details(source))
        record_audit(session, "structure-inventory", source.id, "archived", actor, source.revision,
                     inventory_audit_details(source))
        session.commit()
        response.headers["ETag"] = _etag(source.revision)
        return {**_physical_source_payload(session, source), "inventoryManageable": True}

    @router.post("/{source_id}/restore", response_model=PhysicalSourceResponse)
    def restore(source_id: uuid.UUID, session: SessionDep, actor: ActorDep, response: Response,
                if_match: Annotated[str | None, Header(alias="If-Match")] = None):
        from .modeling_lifecycle_api import _physical_source_payload

        source = _inventory(session, actor, source_id, if_match)
        if source.lifecycle != "archived":
            raise HTTPException(409, "Nur archivierte Strukturinventare können wiederhergestellt werden.")
        source.lifecycle = "active"
        source.revision += 1
        source.updated_at = utc_now()
        source.retired_at = None
        source.content_hash = canonical_hash(inventory_audit_details(source))
        record_audit(session, "structure-inventory", source.id, "restored", actor, source.revision,
                     inventory_audit_details(source))
        session.commit()
        response.headers["ETag"] = _etag(source.revision)
        return {**_physical_source_payload(session, source), "inventoryManageable": True}

    @router.delete("/{source_id}", status_code=204)
    def remove(source_id: uuid.UUID, session: SessionDep, actor: ActorDep,
               if_match: Annotated[str | None, Header(alias="If-Match")] = None):
        return remove_structure_inventory(session, actor, source_id, if_match)

    return router
