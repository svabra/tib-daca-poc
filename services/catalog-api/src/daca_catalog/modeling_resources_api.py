from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import APIRouter, Header, HTTPException, Query, Response
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .modeling_api import (
    ActorDep,
    SessionDep,
    _etag,
    _require_any_assignment,
    _require_etag,
    _require_snapshot_scope,
    _require_version_scope,
)
from .modeling_rdf import export_logical_dcat
from .modeling_schemas import (
    AssetMappingResponse,
    DcatDataServiceResponse,
    DcatDataServiceWrite,
    DcatDistributionResponse,
    DcatDistributionWrite,
    LogicalStatus,
)
from .modeling_service import (
    create_logical_successor,
    get_logical_model,
    get_logical_version,
    get_mapping_version,
    logical_version_payload,
    logical_write_from_payload,
    mapping_payload,
    snapshot_tree,
)
from .models import (
    AssetMapping,
    AssetMappingVersion,
    DcatDataset,
    DcatDatasetVersion,
    LogicalModel,
    LogicalModelVersion,
    PhysicalSchemaSnapshot,
    PhysicalSource,
)
from .schemas import ApiModel


class DcatDistributionCollection(ApiModel):
    dataset_id: uuid.UUID
    logical_model_id: uuid.UUID
    logical_model_version_id: uuid.UUID
    logical_model_revision: int
    items: list[DcatDistributionResponse]
    total: int


class DcatDataServiceCollection(ApiModel):
    dataset_id: uuid.UUID
    logical_model_id: uuid.UUID
    logical_model_version_id: uuid.UUID
    logical_model_revision: int
    items: list[DcatDataServiceResponse]
    total: int


class LogicalModelReadiness(ApiModel):
    logical_model_id: uuid.UUID
    logical_model_version_id: uuid.UUID
    dataset_id: uuid.UUID
    dcat_ready: bool
    i14y_ready: bool
    dcat_issues: list[str] = Field(default_factory=list)
    i14y_issues: list[str] = Field(default_factory=list)


class AssetMappingVersionCollection(ApiModel):
    mapping_id: uuid.UUID
    items: list[AssetMappingResponse]
    total: int


class WorkspaceLogicalField(ApiModel):
    id: uuid.UUID
    field_version_id: uuid.UUID
    urn: str
    entity_id: uuid.UUID
    entity_name: str
    name: str
    business_object: str | None
    data_type: str
    length: int | None
    decimal_places: int | None
    nullable: bool
    min_count: int
    max_count: int | None
    classification: str
    concept_ids: list[uuid.UUID]
    primary_concept_id: uuid.UUID | None


class WorkspacePhysicalColumn(ApiModel):
    id: uuid.UUID
    urn: str
    stable_key: str
    database_name: str
    schema_name: str
    table_id: uuid.UUID
    table_name: str
    name: str
    raw_data_type: str
    normalized_data_type: str
    character_length: int | None
    numeric_precision: int | None
    numeric_scale: int | None
    nullable: bool
    ordinal_position: int


class MappingWorkspaceProjection(ApiModel):
    logical_fields: list[WorkspaceLogicalField]
    physical_columns: list[WorkspacePhysicalColumn]
    mapping_versions: list[AssetMappingResponse]


class MappingWorkspace(ApiModel):
    logical_model_id: uuid.UUID
    logical_model_version_id: uuid.UUID
    dataset_id: uuid.UUID
    title: str
    status: LogicalStatus
    physical_snapshot_id: uuid.UUID | None
    graph: MappingWorkspaceProjection
    matrix: MappingWorkspaceProjection


class MappingWorkspaceCollection(ApiModel):
    items: list[MappingWorkspace]
    total: int


@dataclass(frozen=True, slots=True)
class _DatasetContext:
    dataset: DcatDataset
    model: LogicalModel
    version: LogicalModelVersion


def _dataset_context(
    session: Session,
    dataset_id: uuid.UUID,
    *,
    lock: bool = False,
) -> _DatasetContext:
    dataset_statement = select(DcatDataset).where(DcatDataset.id == dataset_id)
    if lock:
        dataset_statement = dataset_statement.with_for_update()
    dataset = session.scalar(dataset_statement)
    if dataset is None:
        raise HTTPException(404, "Catalog dataset not found")
    version_statement = (
        select(LogicalModelVersion)
        .join(
            DcatDatasetVersion,
            DcatDatasetVersion.id == LogicalModelVersion.dataset_version_id,
        )
        .where(DcatDatasetVersion.dataset_id == dataset.id)
        .order_by(LogicalModelVersion.revision.desc())
        .limit(1)
    )
    if lock:
        version_statement = version_statement.with_for_update()
    version = session.scalar(version_statement)
    if version is None:
        raise HTTPException(404, "Catalog dataset is not attached to a logical model")
    model = get_logical_model(session, version.logical_model_id, lock=lock)
    if version.revision != model.revision:
        raise HTTPException(409, "Catalog dataset is not attached to the latest model version")
    return _DatasetContext(dataset=dataset, model=model, version=version)


def _distribution_collection(session: Session, context: _DatasetContext) -> dict[str, Any]:
    payload = logical_version_payload(session, context.model, context.version)
    return {
        "datasetId": context.dataset.id,
        "logicalModelId": context.model.id,
        "logicalModelVersionId": context.version.id,
        "logicalModelRevision": context.model.revision,
        "items": payload["distributions"],
        "total": len(payload["distributions"]),
    }


def _data_service_collection(session: Session, context: _DatasetContext) -> dict[str, Any]:
    payload = logical_version_payload(session, context.model, context.version)
    return {
        "datasetId": context.dataset.id,
        "logicalModelId": context.model.id,
        "logicalModelVersionId": context.version.id,
        "logicalModelRevision": context.model.revision,
        "items": payload["dataServices"],
        "total": len(payload["dataServices"]),
    }


def logical_model_readiness(
    session: Session,
    model: LogicalModel,
    version: LogicalModelVersion,
) -> dict[str, Any]:
    dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset_version is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    payload = logical_version_payload(session, model, version)
    dcat_issues: list[str] = []
    try:
        export_logical_dcat(session, model, version, "ttl")
    except (HTTPException, ValueError) as exc:
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        dcat_issues.append(str(detail))
    dcat_ready = not dcat_issues
    has_i14y_delivery = bool(payload["distributions"] or payload["dataServices"])
    i14y_issues = list(dcat_issues)
    if not has_i14y_delivery:
        i14y_issues.append("I14Y readiness requires a distribution or data service")
    return {
        "logicalModelId": model.id,
        "logicalModelVersionId": version.id,
        "datasetId": dataset_version.dataset_id,
        "dcatReady": dcat_ready,
        "i14yReady": dcat_ready and has_i14y_delivery,
        "dcatIssues": dcat_issues,
        "i14yIssues": i14y_issues,
    }


def require_dcat_publish_ready(
    session: Session,
    model: LogicalModel,
    version: LogicalModelVersion,
) -> None:
    readiness = logical_model_readiness(session, model, version)
    if not readiness["dcatReady"]:
        raise HTTPException(
            422,
            "Logical model does not satisfy mandatory DCAT metadata: "
            + "; ".join(readiness["dcatIssues"]),
        )


def _selected_snapshot(
    session: Session,
    actor: str,
    model: LogicalModel,
    version: LogicalModelVersion,
    requested_snapshot_id: uuid.UUID | None,
) -> PhysicalSchemaSnapshot | None:
    dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset_version is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    if requested_snapshot_id is not None:
        snapshot = _require_snapshot_scope(session, actor, requested_snapshot_id)
        source = session.get(PhysicalSource, snapshot.source_id)
        if source is None or (
            source.department_code,
            source.organization_id,
        ) != (dataset_version.department_code, dataset_version.organization_id):
            raise HTTPException(422, "Workspace snapshot and logical model must share one scope")
        return snapshot

    for mapping in session.scalars(
        select(AssetMapping)
        .where(
            AssetMapping.logical_model_id == model.id,
            AssetMapping.lifecycle == "active",
        )
        .order_by(AssetMapping.updated_at.desc())
    ):
        source = session.get(PhysicalSource, mapping.physical_source_id)
        if source is None or source.lifecycle != "active" or (
            source.department_code,
            source.organization_id,
        ) != (dataset_version.department_code, dataset_version.organization_id):
            continue
        snapshot = session.scalar(
            select(PhysicalSchemaSnapshot)
            .where(PhysicalSchemaSnapshot.source_id == source.id)
            .order_by(
                PhysicalSchemaSnapshot.sequence.desc(),
                PhysicalSchemaSnapshot.imported_at.desc(),
            )
            .limit(1)
        )
        if snapshot is not None:
            return snapshot

    return session.scalar(
        select(PhysicalSchemaSnapshot)
        .join(PhysicalSource, PhysicalSource.id == PhysicalSchemaSnapshot.source_id)
        .where(
            PhysicalSource.department_code == dataset_version.department_code,
            PhysicalSource.organization_id == dataset_version.organization_id,
            PhysicalSource.lifecycle == "active",
        )
        .order_by(PhysicalSchemaSnapshot.imported_at.desc())
        .limit(1)
    )


def _workspace(
    session: Session,
    actor: str,
    model: LogicalModel,
    version: LogicalModelVersion,
    *,
    requested_snapshot_id: uuid.UUID | None = None,
) -> dict[str, Any]:
    _require_version_scope(session, actor, version)
    logical = logical_version_payload(session, model, version)
    dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset_version is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    snapshot = _selected_snapshot(
        session,
        actor,
        model,
        version,
        requested_snapshot_id,
    )
    fields = [
        {
            "id": field["id"],
            "fieldVersionId": field["fieldVersionId"],
            "urn": field["urn"],
            "entityId": entity["id"],
            "entityName": entity["name"],
            "name": field["name"],
            "businessObject": field["businessObject"],
            "dataType": field["dataType"],
            "length": field["length"],
            "decimalPlaces": field["decimalPlaces"],
            "nullable": field["nullable"],
            "minCount": field["minCount"],
            "maxCount": field["maxCount"],
            "classification": field["classification"],
            "conceptIds": field["conceptIds"],
            "primaryConceptId": field["primaryConceptId"],
        }
        for entity in logical["entities"]
        for field in entity["fields"]
    ]
    columns: list[dict[str, Any]] = []
    if snapshot is not None:
        physical = snapshot_tree(session, snapshot)
        columns = [
            {
                "id": column["id"],
                "urn": column["urn"],
                "stableKey": column["stableKey"],
                "databaseName": database["name"],
                "schemaName": schema["name"],
                "tableId": table["id"],
                "tableName": table["name"],
                "name": column["name"],
                "rawDataType": column["rawDataType"],
                "normalizedDataType": column["normalizedDataType"],
                "characterLength": column["characterLength"],
                "numericPrecision": column["numericPrecision"],
                "numericScale": column["numericScale"],
                "nullable": column["nullable"],
                "ordinalPosition": column["ordinalPosition"],
            }
            for database in physical["databases"]
            for schema in database["schemas"]
            for table in schema["tables"]
            for column in table["columns"]
        ]
    mappings: list[dict[str, Any]] = []
    if snapshot is not None:
        for mapping in session.scalars(
            select(AssetMapping)
            .where(
                AssetMapping.logical_model_id == model.id,
                AssetMapping.lifecycle == "active",
            )
            .order_by(AssetMapping.updated_at)
        ):
            _mapping, mapping_version = get_mapping_version(session, mapping.id)
            if mapping_version.physical_snapshot_id == snapshot.id:
                mappings.append(mapping_payload(session, mapping, mapping_version))
    canonical = {
        "logicalFields": fields,
        "physicalColumns": columns,
        "mappingVersions": mappings,
    }
    return {
        "logicalModelId": model.id,
        "logicalModelVersionId": version.id,
        "datasetId": dataset_version.dataset_id,
        "title": logical["title"],
        "status": version.status,
        "physicalSnapshotId": snapshot.id if snapshot else None,
        # Both renderers deliberately receive values built from this one canonical projection.
        "graph": canonical,
        "matrix": canonical,
    }


def create_modeling_resources_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["data modeling resources"])

    @router.get(
        "/catalog-datasets/{dataset_id}/distributions",
        response_model=DcatDistributionCollection,
    )
    def list_distributions(
        dataset_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        context = _dataset_context(session, dataset_id)
        _require_version_scope(session, actor, context.version)
        response.headers["ETag"] = _etag(context.model.revision)
        return _distribution_collection(session, context)

    @router.post(
        "/catalog-datasets/{dataset_id}/distributions",
        response_model=DcatDistributionCollection,
        status_code=201,
    )
    def add_distribution(
        dataset_id: uuid.UUID,
        body: DcatDistributionWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        context = _dataset_context(session, dataset_id, lock=True)
        _require_version_scope(session, actor, context.version)
        _require_etag(if_match, context.model.revision)
        _require_active_model(context.model)
        write = logical_write_from_payload(
            logical_version_payload(session, context.model, context.version)
        )
        if body.id is not None and any(item.id == body.id for item in write.distributions):
            raise HTTPException(409, "Distribution already belongs to this catalog dataset")
        write.distributions.append(body)
        successor = create_logical_successor(
            session,
            context.model,
            context.version,
            write,
            actor,
            action="distribution-added",
        )
        session.commit()
        response.headers["ETag"] = _etag(context.model.revision)
        return _distribution_collection(
            session,
            _DatasetContext(context.dataset, context.model, successor),
        )

    @router.get(
        "/catalog-datasets/{dataset_id}/data-services",
        response_model=DcatDataServiceCollection,
    )
    def list_data_services(
        dataset_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        context = _dataset_context(session, dataset_id)
        _require_version_scope(session, actor, context.version)
        response.headers["ETag"] = _etag(context.model.revision)
        return _data_service_collection(session, context)

    @router.post(
        "/catalog-datasets/{dataset_id}/data-services",
        response_model=DcatDataServiceCollection,
        status_code=201,
    )
    def add_data_service(
        dataset_id: uuid.UUID,
        body: DcatDataServiceWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        context = _dataset_context(session, dataset_id, lock=True)
        _require_version_scope(session, actor, context.version)
        _require_etag(if_match, context.model.revision)
        _require_active_model(context.model)
        write = logical_write_from_payload(
            logical_version_payload(session, context.model, context.version)
        )
        if body.id is not None and any(item.id == body.id for item in write.data_services):
            raise HTTPException(409, "Data service already belongs to this catalog dataset")
        write.data_services.append(body)
        successor = create_logical_successor(
            session,
            context.model,
            context.version,
            write,
            actor,
            action="data-service-added",
        )
        session.commit()
        response.headers["ETag"] = _etag(context.model.revision)
        return _data_service_collection(
            session,
            _DatasetContext(context.dataset, context.model, successor),
        )

    @router.get(
        "/logical-models/{model_id}/versions/{version_id}/readiness",
        response_model=LogicalModelReadiness,
    )
    def read_readiness(
        model_id: uuid.UUID,
        version_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        model = get_logical_model(session, model_id)
        version = get_logical_version(session, model.id, version_id)
        _require_version_scope(session, actor, version)
        response.headers["ETag"] = _etag(version.lock_version)
        return logical_model_readiness(session, model, version)

    @router.get(
        "/asset-mappings/{mapping_id}/versions",
        response_model=AssetMappingVersionCollection,
    )
    def list_mapping_versions(
        mapping_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        mapping, _latest = get_mapping_version(session, mapping_id)
        versions = list(
            session.scalars(
                select(AssetMappingVersion)
                .where(AssetMappingVersion.asset_mapping_id == mapping.id)
                .order_by(AssetMappingVersion.revision.desc())
            )
        )
        for version in versions:
            logical_version = session.get(LogicalModelVersion, version.logical_model_version_id)
            if logical_version is None:
                raise HTTPException(500, "Asset mapping is missing its logical model version")
            _require_version_scope(session, actor, logical_version)
        response.headers["ETag"] = _etag(mapping.revision)
        return {
            "mappingId": mapping.id,
            "items": [
                {
                    **mapping_payload(session, mapping, version),
                    # The root revision denotes the latest state.  A history item must expose
                    # its own immutable version revision instead.
                    "revision": version.revision,
                }
                for version in versions
            ],
            "total": len(versions),
        }

    @router.get("/mapping-workspaces", response_model=MappingWorkspaceCollection)
    def list_mapping_workspaces(
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        assignments = _require_any_assignment(session, actor)
        scopes = {
            (assignment.department_code, assignment.organization_id) for assignment in assignments
        }
        items: list[dict[str, Any]] = []
        for model in session.scalars(
            select(LogicalModel)
            .where(LogicalModel.lifecycle == "active")
            .order_by(LogicalModel.updated_at.desc())
        ):
            version = get_logical_version(session, model.id)
            dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
            if (
                dataset_version is None
                or (
                    dataset_version.department_code,
                    dataset_version.organization_id,
                )
                not in scopes
            ):
                continue
            items.append(_workspace(session, actor, model, version))
        return {"items": items, "total": len(items)}

    @router.get(
        "/mapping-workspaces/{logical_model_id}",
        response_model=MappingWorkspace,
    )
    def read_mapping_workspace(
        logical_model_id: uuid.UUID,
        session: SessionDep,
        actor: ActorDep,
        physical_snapshot_id: Annotated[
            uuid.UUID | None,
            Query(alias="physicalSnapshotId"),
        ] = None,
    ) -> dict[str, Any]:
        model = get_logical_model(session, logical_model_id)
        version = get_logical_version(session, model.id)
        return _workspace(
            session,
            actor,
            model,
            version,
            requested_snapshot_id=physical_snapshot_id,
        )

    return router


def _require_active_model(model: LogicalModel) -> None:
    if model.lifecycle != "active":
        raise HTTPException(409, "Retired logical models cannot receive catalog resources")
