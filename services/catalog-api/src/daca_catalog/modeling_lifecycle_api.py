from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import Field, field_validator
from sqlalchemy import select

from .modeling_api import (
    ActorDep,
    SessionDep,
    _etag,
    _require_etag,
    _require_publish_right,
    _require_scope,
    _require_version_scope,
)
from .modeling_core import canonical_hash
from .mapping_inconsistencies import sync_mapping_inconsistencies
from .modeling_schemas import (
    AssetMappingResponse,
    AssetMappingWrite,
    DriftChangeResponse,
    LogicalModelResponse,
    PhysicalSourceResponse,
)
from .modeling_service import (
    CATALOG_URN,
    create_logical_successor,
    create_mapping_successor,
    get_logical_model,
    get_logical_version,
    get_mapping_version,
    logical_version_payload,
    logical_write_from_payload,
    mapping_payload,
    record_audit,
    utc_now,
)
from .models import (
    AssetMapping,
    AssetMappingVersion,
    DcatDataService,
    DcatDataset,
    DcatDatasetVersion,
    DcatDistribution,
    DemoUser,
    LogicalModelVersion,
    PhysicalDatabase,
    PhysicalDriftChange,
    PhysicalDriftReport,
    PhysicalSchemaSnapshot,
    PhysicalSource,
)
from .schemas import ApiModel, reject_unsafe_service_level_text

_CONFIG_REFERENCE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$")


class PhysicalSourceWrite(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=4000)
    adapter_type: Literal["fixture", "postgresql", "s3"]
    config_ref: str | None = Field(default=None, max_length=255)
    department_code: str = Field(min_length=1, max_length=20)
    organization_id: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def safe_name(cls, value: str) -> str:
        return reject_unsafe_service_level_text(value)

    @field_validator("description")
    @classmethod
    def safe_description(cls, value: str | None) -> str | None:
        return reject_unsafe_service_level_text(value) if value is not None else None

    @field_validator("config_ref")
    @classmethod
    def opaque_server_reference(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not _CONFIG_REFERENCE.fullmatch(normalized):
            raise ValueError("Configuration references must be opaque server-side IDs")
        return normalized


class DriftReviewRequest(ApiModel):
    decision: Literal["accept", "reject"]
    comment: str | None = Field(default=None, max_length=4000)

    @field_validator("comment")
    @classmethod
    def safe_comment(cls, value: str | None) -> str | None:
        return reject_unsafe_service_level_text(value) if value is not None else None


def _physical_source_payload(
    session: SessionDep, source: PhysicalSource
) -> dict[str, object]:
    latest = session.scalar(
        select(PhysicalSchemaSnapshot)
        .where(PhysicalSchemaSnapshot.source_id == source.id)
        .order_by(PhysicalSchemaSnapshot.sequence.desc())
        .limit(1)
    )
    database_name = (
        session.scalar(
            select(PhysicalDatabase.name)
            .where(PhysicalDatabase.snapshot_id == latest.id)
            .order_by(PhysicalDatabase.position)
            .limit(1)
        )
        if latest is not None
        else None
    )
    owner = session.get(DemoUser, source.created_by_user_id)
    return {
        "id": source.id,
        "urn": source.urn,
        "name": source.name,
        "description": source.description,
        "adapterType": source.adapter_type,
        "departmentCode": source.department_code,
        "organizationId": source.organization_id,
        "revision": source.revision,
        "lifecycle": source.lifecycle,
        "latestSnapshotId": latest.id if latest else None,
        "latestSnapshotSequence": latest.sequence if latest else None,
        "catalogPath": (
            f"s3://{database_name}/"
            if source.adapter_type == "s3" and database_name
            else f"postgresql://{database_name}/"
            if database_name
            else source.config_ref or f"urn:daca:physical-source:{source.id}"
        ),
        "systemName": "S3 Object Storage" if source.adapter_type == "s3" else "PostgreSQL",
        "databaseName": database_name,
        "ownerName": owner.display_name if owner is not None else source.created_by_user_id,
        "updatedAt": source.updated_at,
    }


def _drift_change_payload(change: PhysicalDriftChange) -> dict[str, object]:
    return {
        "id": change.id,
        "changeType": change.change_type,
        "assetKey": change.asset_key,
        "before": change.before,
        "after": change.after,
        "confidence": change.confidence,
        "impactedLogicalFieldIds": change.impacted_logical_field_ids,
        "impactedMappingIds": change.impacted_mapping_ids,
        "reviewStatus": change.review_status,
    }


def _retire_dcat_dataset(
    session: SessionDep,
    version: LogicalModelVersion,
    retired_at: datetime,
    actor: str,
) -> None:
    dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset_version is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    dataset = session.get(DcatDataset, dataset_version.dataset_id)
    if dataset is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset")
    dataset.lifecycle = "retired"
    dataset.retired_at = retired_at
    dataset.updated_at = retired_at
    for resource_type, resource in (
        ("dcat-distribution", item)
        for item in session.scalars(
            select(DcatDistribution).where(
                DcatDistribution.dataset_id == dataset.id,
                DcatDistribution.lifecycle == "active",
            )
        )
    ):
        resource.lifecycle = "retired"
        resource.retired_at = retired_at
        resource.content_hash = canonical_hash(
            {
                "urn": resource.urn,
                "revision": resource.revision,
                "lifecycle": "retired",
            }
        )
        record_audit(
            session,
            resource_type,
            resource.id,
            "retired",
            actor,
            resource.revision,
        )
    for resource_type, resource in (
        ("dcat-data-service", item)
        for item in session.scalars(
            select(DcatDataService).where(
                DcatDataService.dataset_id == dataset.id,
                DcatDataService.lifecycle == "active",
            )
        )
    ):
        resource.lifecycle = "retired"
        resource.retired_at = retired_at
        resource.content_hash = canonical_hash(
            {
                "urn": resource.urn,
                "revision": resource.revision,
                "lifecycle": "retired",
            }
        )
        record_audit(
            session,
            resource_type,
            resource.id,
            "retired",
            actor,
            resource.revision,
        )


def create_modeling_lifecycle_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["data modeling lifecycle"])

    @router.post(
        "/logical-models/{model_id}/versions/{version_id}/retire",
        response_model=LogicalModelResponse,
    )
    def retire_logical_model(
        model_id: uuid.UUID,
        version_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, object]:
        model = get_logical_model(session, model_id, lock=True)
        version = get_logical_version(session, model.id, version_id, lock=True)
        _require_publish_right(session, actor, version)
        _require_etag(if_match, version.lock_version)
        if model.lifecycle == "retired":
            raise HTTPException(409, "Logical model is already retired")
        if version.revision != model.revision:
            raise HTTPException(409, "Only the latest logical model version can be retired")
        if version.status != "published":
            raise HTTPException(409, "Only a published logical model can be retired")
        body = logical_write_from_payload(logical_version_payload(session, model, version))
        successor = create_logical_successor(
            session,
            model,
            version,
            body,
            actor,
            status="retired",
            action="retired",
        )
        retired_at = utc_now()
        model.lifecycle = "retired"
        model.retired_at = retired_at
        model.updated_at = retired_at
        _retire_dcat_dataset(session, successor, retired_at, actor)
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return logical_version_payload(session, model, successor)

    @router.post(
        "/asset-mappings/{mapping_id}/versions/{version_id}/supersede",
        response_model=AssetMappingResponse,
    )
    def supersede_asset_mapping(
        mapping_id: uuid.UUID,
        version_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, object]:
        mapping, version = get_mapping_version(session, mapping_id, version_id, lock=True)
        logical_version = session.get(LogicalModelVersion, version.logical_model_version_id)
        if logical_version is None:
            raise HTTPException(500, "Asset mapping is missing its logical model version")
        _require_version_scope(session, actor, logical_version)
        _require_etag(if_match, version.lock_version)
        if mapping.lifecycle == "retired":
            raise HTTPException(409, "Asset mapping is retired")
        if version.revision != mapping.revision:
            raise HTTPException(409, "Only the latest asset mapping version can be superseded")
        successor = create_mapping_successor(
            session,
            mapping,
            version,
            body=_mapping_write(session, mapping, version),
            actor=actor,
            status="superseded",
            validation_result=version.validation_result,
            last_drift_check_at=version.last_drift_check_at,
            action="superseded",
        )
        sync_mapping_inconsistencies(session, mapping.logical_model_id)
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return mapping_payload(session, mapping, successor)

    @router.post(
        "/asset-mappings/{mapping_id}/versions/{version_id}/retire",
        response_model=AssetMappingResponse,
    )
    def retire_asset_mapping(
        mapping_id: uuid.UUID,
        version_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, object]:
        mapping, version = get_mapping_version(session, mapping_id, version_id, lock=True)
        logical_version = session.get(LogicalModelVersion, version.logical_model_version_id)
        if logical_version is None:
            raise HTTPException(500, "Asset mapping is missing its logical model version")
        _require_publish_right(session, actor, logical_version)
        _require_etag(if_match, version.lock_version)
        if mapping.lifecycle == "retired":
            raise HTTPException(409, "Asset mapping is already retired")
        if version.revision != mapping.revision:
            raise HTTPException(409, "Only the latest asset mapping version can be retired")
        successor = create_mapping_successor(
            session,
            mapping,
            version,
            body=_mapping_write(session, mapping, version),
            actor=actor,
            status="superseded",
            validation_result=version.validation_result,
            last_drift_check_at=version.last_drift_check_at,
            action="retired",
        )
        retired_at = utc_now()
        mapping.lifecycle = "retired"
        mapping.retired_at = retired_at
        mapping.updated_at = retired_at
        sync_mapping_inconsistencies(session, mapping.logical_model_id)
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return mapping_payload(session, mapping, successor)

    @router.post(
        "/physical-sources",
        response_model=PhysicalSourceResponse,
        status_code=201,
    )
    def create_physical_source(
        body: PhysicalSourceWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, object]:
        _require_scope(
            session,
            actor,
            body.department_code,
            body.organization_id,
            roles={"data_owner", "deputy_data_owner", "data_steward"},
        )
        existing = session.scalar(
            select(PhysicalSource).where(
                PhysicalSource.lifecycle == "active",
                PhysicalSource.adapter_type == body.adapter_type,
                PhysicalSource.config_ref == body.config_ref,
                PhysicalSource.department_code == body.department_code,
                PhysicalSource.organization_id == body.organization_id,
            )
        )
        if existing is not None:
            raise HTTPException(
                409,
                "Für diesen Katalogpfad besteht bereits eine aktive Systeminstanz.",
            )
        source_id = uuid.uuid4()
        now = utc_now()
        serialized = body.model_dump(mode="json", by_alias=True)
        source = PhysicalSource(
            id=source_id,
            urn=f"urn:daca:physical-source:{source_id}",
            origin_catalog_id=CATALOG_URN,
            name=body.name,
            description=body.description,
            adapter_type=body.adapter_type,
            config_ref=body.config_ref,
            department_code=body.department_code,
            organization_id=body.organization_id,
            revision=1,
            content_hash=canonical_hash(serialized),
            lifecycle="active",
            created_by_user_id=actor,
            created_at=now,
            updated_at=now,
        )
        session.add(source)
        record_audit(session, "physical-source", source.id, "created", actor, 1)
        session.commit()
        response.headers["ETag"] = _etag(source.revision)
        return _physical_source_payload(session, source)

    @router.put("/physical-sources/{source_id}", response_model=PhysicalSourceResponse)
    def update_physical_source(
        source_id: uuid.UUID,
        body: PhysicalSourceWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, object]:
        source = session.scalar(
            select(PhysicalSource).where(PhysicalSource.id == source_id).with_for_update()
        )
        if source is None:
            raise HTTPException(404, "Physical source not found")
        _require_scope(
            session,
            actor,
            source.department_code,
            source.organization_id,
            roles={"data_owner", "deputy_data_owner", "data_steward"},
        )
        _require_etag(if_match, source.revision)
        if source.lifecycle == "retired":
            raise HTTPException(409, "Physical source is retired")
        if (body.department_code, body.organization_id) != (
            source.department_code,
            source.organization_id,
        ):
            raise HTTPException(422, "A physical source cannot move to another organization scope")
        duplicate = session.scalar(
            select(PhysicalSource).where(
                PhysicalSource.id != source.id,
                PhysicalSource.lifecycle == "active",
                PhysicalSource.adapter_type == body.adapter_type,
                PhysicalSource.config_ref == body.config_ref,
                PhysicalSource.department_code == body.department_code,
                PhysicalSource.organization_id == body.organization_id,
            )
        )
        if duplicate is not None:
            raise HTTPException(
                409,
                "Für diesen Katalogpfad besteht bereits eine aktive Systeminstanz.",
            )
        before = _source_audit_payload(source)
        source.name = body.name
        source.description = body.description
        source.adapter_type = body.adapter_type
        source.config_ref = body.config_ref
        source.revision += 1
        source.content_hash = canonical_hash(body.model_dump(mode="json", by_alias=True))
        source.updated_at = utc_now()
        record_audit(
            session,
            "physical-source",
            source.id,
            "updated",
            actor,
            source.revision,
            {"before": before, "after": _source_audit_payload(source)},
        )
        session.commit()
        response.headers["ETag"] = _etag(source.revision)
        return _physical_source_payload(session, source)

    @router.post(
        "/physical-sources/{source_id}/retire",
        response_model=PhysicalSourceResponse,
    )
    def retire_physical_source(
        source_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, object]:
        source = session.scalar(
            select(PhysicalSource).where(PhysicalSource.id == source_id).with_for_update()
        )
        if source is None:
            raise HTTPException(404, "Physical source not found")
        _require_scope(
            session,
            actor,
            source.department_code,
            source.organization_id,
            roles={"data_owner", "deputy_data_owner"},
        )
        _require_etag(if_match, source.revision)
        if source.lifecycle == "retired":
            raise HTTPException(409, "Physical source is already retired")
        source.lifecycle = "retired"
        source.revision += 1
        source.retired_at = utc_now()
        source.updated_at = source.retired_at
        source.content_hash = canonical_hash(
            {**_source_audit_payload(source), "lifecycle": "retired"}
        )
        record_audit(
            session,
            "physical-source",
            source.id,
            "retired",
            actor,
            source.revision,
        )
        session.commit()
        response.headers["ETag"] = _etag(source.revision)
        return _physical_source_payload(session, source)

    @router.post(
        "/physical-drift-changes/{change_id}/review",
        response_model=DriftChangeResponse,
    )
    def review_drift_change(
        change_id: uuid.UUID,
        body: DriftReviewRequest,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, object]:
        row = session.execute(
            select(PhysicalDriftChange, PhysicalDriftReport, PhysicalSource)
            .join(
                PhysicalDriftReport,
                PhysicalDriftReport.id == PhysicalDriftChange.drift_report_id,
            )
            .join(PhysicalSource, PhysicalSource.id == PhysicalDriftReport.source_id)
            .where(PhysicalDriftChange.id == change_id)
            .with_for_update()
        ).one_or_none()
        if row is None:
            raise HTTPException(404, "Physical drift change not found")
        change, report, source = row
        _require_scope(
            session,
            actor,
            source.department_code,
            source.organization_id,
            roles={"data_owner", "deputy_data_owner", "data_steward"},
        )
        if change.change_type != "rename_candidate":
            raise HTTPException(422, "Only rename candidates require an accept/reject decision")
        _require_etag(if_match, _drift_review_revision(change))
        selected = "accepted" if body.decision == "accept" else "rejected"
        if change.review_status == selected:
            response.headers["ETag"] = _etag(_drift_review_revision(change))
            return _drift_change_payload(change)
        if change.review_status != "pending":
            raise HTTPException(409, "This rename candidate already has a review decision")
        change.review_status = selected
        record_audit(
            session,
            "physical-drift-change",
            change.id,
            selected,
            actor,
            None,
            {"driftReportId": str(report.id), "comment": body.comment},
        )
        session.commit()
        response.headers["ETag"] = _etag(_drift_review_revision(change))
        return _drift_change_payload(change)

    @router.get(
        "/physical-drift-changes/{change_id}",
        response_model=DriftChangeResponse,
    )
    def read_drift_change(
        change_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, object]:
        row = session.execute(
            select(PhysicalDriftChange, PhysicalDriftReport, PhysicalSource)
            .join(
                PhysicalDriftReport,
                PhysicalDriftReport.id == PhysicalDriftChange.drift_report_id,
            )
            .join(PhysicalSource, PhysicalSource.id == PhysicalDriftReport.source_id)
            .where(PhysicalDriftChange.id == change_id)
        ).one_or_none()
        if row is None:
            raise HTTPException(404, "Physical drift change not found")
        change, _report, source = row
        _require_scope(
            session,
            actor,
            source.department_code,
            source.organization_id,
        )
        response.headers["ETag"] = _etag(_drift_review_revision(change))
        return _drift_change_payload(change)

    return router


def _mapping_write(
    session: SessionDep,
    mapping: AssetMapping,
    version: AssetMappingVersion,
) -> AssetMappingWrite:
    payload = mapping_payload(session, mapping, version)
    return AssetMappingWrite.model_validate(
        {
            key: payload[key]
            for key in (
                "logicalModelVersionId",
                "physicalSnapshotId",
                "mappingType",
                "classification",
                "transformationRule",
                "comment",
                "responsibleUserId",
                "validFrom",
                "validTo",
                "logicalFieldVersionIds",
                "physicalColumnIds",
            )
        }
    )


def _source_audit_payload(source: PhysicalSource) -> dict[str, object]:
    return {
        "name": source.name,
        "description": source.description,
        "adapterType": source.adapter_type,
        "configRef": source.config_ref,
        "departmentCode": source.department_code,
        "organizationId": source.organization_id,
        "revision": source.revision,
    }


def _drift_review_revision(change: PhysicalDriftChange) -> int:
    # Review is a one-way state transition. Its persisted status therefore supplies a stable
    # optimistic-concurrency revision without widening the shared migration in this router.
    return 1 if change.review_status == "pending" else 2
