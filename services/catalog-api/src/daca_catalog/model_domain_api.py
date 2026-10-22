"""Explicit logical/physical domain actions used by the mapping editor."""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import Field
from sqlalchemy import select

from .mapping_inconsistencies import rebase_mapping_versions, sync_mapping_inconsistencies
from .modeling_api import (
    ActorDep,
    SessionDep,
    _assignments,
    _dataset_version,
    _require_etag,
    _require_scope,
    _require_version_scope,
)
from .modeling_domains import apply_domain_targets, physical_domain_state, physical_table_context
from .modeling_schemas import (
    ApiModel,
    AssetMappingResponse,
    LogicalModelResponse,
    PhysicalDomainState,
    PhysicalDomainTarget,
)
from .modeling_service import (
    create_logical_successor,
    get_logical_model,
    get_logical_version,
    logical_summary_payload,
    logical_version_payload,
    logical_write_from_payload,
    mapping_payload,
)
from .models import (
    AssetMapping,
    AssetMappingVersion,
    DcatDatasetVersion,
    Domain,
    LogicalModel,
    LogicalModelVersion,
    PhysicalDatabase,
    PhysicalDomainAssignment,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
)


class DomainAssignmentWrite(ApiModel):
    data_domain_id: uuid.UUID
    physical_domain_targets: list[PhysicalDomainTarget] = Field(default_factory=list, max_length=500)


class LogicalDomainAssignmentWrite(DomainAssignmentWrite):
    logical_model_version_id: uuid.UUID


class PhysicalDomainAssignmentResult(PhysicalDomainState):
    physical_table_id: uuid.UUID


class LogicalDomainAssignmentResult(LogicalModelResponse):
    mappings: list[AssetMappingResponse]
    physical_domain_assignments: list[PhysicalDomainAssignmentResult]


def create_model_domain_router():
    router = APIRouter(prefix="/api/v1", tags=["modeling"])

    @router.get("/domains/{domain_id}/models")
    def read_domain_models(domain_id: uuid.UUID, session: SessionDep, actor: ActorDep):
        """Explicit current membership, independent of representation/field links.

        Logical metadata follows the catalog-wide read policy. Physical objects
        follow the same exact source scopes as /physical-models. Only the latest
        snapshot is listed, so removed objects and historical duplicates vanish.
        """
        if session.get(Domain, domain_id) is None:
            raise HTTPException(404, "Domain not found")
        logical = []
        rows = session.execute(select(LogicalModel, LogicalModelVersion)
            .join(LogicalModelVersion, (LogicalModelVersion.logical_model_id == LogicalModel.id)
                  & (LogicalModelVersion.revision == LogicalModel.revision))
            .join(DcatDatasetVersion, DcatDatasetVersion.id == LogicalModelVersion.dataset_version_id)
            .where(LogicalModel.lifecycle == "active", DcatDatasetVersion.data_domain_id == domain_id))
        for model, version in rows:
            value = logical_summary_payload(session, model, version)
            logical.append({"id": model.id, "title": value["title"], "description": value["description"],
                "status": version.status, "revision": version.revision,
                "organizationId": value["organizationId"], "fieldCount": value["fieldCount"]})
        scopes = {(row.department_code, row.organization_id) for row in _assignments(session, actor)}
        physical = []
        for source in session.scalars(select(PhysicalSource).where(PhysicalSource.lifecycle == "active")):
            if (source.department_code, source.organization_id) not in scopes:
                continue
            snapshot = session.scalar(select(PhysicalSchemaSnapshot).where(
                PhysicalSchemaSnapshot.source_id == source.id).order_by(PhysicalSchemaSnapshot.sequence.desc()).limit(1))
            if snapshot is None:
                continue
            tables = session.execute(select(PhysicalTable, PhysicalSchema.name, PhysicalDatabase.name)
                .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
                .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
                .join(PhysicalDomainAssignment, (PhysicalDomainAssignment.physical_table_key == PhysicalTable.stable_key)
                      & (PhysicalDomainAssignment.physical_source_id == source.id))
                .where(PhysicalDatabase.snapshot_id == snapshot.id, PhysicalDomainAssignment.domain_id == domain_id))
            for table, schema_name, database_name in tables:
                physical.append({"id": table.id, "title": table.storage_location or f"{database_name}.{schema_name}.{table.name}",
                    "sourceId": source.id, "sourceName": source.name, "sourceType": source.adapter_type,
                    "modelType": table.kind, "snapshotId": snapshot.id, "snapshotRevision": snapshot.sequence})
        return {"logicalModels": sorted(logical, key=lambda row: row["title"].casefold()),
                "physicalModels": sorted(physical, key=lambda row: (row["sourceName"].casefold(), row["title"].casefold()))}

    @router.get("/physical-tables/{table_id}/domains", response_model=PhysicalDomainState)
    def read_physical_domains(table_id: uuid.UUID, session: SessionDep, actor: ActorDep):
        table, _snapshot_id, source_id = physical_table_context(session, table_id)
        source = session.get(PhysicalSource, source_id)
        _require_scope(session, actor, source.department_code, source.organization_id)
        return physical_domain_state(session, source_id, table.stable_key)

    @router.post("/physical-tables/{table_id}/domain-assignment", response_model=PhysicalDomainState)
    def assign_physical_domain(table_id: uuid.UUID, body: DomainAssignmentWrite,
                               session: SessionDep, actor: ActorDep):
        table, _snapshot_id, source_id = physical_table_context(session, table_id)
        source = session.get(PhysicalSource, source_id)
        if len(body.physical_domain_targets) != 1 or body.physical_domain_targets[0].physical_table_id != table_id:
            raise HTTPException(422, "Select exactly this physical object")
        apply_domain_targets(session, actor, body.data_domain_id, body.physical_domain_targets,
                             source.department_code, source.organization_id)
        result = physical_domain_state(session, source_id, table.stable_key)
        session.commit()
        return result

    @router.post("/logical-models/{model_id}/domain-assignment", response_model=LogicalDomainAssignmentResult)
    def assign_logical_domain(model_id: uuid.UUID, body: LogicalDomainAssignmentWrite,
                             response: Response, session: SessionDep, actor: ActorDep,
                             if_match: Annotated[str | None, Header(alias="If-Match")] = None):
        model = get_logical_model(session, model_id, lock=True)
        version = get_logical_version(session, model_id)
        _require_version_scope(session, actor, version, roles={"data_owner", "data_steward"})
        _require_etag(if_match, version.lock_version)
        if model.lifecycle != "active" or version.id != body.logical_model_version_id or version.status in {"review_pending", "retired"}:
            raise HTTPException(409, "The logical model changed or cannot receive assignments")
        value = logical_write_from_payload(logical_version_payload(session, model, version))
        value.data_domain_id = body.data_domain_id
        domain = session.get(Domain, body.data_domain_id)
        if domain is None or domain.lifecycle != "active":
            raise HTTPException(422, "Select an active domain")
        # Domain membership does not transfer the trusted model ownership.
        # The reviewer is still resolved from the domain register on submission.
        dataset = _dataset_version(session, version)
        apply_domain_targets(session, actor, body.data_domain_id, body.physical_domain_targets,
                             dataset.department_code, dataset.organization_id)
        if dataset.data_domain_id != body.data_domain_id:
            version = create_logical_successor(session, model, version, value, actor, action="domain-assigned")
            rebase_mapping_versions(session, model, version, actor)
            sync_mapping_inconsistencies(session, model.id)
        result = logical_version_payload(session, model, version)
        result["mappings"] = [mapping_payload(session, root, current) for root, current in session.execute(
            select(AssetMapping, AssetMappingVersion).join(AssetMappingVersion,
                AssetMappingVersion.asset_mapping_id == AssetMapping.id).where(
                AssetMapping.logical_model_id == model_id, AssetMapping.lifecycle == "active",
                AssetMappingVersion.revision == AssetMapping.revision))]
        result["physicalDomainAssignments"] = []
        for target in body.physical_domain_targets:
            table, _, source_id = physical_table_context(session, target.physical_table_id)
            result["physicalDomainAssignments"].append({"physicalTableId": table.id,
                **physical_domain_state(session, source_id, table.stable_key)})
        response.headers["ETag"] = f'"{version.lock_version}"'
        session.commit()
        return result

    return router
