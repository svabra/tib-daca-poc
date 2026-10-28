"""Snapshot-pinned representation membership and atomic workspace draft saves."""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import Field
from sqlalchemy import select

from .mapping_canvas import CanvasLayout, canvas_payload, save_canvas
from .mapping_inconsistencies import rebase_mapping_versions, sync_mapping_inconsistencies
from .modeling_api import (
    ActorDep,
    SessionDep,
    _compatible_representation_scope,
    _dataset_version,
    _normalize_logical_write_scope,
    _require_etag,
    _require_scope,
    _require_snapshot_scope,
    _require_version_scope,
    _validate_mapping_scope,
    _validate_owner_assignments,
)
from .modeling_core import canonical_hash
from .modeling_schemas import (
    ApiModel,
    AssetMappingResponse,
    AssetMappingWrite,
    LogicalModelResponse,
    LogicalModelWrite,
)
from .modeling_service import (
    create_asset_mapping,
    create_logical_successor,
    create_mapping_successor,
    get_logical_model,
    get_logical_version,
    get_mapping_version,
    logical_version_payload,
    mapping_payload,
    mapping_write_from_payload,
    record_audit,
    utc_now,
    validate_mapping_version,
)
from .models import (
    AssetMapping,
    AssetMappingPhysicalColumn,
    AssetMappingVersion,
    LogicalModelRepresentation,
    LogicalModelVersion,
    PhysicalColumn,
    PhysicalDatabase,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
)
from .physical_source_access import returned_source_ids


class RepresentationWrite(ApiModel):
    physical_snapshot_id: uuid.UUID
    physical_table_id: uuid.UUID


class RepresentationResponse(RepresentationWrite):
    id: uuid.UUID


class RepresentationCollection(ApiModel):
    items: list[RepresentationResponse]


class MappingDraftChange(ApiModel):
    client_id: str = Field(min_length=1, max_length=200)
    mapping_id: uuid.UUID | None = None
    version_id: uuid.UUID | None = None
    lock_version: int | None = None
    value: AssetMappingWrite


class MappingRemoval(ApiModel):
    mapping_id: uuid.UUID
    version_id: uuid.UUID
    lock_version: int = Field(ge=1)


class WorkspaceDraftWrite(ApiModel):
    logical_model_version_id: uuid.UUID
    logical_model: LogicalModelWrite | None = None
    representations: list[RepresentationWrite] = Field(default_factory=list, max_length=500)
    mappings: list[MappingDraftChange] = Field(default_factory=list, max_length=5000)
    removals: list[MappingRemoval] = Field(default_factory=list, max_length=5000)
    canvas_layout: CanvasLayout | None = None


class SavedMapping(ApiModel):
    client_id: str
    mapping: AssetMappingResponse


class WorkspaceDraftResponse(RepresentationCollection):
    mappings: list[SavedMapping]
    removed_mapping_ids: list[uuid.UUID] = Field(default_factory=list)
    logical_model: LogicalModelResponse | None = None
    current_mappings: list[AssetMappingResponse] | None = None
    canvas_layout: CanvasLayout


def representation_id(model_id: uuid.UUID, table_id: uuid.UUID) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"daca:representation:{model_id}:{table_id}")


def representation_items(session, model_id: uuid.UUID, actor: str | None = None) -> list[dict[str, Any]]:
    items = {
        row.physical_table_id: {
            "id": row.id,
            "physicalSnapshotId": row.physical_snapshot_id,
            "physicalTableId": row.physical_table_id,
        }
        for row in session.scalars(
            select(LogicalModelRepresentation).where(
                LogicalModelRepresentation.logical_model_id == model_id
            )
        )
    }
    # Compatibility for sources derived/linked through the existing individual
    # mapping APIs, including installations whose seed runs after the migration.
    rows = session.execute(
        select(AssetMappingVersion.physical_snapshot_id, PhysicalColumn.physical_table_id)
        .join(AssetMapping, AssetMapping.id == AssetMappingVersion.asset_mapping_id)
        .join(
            AssetMappingPhysicalColumn,
            AssetMappingPhysicalColumn.asset_mapping_version_id == AssetMappingVersion.id,
        )
        .join(PhysicalColumn, PhysicalColumn.id == AssetMappingPhysicalColumn.physical_column_id)
        .where(
            AssetMapping.logical_model_id == model_id,
            AssetMapping.lifecycle == "active",
            AssetMappingVersion.revision == AssetMapping.revision,
            AssetMappingVersion.status != "superseded",
        )
    )
    for snapshot_id, table_id in rows:
        items.setdefault(
            table_id,
            {
                "id": representation_id(model_id, table_id),
                "physicalSnapshotId": snapshot_id,
                "physicalTableId": table_id,
            },
        )
    returned = returned_source_ids(session, actor) if actor else set()
    blocked_snapshots = set(session.scalars(select(PhysicalSchemaSnapshot.id).where(
        PhysicalSchemaSnapshot.source_id.in_(returned)))) if returned else set()
    return [item for item in items.values() if item["physicalSnapshotId"] not in blocked_snapshots]


def create_representation_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["modeling"])

    def accessible_canvas_tables(session, model_id, actor):
        tables = set()
        for item in representation_items(session, model_id, actor):
            try:
                _require_snapshot_scope(session, actor, item["physicalSnapshotId"])
            except HTTPException as exc:
                if exc.status_code == 403:
                    continue
                raise
            tables.add(item["physicalTableId"])
        return tables

    @router.get("/logical-models/{model_id}/canvas-layout", response_model=CanvasLayout)
    def read_canvas(model_id: uuid.UUID, session: SessionDep, actor: ActorDep):
        version = get_logical_version(session, model_id)
        _require_version_scope(session, actor, version)
        return canvas_payload(session, model_id, accessible_canvas_tables(session, model_id, actor))

    @router.get(
        "/logical-models/{model_id}/representations", response_model=RepresentationCollection
    )
    def read_representations(model_id: uuid.UUID, session: SessionDep, actor: ActorDep):
        version = get_logical_version(session, model_id)
        _require_version_scope(session, actor, version)
        return {"items": representation_items(session, model_id, actor)}

    @router.post("/logical-models/{model_id}/mapping-drafts", response_model=WorkspaceDraftResponse)
    def save_workspace(
        model_id: uuid.UUID,
        body: WorkspaceDraftWrite,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ):
        # Serialize writes with model revisions and other batch saves; every
        # reference and optimistic version is checked in this one transaction.
        model = get_logical_model(session, model_id, lock=True)
        version = get_logical_version(session, model_id)
        _require_version_scope(session, actor, version, roles={"data_owner", "data_steward"})
        _require_etag(if_match, version.lock_version)
        if version.id != body.logical_model_version_id:
            raise HTTPException(409, "The logical model changed; reload before saving")
        if model.lifecycle != "active" or version.status in {"review_pending", "retired"}:
            raise HTTPException(409, "This model cannot receive draft changes")
        dataset = _dataset_version(session, version)
        if body.logical_model is not None:
            _normalize_logical_write_scope(session, body.logical_model)
            _require_scope(session, actor, body.logical_model.department_code, body.logical_model.organization_id)
            # Match the ordinary model-save boundary: domain review ownership
            # cannot be reassigned through an embedded workspace draft.
            if dataset.data_domain_id is not None or body.logical_model.data_domain_id is not None:
                body.logical_model.data_owner_user_id = dataset.data_owner_user_id
                body.logical_model.deputy_owner_user_id = dataset.deputy_owner_user_id
            _validate_owner_assignments(session, body.logical_model)
            if body.logical_model.physical_domain_targets:
                raise HTTPException(422, "Assign physical domains through the domain dialog before saving this workspace")
            if (body.logical_model.organization_id != dataset.organization_id
                    or body.logical_model.data_domain_id != dataset.data_domain_id):
                raise HTTPException(422, "Change model organization and domain through the model editor")
        requested = {
            (item.physical_snapshot_id, item.physical_table_id) for item in body.representations
        }
        for change in body.mappings:
            if change.value.logical_model_version_id != version.id:
                raise HTTPException(
                    422, "All mappings must reference the current logical model version"
                )
            for table_id in session.scalars(
                select(PhysicalColumn.physical_table_id).where(
                    PhysicalColumn.id.in_(change.value.physical_column_ids)
                )
            ):
                requested.add((change.value.physical_snapshot_id, table_id))
        for snapshot_id, table_id in sorted(requested, key=lambda pair: str(pair)):
            snapshot = _require_snapshot_scope(session, actor, snapshot_id)
            source = session.get(PhysicalSource, snapshot.source_id)
            existing_binding = session.get(LogicalModelRepresentation, representation_id(model_id, table_id))
            source_usable = source.lifecycle == "active" or (source.lifecycle == "archived" and existing_binding is not None)
            if not source_usable or not _compatible_representation_scope(source, dataset.department_code, dataset.organization_id):
                raise HTTPException(
                    422, "Logical model and physical source must share an active scope"
                )
            table_snapshot_id = session.scalar(
                select(PhysicalDatabase.snapshot_id)
                .join(PhysicalSchema, PhysicalSchema.physical_database_id == PhysicalDatabase.id)
                .join(PhysicalTable, PhysicalTable.physical_schema_id == PhysicalSchema.id)
                .where(PhysicalTable.id == table_id)
            )
            if table_snapshot_id != snapshot_id:
                raise HTTPException(
                    422, "The physical object does not belong to the selected snapshot"
                )
            identity = representation_id(model_id, table_id)
            if session.get(LogicalModelRepresentation, identity) is None:
                payload = {
                    "logicalModelId": str(model_id),
                    "physicalSnapshotId": str(snapshot_id),
                    "physicalTableId": str(table_id),
                }
                session.add(
                    LogicalModelRepresentation(
                        id=identity,
                        urn=f"urn:daca:representation:{identity}",
                        logical_model_id=model_id,
                        physical_snapshot_id=snapshot_id,
                        physical_table_id=table_id,
                        content_hash=canonical_hash(payload),
                        created_by_user_id=actor,
                        created_at=utc_now(),
                    )
                )
                record_audit(
                    session, "logical-model-representation", identity, "attached", actor, 1, payload
                )
        saved = []
        removal_ids = [item.mapping_id for item in body.removals]
        if len(set(removal_ids)) != len(removal_ids) or set(removal_ids).intersection(
            change.mapping_id for change in body.mappings if change.mapping_id is not None
        ):
            raise HTTPException(422, "A mapping can be removed only once and cannot also be edited")
        for removal in sorted(body.removals, key=lambda item: str(item.mapping_id)):
            mapping, previous = get_mapping_version(session, removal.mapping_id, removal.version_id, lock=True)
            if mapping.logical_model_id != model_id:
                raise HTTPException(422, "Mapping does not belong to this workspace")
            _require_version_scope(session, actor, session.get(LogicalModelVersion, previous.logical_model_version_id), roles={"data_owner", "data_steward"})
            _require_snapshot_scope(session, actor, previous.physical_snapshot_id)
            _require_etag(f'"{removal.lock_version}"', previous.lock_version)
            if previous.revision != mapping.revision or previous.status == "superseded":
                raise HTTPException(409, "The mapping changed or has already been removed")
            create_mapping_successor(
                session, mapping, previous, mapping_write_from_payload(mapping_payload(session, mapping, previous)), actor,
                status="superseded", validation_result=previous.validation_result,
                last_drift_check_at=previous.last_drift_check_at, action="superseded",
            )
        if len({change.client_id for change in body.mappings}) != len(body.mappings):
            raise HTTPException(422, "Draft client identifiers must be unique")
        for change in body.mappings:
            value = change.value
            created = True
            if change.mapping_id:
                mapping, previous = get_mapping_version(
                    session, change.mapping_id, change.version_id, lock=True
                )
                if mapping.logical_model_id != model_id or change.version_id is None:
                    raise HTTPException(422, "Mapping does not belong to this workspace")
                _require_etag(f'"{change.lock_version}"', previous.lock_version)
                if previous.revision != mapping.revision or previous.status not in {
                    "draft",
                    "broken",
                    "review_pending",
                    "validated",
                }:
                    raise HTTPException(409, "The mapping changed or is no longer editable")
                _validate_mapping_scope(session, actor, value, mapping=mapping)
                current = create_mapping_successor(
                    session, mapping, previous, value, actor, action="draft-revised"
                )
            else:
                _validate_mapping_scope(session, actor, value)
                identity = uuid.uuid5(model_id, change.client_id)
                mapping = session.get(AssetMapping, identity)
                if mapping is None:
                    mapping, current = create_asset_mapping(
                        session, value, actor, mapping_id=identity
                    )
                else:
                    created = False
                    mapping, current = get_mapping_version(session, identity)
                    if current.content_hash != canonical_hash(
                        value.model_dump(mode="json", by_alias=True)
                    ):
                        raise HTTPException(
                            409, "This draft was already saved with different content"
                        )
            if created:
                current.validation_result = {
                    "valid": False,
                    "issues": [
                        issue.model_dump(mode="json", by_alias=True)
                        for issue in validate_mapping_version(session, current).issues
                    ],
                }
            saved.append(
                {
                    "clientId": change.client_id,
                    "mapping": mapping_payload(session, mapping, current),
                }
            )
        session.flush()
        logical_payload = None
        current_mappings = None
        if body.logical_model is not None:
            successor = create_logical_successor(
                session, model, version, body.logical_model, actor, action="workspace-draft-revised"
            )
            rebase_mapping_versions(session, model, successor, actor)
            logical_payload = logical_version_payload(session, model, successor)
            # Refresh references after rebasing. Use the same source checks as
            # the mapping list; a logical edit never restores source access.
            current_mappings = []
            for mapping in session.scalars(select(AssetMapping).where(
                AssetMapping.logical_model_id == model_id, AssetMapping.lifecycle == "active"
            )):
                _, current = get_mapping_version(session, mapping.id)
                try:
                    _require_version_scope(session, actor, session.get(LogicalModelVersion, current.logical_model_version_id))
                    _require_snapshot_scope(session, actor, current.physical_snapshot_id)
                except HTTPException as exc:
                    if exc.status_code == 403:
                        continue
                    raise
                current_mappings.append(mapping_payload(session, mapping, current))
            by_id = {item["id"]: item for item in current_mappings}
            for item in saved:
                item["mapping"] = by_id[item["mapping"]["id"]]
        sync_mapping_inconsistencies(session, model_id)
        canvas_tables = accessible_canvas_tables(session, model_id, actor)
        if body.canvas_layout is not None:
            save_canvas(session, model_id, actor, body.canvas_layout, canvas_tables)
            session.flush()
        result = {"items": representation_items(session, model_id, actor), "mappings": saved,
                  "removedMappingIds": removal_ids,
                  "logicalModel": logical_payload, "currentMappings": current_mappings,
                  "canvasLayout": canvas_payload(session, model_id, canvas_tables)}
        session.commit()
        return result

    return router
