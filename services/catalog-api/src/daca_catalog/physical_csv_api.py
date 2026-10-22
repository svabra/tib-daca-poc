from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response
from pydantic import Field
from sqlalchemy import func, select, text

from .modeling_api import ActorDep, SessionDep, _require_any_assignment, _require_scope
from .modeling_core import canonical_hash, stable_uuid
from .modeling_service import persist_physical_import, record_audit, snapshot_tree, utc_now
from .models import AdministrativeOrganization, AuditEvent, PhysicalSchemaSnapshot, PhysicalSource
from .physical_csv import CsvInventory, parse_inventory
from .schemas import ApiModel
from .structure_inventory_api import inventory_audit_details


class CsvPreviewRequest(ApiModel):
    content_base64: str = Field(min_length=1, max_length=2_796_204)


class CsvImportRequest(CsvPreviewRequest):
    name: str = Field(min_length=1, max_length=255)
    filename: str = Field(min_length=1, max_length=255)
    department_code: str = Field(min_length=1, max_length=20)
    organization_id: str = Field(min_length=1, max_length=255)
    fingerprint: str = Field(pattern=r"^[a-f0-9]{64}$")


def _parse(body: CsvPreviewRequest) -> CsvInventory:
    try:
        return parse_inventory(body.content_base64)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


def create_physical_csv_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1/physical-model-csv", tags=["physical metadata CSV"])

    @router.post("/preview")
    def preview(body: CsvPreviewRequest, session: SessionDep, actor: ActorDep) -> dict[str, Any]:
        _require_any_assignment(session, actor)
        return _parse(body).preview()

    @router.post("/imports")
    def import_inventory(body: CsvImportRequest, session: SessionDep, actor: ActorDep, response: Response) -> dict[str, Any]:
        _require_scope(session, actor, body.department_code, body.organization_id,
                       roles={"data_owner", "deputy_data_owner", "data_steward"})
        organization = session.get(AdministrativeOrganization, body.organization_id)
        if not organization or not organization.active or organization.department_code != body.department_code:
            raise HTTPException(422, "Bitte eine aktive Organisation im gewählten Departement auswählen.")
        inventory = _parse(body)
        if inventory.fingerprint != body.fingerprint:
            raise HTTPException(409, "Die Datei hat sich seit der Vorschau geändert. Bitte erneut prüfen.")
        if not body.name.strip():
            raise HTTPException(422, "Bitte eine Bezeichnung für die importierte Struktur angeben.")
        # One immutable inventory per scope/content. Serialize retries, including
        # concurrent requests, before testing existence; never overwrite live sources.
        source_id = stable_uuid(f"csv-inventory:{body.department_code}:{body.organization_id}:{inventory.fingerprint}")
        session.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": str(source_id)})
        source = session.get(PhysicalSource, source_id)
        reused = source is not None
        if source is not None:
            if source.lifecycle != "active":
                raise HTTPException(409, "Dieses Strukturinventar ist archiviert oder stillgelegt. Bitte zuerst im Register wiederherstellen.")
            snapshot = session.scalar(select(PhysicalSchemaSnapshot).where(PhysicalSchemaSnapshot.source_id == source.id)
                                      .order_by(PhysicalSchemaSnapshot.sequence.desc()).limit(1))
            if snapshot is None:
                raise HTTPException(409, "Zum bestehenden Import fehlt der Snapshot.")
        else:
            previous_revision = session.scalar(select(func.max(AuditEvent.revision)).where(
                AuditEvent.resource_id == str(source_id),
                AuditEvent.resource_type.in_(["structure-inventory", "physical-source"]))) or 0
            source = PhysicalSource(
                id=source_id, urn=f"urn:daca:physical-source:{source_id}", origin_catalog_id="urn:daca:catalog:bit-poc",
                name=body.name.strip(), description=f"Strukturinventar aus {body.filename}. Importierte Strukturmetadaten ohne technische Anbindung.",
                adapter_type="csv", department_code=body.department_code, organization_id=body.organization_id,
                revision=previous_revision + 1, content_hash=canonical_hash({"fingerprint": inventory.fingerprint, "filename": body.filename}),
                lifecycle="active", created_by_user_id=actor, created_at=utc_now(), updated_at=utc_now(),
            )
            session.add(source)
            session.flush()
            snapshot, _report = persist_physical_import(session, source, inventory, actor)
            record_audit(session, "structure-inventory", source.id, "imported", actor, source.revision,
                         inventory_audit_details(source))
        # The source, all 31 (or other) tables, fields and audit evidence commit together.
        result = {"sourceId": str(source.id), "reused": reused, "preview": inventory.preview(), "snapshot": snapshot_tree(session, snapshot)}
        session.commit()
        response.status_code = 200 if reused else 201
        return result

    return router
