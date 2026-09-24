from __future__ import annotations

import uuid
from collections import Counter, defaultdict
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .modeling_core import (
    PhysicalMetadataAdapter,
    canonical_hash,
    detect_physical_drift,
    normalize_postgresql_type,
    normalized_physical_metadata,
    stable_uuid,
)
from .modeling_schemas import (
    AssetMappingWrite,
    LogicalModelWrite,
    MappingIssue,
    MappingValidation,
)
from .models import (
    AssetMapping,
    AssetMappingLogicalField,
    AssetMappingPhysicalColumn,
    AssetMappingVersion,
    AuditEvent,
    DataModelRoleAssignment,
    DcatCatalog,
    DcatCatalogVersion,
    DcatDataService,
    DcatDataServiceVersion,
    DcatDataset,
    DcatDatasetVersion,
    DcatDatasetVersionLocalization,
    DcatDistribution,
    DcatDistributionVersion,
    DemoUser,
    Domain,
    I14yConcept,
    LogicalConceptLink,
    LogicalEntity,
    LogicalEntityVersion,
    LogicalField,
    LogicalFieldVersion,
    LogicalModel,
    LogicalModelAssistanceProvenance,
    LogicalModelIdentifierReservation,
    LogicalModelReview,
    LogicalModelVersion,
    LogicalMappingInconsistency,
    PhysicalColumn,
    PhysicalDatabase,
    PhysicalDriftChange,
    PhysicalDriftReport,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
    TerminologyTermVersion,
)

CATALOG_URN = "urn:daca:catalog:bit-poc"


def utc_now() -> datetime:
    return datetime.now(UTC)


def record_audit(
    session: Session,
    resource_type: str,
    resource_id: uuid.UUID | str,
    action: str,
    actor: str,
    revision: int | None,
    details: dict[str, Any] | None = None,
) -> None:
    session.add(
        AuditEvent(
            id=uuid.uuid4(),
            resource_type=resource_type,
            resource_id=str(resource_id),
            action=action,
            actor=actor,
            revision=revision,
            details=details or {},
        )
    )


def get_logical_model(session: Session, model_id: uuid.UUID, *, lock: bool = False) -> LogicalModel:
    statement = select(LogicalModel).where(LogicalModel.id == model_id)
    if lock:
        statement = statement.with_for_update()
    row = session.scalar(statement)
    if row is None:
        raise HTTPException(404, "Logical model not found")
    return row


def get_logical_version(
    session: Session, model_id: uuid.UUID, version_id: uuid.UUID | None = None, *, lock: bool = False
) -> LogicalModelVersion:
    statement = select(LogicalModelVersion).where(LogicalModelVersion.logical_model_id == model_id)
    if version_id is not None:
        statement = statement.where(LogicalModelVersion.id == version_id)
    else:
        statement = statement.order_by(LogicalModelVersion.revision.desc()).limit(1)
    if lock:
        statement = statement.with_for_update()
    row = session.scalar(statement)
    if row is None:
        raise HTTPException(404, "Logical model version not found")
    return row


def logical_version_payload(session: Session, model: LogicalModel, version: LogicalModelVersion) -> dict[str, Any]:
    dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset_version is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    localizations = list(
        session.scalars(
            select(DcatDatasetVersionLocalization)
            .where(DcatDatasetVersionLocalization.dataset_version_id == dataset_version.id)
            .order_by(DcatDatasetVersionLocalization.language)
        )
    )
    entities: list[dict[str, Any]] = []
    entity_versions = list(
        session.scalars(
            select(LogicalEntityVersion)
            .where(LogicalEntityVersion.logical_model_version_id == version.id)
            .order_by(LogicalEntityVersion.position, LogicalEntityVersion.name)
        )
    )
    for entity_version in entity_versions:
        entity = session.get(LogicalEntity, entity_version.logical_entity_id)
        field_rows = session.execute(
            select(LogicalFieldVersion, LogicalField)
            .join(LogicalField, LogicalField.id == LogicalFieldVersion.logical_field_id)
            .where(LogicalFieldVersion.logical_entity_version_id == entity_version.id)
            .order_by(LogicalFieldVersion.position, LogicalFieldVersion.name)
        ).all()
        fields: list[dict[str, Any]] = []
        for field_version, field in field_rows:
            concept_links = list(
                session.scalars(
                    select(LogicalConceptLink).where(
                        LogicalConceptLink.logical_field_version_id == field_version.id
                    )
                )
            )
            concept_ids = [item.concept_id for item in concept_links]
            fields.append(
                {
                    "id": field.id,
                    "urn": field.urn,
                    "originCatalogId": field_version.origin_catalog_id,
                    "revision": field_version.revision,
                    "contentHash": field_version.content_hash,
                    "lifecycle": field.lifecycle,
                    "retiredAt": field.retired_at,
                    "fieldVersionId": field_version.id,
                    "businessObject": field_version.business_object,
                    "businessObjectVersionId": field_version.business_object_version_id,
                    "name": field_version.name,
                    "dataType": field_version.data_type,
                    "length": field_version.length,
                    "precision": field_version.precision,
                    "shortDescription": field_version.short_description,
                    "comment": field_version.comment,
                    "sourceSystem": field_version.source_system,
                    "classification": field_version.classification,
                    "decimalPlaces": field_version.decimal_places,
                    "valueListConceptId": field_version.value_list_concept_id,
                    "conceptMatchExplicitlyNone": (
                        field_version.concept_match_explicitly_none
                    ),
                    "nullable": field_version.nullable,
                    "minCount": field_version.min_count,
                    "maxCount": field_version.max_count,
                    "position": field_version.position,
                    "conceptIds": concept_ids,
                    "primaryConceptId": next(
                        (item.concept_id for item in concept_links if item.primary_for_i14y), None
                    ),
                }
            )
        entities.append(
            {
                "id": entity.id,
                "urn": entity.urn,
                "originCatalogId": entity_version.origin_catalog_id,
                "revision": entity_version.revision,
                "contentHash": entity_version.content_hash,
                "lifecycle": entity.lifecycle,
                "retiredAt": entity.retired_at,
                "entityVersionId": entity_version.id,
                "name": entity_version.name,
                "businessObject": entity_version.business_object,
                "businessObjectVersionId": entity_version.business_object_version_id,
                "comment": entity_version.comment,
                "position": entity_version.position,
                "fields": fields,
            }
        )
    model_concept_ids = list(
        session.scalars(
            select(LogicalConceptLink.concept_id).where(
                LogicalConceptLink.logical_model_version_id == version.id
            )
        )
    )
    german = next((item for item in localizations if item.language == "de"), localizations[0])
    has_mapping = session.scalar(
        select(func.count()).select_from(AssetMapping).where(
            AssetMapping.logical_model_id == model.id, AssetMapping.lifecycle == "active"
        )
    )
    distributions = list(
        session.execute(
            select(DcatDistributionVersion, DcatDistribution)
            .join(DcatDistribution, DcatDistribution.id == DcatDistributionVersion.distribution_id)
            .where(DcatDistributionVersion.dataset_version_id == version.dataset_version_id)
            .order_by(DcatDistribution.urn)
        ).all()
    )
    data_services = list(
        session.execute(
            select(DcatDataServiceVersion, DcatDataService)
            .join(DcatDataService, DcatDataService.id == DcatDataServiceVersion.data_service_id)
            .where(DcatDataServiceVersion.dataset_version_id == version.dataset_version_id)
            .order_by(DcatDataService.urn)
        ).all()
    )
    assistance_provenance = list(
        session.scalars(
            select(LogicalModelAssistanceProvenance)
            .where(LogicalModelAssistanceProvenance.logical_model_version_id == version.id)
            .order_by(LogicalModelAssistanceProvenance.field_path, LogicalModelAssistanceProvenance.language)
        )
    )
    return {
        "id": model.id,
        "urn": model.urn,
        "revision": version.revision,
        "publishedRevision": model.published_revision,
        "lifecycle": model.lifecycle,
        "versionId": version.id,
        "datasetVersionId": version.dataset_version_id,
        "predecessorVersionId": version.predecessor_version_id,
        "lockVersion": version.lock_version,
        "status": version.status,
        "identifierMode": version.identifier_mode,
        "reviewId": session.scalar(select(LogicalModelReview.id).where(LogicalModelReview.submitted_version_id == version.id)),
        "title": german.title,
        "description": german.description,
        "dataOwnerUserId": dataset_version.data_owner_user_id,
        "deputyOwnerUserId": dataset_version.deputy_owner_user_id,
        "departmentCode": dataset_version.department_code,
        "organizationId": dataset_version.organization_id,
        "organizationUnitId": dataset_version.organization_id,
        "dataDomainId": dataset_version.data_domain_id,
        "dataClassification": dataset_version.data_classification,
        "hasPhysicalMapping": bool(has_mapping),
        "mappingInconsistencyCount": session.scalar(
            select(func.count(LogicalMappingInconsistency.id)).where(
                LogicalMappingInconsistency.logical_model_id == model.id,
                LogicalMappingInconsistency.status != "resolved",
            )
        ) or 0,
        "fieldCount": sum(len(entity["fields"]) for entity in entities),
        "updatedAt": version.updated_at,
        "identifiers": dataset_version.identifiers,
        "localizations": [
            {"language": item.language, "title": item.title, "description": item.description}
            for item in localizations
        ],
        "creator": dataset_version.creator,
        "dateCreated": dataset_version.date_created,
        "contactPoints": dataset_version.contact_points,
        "publisher": dataset_version.publisher,
        "accessRights": dataset_version.access_rights,
        "themes": dataset_version.themes,
        "mediaFormatHint": next(
            (row.media_type for row, _root in distributions if row.media_type), None
        ),
        "comment": version.comment,
        "conceptIds": model_concept_ids,
        "entities": entities,
        "distributions": [
            {
                "id": root.id,
                "urn": root.urn,
                "originCatalogId": root.origin_catalog_id,
                "datasetId": root.dataset_id,
                "revision": row.revision,
                "contentHash": row.content_hash,
                "lifecycle": root.lifecycle,
                "versionId": row.id,
                "status": row.status,
                "title": row.title,
                "accessUrl": row.access_url,
                "downloadUrl": row.download_url,
                "mediaType": row.media_type,
                "format": row.format,
                "licenseUri": row.license_uri,
                "createdAt": row.created_at,
                "publishedAt": row.published_at,
                "retiredAt": root.retired_at,
            }
            for row, root in distributions
        ],
        "dataServices": [
            {
                "id": root.id,
                "urn": root.urn,
                "originCatalogId": root.origin_catalog_id,
                "datasetId": root.dataset_id,
                "revision": row.revision,
                "contentHash": row.content_hash,
                "lifecycle": root.lifecycle,
                "versionId": row.id,
                "status": row.status,
                "title": row.title,
                "endpointUrl": row.endpoint_url,
                "endpointDescription": row.endpoint_description,
                "createdAt": row.created_at,
                "publishedAt": row.published_at,
                "retiredAt": root.retired_at,
            }
            for row, root in data_services
        ],
        "assistanceProvenance": [
            {
                "fieldPath": item.field_path,
                "language": item.language,
                "provider": item.provider,
                "sourceTextHash": item.source_text_hash,
                "sourceIdentifier": item.source_identifier,
                "sourceUri": item.source_uri,
                "sourceModifiedAt": item.source_modified_at,
                "retrievedAt": item.retrieved_at,
                "payloadHash": item.payload_hash,
                "origin": item.origin,
            }
            for item in assistance_provenance
        ],
        "createdByUserId": version.created_by_user_id,
        "updatedByUserId": version.updated_by_user_id,
        "createdAt": version.created_at,
        "submittedAt": version.submitted_at,
        "publishedAt": version.published_at,
    }


def logical_summary(payload: dict[str, Any]) -> dict[str, Any]:
    keys = {
        "id",
        "urn",
        "revision",
        "publishedRevision",
        "lifecycle",
        "versionId",
        "datasetVersionId",
        "predecessorVersionId",
        "lockVersion",
        "status",
        "title",
        "description",
        "dataOwnerUserId",
        "deputyOwnerUserId",
        "departmentCode",
        "organizationId",
        "organizationUnitId",
        "dataDomainId",
        "dataClassification",
        "hasPhysicalMapping",
        "mappingInconsistencyCount",
        "fieldCount",
        "updatedAt",
        "identifiers",
        "dateCreated",
        "createdAt",
    }
    return {key: value for key, value in payload.items() if key in keys}


def logical_summary_payload(session: Session, model: LogicalModel,
                            version: LogicalModelVersion) -> dict[str, Any]:
    """Read list metadata without loading every field, concept and distribution."""
    dataset = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    localization = session.scalar(select(DcatDatasetVersionLocalization).where(
        DcatDatasetVersionLocalization.dataset_version_id == dataset.id,
    ).order_by(
        (DcatDatasetVersionLocalization.language != "de"),
        DcatDatasetVersionLocalization.language,
    ).limit(1))
    if localization is None:
        raise HTTPException(500, "Logical model is missing its localization")
    field_count = session.scalar(select(func.count(LogicalFieldVersion.id))
        .join(LogicalEntityVersion, LogicalEntityVersion.id == LogicalFieldVersion.logical_entity_version_id)
        .where(LogicalEntityVersion.logical_model_version_id == version.id)) or 0
    return {
        "id": model.id, "urn": model.urn, "revision": version.revision,
        "publishedRevision": model.published_revision, "lifecycle": model.lifecycle,
        "versionId": version.id, "datasetVersionId": version.dataset_version_id,
        "predecessorVersionId": version.predecessor_version_id,
        "lockVersion": version.lock_version, "status": version.status,
        "title": localization.title, "description": localization.description,
        "dataOwnerUserId": dataset.data_owner_user_id,
        "deputyOwnerUserId": dataset.deputy_owner_user_id,
        "departmentCode": dataset.department_code,
        "organizationId": dataset.organization_id,
        "organizationUnitId": dataset.organization_id,
        "dataDomainId": dataset.data_domain_id,
        "dataClassification": dataset.data_classification,
        "hasPhysicalMapping": session.scalar(select(AssetMapping.id).where(
            AssetMapping.logical_model_id == model.id,
            AssetMapping.lifecycle == "active",
        ).limit(1)) is not None,
        "mappingInconsistencyCount": session.scalar(select(func.count(LogicalMappingInconsistency.id)).where(
            LogicalMappingInconsistency.logical_model_id == model.id,
            LogicalMappingInconsistency.status != "resolved",
        )) or 0,
        "fieldCount": field_count, "updatedAt": version.updated_at,
        "identifiers": dataset.identifiers, "dateCreated": dataset.date_created,
        "createdAt": version.created_at,
    }


def ensure_dcat_catalog(session: Session) -> DcatCatalog:
    catalog_id = stable_uuid("dcat-catalog:bit-poc")
    catalog = session.get(DcatCatalog, catalog_id)
    if catalog is not None:
        return catalog
    payload = {
        "title": {"de": "BIT DaCa Datenkatalog", "en": "BIT DaCa data catalog"},
        "description": {
            "de": "Zentraler Datenkatalog der Data Platform BIT im DaCa PoC.",
            "en": "Central data catalog of the BIT data platform in the DaCa proof of concept.",
        },
        "publisher": {"name": "Bundesamt für Informatik und Telekommunikation BIT"},
        "languages": ["de", "fr", "it", "en"],
    }
    digest = canonical_hash(payload)
    catalog = DcatCatalog(
        id=catalog_id,
        urn=CATALOG_URN,
        origin_catalog_id=CATALOG_URN,
        revision=1,
        content_hash=digest,
        lifecycle="active",
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(catalog)
    session.add(
        DcatCatalogVersion(
            id=stable_uuid("dcat-catalog-version:bit-poc:1"),
            catalog_id=catalog.id,
            revision=1,
            status="published",
            title=payload["title"],
            description=payload["description"],
            publisher=payload["publisher"],
            homepage=None,
            languages=payload["languages"],
            content_hash=digest,
            created_at=utc_now(),
            published_at=utc_now(),
        )
    )
    session.flush()
    return catalog


def create_dcat_dataset_version(
    session: Session,
    body: LogicalModelWrite,
    model_id: uuid.UUID,
    revision: int,
    *,
    dataset: DcatDataset | None = None,
) -> tuple[DcatDataset, DcatDatasetVersion]:
    catalog = ensure_dcat_catalog(session)
    digest = canonical_hash(
        {
            "identifiers": body.identifiers,
            "localizations": [item.model_dump(mode="json") for item in body.localizations],
            "dataDomainId": str(body.data_domain_id),
            "revision": revision,
        }
    )
    if dataset is None:
        dataset_id = stable_uuid(f"dcat-dataset:{model_id}")
        dataset = DcatDataset(
            id=dataset_id,
            urn=f"urn:daca:dataset:{dataset_id}",
            origin_catalog_id=CATALOG_URN,
            catalog_id=catalog.id,
            revision=revision,
            content_hash=digest,
            lifecycle="active",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(dataset)
    else:
        dataset.revision = revision
        dataset.content_hash = digest
        dataset.updated_at = utc_now()
    domain = session.get(Domain, body.data_domain_id)
    if domain is None or domain.lifecycle != "active":
        raise HTTPException(422, "dataDomainId must identify an active DaCa domain")
    version = DcatDatasetVersion(
        id=uuid.uuid4(),
        dataset_id=dataset.id,
        revision=revision,
        status="draft",
        identifiers=body.identifiers,
        data_owner_user_id=body.data_owner_user_id,
        deputy_owner_user_id=body.deputy_owner_user_id,
        creator=body.creator.model_dump(mode="json", by_alias=True) if body.creator else None,
        data_domain_id=body.data_domain_id,
        department_code=body.department_code,
        organization_id=body.organization_id,
        data_classification=body.data_classification,
        date_created=body.date_created,
        contact_points=[item.model_dump(mode="json", by_alias=True) for item in body.contact_points],
        publisher=body.publisher.model_dump(mode="json", by_alias=True),
        access_rights=body.access_rights,
        themes=body.themes,
        keywords={},
        issued=None,
        modified=utc_now(),
        content_hash=digest,
        created_at=utc_now(),
    )
    session.add(version)
    session.flush()
    return dataset, version


def populate_dcat_dataset_version(
    session: Session, version: LogicalModelVersion, body: LogicalModelWrite
) -> None:
    dataset_version = session.get(DcatDatasetVersion, version.dataset_version_id)
    if dataset_version is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    dataset = session.get(DcatDataset, dataset_version.dataset_id)
    domain = session.get(Domain, body.data_domain_id)
    if dataset is None or domain is None or domain.lifecycle != "active":
        raise HTTPException(422, "dataDomainId must identify an active DaCa domain")
    digest = canonical_hash(
        {
            "identifiers": body.identifiers,
            "localizations": [item.model_dump(mode="json") for item in body.localizations],
            "themes": body.themes,
            "revision": version.revision,
        }
    )
    dataset_version.identifiers = body.identifiers
    dataset_version.data_owner_user_id = body.data_owner_user_id
    dataset_version.deputy_owner_user_id = body.deputy_owner_user_id
    dataset_version.creator = body.creator.model_dump(mode="json", by_alias=True) if body.creator else None
    dataset_version.data_domain_id = body.data_domain_id
    dataset_version.department_code = body.department_code
    dataset_version.organization_id = body.organization_id
    dataset_version.data_classification = body.data_classification
    dataset_version.date_created = body.date_created
    dataset_version.contact_points = [
        item.model_dump(mode="json", by_alias=True) for item in body.contact_points
    ]
    dataset_version.publisher = body.publisher.model_dump(mode="json", by_alias=True)
    dataset_version.access_rights = body.access_rights
    dataset_version.themes = body.themes
    dataset_version.modified = utc_now()
    dataset_version.content_hash = digest
    dataset.content_hash = digest
    dataset.updated_at = utc_now()
    already_populated = session.scalar(
        select(func.count())
        .select_from(DcatDatasetVersionLocalization)
        .where(DcatDatasetVersionLocalization.dataset_version_id == dataset_version.id)
    )
    if already_populated:
        raise HTTPException(409, "DCAT dataset versions are immutable")
    for localization in body.localizations:
        session.add(
            DcatDatasetVersionLocalization(
                dataset_version_id=dataset_version.id,
                language=localization.language,
                title=localization.title,
                description=localization.description,
            )
        )
    requested_distribution_ids = {item.id for item in body.distributions if item.id is not None}
    for retired_root in session.scalars(
        select(DcatDistribution).where(
            DcatDistribution.dataset_id == dataset.id,
            DcatDistribution.lifecycle == "active",
        )
    ):
        if retired_root.id in requested_distribution_ids:
            continue
        retired_root.revision += 1
        retired_root.lifecycle = "retired"
        retired_root.retired_at = utc_now()
        retired_root.content_hash = canonical_hash(
            {
                "urn": retired_root.urn,
                "revision": retired_root.revision,
                "lifecycle": "retired",
            }
        )
        record_audit(
            session,
            "dcat-distribution",
            retired_root.id,
            "retired",
            version.updated_by_user_id,
            retired_root.revision,
        )
    for item in body.distributions:
        root = session.get(DcatDistribution, item.id) if item.id else None
        if root is not None and root.dataset_id != dataset.id:
            raise HTTPException(422, "Distribution ID belongs to another DCAT dataset")
        if root is not None and root.lifecycle != "active":
            raise HTTPException(409, "A retired distribution cannot be restored")
        resource_action = "created" if root is None else "version-created"
        if root is None:
            root_id = item.id or uuid.uuid4()
            root = DcatDistribution(
                id=root_id,
                urn=f"{dataset.urn}:distribution:{root_id}",
                origin_catalog_id=CATALOG_URN,
                dataset_id=dataset.id,
                revision=1,
                content_hash=canonical_hash(item.model_dump(mode="json")),
                lifecycle="active",
                created_at=utc_now(),
            )
            session.add(root)
        else:
            root.revision += 1
            root.content_hash = canonical_hash(item.model_dump(mode="json"))
        session.add(
            DcatDistributionVersion(
                id=uuid.uuid4(),
                distribution_id=root.id,
                dataset_version_id=dataset_version.id,
                revision=root.revision,
                status="draft",
                title=dict(item.title),
                access_url=item.access_url,
                download_url=item.download_url,
                media_type=item.media_type,
                format=item.format,
                license_uri=item.license_uri,
                content_hash=root.content_hash,
                created_at=utc_now(),
            )
        )
        record_audit(
            session,
            "dcat-distribution",
            root.id,
            resource_action,
            version.updated_by_user_id,
            root.revision,
        )
    requested_service_ids = {item.id for item in body.data_services if item.id is not None}
    for retired_root in session.scalars(
        select(DcatDataService).where(
            DcatDataService.dataset_id == dataset.id,
            DcatDataService.lifecycle == "active",
        )
    ):
        if retired_root.id in requested_service_ids:
            continue
        retired_root.revision += 1
        retired_root.lifecycle = "retired"
        retired_root.retired_at = utc_now()
        retired_root.content_hash = canonical_hash(
            {
                "urn": retired_root.urn,
                "revision": retired_root.revision,
                "lifecycle": "retired",
            }
        )
        record_audit(
            session,
            "dcat-data-service",
            retired_root.id,
            "retired",
            version.updated_by_user_id,
            retired_root.revision,
        )
    for item in body.data_services:
        root = session.get(DcatDataService, item.id) if item.id else None
        if root is not None and root.dataset_id != dataset.id:
            raise HTTPException(422, "Data service ID belongs to another DCAT dataset")
        if root is not None and root.lifecycle != "active":
            raise HTTPException(409, "A retired data service cannot be restored")
        resource_action = "created" if root is None else "version-created"
        if root is None:
            root_id = item.id or uuid.uuid4()
            root = DcatDataService(
                id=root_id,
                urn=f"{dataset.urn}:service:{root_id}",
                origin_catalog_id=CATALOG_URN,
                dataset_id=dataset.id,
                revision=1,
                content_hash=canonical_hash(item.model_dump(mode="json")),
                lifecycle="active",
                created_at=utc_now(),
            )
            session.add(root)
        else:
            root.revision += 1
            root.content_hash = canonical_hash(item.model_dump(mode="json"))
        session.add(
            DcatDataServiceVersion(
                id=uuid.uuid4(),
                data_service_id=root.id,
                dataset_version_id=dataset_version.id,
                revision=root.revision,
                status="draft",
                title=dict(item.title),
                endpoint_url=item.endpoint_url,
                endpoint_description=item.endpoint_description,
                serves_dataset_urns=[dataset.urn],
                content_hash=root.content_hash,
                created_at=utc_now(),
            )
        )
        record_audit(
            session,
            "dcat-data-service",
            root.id,
            resource_action,
            version.updated_by_user_id,
            root.revision,
        )
    session.flush()


def create_logical_model(
    session: Session, body: LogicalModelWrite, actor: str, *, model_id: uuid.UUID | None = None
) -> tuple[LogicalModel, LogicalModelVersion]:
    model_id = model_id or uuid.uuid4()
    now = utc_now()
    content_hash = canonical_hash(body.model_dump(mode="json", by_alias=True))
    model = LogicalModel(
        id=model_id,
        urn=f"urn:daca:logical-model:{model_id}",
        origin_catalog_id=CATALOG_URN,
        revision=1,
        published_revision=None,
        content_hash=content_hash,
        lifecycle="active",
        created_by_user_id=actor,
        created_at=now,
        updated_at=now,
    )
    session.add(model)
    session.flush()
    reserve_logical_model_identifier(session, model, body)
    _dataset, dataset_version = create_dcat_dataset_version(
        session, body, model.id, 1
    )
    version = LogicalModelVersion(
        id=uuid.uuid4(),
        logical_model_id=model.id,
        dataset_version_id=dataset_version.id,
        predecessor_version_id=None,
        revision=1,
        lock_version=model.revision,
        status="draft",
        identifier_mode=body.identifier_mode,
        content_hash=content_hash,
        created_by_user_id=actor,
        updated_by_user_id=actor,
        created_at=now,
        updated_at=now,
    )
    session.add(version)
    session.flush()
    write_logical_version(session, model, version, body, actor, replacing=False)
    record_audit(session, "logical-model", model.id, "created", actor, 1)
    return model, version


def reserve_logical_model_identifier(
    session: Session,
    model: LogicalModel,
    body: LogicalModelWrite,
    *,
    legacy_identifier: str | None = None,
) -> None:
    """Reserve the current identifier for this root, including after retirement."""

    identifier = body.identifiers[0]
    reservation = session.get(LogicalModelIdentifierReservation, model.id)
    existing = session.scalar(
        select(LogicalModelIdentifierReservation).where(
            LogicalModelIdentifierReservation.normalized_identifier == identifier.casefold()
        )
    )
    # Historical data can contain duplicate identifiers because it pre-dates
    # the catalog-wide unique reservation.  Migration reserves one root so no
    # new model can claim that value.  A second legacy root may still save an
    # unchanged identifier; once it chooses a new identifier, it receives its
    # own reservation and the old duplicate remains protected by the first.
    if (
        reservation is None
        and existing is not None
        and existing.logical_model_id != model.id
        and legacy_identifier is not None
        and legacy_identifier.casefold() == identifier.casefold()
    ):
        return
    if reservation is None:
        session.add(
            LogicalModelIdentifierReservation(
                logical_model_id=model.id,
                identifier=identifier,
                normalized_identifier=identifier.casefold(),
                updated_at=utc_now(),
            )
        )
    else:
        reservation.identifier = identifier
        reservation.normalized_identifier = identifier.casefold()
        reservation.updated_at = utc_now()
    # Force the unique index here, while the request can still report a
    # field-specific problem rather than succeeding until commit.
    session.flush()


def _retire_logical_field(
    session: Session, field: LogicalField, actor: str, retired_at: datetime
) -> None:
    if field.lifecycle == "retired":
        return
    field.revision += 1
    field.lifecycle = "retired"
    field.retired_at = retired_at
    field.updated_at = retired_at
    field.content_hash = canonical_hash(
        {
            "urn": field.urn,
            "originCatalogId": field.origin_catalog_id,
            "revision": field.revision,
            "lifecycle": field.lifecycle,
            "retiredAt": retired_at,
        }
    )
    record_audit(session, "logical-field", field.id, "retired", actor, field.revision)


def _retire_logical_entity(
    session: Session, entity: LogicalEntity, actor: str, retired_at: datetime
) -> None:
    if entity.lifecycle == "retired":
        return
    fields = session.scalars(
        select(LogicalField).where(
            LogicalField.logical_entity_id == entity.id,
            LogicalField.lifecycle == "active",
        )
    )
    for field in fields:
        _retire_logical_field(session, field, actor, retired_at)
    entity.revision += 1
    entity.lifecycle = "retired"
    entity.retired_at = retired_at
    entity.updated_at = retired_at
    entity.content_hash = canonical_hash(
        {
            "urn": entity.urn,
            "originCatalogId": entity.origin_catalog_id,
            "revision": entity.revision,
            "lifecycle": entity.lifecycle,
            "retiredAt": retired_at,
        }
    )
    record_audit(session, "logical-entity", entity.id, "retired", actor, entity.revision)


def write_logical_version(
    session: Session,
    model: LogicalModel,
    version: LogicalModelVersion,
    body: LogicalModelWrite,
    actor: str,
    *,
    replacing: bool,
) -> None:
    if version.status != "draft":
        raise HTTPException(409, "Only a draft logical model version can be edited")
    if replacing:
        raise HTTPException(
            409,
            "Logical model versions are immutable; create a successor version instead",
        )
    existing_structure = session.scalar(
        select(func.count())
        .select_from(LogicalEntityVersion)
        .where(LogicalEntityVersion.logical_model_version_id == version.id)
    )
    if existing_structure:
        raise HTTPException(409, "Logical model versions are immutable")
    populate_dcat_dataset_version(session, version, body)
    serialized = body.model_dump(mode="json", by_alias=True)
    content_hash = canonical_hash(serialized)
    version.comment = body.comment
    version.content_hash = content_hash
    version.updated_by_user_id = actor
    version.updated_at = utc_now()
    model.content_hash = content_hash
    model.updated_at = version.updated_at
    for concept_id in body.concept_ids:
        add_concept_link(session, actor, concept_id, model_version_id=version.id)
    for provenance in body.assistance_provenance:
        session.add(
            LogicalModelAssistanceProvenance(
                id=uuid.uuid4(),
                logical_model_version_id=version.id,
                **provenance.model_dump(),
            )
        )

    now = utc_now()
    existing_entities = list(
        session.scalars(
            select(LogicalEntity).where(LogicalEntity.logical_model_id == model.id)
        )
    )
    entities_by_id = {item.id: item for item in existing_entities}
    for entity_body in body.entities:
        if entity_body.id is None:
            continue
        entity = entities_by_id.get(entity_body.id)
        if entity is None:
            raise HTTPException(422, "Entity ID does not belong to this logical model")
        if entity.lifecycle != "active":
            raise HTTPException(409, "A retired logical entity cannot be reused")
        for field_body in entity_body.fields:
            if field_body.id is None:
                continue
            field = session.get(LogicalField, field_body.id)
            if field is None or field.logical_entity_id != entity.id:
                raise HTTPException(422, "Field ID does not belong to this logical entity")
            if field.lifecycle != "active":
                raise HTTPException(409, "A retired logical field cannot be reused")

    requested_entity_ids = {
        item.id for item in body.entities if item.id is not None
    }
    for entity in existing_entities:
        if entity.lifecycle == "active" and entity.id not in requested_entity_ids:
            _retire_logical_entity(session, entity, actor, now)

    for entity_body in body.entities:
        if entity_body.business_object_version_id is not None:
            business_object = session.get(TerminologyTermVersion, entity_body.business_object_version_id)
            if business_object is None or business_object.concept_kind != "business_object" or business_object.status != "published":
                raise HTTPException(422, "businessObjectVersionId must identify a published business object")
        entity = None
        if entity_body.id:
            entity = entities_by_id[entity_body.id]
        entity_hash = canonical_hash(entity_body.model_dump(mode="json", by_alias=True))
        if entity is None:
            entity_id = uuid.uuid4()
            entity = LogicalEntity(
                id=entity_id,
                logical_model_id=model.id,
                urn=f"{model.urn}:entity:{entity_id}",
                origin_catalog_id=CATALOG_URN,
                revision=1,
                content_hash=entity_hash,
                lifecycle="active",
                created_at=now,
                updated_at=now,
            )
            session.add(entity)
            session.flush()
        else:
            entity.revision += 1
            entity.content_hash = entity_hash
            entity.updated_at = now
        entity_version = LogicalEntityVersion(
            id=uuid.uuid4(),
            logical_model_version_id=version.id,
            logical_entity_id=entity.id,
            origin_catalog_id=entity.origin_catalog_id,
            revision=entity.revision,
            content_hash=entity_hash,
            name=entity_body.name,
            business_object=entity_body.business_object,
            business_object_version_id=entity_body.business_object_version_id,
            comment=entity_body.comment,
            position=entity_body.position,
        )
        session.add(entity_version)
        session.flush()

        existing_fields = list(
            session.scalars(
                select(LogicalField).where(LogicalField.logical_entity_id == entity.id)
            )
        )
        fields_by_id = {item.id: item for item in existing_fields}
        requested_field_ids = {
            item.id for item in entity_body.fields if item.id is not None
        }
        for field in existing_fields:
            if field.lifecycle == "active" and field.id not in requested_field_ids:
                _retire_logical_field(session, field, actor, now)

        for field_body in entity_body.fields:
            if field_body.business_object_version_id is not None:
                business_object = session.get(TerminologyTermVersion, field_body.business_object_version_id)
                if business_object is None or business_object.concept_kind != "business_object" or business_object.status != "published":
                    raise HTTPException(422, "businessObjectVersionId must identify a published business object")
            field = None
            if field_body.id:
                field = fields_by_id[field_body.id]
            field_hash = canonical_hash(field_body.model_dump(mode="json", by_alias=True))
            if field is None:
                field_id = uuid.uuid4()
                field = LogicalField(
                    id=field_id,
                    logical_entity_id=entity.id,
                    urn=f"{entity.urn}:field:{field_id}",
                    origin_catalog_id=CATALOG_URN,
                    revision=1,
                    content_hash=field_hash,
                    lifecycle="active",
                    created_at=now,
                    updated_at=now,
                )
                session.add(field)
                session.flush()
            else:
                field.revision += 1
                field.content_hash = field_hash
                field.updated_at = now
            field_version = LogicalFieldVersion(
                id=uuid.uuid4(),
                logical_entity_version_id=entity_version.id,
                logical_field_id=field.id,
                origin_catalog_id=field.origin_catalog_id,
                revision=field.revision,
                content_hash=field_hash,
                business_object=field_body.business_object,
                business_object_version_id=field_body.business_object_version_id,
                name=field_body.name,
                data_type=field_body.data_type,
                length=field_body.length,
                precision=field_body.precision,
                short_description=field_body.short_description,
                comment=field_body.comment,
                source_system=field_body.source_system,
                classification=field_body.classification,
                decimal_places=field_body.decimal_places,
                value_list_concept_id=field_body.value_list_concept_id,
                concept_match_explicitly_none=field_body.concept_match_explicitly_none,
                nullable=field_body.nullable,
                min_count=field_body.min_count,
                max_count=field_body.max_count,
                position=field_body.position,
            )
            session.add(field_version)
            session.flush()
            if field_body.value_list_concept_id is not None:
                value_list = session.get(I14yConcept, field_body.value_list_concept_id)
                if value_list is None or value_list.concept_type != "CodeList":
                    raise HTTPException(
                        422, "valueListConceptId must identify a cached CodeList concept"
                    )
            for concept_id in field_body.concept_ids:
                add_concept_link(
                    session,
                    actor,
                    concept_id,
                    field_version_id=field_version.id,
                    primary_for_i14y=concept_id == field_body.primary_concept_id,
                )
    session.flush()


def add_concept_link(
    session: Session,
    actor: str,
    concept_id: uuid.UUID,
    *,
    model_version_id: uuid.UUID | None = None,
    field_version_id: uuid.UUID | None = None,
    primary_for_i14y: bool = False,
) -> None:
    concept = session.get(I14yConcept, concept_id)
    if concept is None:
        raise HTTPException(422, f"I14Y concept {concept_id} is not present in the local cache")
    session.add(
        LogicalConceptLink(
            id=uuid.uuid4(),
            logical_model_version_id=model_version_id,
            logical_field_version_id=field_version_id,
            concept_id=concept.id,
            concept_version=concept.version,
            concept_source_modified_at=concept.system_modified_at,
            source_uri=concept.register_uri or concept.source_url,
            primary_for_i14y=primary_for_i14y,
            linked_by_user_id=actor,
            linked_at=utc_now(),
        )
    )


def logical_write_from_payload(payload: dict[str, Any]) -> LogicalModelWrite:
    """Rehydrate a write DTO from an immutable persisted logical/DCAT version."""
    return LogicalModelWrite.model_validate(
        {
            "identifiers": payload["identifiers"],
            "localizations": payload["localizations"],
            "dataOwnerUserId": payload["dataOwnerUserId"],
            "deputyOwnerUserId": payload["deputyOwnerUserId"],
            "creator": payload["creator"],
            "identifierMode": payload.get("identifierMode", "manual"),
            "dataDomainId": payload["dataDomainId"],
            "departmentCode": payload["departmentCode"],
            "organizationId": payload["organizationId"],
            "dataClassification": payload["dataClassification"],
            "dateCreated": payload["dateCreated"],
            "contactPoints": payload["contactPoints"],
            "publisher": payload["publisher"],
            "accessRights": payload["accessRights"],
            "themes": payload["themes"],
            "mediaFormatHint": payload["mediaFormatHint"],
            "comment": payload["comment"],
            "conceptIds": payload["conceptIds"],
            "entities": [
                {
                    "id": entity["id"],
                    "name": entity["name"],
                    "businessObject": entity["businessObject"],
                    "businessObjectVersionId": entity.get("businessObjectVersionId"),
                    "comment": entity["comment"],
                    "position": entity["position"],
                    "fields": [
                        {
                            key: value
                            for key, value in field.items()
                            if key
                            not in {
                                "urn",
                                "originCatalogId",
                                "revision",
                                "contentHash",
                                "lifecycle",
                                "retiredAt",
                                "fieldVersionId",
                            }
                        }
                        for field in entity["fields"]
                    ],
                }
                for entity in payload["entities"]
            ],
            "distributions": [
                {
                    key: item[key]
                    for key in (
                        "id",
                        "title",
                        "accessUrl",
                        "downloadUrl",
                        "mediaType",
                        "format",
                        "licenseUri",
                    )
                    if key in item
                }
                for item in payload["distributions"]
            ],
            "dataServices": [
                {
                    key: item[key]
                    for key in ("id", "title", "endpointUrl", "endpointDescription")
                    if key in item
                }
                for item in payload["dataServices"]
            ],
            "assistanceProvenance": payload.get("assistanceProvenance", []),
        }
    )


def create_logical_successor(
    session: Session,
    model: LogicalModel,
    source: LogicalModelVersion,
    body: LogicalModelWrite,
    actor: str,
    *,
    status: str = "draft",
    action: str = "version-created",
) -> LogicalModelVersion:
    """Append a complete immutable version instead of editing an existing revision."""
    if source.logical_model_id != model.id:
        raise HTTPException(422, "Source version does not belong to the logical model")
    if model.lifecycle != "active":
        raise HTTPException(409, "A retired logical model cannot be changed")
    if status not in {"draft", "review_pending", "changes_requested", "published", "superseded", "retired"}:
        raise HTTPException(422, "Unsupported logical model status")
    source_dataset_version = session.get(DcatDatasetVersion, source.dataset_version_id)
    if source_dataset_version is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    source_dataset = session.get(DcatDataset, source_dataset_version.dataset_id)
    if source_dataset is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset")
    model.revision += 1
    model.updated_at = utc_now()
    _dataset, dataset_version = create_dcat_dataset_version(
        session, body, model.id, model.revision, dataset=source_dataset
    )
    version = LogicalModelVersion(
        id=uuid.uuid4(),
        logical_model_id=model.id,
        dataset_version_id=dataset_version.id,
        predecessor_version_id=source.id,
        revision=model.revision,
        lock_version=model.revision,
        status="draft",
        identifier_mode=body.identifier_mode,
        content_hash=canonical_hash(body.model_dump(mode="json", by_alias=True)),
        created_by_user_id=actor,
        updated_by_user_id=actor,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(version)
    session.flush()
    reserve_logical_model_identifier(
        session,
        model,
        body,
        legacy_identifier=(source_dataset_version.identifiers or [None])[0],
    )
    write_logical_version(session, model, version, body, actor, replacing=False)
    version.status = status
    dataset_version.status = (
        "published"
        if status == "published"
        else "superseded"
        if status in {"superseded", "retired"}
        else "draft"
    )
    if status == "review_pending":
        version.submitted_at = utc_now()
    if status == "published":
        version.published_at = utc_now()
        dataset_version.published_at = version.published_at
        dataset_version.issued = version.published_at.date()
        for distribution_version in session.scalars(
            select(DcatDistributionVersion).where(
                DcatDistributionVersion.dataset_version_id == dataset_version.id
            )
        ):
            distribution_version.status = "published"
            distribution_version.published_at = version.published_at
        for service_version in session.scalars(
            select(DcatDataServiceVersion).where(
                DcatDataServiceVersion.dataset_version_id == dataset_version.id
            )
        ):
            service_version.status = "published"
            service_version.published_at = version.published_at
        model.published_revision = version.revision
    elif status in {"superseded", "retired"}:
        for distribution_version in session.scalars(
            select(DcatDistributionVersion).where(
                DcatDistributionVersion.dataset_version_id == dataset_version.id
            )
        ):
            distribution_version.status = "superseded"
        for service_version in session.scalars(
            select(DcatDataServiceVersion).where(
                DcatDataServiceVersion.dataset_version_id == dataset_version.id
            )
        ):
            service_version.status = "superseded"
    record_audit(session, "logical-model", model.id, action, actor, version.revision)
    session.flush()
    return version


def clone_logical_version(
    session: Session, model: LogicalModel, source: LogicalModelVersion, actor: str
) -> LogicalModelVersion:
    payload = logical_version_payload(session, model, source)
    return create_logical_successor(
        session, model, source, logical_write_from_payload(payload), actor
    )


def snapshot_tree(session: Session, snapshot: PhysicalSchemaSnapshot) -> dict[str, Any]:
    source = session.get(PhysicalSource, snapshot.source_id)
    databases: list[dict[str, Any]] = []
    for database in session.scalars(
        select(PhysicalDatabase)
        .where(PhysicalDatabase.snapshot_id == snapshot.id)
        .order_by(PhysicalDatabase.position, PhysicalDatabase.name)
    ):
        schemas: list[dict[str, Any]] = []
        for schema in session.scalars(
            select(PhysicalSchema)
            .where(PhysicalSchema.physical_database_id == database.id)
            .order_by(PhysicalSchema.position, PhysicalSchema.name)
        ):
            tables: list[dict[str, Any]] = []
            for table in session.scalars(
                select(PhysicalTable)
                .where(PhysicalTable.physical_schema_id == schema.id)
                .order_by(PhysicalTable.position, PhysicalTable.name)
            ):
                columns = list(
                    session.scalars(
                        select(PhysicalColumn)
                        .where(PhysicalColumn.physical_table_id == table.id)
                        .order_by(PhysicalColumn.ordinal_position)
                    )
                )
                tables.append(
                    {
                        "id": table.id,
                        "stableKey": table.stable_key,
                        "urn": table.urn,
                        "name": table.name,
                        "kind": table.kind,
                        "comment": table.comment,
                        "position": table.position,
                        "storageLocation": table.storage_location,
                        "mediaType": table.media_type,
                        "objectCount": table.object_count,
                        "sizeBytes": table.size_bytes,
                        "schemaConfidence": table.schema_confidence,
                        "partitionKeys": table.partition_keys or [],
                        "columns": [
                            {
                                "id": column.id,
                                "stableKey": column.stable_key,
                                "urn": column.urn,
                                "name": column.name,
                                "rawDataType": column.raw_data_type,
                                "normalizedDataType": column.normalized_data_type,
                                "characterLength": column.character_length,
                                "numericPrecision": column.numeric_precision,
                                "numericScale": column.numeric_scale,
                                "nullable": column.nullable,
                                "ordinalPosition": column.ordinal_position,
                                "comment": column.comment,
                            }
                            for column in columns
                        ],
                    }
                )
            schemas.append(
                {
                    "id": schema.id,
                    "stableKey": schema.stable_key,
                    "urn": schema.urn,
                    "name": schema.name,
                    "position": schema.position,
                    "tables": tables,
                }
            )
        databases.append(
            {
                "id": database.id,
                "stableKey": database.stable_key,
                "urn": database.urn,
                "name": database.name,
                "position": database.position,
                "schemas": schemas,
            }
        )
    database_name = databases[0]["name"] if databases else None
    data_owner_name = (
        session.scalar(
            select(DemoUser.display_name)
            .join(DataModelRoleAssignment, DataModelRoleAssignment.user_id == DemoUser.id)
            .where(
                DataModelRoleAssignment.department_code == source.department_code,
                DataModelRoleAssignment.organization_id == source.organization_id,
                DataModelRoleAssignment.role == "data_owner",
                DataModelRoleAssignment.active.is_(True),
            )
            .order_by(DemoUser.display_name)
            .limit(1)
        )
        if source is not None
        else None
    )
    catalog_path = (
        f"s3://{database_name}/"
        if source is not None and source.adapter_type == "s3" and database_name
        else f"postgresql://{database_name}/"
        if database_name
        else source.config_ref if source is not None and source.config_ref else f"urn:daca:physical-source:{snapshot.source_id}"
    )
    return {
        "snapshot": {
            "id": snapshot.id,
            "urn": snapshot.urn,
            "originCatalogId": snapshot.origin_catalog_id,
            "sourceId": snapshot.source_id,
            "sourceName": source.name if source else "Unknown source",
            "dataOwnerName": data_owner_name,
            "catalogPath": catalog_path,
            "sourceAdapterType": source.adapter_type if source else "fixture",
            "sequence": snapshot.sequence,
            "predecessorSnapshotId": snapshot.predecessor_snapshot_id,
            "fingerprint": snapshot.fingerprint,
            "importedByUserId": snapshot.imported_by_user_id,
            "importedAt": snapshot.imported_at,
        },
        "databases": databases,
    }


def snapshot_metadata_for_diff(session: Session, snapshot: PhysicalSchemaSnapshot) -> dict[str, Any]:
    response = snapshot_tree(session, snapshot)
    return {
        "databases": [
            {
                "stableKey": database["stableKey"],
                "name": database["name"],
                "position": database["position"],
                "schemas": [
                    {
                        "stableKey": schema["stableKey"],
                        "name": schema["name"],
                        "position": schema["position"],
                        "tables": [
                            {
                                **{
                                    key: value
                                    for key, value in table.items()
                                    if key not in {"id", "urn", "columns"}
                                },
                                "columns": [
                                    {
                                        key: value
                                        for key, value in column.items()
                                        if key not in {"id", "urn"}
                                    }
                                    for column in table["columns"]
                                ],
                            }
                            for table in schema["tables"]
                        ],
                    }
                    for schema in database["schemas"]
                ],
            }
            for database in response["databases"]
        ]
    }


def persist_physical_import(
    session: Session,
    source: PhysicalSource,
    adapter: PhysicalMetadataAdapter,
    actor: str,
    *,
    variant: str | None = None,
) -> tuple[PhysicalSchemaSnapshot, PhysicalDriftReport | None]:
    raw = adapter.inspect(variant=variant)
    normalized = normalized_physical_metadata(raw)
    fingerprint = canonical_hash(normalized)
    previous = session.scalar(
        select(PhysicalSchemaSnapshot)
        .where(PhysicalSchemaSnapshot.source_id == source.id)
        .order_by(PhysicalSchemaSnapshot.sequence.desc())
        .limit(1)
        .with_for_update()
    )
    sequence = 1 if previous is None else previous.sequence + 1
    snapshot = PhysicalSchemaSnapshot(
        id=uuid.uuid4(),
        urn=f"{source.urn}:snapshot:{sequence}",
        origin_catalog_id=source.origin_catalog_id,
        source_id=source.id,
        sequence=sequence,
        predecessor_snapshot_id=previous.id if previous else None,
        fingerprint=fingerprint,
        imported_by_user_id=actor,
        imported_at=utc_now(),
    )
    session.add(snapshot)
    session.flush()
    for database_data in normalized["databases"]:
        database = PhysicalDatabase(
            id=stable_uuid(f"physical-row:{snapshot.id}:{database_data['stableKey']}"),
            snapshot_id=snapshot.id,
            stable_key=database_data["stableKey"],
            urn=f"{source.urn}:database:{database_data['name']}",
            name=database_data["name"],
            position=database_data["position"],
        )
        session.add(database)
        session.flush()
        for schema_data in database_data["schemas"]:
            schema = PhysicalSchema(
                id=stable_uuid(f"physical-row:{snapshot.id}:{schema_data['stableKey']}"),
                physical_database_id=database.id,
                stable_key=schema_data["stableKey"],
                urn=f"{source.urn}:schema:{schema_data['stableKey']}",
                name=schema_data["name"],
                position=schema_data["position"],
            )
            session.add(schema)
            session.flush()
            for table_data in schema_data["tables"]:
                table = PhysicalTable(
                    id=stable_uuid(f"physical-row:{snapshot.id}:{table_data['stableKey']}"),
                    physical_schema_id=schema.id,
                    stable_key=table_data["stableKey"],
                    urn=f"{source.urn}:table:{table_data['stableKey']}",
                    name=table_data["name"],
                    kind=table_data["kind"],
                    comment=table_data["comment"],
                    position=table_data["position"],
                    storage_location=table_data.get("storageLocation"),
                    media_type=table_data.get("mediaType"),
                    object_count=table_data.get("objectCount"),
                    size_bytes=table_data.get("sizeBytes"),
                    schema_confidence=table_data.get("schemaConfidence"),
                    partition_keys=table_data.get("partitionKeys") or [],
                )
                session.add(table)
                session.flush()
                for column_data in table_data["columns"]:
                    session.add(
                        PhysicalColumn(
                            id=stable_uuid(
                                f"physical-row:{snapshot.id}:{column_data['stableKey']}"
                            ),
                            physical_table_id=table.id,
                            stable_key=column_data["stableKey"],
                            urn=f"{source.urn}:column:{column_data['stableKey']}",
                            name=column_data["name"],
                            raw_data_type=column_data["rawDataType"],
                            normalized_data_type=column_data["normalizedDataType"],
                            character_length=column_data["characterLength"],
                            numeric_precision=column_data["numericPrecision"],
                            numeric_scale=column_data["numericScale"],
                            nullable=column_data["nullable"],
                            ordinal_position=column_data["ordinalPosition"],
                            comment=column_data["comment"],
                        )
                    )
    session.flush()
    report = None
    if previous is not None:
        previous_tree = snapshot_metadata_for_diff(session, previous)
        changes = detect_physical_drift(previous_tree, normalized)
        report = persist_drift_report(session, source, previous, snapshot, changes)
    record_audit(
        session,
        "physical-schema-snapshot",
        snapshot.id,
        "imported",
        actor,
        sequence,
        {"sourceId": str(source.id), "fingerprint": fingerprint},
    )
    return snapshot, report


def persist_drift_report(
    session: Session,
    source: PhysicalSource,
    previous: PhysicalSchemaSnapshot,
    current: PhysicalSchemaSnapshot,
    changes: list[dict[str, Any]],
) -> PhysicalDriftReport:
    counts = Counter(item["changeType"] for item in changes)
    report = PhysicalDriftReport(
        id=uuid.uuid4(),
        source_id=source.id,
        previous_snapshot_id=previous.id,
        current_snapshot_id=current.id,
        summary=dict(counts),
        created_at=utc_now(),
    )
    session.add(report)
    session.flush()
    impacts = physical_mapping_impacts(session, source.id)
    breaking_types = {
        "table_removed",
        "column_removed",
        "type_changed",
        "length_changed",
        "precision_changed",
        "scale_changed",
        "nullability_changed",
        "rename_candidate",
    }
    broken_versions: set[uuid.UUID] = set()
    for change in changes:
        impact = impacts.get(change["assetKey"], {"fields": set(), "mappings": set(), "versions": set()})
        if change["changeType"] in breaking_types:
            broken_versions.update(impact["versions"])
        session.add(
            PhysicalDriftChange(
                id=uuid.uuid4(),
                drift_report_id=report.id,
                change_type=change["changeType"],
                asset_key=change["assetKey"],
                before=change.get("before"),
                after=change.get("after"),
                confidence=change.get("confidence"),
                impacted_logical_field_ids=sorted(str(value) for value in impact["fields"]),
                impacted_mapping_ids=sorted(str(value) for value in impact["mappings"]),
                review_status=change.get("reviewStatus", "not_applicable"),
                created_at=utc_now(),
            )
        )
    for version_id in broken_versions:
        version = session.get(AssetMappingVersion, version_id)
        if version is None or version.status in {"superseded", "broken"}:
            continue
        mapping = session.get(AssetMapping, version.asset_mapping_id)
        if mapping is None or mapping.lifecycle != "active":
            continue
        logical_model = session.get(LogicalModel, mapping.logical_model_id)
        if logical_model is None or logical_model.lifecycle != "active":
            continue
        latest = session.scalar(
            select(AssetMappingVersion)
            .where(AssetMappingVersion.asset_mapping_id == mapping.id)
            .order_by(AssetMappingVersion.revision.desc())
            .limit(1)
        )
        # Historical validated evidence remains immutable; drift advances only
        # the currently selected mapping lineage.
        if latest is None or latest.id != version.id:
            continue
        payload = mapping_payload(session, mapping, version)
        body = mapping_write_from_payload(payload)
        evidence = dict(version.validation_result or {})
        evidence["drift"] = {
            "reportId": str(report.id),
            "previousSnapshotId": str(previous.id),
            "currentSnapshotId": str(current.id),
        }
        create_mapping_successor(
            session,
            mapping,
            version,
            body,
            version.responsible_user_id,
            status="broken",
            validation_result=evidence,
            last_drift_check_at=utc_now(),
            action="broken-by-drift",
            audit_actor="system:drift-detector",
            audit_details={
                "driftReportId": str(report.id),
                "previousSnapshotId": str(previous.id),
                "currentSnapshotId": str(current.id),
            },
        )
    session.flush()
    return report


def physical_mapping_impacts(session: Session, source_id: uuid.UUID) -> dict[str, dict[str, set]]:
    rows = session.execute(
        select(
            PhysicalColumn.stable_key,
            AssetMapping.id,
            AssetMappingVersion.id,
            AssetMappingLogicalField.logical_field_version_id,
        )
        .join(
            AssetMappingPhysicalColumn,
            AssetMappingPhysicalColumn.physical_column_id == PhysicalColumn.id,
        )
        .join(
            AssetMappingVersion,
            AssetMappingVersion.id == AssetMappingPhysicalColumn.asset_mapping_version_id,
        )
        .join(AssetMapping, AssetMapping.id == AssetMappingVersion.asset_mapping_id)
        .join(
            AssetMappingLogicalField,
            AssetMappingLogicalField.asset_mapping_version_id == AssetMappingVersion.id,
        )
        .join(PhysicalTable, PhysicalTable.id == PhysicalColumn.physical_table_id)
        .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
        .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
        .join(
            PhysicalSchemaSnapshot,
            PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id,
        )
        .where(
            PhysicalSchemaSnapshot.source_id == source_id,
            AssetMappingVersion.physical_snapshot_id == PhysicalSchemaSnapshot.id,
            AssetMapping.physical_source_id == source_id,
            AssetMapping.lifecycle == "active",
        )
    )
    result: dict[str, dict[str, set]] = defaultdict(
        lambda: {"fields": set(), "mappings": set(), "versions": set()}
    )
    for stable_key, mapping_id, version_id, field_id in rows:
        result[stable_key]["fields"].add(field_id)
        result[stable_key]["mappings"].add(mapping_id)
        result[stable_key]["versions"].add(version_id)
    return result


def drift_report_payload(session: Session, snapshot: PhysicalSchemaSnapshot) -> dict[str, Any]:
    report = session.scalar(
        select(PhysicalDriftReport).where(PhysicalDriftReport.current_snapshot_id == snapshot.id)
    )
    if report is None:
        return {
            "id": None,
            "sourceId": snapshot.source_id,
            "previousSnapshotId": snapshot.predecessor_snapshot_id,
            "currentSnapshotId": snapshot.id,
            "summary": {},
            "changes": [],
            "createdAt": None,
        }
    rows = list(
        session.scalars(
            select(PhysicalDriftChange)
            .where(PhysicalDriftChange.drift_report_id == report.id)
            .order_by(PhysicalDriftChange.change_type, PhysicalDriftChange.asset_key)
        )
    )
    return {
        "id": report.id,
        "sourceId": report.source_id,
        "previousSnapshotId": report.previous_snapshot_id,
        "currentSnapshotId": report.current_snapshot_id,
        "summary": report.summary,
        "changes": [
            {
                "id": row.id,
                "changeType": row.change_type,
                "assetKey": row.asset_key,
                "before": row.before,
                "after": row.after,
                "confidence": row.confidence,
                "impactedLogicalFieldIds": row.impacted_logical_field_ids,
                "impactedMappingIds": row.impacted_mapping_ids,
                "reviewStatus": row.review_status,
            }
            for row in rows
        ],
        "createdAt": report.created_at,
    }


def create_asset_mapping(
    session: Session, body: AssetMappingWrite, actor: str
) -> tuple[AssetMapping, AssetMappingVersion]:
    logical_version = session.get(LogicalModelVersion, body.logical_model_version_id)
    snapshot = session.get(PhysicalSchemaSnapshot, body.physical_snapshot_id)
    if logical_version is None or snapshot is None:
        raise HTTPException(422, "Mapping references an unknown logical version or physical snapshot")
    logical_model = session.get(LogicalModel, logical_version.logical_model_id)
    if logical_model is None:
        raise HTTPException(422, "Mapping references an unknown logical model")
    if logical_model.lifecycle != "active":
        raise HTTPException(409, "A mapping cannot be created for a retired logical model")
    mapping_id = uuid.uuid4()
    digest = canonical_hash(body.model_dump(mode="json", by_alias=True))
    mapping = AssetMapping(
        id=mapping_id,
        urn=f"urn:daca:asset-mapping:{mapping_id}",
        origin_catalog_id=CATALOG_URN,
        logical_model_id=logical_version.logical_model_id,
        physical_source_id=snapshot.source_id,
        revision=1,
        content_hash=digest,
        lifecycle="active",
        created_by_user_id=actor,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(mapping)
    session.flush()
    version = AssetMappingVersion(
        id=uuid.uuid4(),
        asset_mapping_id=mapping.id,
        revision=1,
        lock_version=1,
        predecessor_version_id=None,
        logical_model_version_id=body.logical_model_version_id,
        physical_snapshot_id=body.physical_snapshot_id,
        mapping_type=body.mapping_type,
        classification=body.classification,
        status="draft",
        transformation_rule=body.transformation_rule,
        comment=body.comment,
        responsible_user_id=body.responsible_user_id,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        validation_result={"valid": False, "issues": []},
        content_hash=digest,
        created_by_user_id=actor,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(version)
    session.flush()
    replace_mapping_references(session, mapping, version, body)
    record_audit(session, "asset-mapping", mapping.id, "created", actor, 1)
    return mapping, version


def replace_mapping_references(
    session: Session,
    mapping: AssetMapping,
    version: AssetMappingVersion,
    body: AssetMappingWrite,
) -> None:
    if version.status != "draft":
        raise HTTPException(409, "Only a draft mapping version can be edited")
    existing_references = session.scalar(
        select(func.count())
        .select_from(AssetMappingLogicalField)
        .where(AssetMappingLogicalField.asset_mapping_version_id == version.id)
    )
    if existing_references:
        raise HTTPException(
            409, "Asset mapping versions are immutable; create a successor version instead"
        )
    logical_rows = list(
        session.execute(
            select(LogicalFieldVersion, LogicalEntityVersion)
            .join(
                LogicalEntityVersion,
                LogicalEntityVersion.id == LogicalFieldVersion.logical_entity_version_id,
            )
            .where(LogicalFieldVersion.id.in_(body.logical_field_version_ids))
        ).all()
    )
    if len(logical_rows) != len(body.logical_field_version_ids) or any(
        entity.logical_model_version_id != body.logical_model_version_id
        for _field, entity in logical_rows
    ):
        raise HTTPException(422, "All logical fields must belong to the selected model version")
    physical_rows = list(
        session.execute(
            select(PhysicalColumn, PhysicalDatabase)
            .join(PhysicalTable, PhysicalTable.id == PhysicalColumn.physical_table_id)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .where(PhysicalColumn.id.in_(body.physical_column_ids))
        ).all()
    )
    if len(physical_rows) != len(body.physical_column_ids) or any(
        database.snapshot_id != body.physical_snapshot_id for _column, database in physical_rows
    ):
        raise HTTPException(422, "All physical columns must belong to the selected snapshot")
    for position, field_id in enumerate(body.logical_field_version_ids):
        session.add(
            AssetMappingLogicalField(
                asset_mapping_version_id=version.id,
                logical_field_version_id=field_id,
                position=position,
                role="target" if body.mapping_type in {"Derived", "Transformed"} else "source",
            )
        )
    for position, column_id in enumerate(body.physical_column_ids):
        session.add(
            AssetMappingPhysicalColumn(
                asset_mapping_version_id=version.id,
                physical_column_id=column_id,
                position=position,
                role="source",
            )
        )
    digest = canonical_hash(body.model_dump(mode="json", by_alias=True))
    version.logical_model_version_id = body.logical_model_version_id
    version.physical_snapshot_id = body.physical_snapshot_id
    version.mapping_type = body.mapping_type
    version.classification = body.classification
    version.transformation_rule = body.transformation_rule
    version.comment = body.comment
    version.responsible_user_id = body.responsible_user_id
    version.valid_from = body.valid_from
    version.valid_to = body.valid_to
    version.validation_result = {"valid": False, "issues": []}
    version.content_hash = digest
    version.updated_at = utc_now()
    mapping.content_hash = digest
    mapping.updated_at = version.updated_at
    session.flush()


def validate_mapping_version(session: Session, version: AssetMappingVersion) -> MappingValidation:
    logical_fields = list(
        session.scalars(
            select(LogicalFieldVersion)
            .join(
                AssetMappingLogicalField,
                AssetMappingLogicalField.logical_field_version_id == LogicalFieldVersion.id,
            )
            .where(AssetMappingLogicalField.asset_mapping_version_id == version.id)
            .order_by(AssetMappingLogicalField.position)
        )
    )
    physical_columns = list(
        session.scalars(
            select(PhysicalColumn)
            .join(
                AssetMappingPhysicalColumn,
                AssetMappingPhysicalColumn.physical_column_id == PhysicalColumn.id,
            )
            .where(AssetMappingPhysicalColumn.asset_mapping_version_id == version.id)
            .order_by(AssetMappingPhysicalColumn.position)
        )
    )
    issues: list[MappingIssue] = []
    if version.valid_to is not None and version.valid_to < version.valid_from:
        issues.append(
            MappingIssue(
                severity="error",
                code="invalid_validity_period",
                message="validTo must not precede validFrom.",
            )
        )
    if version.mapping_type in {"Derived", "Lookup", "Transformed"} and not (
        version.transformation_rule or ""
    ).strip():
        issues.append(
            MappingIssue(
                severity="error",
                code="missing_transformation_rule",
                message=f"A transformation rule is required for {version.mapping_type} mappings.",
            )
        )
    strict = version.mapping_type in {"Direct", "Renamed"}
    for logical in logical_fields:
        expected_type = normalize_postgresql_type(logical.data_type)
        for physical in physical_columns:
            severity = "error" if strict else "warning"
            if expected_type != physical.normalized_data_type:
                issues.append(
                    MappingIssue(
                        severity=severity,
                        code="type_mismatch",
                        message=(
                            f"Logical type {logical.data_type} is not compatible with "
                            f"physical type {physical.raw_data_type}."
                        ),
                        logical_field_version_id=logical.id,
                        physical_column_id=physical.id,
                    )
                )
            if (
                logical.length is not None
                and physical.character_length is not None
                and physical.character_length < logical.length
            ):
                issues.append(
                    MappingIssue(
                        severity=severity,
                        code="length_too_short",
                        message="Physical length is shorter than the logical constraint.",
                        logical_field_version_id=logical.id,
                        physical_column_id=physical.id,
                    )
                )
            if (
                logical.precision is not None
                and physical.numeric_precision is not None
                and physical.numeric_precision < logical.precision
            ):
                issues.append(
                    MappingIssue(
                        severity=severity,
                        code="precision_too_small",
                        message="Physical precision is smaller than the logical constraint.",
                        logical_field_version_id=logical.id,
                        physical_column_id=physical.id,
                    )
                )
            if (
                logical.decimal_places is not None
                and physical.numeric_scale is not None
                and physical.numeric_scale != logical.decimal_places
            ):
                issues.append(
                    MappingIssue(
                        severity=severity,
                        code="scale_mismatch",
                        message="Physical scale differs from the logical decimal places.",
                        logical_field_version_id=logical.id,
                        physical_column_id=physical.id,
                    )
                )
            if not logical.nullable and physical.nullable:
                issues.append(
                    MappingIssue(
                        severity=severity,
                        code="nullability_mismatch",
                        message="A nullable physical source cannot guarantee the required logical value.",
                        logical_field_version_id=logical.id,
                        physical_column_id=physical.id,
                    )
                )
    valid = not any(issue.severity == "error" for issue in issues)
    return MappingValidation(valid=valid, issues=issues)


def mapping_payload(session: Session, mapping: AssetMapping, version: AssetMappingVersion) -> dict[str, Any]:
    logical_ids = list(
        session.scalars(
            select(AssetMappingLogicalField.logical_field_version_id)
            .where(AssetMappingLogicalField.asset_mapping_version_id == version.id)
            .order_by(AssetMappingLogicalField.position)
        )
    )
    physical_ids = list(
        session.scalars(
            select(AssetMappingPhysicalColumn.physical_column_id)
            .where(AssetMappingPhysicalColumn.asset_mapping_version_id == version.id)
            .order_by(AssetMappingPhysicalColumn.position)
        )
    )
    validation = version.validation_result or {"valid": False, "issues": []}
    return {
        "id": mapping.id,
        "urn": mapping.urn,
        "revision": mapping.revision,
        "lifecycle": mapping.lifecycle,
        "versionId": version.id,
        "lockVersion": version.lock_version,
        "predecessorVersionId": version.predecessor_version_id,
        "logicalModelId": mapping.logical_model_id,
        "physicalSourceId": mapping.physical_source_id,
        "logicalModelVersionId": version.logical_model_version_id,
        "physicalSnapshotId": version.physical_snapshot_id,
        "mappingType": version.mapping_type,
        "classification": version.classification,
        "status": version.status,
        "transformationRule": version.transformation_rule,
        "comment": version.comment,
        "responsibleUserId": version.responsible_user_id,
        "validFrom": version.valid_from,
        "validTo": version.valid_to,
        "logicalFieldVersionIds": logical_ids,
        "physicalColumnIds": physical_ids,
        "validationResult": validation,
        "lastDriftCheckAt": version.last_drift_check_at,
        "createdByUserId": version.created_by_user_id,
        "createdAt": version.created_at,
        "updatedAt": version.updated_at,
    }


def mapping_write_from_payload(payload: dict[str, Any]) -> AssetMappingWrite:
    """Project an API response back to the exact immutable mapping write shape."""
    keys = {
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
    }
    return AssetMappingWrite.model_validate(
        {key: value for key, value in payload.items() if key in keys}
    )


def get_mapping_version(
    session: Session, mapping_id: uuid.UUID, version_id: uuid.UUID | None = None, *, lock: bool = False
) -> tuple[AssetMapping, AssetMappingVersion]:
    mapping_statement = select(AssetMapping).where(AssetMapping.id == mapping_id)
    if lock:
        mapping_statement = mapping_statement.with_for_update()
    mapping = session.scalar(mapping_statement)
    if mapping is None:
        raise HTTPException(404, "Asset mapping not found")
    statement = select(AssetMappingVersion).where(AssetMappingVersion.asset_mapping_id == mapping.id)
    if version_id:
        statement = statement.where(AssetMappingVersion.id == version_id)
    else:
        statement = statement.order_by(AssetMappingVersion.revision.desc()).limit(1)
    if lock:
        statement = statement.with_for_update()
    version = session.scalar(statement)
    if version is None:
        raise HTTPException(404, "Asset mapping version not found")
    return mapping, version


def clone_mapping_version(
    session: Session, mapping: AssetMapping, source: AssetMappingVersion, actor: str
) -> AssetMappingVersion:
    source_payload = mapping_payload(session, mapping, source)
    body = mapping_write_from_payload(source_payload)
    return create_mapping_successor(session, mapping, source, body, actor)


def create_mapping_successor(
    session: Session,
    mapping: AssetMapping,
    source: AssetMappingVersion,
    body: AssetMappingWrite,
    actor: str,
    *,
    status: str = "draft",
    validation_result: dict[str, Any] | None = None,
    last_drift_check_at: datetime | None = None,
    action: str = "version-created",
    audit_details: dict[str, Any] | None = None,
    audit_actor: str | None = None,
) -> AssetMappingVersion:
    if source.asset_mapping_id != mapping.id:
        raise HTTPException(422, "Source version does not belong to the asset mapping")
    if mapping.lifecycle != "active":
        raise HTTPException(409, "A retired asset mapping cannot be changed")
    logical_model = session.get(LogicalModel, mapping.logical_model_id)
    if logical_model is None:
        raise HTTPException(422, "Asset mapping references an unknown logical model")
    if logical_model.lifecycle != "active":
        raise HTTPException(409, "A mapping for a retired logical model cannot be changed")
    if status not in {"draft", "review_pending", "validated", "broken", "superseded"}:
        raise HTTPException(422, "Unsupported mapping status")
    mapping.revision += 1
    digest = canonical_hash(
        {
            **body.model_dump(mode="json", by_alias=True),
            "status": status,
            "validationResult": validation_result or source.validation_result,
        }
    )
    version = AssetMappingVersion(
        id=uuid.uuid4(),
        asset_mapping_id=mapping.id,
        revision=mapping.revision,
        lock_version=1,
        predecessor_version_id=source.id,
        logical_model_version_id=body.logical_model_version_id,
        physical_snapshot_id=body.physical_snapshot_id,
        mapping_type=body.mapping_type,
        classification=body.classification,
        status="draft",
        transformation_rule=body.transformation_rule,
        comment=body.comment,
        responsible_user_id=body.responsible_user_id,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        validation_result=validation_result or {"valid": False, "issues": []},
        last_drift_check_at=last_drift_check_at,
        content_hash=digest,
        created_by_user_id=actor,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    session.add(version)
    session.flush()
    replace_mapping_references(session, mapping, version, body)
    version.status = status
    version.validation_result = validation_result or {"valid": False, "issues": []}
    version.last_drift_check_at = last_drift_check_at
    version.content_hash = digest
    mapping.content_hash = digest
    mapping.updated_at = utc_now()
    record_audit(
        session,
        "asset-mapping",
        mapping.id,
        action,
        audit_actor or actor,
        mapping.revision,
        audit_details,
    )
    session.flush()
    return version
