from __future__ import annotations

import re
import uuid
from datetime import UTC, date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.encoders import jsonable_encoder
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_session
from .i14y_concepts import (
    code_list_entry_to_cache_dict,
    concept_to_cache_dict,
    normalize_code_list_export,
    normalize_concept,
)
from .modeling_core import (
    FixturePhysicalMetadataAdapter,
    PostgreSQLPhysicalMetadataAdapter,
    S3ParquetPhysicalMetadataAdapter,
)
from .modeling_rdf import content_type, export_logical_dcat, export_logical_shacl
from .modeling_schemas import (
    AssetMappingCollection,
    AssetMappingResponse,
    AssetMappingWrite,
    DataModelRoleResponse,
    DerivationPreviewResponse,
    DerivedLogicalModelRequest,
    DeriveLogicalModelRequest,
    DriftReportResponse,
    I14yCodeListEntryResponse,
    I14yConceptCollection,
    I14yConceptResponse,
    I14ySyncRunResponse,
    I14ySyncStatusResponse,
    LogicalModelCollection,
    LogicalModelResponse,
    LogicalModelVersionCollection,
    LogicalModelWrite,
    PhysicalImportRequest,
    PhysicalModelCollection,
    PhysicalSnapshotCollection,
    PhysicalSnapshotResponse,
    PhysicalSourceCollection,
)
from .modeling_service import (
    clone_logical_version,
    clone_mapping_version,
    create_asset_mapping,
    create_logical_model,
    create_logical_successor,
    create_mapping_successor,
    drift_report_payload,
    get_logical_model,
    get_logical_version,
    get_mapping_version,
    logical_summary,
    logical_version_payload,
    logical_write_from_payload,
    mapping_payload,
    mapping_write_from_payload,
    persist_physical_import,
    snapshot_tree,
    utc_now,
    validate_mapping_version,
)
from .models import (
    AdministrativeOrganization,
    AssetMapping,
    AssetMappingVersion,
    DataModelRoleAssignment,
    DcatDatasetVersion,
    DemoUser,
    Domain,
    FederalPersonMembership,
    I14yCodeListEntry,
    I14yConcept,
    I14ySyncRun,
    LogicalEntityVersion,
    LogicalFieldVersion,
    LogicalModel,
    LogicalModelIdentifierReservation,
    LogicalModelReview,
    LogicalModelVersion,
    PhysicalColumn,
    PhysicalDatabase,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
    WorkflowTask,
)

SessionDep = Annotated[Session, Depends(get_session)]


def _etag(value: int) -> str:
    return f'"{value}"'


def _require_etag(if_match: str | None, value: int) -> None:
    if if_match is None:
        raise HTTPException(428, "If-Match is required for this versioned resource")
    candidates = {item.strip() for item in if_match.split(",")}
    if not candidates.intersection({_etag(value), f"W/{_etag(value)}"}):
        raise HTTPException(412, f"The current revision is {value}; reload and retry")


def require_modeling_actor(
    request: Request,
    x_daca_user: Annotated[str | None, Header(alias="X-DaCa-User")] = None,
) -> str:
    if not request.app.state.settings.daca_demo_auth:
        raise HTTPException(503, "Demo identity is disabled")
    if not x_daca_user or not x_daca_user.strip():
        raise HTTPException(401, "Provide X-DaCa-User for this local demo operation")
    actor = x_daca_user.strip()[:200]
    with request.app.state.session_factory() as session:
        user = session.get(DemoUser, actor)
        if user is None or not user.active:
            raise HTTPException(401, "Unknown or inactive local demo identity")
    return actor


ActorDep = Annotated[str, Depends(require_modeling_actor)]


def _assignments(session: Session, actor: str) -> list[DataModelRoleAssignment]:
    return list(
        session.scalars(
            select(DataModelRoleAssignment).where(
                DataModelRoleAssignment.user_id == actor,
                DataModelRoleAssignment.active.is_(True),
            )
        )
    )


def _organization_breadcrumb(session: Session, organization_id: str) -> list[dict[str, str]]:
    result: list[dict[str, str]] = []
    seen: set[str] = set()
    row = session.get(AdministrativeOrganization, organization_id)
    while row is not None:
        if row.id in seen:
            raise HTTPException(500, "Organization hierarchy contains a cycle")
        seen.add(row.id)
        result.append({"id": row.id, "label": row.display_name, "type": row.organization_type})
        row = session.get(AdministrativeOrganization, row.parent_id) if row.parent_id else None
    result.reverse()
    return result


def _descendant_ids(session: Session, organization_id: str) -> set[str]:
    children: dict[str, list[str]] = {}
    for row in session.scalars(select(AdministrativeOrganization).where(AdministrativeOrganization.active.is_(True))):
        if row.parent_id:
            children.setdefault(row.parent_id, []).append(row.id)
    result = {organization_id}
    pending = [organization_id]
    while pending:
        current = pending.pop()
        for child in children.get(current, []):
            if child not in result:
                result.add(child)
                pending.append(child)
    return result


def _require_any_assignment(session: Session, actor: str) -> list[DataModelRoleAssignment]:
    rows = _assignments(session, actor)
    if not rows:
        raise HTTPException(403, "This identity has no scoped data-model role")
    return rows


def _require_scope(
    session: Session,
    actor: str,
    department_code: str,
    organization_id: str,
    *,
    roles: set[str] | None = None,
) -> DataModelRoleAssignment:
    row = next(
        (
            assignment
            for assignment in _assignments(session, actor)
            if assignment.department_code == department_code
            and organization_id in _descendant_ids(session, assignment.organization_id)
            and (roles is None or assignment.role in roles)
        ),
        None,
    )
    if row is None:
        raise HTTPException(403, "The identity has no matching role in this organization scope")
    return row


def _normalize_logical_write_scope(session: Session, body: LogicalModelWrite) -> None:
    organization_id = body.organization_unit_id or body.organization_id
    organization = session.get(AdministrativeOrganization, organization_id) if organization_id else None
    if organization is None or not organization.active:
        raise HTTPException(422, "organizationUnitId must identify an active federal organization")
    body.organization_unit_id = organization.id
    body.organization_id = organization.id
    body.department_code = organization.department_code
    domain = session.get(Domain, body.data_domain_id)
    if domain is None or domain.lifecycle != "active":
        raise HTTPException(422, "dataDomainId must identify an active DaCa domain")
    # Domain responsibility is governed by the domain register.  Clients may
    # display these values, but must not be able to assign a different reviewer.
    body.data_owner_user_id = domain.owner_user_id
    body.deputy_owner_user_id = domain.deputy_owner_user_id


def _dataset_version(session: Session, version: LogicalModelVersion) -> DcatDatasetVersion:
    row = session.get(DcatDatasetVersion, version.dataset_version_id)
    if row is None:
        raise HTTPException(500, "Logical model is missing its DCAT dataset version")
    return row


def _require_version_scope(
    session: Session, actor: str, version: LogicalModelVersion, *, roles: set[str] | None = None
) -> DataModelRoleAssignment:
    dataset = _dataset_version(session, version)
    return _require_scope(
        session,
        actor,
        dataset.department_code,
        dataset.organization_id,
        roles=roles,
    )


def _require_publish_right(session: Session, actor: str, version: LogicalModelVersion) -> None:
    dataset = _dataset_version(session, version)
    assignments = _assignments(session, actor)
    allowed = any(
        item.department_code == dataset.department_code
        and item.organization_id == dataset.organization_id
        and (
            (item.role == "data_owner" and actor == dataset.data_owner_user_id)
            or (
                item.role == "deputy_data_owner"
                and item.delegated_owner_user_id == dataset.data_owner_user_id
            )
        )
        for item in assignments
    )
    if not allowed:
        raise HTTPException(403, "Only the scoped data owner or delegated deputy may publish")


def _validate_owner_assignments(session: Session, body: LogicalModelWrite) -> None:
    owner = next(
        (
            assignment
            for assignment in _assignments(session, body.data_owner_user_id)
            if assignment.department_code == body.department_code
            and assignment.role == "data_owner"
            and body.organization_id in _descendant_ids(session, assignment.organization_id)
        ),
        None,
    )
    if owner is None:
        raise HTTPException(422, "dataOwnerUserId must be an active owner in the selected scope")
    if body.deputy_owner_user_id:
        deputy = next(
            (
                assignment
                for assignment in _assignments(session, body.deputy_owner_user_id)
                if assignment.department_code == body.department_code
                and assignment.role == "deputy_data_owner"
                and assignment.delegated_owner_user_id == body.data_owner_user_id
                and body.organization_id in _descendant_ids(session, assignment.organization_id)
            ),
            None,
        )
        if deputy is None:
            raise HTTPException(
                422,
                "deputyOwnerUserId must be an active deputy delegated by the selected owner",
            )


def _require_snapshot_scope(
    session: Session, actor: str, snapshot_id: uuid.UUID
) -> PhysicalSchemaSnapshot:
    snapshot = session.get(PhysicalSchemaSnapshot, snapshot_id)
    if snapshot is None:
        raise HTTPException(422, "Unknown physical snapshot")
    source = session.get(PhysicalSource, snapshot.source_id)
    if source is None:
        raise HTTPException(500, "Physical snapshot is missing its source")
    _require_scope(session, actor, source.department_code, source.organization_id)
    return snapshot


def _validate_mapping_scope(
    session: Session,
    actor: str,
    body: AssetMappingWrite,
    *,
    mapping: AssetMapping | None = None,
) -> tuple[LogicalModelVersion, PhysicalSchemaSnapshot]:
    logical_version = session.get(LogicalModelVersion, body.logical_model_version_id)
    if logical_version is None:
        raise HTTPException(422, "Unknown logical model version")
    logical_model = session.get(LogicalModel, logical_version.logical_model_id)
    if logical_model is None:
        raise HTTPException(422, "Unknown logical model")
    if logical_model.lifecycle != "active":
        raise HTTPException(409, "A retired logical model cannot receive mappings")
    dataset = _dataset_version(session, logical_version)
    _require_version_scope(session, actor, logical_version)
    snapshot = _require_snapshot_scope(session, actor, body.physical_snapshot_id)
    source = session.get(PhysicalSource, snapshot.source_id)
    if source is None or (
        source.department_code,
        source.organization_id,
    ) != (dataset.department_code, dataset.organization_id):
        raise HTTPException(422, "Logical model and physical snapshot must share one scope")
    responsible = session.scalar(
        select(DataModelRoleAssignment).where(
            DataModelRoleAssignment.user_id == body.responsible_user_id,
            DataModelRoleAssignment.department_code == dataset.department_code,
            DataModelRoleAssignment.organization_id == dataset.organization_id,
            DataModelRoleAssignment.active.is_(True),
        )
    )
    if responsible is None:
        raise HTTPException(422, "responsibleUserId must have an active role in this scope")
    if mapping is not None and (
        mapping.logical_model_id != logical_version.logical_model_id
        or mapping.physical_source_id != snapshot.source_id
    ):
        raise HTTPException(422, "A mapping version cannot switch logical or physical roots")
    if mapping is not None:
        broken_lineage = session.scalar(
            select(AssetMappingVersion.id)
            .where(
                AssetMappingVersion.asset_mapping_id == mapping.id,
                AssetMappingVersion.status == "broken",
            )
            .limit(1)
        )
        if broken_lineage is not None:
            latest_snapshot_id = session.scalar(
                select(PhysicalSchemaSnapshot.id)
                .where(PhysicalSchemaSnapshot.source_id == mapping.physical_source_id)
                .order_by(PhysicalSchemaSnapshot.sequence.desc())
                .limit(1)
            )
            if latest_snapshot_id is None:
                raise HTTPException(409, "The physical source has no resolvable snapshot")
            if body.physical_snapshot_id != latest_snapshot_id:
                raise HTTPException(
                    409,
                    "A broken mapping must be resolved against the latest physical snapshot",
                )
    return logical_version, snapshot


def _parse_date(value: Any) -> date | None:
    if value in {None, ""}:
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if value in {None, ""}:
        return None
    if isinstance(value, datetime):
        return value
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


def _same_instant(left: datetime | None, right: datetime | None) -> bool:
    if left is None or right is None:
        return left is right
    normalized_left = left.replace(tzinfo=UTC) if left.tzinfo is None else left.astimezone(UTC)
    normalized_right = right.replace(tzinfo=UTC) if right.tzinfo is None else right.astimezone(UTC)
    return normalized_left == normalized_right


def _concept_response(row: I14yConcept) -> dict[str, Any]:
    return {
        "id": row.id,
        "identifiers": row.identifiers,
        "name": row.name,
        "description": row.description,
        "conceptType": row.concept_type,
        "publisher": row.publisher,
        "version": row.version,
        "publicationLevel": row.publication_level,
        "publicationLevelProposal": row.publication_level_proposal,
        "registrationStatus": row.registration_status,
        "registrationStatusProposal": row.registration_status_proposal,
        "themes": row.themes,
        "validFrom": row.valid_from,
        "validTo": row.valid_to,
        "conformsTo": row.conforms_to,
        "constraints": row.constraints,
        "codeList": row.code_list,
        "systemCreatedAt": row.system_created_at,
        "systemModifiedAt": row.system_modified_at,
        "registerUri": row.register_uri,
        "sourceUrl": row.source_url,
        "detailLoaded": row.detail_loaded,
        "fetchedAt": row.fetched_at,
    }


def _upsert_concept(
    session: Session, raw: dict[str, Any], source_url: str, *, detail_loaded: bool
) -> tuple[I14yConcept, bool]:
    cached = concept_to_cache_dict(normalize_concept(raw))
    try:
        concept_id = uuid.UUID(str(cached["external_id"]))
    except (TypeError, ValueError) as exc:
        raise HTTPException(502, "I14Y returned a concept without a valid UUID") from exc
    row = session.get(I14yConcept, concept_id)
    incoming_modified_at = _parse_datetime(cached["system_modified_at"])
    exact_match = bool(
        row is not None
        and row.version == cached["version"]
        and _same_instant(row.system_modified_at, incoming_modified_at)
        and row.payload_hash == cached["payload_hash"]
    )
    if exact_match and not (detail_loaded and not row.detail_loaded):
        return row, False
    # A list result is intentionally less complete than the detail resource. Keep an
    # already loaded detail record when both describe the same upstream release.
    if (
        row is not None
        and row.detail_loaded
        and not detail_loaded
        and row.version == cached["version"]
        and _same_instant(row.system_modified_at, incoming_modified_at)
    ):
        return row, False
    changed = True
    if row is None:
        row = I14yConcept(
            id=concept_id,
            identifiers=[],
            name={},
            description={},
            concept_type=cached["concept_type"],
            publisher={},
            themes=[],
            conforms_to=[],
            constraints={},
            code_list={},
            source_system={},
            source_url=source_url,
            payload_hash=cached["payload_hash"],
            raw_payload={},
            fetched_at=utc_now(),
        )
        session.add(row)
    row.identifiers = cached["identifiers"]
    row.legacy_identifier = cached["legacy_identifier"]
    row.name = cached["name"]
    row.description = cached["description"]
    row.concept_type = cached["concept_type"]
    row.publisher = cached["publisher"]
    row.publisher_identifier = cached["publisher_identifier"]
    row.version = cached["version"]
    row.publication_level = cached["publication_level"]
    row.publication_level_proposal = cached["publication_level_proposal"]
    row.registration_status = cached["registration_status"]
    row.registration_status_proposal = cached["registration_status_proposal"]
    row.themes = cached["themes"]
    row.valid_from = _parse_date(cached["valid_from"])
    row.valid_to = _parse_date(cached["valid_to"])
    row.conforms_to = cached["conforms_to"]
    row.constraints = cached["constraints"]
    row.code_list = cached["code_list"]
    row.source_system = cached["source_system"]
    row.system_created_at = _parse_datetime(cached["system_created_at"])
    row.system_modified_at = incoming_modified_at
    row.register_uri = cached["register_uri"]
    row.source_url = source_url
    row.payload_hash = cached["payload_hash"]
    row.detail_loaded = detail_loaded
    row.raw_payload = cached["raw_payload"]
    row.fetched_at = utc_now()
    return row, changed


def create_modeling_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["data modeling"])

    @router.get("/modeling/scopes/mine")
    def list_my_modeling_scopes(session: SessionDep, actor: ActorDep) -> list[dict[str, Any]]:
        return [
            {
                "role": row.role,
                "organizationId": row.organization_id,
                "delegatedOwnerUserId": row.delegated_owner_user_id,
                "breadcrumb": _organization_breadcrumb(session, row.organization_id),
                "descendantOrganizationIds": sorted(_descendant_ids(session, row.organization_id)),
            }
            for row in _assignments(session, actor)
        ]

    @router.get("/modeling/personas", response_model=list[DataModelRoleResponse])
    def list_personas(
        session: SessionDep,
        q: str | None = None,
        role: Annotated[str | None, Query()] = None,
        scope_organization_id: Annotated[str | None, Query(alias="scopeOrganizationId")] = None,
        preferred_office_id: Annotated[str | None, Query(alias="preferredOfficeId")] = None,
        delegated_owner_user_id: Annotated[str | None, Query(alias="delegatedOwnerUserId")] = None,
        include_descendants: Annotated[bool, Query(alias="includeDescendants")] = False,
    ) -> list[dict[str, Any]]:
        scope_ids = (
            _descendant_ids(session, scope_organization_id)
            if scope_organization_id and include_descendants
            else {scope_organization_id} if scope_organization_id else None
        )
        rows = session.execute(
            select(DataModelRoleAssignment, DemoUser, AdministrativeOrganization)
            .join(DemoUser, DemoUser.id == DataModelRoleAssignment.user_id)
            .join(
                AdministrativeOrganization,
                AdministrativeOrganization.id == DataModelRoleAssignment.organization_id,
            )
            .where(DataModelRoleAssignment.active.is_(True), DemoUser.active.is_(True))
        ).all()
        results: list[dict[str, Any]] = []
        preferred_breadcrumb = _organization_breadcrumb(session, preferred_office_id) if preferred_office_id else []
        preferred_department = next((item["id"] for item in preferred_breadcrumb if item["type"] in {"department", "chancellery"}), None)
        for assignment, user, organization in rows:
            if q and q.casefold() not in f"{user.display_name} {user.email} {organization.display_name}".casefold():
                continue
            if role and assignment.role != role:
                continue
            if scope_ids is not None and assignment.organization_id not in scope_ids:
                continue
            if delegated_owner_user_id and assignment.delegated_owner_user_id != delegated_owner_user_id:
                continue
            membership = session.scalar(
                select(FederalPersonMembership).where(
                    FederalPersonMembership.user_id == user.id,
                    FederalPersonMembership.is_primary.is_(True),
                    FederalPersonMembership.valid_to.is_(None),
                )
            )
            primary_id = membership.organization_id if membership else assignment.organization_id
            breadcrumb = _organization_breadcrumb(session, primary_id)
            department_id = next((item["id"] for item in breadcrumb if item["type"] in {"department", "chancellery"}), None)
            sort_rank = 0 if preferred_office_id and primary_id == preferred_office_id else 1 if preferred_department and department_id == preferred_department else 2
            results.append({
                "id": assignment.id,
                "userId": user.id,
                "displayName": user.display_name,
                "departmentCode": assignment.department_code,
                "organizationId": organization.id,
                "organizationName": organization.display_name,
                "role": assignment.role,
                "delegatedOwnerUserId": assignment.delegated_owner_user_id,
                "primaryOrganizationId": primary_id,
                "sortRank": sort_rank,
                "organizationBreadcrumb": breadcrumb,
            })
        return sorted(results, key=lambda item: (item["sortRank"], item["displayName"].casefold()))

    @router.get("/logical-models", response_model=LogicalModelCollection)
    def list_logical_models(
        session: SessionDep,
        actor: ActorDep,
        q: str | None = None,
        status: str | None = None,
        owner_user_id: Annotated[str | None, Query(alias="ownerUserId")] = None,
    ) -> dict[str, Any]:
        # Logical-model metadata is catalog-wide readable for every active
        # identity.  Scoped role assignments are enforced only for mutations.
        del actor
        items: list[dict[str, Any]] = []
        for model in session.scalars(
            select(LogicalModel).where(LogicalModel.lifecycle == "active").order_by(LogicalModel.updated_at.desc())
        ):
            version = get_logical_version(session, model.id)
            payload = logical_version_payload(session, model, version)
            if status and payload["status"] != status:
                continue
            if owner_user_id and payload["dataOwnerUserId"] != owner_user_id:
                continue
            if q and q.casefold() not in f"{payload['title']} {payload['description']}".casefold():
                continue
            items.append(logical_summary(payload))
        return {"items": items, "total": len(items)}

    @router.post("/logical-models", response_model=LogicalModelResponse, status_code=201)
    def post_logical_model(
        body: LogicalModelWrite, response: Response, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        _normalize_logical_write_scope(session, body)
        _require_scope(
            session,
            actor,
            body.department_code,
            body.organization_id,
            roles={"data_owner", "deputy_data_owner", "data_steward"},
        )
        _validate_owner_assignments(session, body)
        model, version = create_logical_model(session, body, actor)
        session.commit()
        response.headers["ETag"] = _etag(version.lock_version)
        return logical_version_payload(session, model, version)

    @router.get("/logical-model-identifiers/availability")
    def logical_model_identifier_availability(
        identifier: Annotated[str, Query(min_length=1, max_length=500)],
        session: SessionDep,
        actor: ActorDep,
        exclude_model_id: Annotated[uuid.UUID | None, Query(alias="excludeModelId")] = None,
    ) -> dict[str, bool]:
        del actor
        normalized = identifier.strip().casefold()
        if not normalized or any(character.isspace() for character in identifier):
            return {"available": False}
        existing = session.scalar(
            select(LogicalModelIdentifierReservation).where(
                LogicalModelIdentifierReservation.normalized_identifier == normalized
            )
        )
        return {"available": existing is None or existing.logical_model_id == exclude_model_id}

    @router.get("/logical-models/{model_id}", response_model=LogicalModelResponse)
    def read_logical_model(
        model_id: uuid.UUID, response: Response, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        model = get_logical_model(session, model_id)
        version = get_logical_version(session, model.id)
        del actor
        response.headers["ETag"] = _etag(version.lock_version)
        return logical_version_payload(session, model, version)

    @router.get(
        "/logical-models/{model_id}/versions", response_model=LogicalModelVersionCollection
    )
    def list_logical_versions(
        model_id: uuid.UUID, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        model = get_logical_model(session, model_id)
        rows = list(
            session.scalars(
                select(LogicalModelVersion)
                .where(LogicalModelVersion.logical_model_id == model.id)
                .order_by(LogicalModelVersion.revision.desc())
            )
        )
        del actor
        items = [logical_version_payload(session, model, item) for item in rows]
        return {"items": items, "total": len(items)}

    @router.post(
        "/logical-models/{model_id}/versions", response_model=LogicalModelResponse, status_code=201
    )
    def post_logical_version(
        model_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        model = get_logical_model(session, model_id, lock=True)
        source = get_logical_version(session, model.id, lock=True)
        _require_version_scope(session, actor, source)
        _require_etag(if_match, source.lock_version)
        version = clone_logical_version(session, model, source, actor)
        session.commit()
        response.headers["ETag"] = _etag(version.lock_version)
        return logical_version_payload(session, model, version)

    @router.put(
        "/logical-models/{model_id}/versions/{version_id}", response_model=LogicalModelResponse
    )
    def put_logical_version(
        model_id: uuid.UUID,
        version_id: uuid.UUID,
        body: LogicalModelWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        _normalize_logical_write_scope(session, body)
        model = get_logical_model(session, model_id, lock=True)
        version = get_logical_version(session, model.id, version_id, lock=True)
        _require_version_scope(session, actor, version)
        _require_scope(session, actor, body.department_code, body.organization_id)
        _validate_owner_assignments(session, body)
        _require_etag(if_match, version.lock_version)
        if version.revision != model.revision:
            raise HTTPException(409, "Only the latest logical model version can be revised")
        successor = create_logical_successor(
            session,
            model,
            version,
            body,
            actor,
            action="draft-revised",
        )
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return logical_version_payload(session, model, successor)

    @router.post(
        "/logical-models/{model_id}/versions/{version_id}/submit",
        response_model=LogicalModelResponse,
    )
    def submit_logical_version(
        model_id: uuid.UUID,
        version_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        model = get_logical_model(session, model_id, lock=True)
        version = get_logical_version(session, model.id, version_id, lock=True)
        _require_version_scope(session, actor, version, roles={"data_steward"})
        _require_etag(if_match, version.lock_version)
        if version.status != "draft":
            raise HTTPException(409, "Only a draft can be submitted")
        if version.revision != model.revision:
            raise HTTPException(409, "Only the latest logical model version can be submitted")
        successor = create_logical_successor(
            session,
            model,
            version,
            logical_write_from_payload(logical_version_payload(session, model, version)),
            actor,
            status="review_pending",
            action="submitted",
        )
        dataset = _dataset_version(session, successor)
        domain = session.get(Domain, dataset.data_domain_id)
        if domain is None or domain.lifecycle != "active":
            raise HTTPException(409, "The selected domain is no longer active")
        review = LogicalModelReview(
            id=uuid.uuid4(), logical_model_id=model.id, submitted_version_id=successor.id,
            domain_id=domain.id, submitter_user_id=actor, reviewer_user_id=domain.owner_user_id,
            status="pending", review_snapshot=jsonable_encoder(logical_version_payload(session, model, successor)),
            created_at=utc_now(),
        )
        session.add(review)
        session.add(WorkflowTask(
            id=uuid.uuid4(), task_type="logical_model_review", task_kind="action", status="open",
            assignee_user_id=domain.owner_user_id, logical_model_review_id=review.id,
            title=f"Datenmodell prüfen: {review.review_snapshot['title']}",
            detail="Der Data Steward hat das Modell zur Domänenfreigabe eingereicht.",
            created_at=utc_now(), updated_at=utc_now(),
        ))
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return logical_version_payload(session, model, successor)

    @router.get("/logical-models/{model_id}/versions/{version_id}/exports/{layer}/{rdf_format}")
    def export_logical_model(
        model_id: uuid.UUID,
        version_id: uuid.UUID,
        layer: str,
        rdf_format: str,
        session: SessionDep,
        actor: ActorDep,
    ) -> Response:
        if layer not in {"dcat", "shacl"} or rdf_format not in {"ttl", "jsonld"}:
            raise HTTPException(404, "Unsupported RDF export")
        model = get_logical_model(session, model_id)
        version = get_logical_version(session, model.id, version_id)
        del actor
        try:
            content = (
                export_logical_dcat(session, model, version, rdf_format)
                if layer == "dcat"
                else export_logical_shacl(session, model, version, rdf_format)
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        return Response(content=content, media_type=content_type(rdf_format))

    @router.get("/physical-sources", response_model=PhysicalSourceCollection)
    def list_physical_sources(session: SessionDep, actor: ActorDep) -> dict[str, Any]:
        assignments = _require_any_assignment(session, actor)
        scopes = {(item.department_code, item.organization_id) for item in assignments}
        items = []
        for source in session.scalars(
            select(PhysicalSource).where(PhysicalSource.lifecycle == "active").order_by(PhysicalSource.name)
        ):
            if (source.department_code, source.organization_id) not in scopes:
                continue
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
            system_name = "S3 Object Storage" if source.adapter_type == "s3" else "PostgreSQL"
            catalog_path = (
                f"s3://{database_name}/"
                if source.adapter_type == "s3" and database_name
                else f"postgresql://{database_name}/"
                if database_name
                else source.config_ref or f"urn:daca:physical-source:{source.id}"
            )
            owner = session.get(DemoUser, source.created_by_user_id)
            items.append(
                {
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
                    "catalogPath": catalog_path,
                    "systemName": system_name,
                    "databaseName": database_name,
                    "ownerName": owner.display_name if owner is not None else source.created_by_user_id,
                    "updatedAt": source.updated_at,
                }
            )
        return {"items": items, "total": len(items)}

    @router.post("/physical-sources/{source_id}/imports", response_model=PhysicalSnapshotResponse)
    def import_physical_source(
        source_id: uuid.UUID,
        body: PhysicalImportRequest,
        response: Response,
        request: Request,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        source = session.scalar(
            select(PhysicalSource).where(PhysicalSource.id == source_id).with_for_update()
        )
        if source is None:
            raise HTTPException(404, "Physical source not found")
        if source.lifecycle == "retired":
            raise HTTPException(409, "A retired physical source cannot be imported")
        _require_scope(
            session,
            actor,
            source.department_code,
            source.organization_id,
            roles={"data_owner", "deputy_data_owner", "data_steward"},
        )
        _require_etag(if_match, source.revision)
        settings = request.app.state.settings
        if source.adapter_type == "postgresql":
            if settings.daca_physical_metadata_adapter not in {"postgresql", "all"}:
                raise HTTPException(
                    503,
                    "The server-side PostgreSQL metadata adapter is not enabled",
                )
            secret = settings.daca_physical_postgres_dsn
            if secret is None:
                raise HTTPException(503, "The server-side PostgreSQL metadata source is not configured")
            adapter = PostgreSQLPhysicalMetadataAdapter(secret)
        elif source.adapter_type == "s3":
            if settings.daca_physical_metadata_adapter not in {"s3", "all"}:
                raise HTTPException(503, "The server-side S3 metadata adapter is not enabled")
            if not all(
                (
                    settings.daca_physical_s3_endpoint_url,
                    settings.daca_physical_s3_bucket,
                    settings.daca_physical_s3_access_key_id,
                    settings.daca_physical_s3_secret_access_key,
                )
            ):
                raise HTTPException(503, "The server-side S3 metadata source is not configured")
            adapter = S3ParquetPhysicalMetadataAdapter(
                endpoint_url=settings.daca_physical_s3_endpoint_url,
                bucket=settings.daca_physical_s3_bucket,
                prefix=settings.daca_physical_s3_prefix,
                region=settings.daca_physical_s3_region,
                access_key_id=settings.daca_physical_s3_access_key_id,
                secret_access_key=settings.daca_physical_s3_secret_access_key,
                max_objects=settings.daca_physical_s3_max_objects,
            )
        else:
            adapter = FixturePhysicalMetadataAdapter()
        try:
            snapshot, _report = persist_physical_import(
                session, source, adapter, actor, variant=body.fixture_variant
            )
        except HTTPException:
            raise
        except Exception:
            if source.adapter_type == "fixture":
                raise
            raise HTTPException(
                503,
                f"The server-side {source.adapter_type.upper()} metadata import failed",
            ) from None
        source.revision += 1
        source.updated_at = utc_now()
        session.commit()
        response.headers["ETag"] = _etag(source.revision)
        return snapshot_tree(session, snapshot)

    @router.get("/physical-snapshots", response_model=PhysicalSnapshotCollection)
    def list_physical_snapshots(
        session: SessionDep,
        actor: ActorDep,
        source_id: Annotated[uuid.UUID | None, Query(alias="sourceId")] = None,
    ) -> dict[str, Any]:
        assignments = _require_any_assignment(session, actor)
        scopes = {(item.department_code, item.organization_id) for item in assignments}
        statement = select(PhysicalSchemaSnapshot, PhysicalSource).join(
            PhysicalSource, PhysicalSource.id == PhysicalSchemaSnapshot.source_id
        )
        if source_id:
            statement = statement.where(PhysicalSchemaSnapshot.source_id == source_id)
        rows = session.execute(statement.order_by(PhysicalSchemaSnapshot.imported_at.desc())).all()
        items = [
            snapshot_tree(session, snapshot)["snapshot"]
            for snapshot, source in rows
            if (source.department_code, source.organization_id) in scopes
        ]
        return {"items": items, "total": len(items)}

    @router.get("/physical-models", response_model=PhysicalModelCollection)
    def search_physical_models(
        session: SessionDep,
        actor: ActorDep,
        q: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
        source_type: Annotated[
            str | None, Query(alias="sourceType", pattern="^(fixture|postgresql|s3)$")
        ] = None,
    ) -> dict[str, Any]:
        """Search the latest imported structures using catalog metadata only."""
        assignments = _require_any_assignment(session, actor)
        scopes = {(item.department_code, item.organization_id) for item in assignments}
        needle = (q or "").strip().casefold()
        items: list[dict[str, Any]] = []
        for source in session.scalars(
            select(PhysicalSource).where(PhysicalSource.lifecycle == "active").order_by(PhysicalSource.name)
        ):
            if (source.department_code, source.organization_id) not in scopes:
                continue
            if source_type and source.adapter_type != source_type:
                continue
            snapshot = session.scalar(
                select(PhysicalSchemaSnapshot)
                .where(PhysicalSchemaSnapshot.source_id == source.id)
                .order_by(PhysicalSchemaSnapshot.sequence.desc())
                .limit(1)
            )
            if snapshot is None:
                continue
            tree = snapshot_tree(session, snapshot)
            for database in tree["databases"]:
                for schema in database["schemas"]:
                    for table in schema["tables"]:
                        haystack = " ".join(
                            [
                                source.name,
                                database["name"],
                                schema["name"],
                                table["name"],
                                table.get("storageLocation") or "",
                                *(column["name"] for column in table["columns"]),
                            ]
                        ).casefold()
                        if needle and needle not in haystack:
                            continue
                        qualified_name = (
                            table.get("storageLocation")
                            or f"{database['name']}.{schema['name']}.{table['name']}"
                        )
                        items.append(
                            {
                                "id": table["id"],
                                "snapshotId": snapshot.id,
                                "sourceId": source.id,
                                "sourceName": source.name,
                                "sourceType": source.adapter_type,
                                "modelType": table["kind"],
                                "qualifiedName": qualified_name,
                                "databaseName": database["name"],
                                "schemaName": schema["name"],
                                "fieldCount": len(table["columns"]),
                                "storageLocation": table.get("storageLocation"),
                                "mediaType": table.get("mediaType"),
                                "schemaConfidence": table.get("schemaConfidence"),
                                "sizeBytes": table.get("sizeBytes"),
                                "snapshotSequence": snapshot.sequence,
                                "importedAt": snapshot.imported_at,
                            }
                        )
        return {"items": items, "total": len(items)}

    @router.get("/physical-snapshots/{snapshot_id}", response_model=PhysicalSnapshotResponse)
    def read_physical_snapshot(
        snapshot_id: uuid.UUID, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        snapshot = session.get(PhysicalSchemaSnapshot, snapshot_id)
        if snapshot is None:
            raise HTTPException(404, "Physical snapshot not found")
        source = session.get(PhysicalSource, snapshot.source_id)
        _require_scope(session, actor, source.department_code, source.organization_id)
        return snapshot_tree(session, snapshot)

    @router.get("/physical-snapshots/{snapshot_id}/drift", response_model=DriftReportResponse)
    def read_physical_drift(
        snapshot_id: uuid.UUID, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        snapshot = session.get(PhysicalSchemaSnapshot, snapshot_id)
        if snapshot is None:
            raise HTTPException(404, "Physical snapshot not found")
        source = session.get(PhysicalSource, snapshot.source_id)
        _require_scope(session, actor, source.department_code, source.organization_id)
        return drift_report_payload(session, snapshot)

    def derivation_context(
        table_id: uuid.UUID,
        body: DeriveLogicalModelRequest,
        session: Session,
        actor: str,
    ) -> tuple[
        PhysicalTable,
        PhysicalSchemaSnapshot,
        PhysicalSource,
        DemoUser,
        list[PhysicalColumn],
        list[dict[str, Any]],
    ]:
        row = session.execute(
            select(
                PhysicalTable,
                PhysicalSchema,
                PhysicalDatabase,
                PhysicalSchemaSnapshot,
                PhysicalSource,
            )
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .join(PhysicalSchemaSnapshot, PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id)
            .join(PhysicalSource, PhysicalSource.id == PhysicalSchemaSnapshot.source_id)
            .where(PhysicalTable.id == table_id)
        ).one_or_none()
        if row is None:
            raise HTTPException(404, "Physical table not found")
        table, _schema, _database, snapshot, source = row
        _require_scope(
            session,
            actor,
            source.department_code,
            source.organization_id,
            roles={"data_owner", "deputy_data_owner", "data_steward"},
        )
        owner = session.get(DemoUser, body.data_owner_user_id)
        if owner is None:
            raise HTTPException(422, "Unknown data owner")
        columns = list(
            session.scalars(
                select(PhysicalColumn)
                .where(PhysicalColumn.physical_table_id == table.id)
                .order_by(PhysicalColumn.ordinal_position)
            )
        )
        proposed_fields = [
            {
                "physicalColumnId": column.id,
                "name": column.name,
                "dataType": column.normalized_data_type,
                "length": column.character_length,
                "precision": column.numeric_precision,
                "scale": column.numeric_scale,
                "nullable": column.nullable,
                "minCount": 0 if column.nullable else 1,
                "maxCount": 1,
                "classification": "internal",
                "selected": True,
                "conceptIds": [],
                "primaryConceptId": None,
                "conceptMatchExplicitlyNone": False,
            }
            for column in columns
        ]
        if body.fields is not None:
            by_id = {column.id: column for column in columns}
            unknown = {
                field.physical_column_id
                for field in body.fields
                if field.physical_column_id not in by_id
            }
            if unknown:
                raise HTTPException(422, "Every physicalColumnId must belong to the selected table")
            concept_ids = {
                concept_id
                for field in body.fields
                for concept_id in field.concept_ids
            }
            if concept_ids:
                cached_concept_ids = set(
                    session.scalars(
                        select(I14yConcept.id).where(I14yConcept.id.in_(concept_ids))
                    )
                )
                missing_concept_ids = concept_ids - cached_concept_ids
                if missing_concept_ids:
                    raise HTTPException(
                        422,
                        "Every conceptId must identify a concept in the local I14Y cache",
                    )
            proposed_fields = [field.model_dump(mode="json", by_alias=True) for field in body.fields]
        return table, snapshot, source, owner, columns, proposed_fields

    @router.post(
        "/physical-tables/{table_id}/derivation-preview",
        response_model=DerivationPreviewResponse,
    )
    def preview_logical_derivation(
        table_id: uuid.UUID,
        body: DeriveLogicalModelRequest,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        table, snapshot, _source, _owner, _columns, fields = derivation_context(
            table_id, body, session, actor
        )
        return {
            "tableId": table.id,
            "snapshotId": snapshot.id,
            "title": body.title,
            "description": body.description,
            "dataDomainId": body.data_domain_id,
            "dataOwnerUserId": body.data_owner_user_id,
            "deputyOwnerUserId": body.deputy_owner_user_id,
            "fields": fields,
        }

    @router.post(
        "/physical-tables/{table_id}/derive-logical-model",
        response_model=LogicalModelResponse,
        status_code=201,
    )
    def derive_logical_model(
        table_id: uuid.UUID,
        body: DeriveLogicalModelRequest | DerivedLogicalModelRequest,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        if isinstance(body, DerivedLogicalModelRequest):
            row = session.execute(
                select(
                    PhysicalTable,
                    PhysicalSchemaSnapshot,
                    PhysicalSource,
                )
                .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
                .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
                .join(
                    PhysicalSchemaSnapshot,
                    PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id,
                )
                .join(PhysicalSource, PhysicalSource.id == PhysicalSchemaSnapshot.source_id)
                .where(PhysicalTable.id == table_id)
            ).one_or_none()
            if row is None:
                raise HTTPException(404, "Physical table not found")
            table, snapshot, source = row
            _require_scope(
                session,
                actor,
                source.department_code,
                source.organization_id,
                roles={"data_owner", "deputy_data_owner", "data_steward"},
            )

            logical_body = body.logical_model
            _normalize_logical_write_scope(session, logical_body)
            if (
                logical_body.department_code,
                logical_body.organization_id,
            ) != (source.department_code, source.organization_id):
                raise HTTPException(
                    422,
                    "Logical model and physical representation must share one organization scope",
                )
            _validate_owner_assignments(session, logical_body)

            columns = list(
                session.scalars(
                    select(PhysicalColumn).where(
                        PhysicalColumn.physical_table_id == table.id
                    )
                )
            )
            physical_columns = {column.id: column for column in columns}
            unknown_columns = {
                binding.physical_column_id
                for binding in body.field_mappings
                if binding.physical_column_id not in physical_columns
            }
            if unknown_columns:
                raise HTTPException(
                    422, "Every physicalColumnId must belong to the selected table"
                )

            requested_fields = {
                (entity.name.casefold(), field.name.casefold())
                for entity in logical_body.entities
                for field in entity.fields
            }
            unknown_fields = {
                (binding.entity_name, binding.logical_field_name)
                for binding in body.field_mappings
                if (
                    binding.entity_name.casefold(),
                    binding.logical_field_name.casefold(),
                )
                not in requested_fields
            }
            if unknown_fields:
                raise HTTPException(
                    422,
                    "Every fieldMapping must identify a field in logicalModel.entities",
                )

            model, version = create_logical_model(session, logical_body, actor)
            persisted_fields = session.execute(
                select(LogicalEntityVersion.name, LogicalFieldVersion)
                .join(
                    LogicalFieldVersion,
                    LogicalFieldVersion.logical_entity_version_id
                    == LogicalEntityVersion.id,
                )
                .where(LogicalEntityVersion.logical_model_version_id == version.id)
            ).all()
            logical_fields = {
                (entity_name.casefold(), logical_field.name.casefold()): logical_field
                for entity_name, logical_field in persisted_fields
            }
            for binding in body.field_mappings:
                logical_field = logical_fields[
                    (
                        binding.entity_name.casefold(),
                        binding.logical_field_name.casefold(),
                    )
                ]
                physical_column = physical_columns[binding.physical_column_id]
                mapping_body = AssetMappingWrite.model_validate(
                    {
                        "logicalModelVersionId": version.id,
                        "physicalSnapshotId": snapshot.id,
                        "mappingType": (
                            "Direct"
                            if logical_field.name.casefold()
                            == physical_column.name.casefold()
                            else "Renamed"
                        ),
                        "classification": logical_field.classification,
                        "comment": "Created with the physical-first logical-model derivation",
                        "responsibleUserId": actor,
                        "validFrom": datetime.now(UTC).date(),
                        "logicalFieldVersionIds": [logical_field.id],
                        "physicalColumnIds": [physical_column.id],
                    }
                )
                _validate_mapping_scope(session, actor, mapping_body)
                create_asset_mapping(session, mapping_body, actor)
            session.commit()
            response.headers["ETag"] = _etag(version.lock_version)
            return logical_version_payload(session, model, version)

        table, snapshot, source, owner, columns, proposed_fields = derivation_context(
            table_id, body, session, actor
        )
        selected_fields = [field for field in proposed_fields if field["selected"]]
        physical_columns = {column.id: column for column in columns}
        logical_body = LogicalModelWrite.model_validate(
            {
                # A snapshot is immutable. Including it keeps repeated physical
                # derivations catalog-wide unique while retaining a traceable,
                # stable source/table prefix for the generated logical model.
                "identifiers": [f"derived:{table.stable_key}:{snapshot.id}"],
                "localizations": [
                    {"language": "de", "title": body.title, "description": body.description}
                ],
                "dataOwnerUserId": body.data_owner_user_id,
                "deputyOwnerUserId": body.deputy_owner_user_id,
                "creator": {
                    "type": "InternalOrganisation",
                    "organizationId": source.organization_id,
                    "englishName": "Defence",
                },
                "dataDomainId": body.data_domain_id,
                "departmentCode": source.department_code,
                "organizationId": source.organization_id,
                "dataClassification": "internal",
                "dateCreated": datetime.now(UTC).date(),
                "contactPoints": [{"name": owner.display_name, "email": owner.email}],
                "publisher": {
                    "name": "Verteidigung",
                    "identifier": source.organization_id,
                    "uri": f"urn:daca:organization:{source.organization_id}",
                },
                "accessRights": "urn:daca:access-rights:internal",
                "entities": [
                    {
                        "name": table.name,
                        "businessObject": body.title,
                        "position": 0,
                        "fields": [
                            {
                                "name": field["name"],
                                "dataType": field["dataType"],
                                "length": field["length"],
                                "precision": field["precision"],
                                "decimalPlaces": field["scale"],
                                "nullable": field["nullable"],
                                "minCount": field["minCount"],
                                "maxCount": field["maxCount"],
                                "position": position,
                                "sourceSystem": source.name,
                                "classification": field["classification"],
                                "conceptIds": field["conceptIds"],
                                "primaryConceptId": field["primaryConceptId"],
                                "conceptMatchExplicitlyNone": field[
                                    "conceptMatchExplicitlyNone"
                                ],
                            }
                            for position, field in enumerate(selected_fields)
                        ],
                    }
                ],
            }
        )
        _validate_owner_assignments(session, logical_body)
        model, version = create_logical_model(session, logical_body, actor)
        logical_fields = list(
            session.scalars(
                select(LogicalFieldVersion)
                .join(
                    LogicalEntityVersion,
                    LogicalEntityVersion.id == LogicalFieldVersion.logical_entity_version_id,
                )
                .where(LogicalEntityVersion.logical_model_version_id == version.id)
                .order_by(LogicalFieldVersion.position)
            )
        )
        for logical_field, proposed in zip(logical_fields, selected_fields, strict=True):
            physical_id = uuid.UUID(str(proposed["physicalColumnId"]))
            physical_column = physical_columns[physical_id]
            mapping_body = AssetMappingWrite.model_validate(
                {
                    "logicalModelVersionId": version.id,
                    "physicalSnapshotId": snapshot.id,
                    "mappingType": (
                        "Direct"
                        if logical_field.name.casefold() == physical_column.name.casefold()
                        else "Renamed"
                    ),
                    "classification": proposed["classification"],
                    "comment": "Automatically proposed during physical-to-logical derivation",
                    "responsibleUserId": actor,
                    "validFrom": datetime.now(UTC).date(),
                    "logicalFieldVersionIds": [logical_field.id],
                    "physicalColumnIds": [physical_column.id],
                }
            )
            _validate_mapping_scope(session, actor, mapping_body)
            create_asset_mapping(session, mapping_body, actor)
        session.commit()
        response.headers["ETag"] = _etag(version.lock_version)
        return logical_version_payload(session, model, version)

    @router.post(
        "/physical-tables/{table_id}/quick-derive-logical-model",
        response_model=LogicalModelResponse,
        status_code=201,
    )
    def quick_derive_logical_model(
        table_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ) -> dict[str, Any]:
        """Create a technical logical draft and exact 1:1 mappings in one transaction.

        The shortcut deliberately reuses only an unambiguous, already governed domain in
        the source scope. It never invents a business domain from technical metadata.
        """
        row = session.execute(
            select(PhysicalTable, PhysicalSchemaSnapshot, PhysicalSource, PhysicalSchema)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .join(
                PhysicalSchemaSnapshot,
                PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id,
            )
            .join(PhysicalSource, PhysicalSource.id == PhysicalSchemaSnapshot.source_id)
            .where(PhysicalTable.id == table_id)
        ).one_or_none()
        if row is None:
            raise HTTPException(404, "Physical table not found")
        table, snapshot, source, physical_schema = row
        _require_scope(
            session,
            actor,
            source.department_code,
            source.organization_id,
            roles={"data_owner", "deputy_data_owner", "data_steward"},
        )
        columns = list(
            session.scalars(
                select(PhysicalColumn)
                .where(PhysicalColumn.physical_table_id == table.id)
                .order_by(PhysicalColumn.ordinal_position)
            )
        )
        if not columns:
            raise HTTPException(422, "The selected physical object has no columns")

        # Prefer an exact, already governed logical structure in this organization. This
        # keeps the demo fixture deterministic without treating a table name as a domain.
        physical_names = {column.name.casefold() for column in columns}
        matched_domain_ids: set[uuid.UUID] = set()
        seen_models: set[uuid.UUID] = set()
        scoped_owner_ids = set(
            session.scalars(
                select(DataModelRoleAssignment.user_id).where(
                    DataModelRoleAssignment.department_code == source.department_code,
                    DataModelRoleAssignment.organization_id == source.organization_id,
                    DataModelRoleAssignment.role == "data_owner",
                    DataModelRoleAssignment.active.is_(True),
                )
            )
        )
        version_rows = session.execute(
            select(LogicalModelVersion, DcatDatasetVersion)
            .join(
                DcatDatasetVersion,
                DcatDatasetVersion.id == LogicalModelVersion.dataset_version_id,
            )
            .where(DcatDatasetVersion.organization_id == source.organization_id)
            .order_by(LogicalModelVersion.revision.desc())
        ).all()
        for logical_version, dataset_version in version_rows:
            if logical_version.logical_model_id in seen_models:
                continue
            seen_models.add(logical_version.logical_model_id)
            field_names = {
                name.casefold()
                for name in session.scalars(
                    select(LogicalFieldVersion.name)
                    .join(
                        LogicalEntityVersion,
                        LogicalEntityVersion.id
                        == LogicalFieldVersion.logical_entity_version_id,
                    )
                    .where(
                        LogicalEntityVersion.logical_model_version_id
                        == logical_version.id
                    )
                )
            }
            matched_domain = session.get(Domain, dataset_version.data_domain_id)
            if (
                field_names == physical_names
                and matched_domain is not None
                and matched_domain.owner_user_id in scoped_owner_ids
            ):
                matched_domain_ids.add(dataset_version.data_domain_id)

        if len(matched_domain_ids) == 1:
            domain = session.get(Domain, next(iter(matched_domain_ids)))
        else:
            domains = list(
                session.scalars(
                    select(Domain).where(
                        Domain.owner_user_id.in_(scoped_owner_ids),
                        Domain.lifecycle == "active",
                    )
                )
            ) if scoped_owner_ids else []
            domain = domains[0] if len(domains) == 1 else None
        if domain is None:
            raise HTTPException(
                409,
                "Für diese Quelle ist keine eindeutige fachliche Domäne hinterlegt. "
                "Verwenden Sie das vollständige Modellformular.",
            )

        organization = session.get(AdministrativeOrganization, source.organization_id)
        owner = session.get(DemoUser, domain.owner_user_id)
        if organization is None or owner is None:
            raise HTTPException(422, "The governed source scope is incomplete")

        safe_entity_name = re.sub(r"[^A-Za-z0-9_.-]", "_", table.name)
        if not safe_entity_name or not re.match(r"^[A-Za-z_]", safe_entity_name):
            safe_entity_name = f"table_{safe_entity_name}"
        title = table.name.replace("_", " ").strip().title()
        qualified_name = f"{physical_schema.name}.{table.name}"
        derived_identifier = f"derived:{table.stable_key}:{snapshot.id}"
        existing_reservation = session.scalar(
            select(LogicalModelIdentifierReservation).where(
                LogicalModelIdentifierReservation.normalized_identifier
                == derived_identifier.casefold()
            )
        )
        if existing_reservation is not None:
            existing_model = get_logical_model(
                session, existing_reservation.logical_model_id
            )
            existing_version = get_logical_version(session, existing_model.id)
            _require_version_scope(session, actor, existing_version)
            response.headers["ETag"] = _etag(existing_version.lock_version)
            return logical_version_payload(session, existing_model, existing_version)
        logical_body = LogicalModelWrite.model_validate(
            {
                "identifiers": [derived_identifier],
                "localizations": [
                    {
                        "language": "de",
                        "title": title,
                        "description": (
                            f"Technischer Entwurf aus {source.name}, Objekt {qualified_name}, "
                            f"Snapshot {snapshot.sequence}. Fachliche Angaben sind vor der "
                            "Publikation zu prüfen."
                        ),
                    }
                ],
                "dataOwnerUserId": domain.owner_user_id,
                "deputyOwnerUserId": domain.deputy_owner_user_id,
                "creator": {
                    "type": "InternalOrganisation",
                    "organizationId": organization.id,
                    "englishName": organization.display_name,
                },
                "dataDomainId": domain.id,
                "departmentCode": source.department_code,
                "organizationId": source.organization_id,
                "dataClassification": "internal",
                "dateCreated": datetime.now(UTC).date(),
                "contactPoints": [{"name": owner.display_name, "email": owner.email}],
                "publisher": {
                    "name": organization.display_name,
                    "identifier": organization.id,
                    "uri": f"urn:daca:organization:{organization.id}",
                },
                "accessRights": "urn:daca:access-rights:internal",
                "comment": (
                    f"Direkt aus {source.name} / {qualified_name} / Snapshot "
                    f"{snapshot.sequence} abgeleitet."
                ),
                "entities": [
                    {
                        "name": safe_entity_name,
                        "businessObject": title,
                        "comment": table.comment,
                        "position": 0,
                        "fields": [
                            {
                                "name": column.name,
                                "dataType": column.normalized_data_type,
                                "length": column.character_length,
                                "precision": column.numeric_precision,
                                "decimalPlaces": column.numeric_scale,
                                "nullable": column.nullable,
                                "minCount": 0 if column.nullable else 1,
                                "maxCount": 1,
                                "position": position,
                                "sourceSystem": source.name,
                                "classification": "internal",
                                "comment": column.comment,
                                "conceptMatchExplicitlyNone": True,
                            }
                            for position, column in enumerate(columns)
                        ],
                    }
                ],
            }
        )
        request_body = DerivedLogicalModelRequest.model_validate(
            {
                "logicalModel": logical_body.model_dump(mode="json", by_alias=True),
                "fieldMappings": [
                    {
                        "physicalColumnId": column.id,
                        "entityName": safe_entity_name,
                        "logicalFieldName": column.name,
                    }
                    for column in columns
                ],
            }
        )
        return derive_logical_model(table_id, request_body, response, session, actor)

    @router.get("/asset-mappings", response_model=AssetMappingCollection)
    def list_asset_mappings(
        session: SessionDep,
        actor: ActorDep,
        logical_model_id: Annotated[uuid.UUID | None, Query(alias="logicalModelId")] = None,
        physical_snapshot_id: Annotated[uuid.UUID | None, Query(alias="physicalSnapshotId")] = None,
    ) -> dict[str, Any]:
        _require_any_assignment(session, actor)
        items = []
        statement = select(AssetMapping).where(AssetMapping.lifecycle == "active")
        if logical_model_id is not None:
            statement = statement.where(AssetMapping.logical_model_id == logical_model_id)
        for mapping in session.scalars(statement.order_by(AssetMapping.updated_at.desc())):
            _mapping, version = get_mapping_version(session, mapping.id)
            if (
                physical_snapshot_id is not None
                and version.physical_snapshot_id != physical_snapshot_id
            ):
                continue
            try:
                _require_version_scope(session, actor, session.get(LogicalModelVersion, version.logical_model_version_id))
            except HTTPException as exc:
                if exc.status_code == 403:
                    continue
                raise
            items.append(mapping_payload(session, mapping, version))
        return {"items": items, "total": len(items)}

    @router.post("/asset-mappings", response_model=AssetMappingResponse, status_code=201)
    def post_asset_mapping(
        body: AssetMappingWrite, response: Response, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        _validate_mapping_scope(session, actor, body)
        mapping, version = create_asset_mapping(session, body, actor)
        session.commit()
        response.headers["ETag"] = _etag(version.lock_version)
        return mapping_payload(session, mapping, version)

    @router.get("/asset-mappings/{mapping_id}", response_model=AssetMappingResponse)
    def read_asset_mapping(
        mapping_id: uuid.UUID, response: Response, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        mapping, version = get_mapping_version(session, mapping_id)
        logical_version = session.get(LogicalModelVersion, version.logical_model_version_id)
        _require_version_scope(session, actor, logical_version)
        response.headers["ETag"] = _etag(mapping.revision)
        return mapping_payload(session, mapping, version)

    @router.post("/asset-mappings/{mapping_id}/versions", response_model=AssetMappingResponse, status_code=201)
    def post_mapping_version(
        mapping_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        mapping, source = get_mapping_version(session, mapping_id, lock=True)
        logical_version = session.get(LogicalModelVersion, source.logical_model_version_id)
        _require_version_scope(session, actor, logical_version)
        _require_etag(if_match, mapping.revision)
        _validate_mapping_scope(
            session,
            actor,
            mapping_write_from_payload(mapping_payload(session, mapping, source)),
            mapping=mapping,
        )
        version = clone_mapping_version(session, mapping, source, actor)
        session.commit()
        response.headers["ETag"] = _etag(mapping.revision)
        return mapping_payload(session, mapping, version)

    @router.put("/asset-mappings/{mapping_id}/versions/{version_id}", response_model=AssetMappingResponse)
    def put_mapping_version(
        mapping_id: uuid.UUID,
        version_id: uuid.UUID,
        body: AssetMappingWrite,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        mapping, version = get_mapping_version(session, mapping_id, version_id, lock=True)
        logical_version = session.get(LogicalModelVersion, version.logical_model_version_id)
        _require_version_scope(session, actor, logical_version)
        _require_etag(if_match, version.lock_version)
        _validate_mapping_scope(session, actor, body, mapping=mapping)
        if version.revision != mapping.revision:
            raise HTTPException(409, "Only the latest mapping version can be revised")
        successor = create_mapping_successor(
            session,
            mapping,
            version,
            body,
            actor,
            action="draft-revised",
        )
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return mapping_payload(session, mapping, successor)

    @router.post(
        "/asset-mappings/{mapping_id}/versions/{version_id}/validate",
        response_model=AssetMappingResponse,
    )
    def validate_asset_mapping(
        mapping_id: uuid.UUID,
        version_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        mapping, version = get_mapping_version(session, mapping_id, version_id, lock=True)
        logical_version = session.get(LogicalModelVersion, version.logical_model_version_id)
        _require_version_scope(session, actor, logical_version)
        _require_etag(if_match, version.lock_version)
        if version.status not in {"draft", "broken", "review_pending"}:
            raise HTTPException(
                409,
                "Only a draft, broken or review-pending mapping can be validated",
            )
        validation = validate_mapping_version(session, version)
        if version.revision != mapping.revision:
            raise HTTPException(409, "Only the latest mapping version can be validated")
        body = mapping_write_from_payload(mapping_payload(session, mapping, version))
        _validate_mapping_scope(session, actor, body, mapping=mapping)
        target_status = "validated" if validation.valid else version.status
        successor = create_mapping_successor(
            session,
            mapping,
            version,
            body,
            actor,
            status=target_status,
            validation_result=validation.model_dump(mode="json", by_alias=True),
            action="validated" if validation.valid else "validation-failed",
            audit_details={"valid": validation.valid},
        )
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return mapping_payload(session, mapping, successor)

    @router.post(
        "/asset-mappings/{mapping_id}/versions/{version_id}/submit",
        response_model=AssetMappingResponse,
    )
    def submit_asset_mapping(
        mapping_id: uuid.UUID,
        version_id: uuid.UUID,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> dict[str, Any]:
        mapping, version = get_mapping_version(session, mapping_id, version_id, lock=True)
        logical_version = session.get(LogicalModelVersion, version.logical_model_version_id)
        _require_version_scope(session, actor, logical_version)
        _require_etag(if_match, version.lock_version)
        if version.status not in {"draft", "broken"}:
            raise HTTPException(409, "Only a draft or broken mapping can be submitted")
        if version.revision != mapping.revision:
            raise HTTPException(409, "Only the latest mapping version can be submitted")
        body = mapping_write_from_payload(mapping_payload(session, mapping, version))
        _validate_mapping_scope(session, actor, body, mapping=mapping)
        successor = create_mapping_successor(
            session,
            mapping,
            version,
            body,
            actor,
            status="review_pending",
            validation_result=version.validation_result,
            action="submitted",
        )
        session.commit()
        response.headers["ETag"] = _etag(successor.lock_version)
        return mapping_payload(session, mapping, successor)

    @router.get("/i14y/concepts", response_model=I14yConceptCollection, tags=["I14Y concepts"])
    def list_i14y_concepts(
        session: SessionDep,
        actor: ActorDep,
        q: str | None = None,
        concept_type: Annotated[str | None, Query(alias="conceptType")] = None,
        publisher: str | None = None,
        status: str | None = None,
        language: str | None = None,
        theme: str | None = None,
    ) -> dict[str, Any]:
        _require_any_assignment(session, actor)
        statement = select(I14yConcept)
        if concept_type:
            statement = statement.where(I14yConcept.concept_type == concept_type)
        if publisher:
            statement = statement.where(I14yConcept.publisher_identifier == publisher)
        if status:
            statement = statement.where(I14yConcept.registration_status == status)
        rows = list(session.scalars(statement.order_by(I14yConcept.fetched_at.desc())))
        if language:
            rows = [
                row
                for row in rows
                if language in row.name or language in row.description
            ]
        if theme:
            theme_query = theme.casefold()
            rows = [
                row
                for row in rows
                if theme_query in str(row.themes).casefold()
            ]
        if q:
            query = q.casefold()
            rows = [
                row
                for row in rows
                if query
                in " ".join([*row.identifiers, *row.name.values(), *row.description.values()]).casefold()
            ]
        return {"items": [_concept_response(row) for row in rows], "total": len(rows)}

    @router.get("/i14y/concepts/remote-search", tags=["I14Y concepts"])
    async def remote_search_i14y_concepts(
        request: Request,
        session: SessionDep,
        actor: ActorDep,
        q: Annotated[str, Query(min_length=1, max_length=300)],
        page: Annotated[int, Query(ge=1, le=1000)] = 1,
        page_size: Annotated[int, Query(alias="pageSize", ge=1, le=100)] = 25,
    ) -> dict[str, Any]:
        _require_any_assignment(session, actor)
        result = await request.app.state.i14y_client.search(
            resource_type="Concept",
            page=page,
            page_size=page_size,
            search=q,
        )
        return {
            "items": result.items,
            "total": result.pagination.total_rows
            if result.pagination.total_rows is not None
            else len(result.items),
            "page": result.pagination.page or page,
            "pageSize": result.pagination.page_size or page_size,
        }

    @router.get("/i14y/concepts/{concept_id}", response_model=I14yConceptResponse, tags=["I14Y concepts"])
    def read_i14y_concept(concept_id: uuid.UUID, session: SessionDep, actor: ActorDep) -> dict[str, Any]:
        _require_any_assignment(session, actor)
        row = session.get(I14yConcept, concept_id)
        if row is None:
            raise HTTPException(404, "I14Y concept is not cached")
        return _concept_response(row)

    @router.get(
        "/i14y/concepts/{concept_id}/code-list-entries",
        response_model=list[I14yCodeListEntryResponse],
        tags=["I14Y concepts"],
    )
    def list_code_list_entries(
        concept_id: uuid.UUID, session: SessionDep, actor: ActorDep
    ) -> list[I14yCodeListEntry]:
        _require_any_assignment(session, actor)
        return list(
            session.scalars(
                select(I14yCodeListEntry)
                .where(I14yCodeListEntry.concept_id == concept_id)
                .order_by(I14yCodeListEntry.position, I14yCodeListEntry.code)
            )
        )

    @router.get("/i14y/sync-status", response_model=I14ySyncStatusResponse, tags=["I14Y concepts"])
    def get_i14y_sync_status(session: SessionDep, actor: ActorDep, request: Request) -> dict[str, Any]:
        _require_any_assignment(session, actor)
        last = session.scalar(select(I14ySyncRun).order_by(I14ySyncRun.started_at.desc()).limit(1))
        successful = session.scalar(
            select(I14ySyncRun)
            .where(I14ySyncRun.status == "succeeded")
            .order_by(I14ySyncRun.completed_at.desc())
            .limit(1)
        )
        count = session.scalar(select(func.count()).select_from(I14yConcept)) or 0
        source_url = getattr(request.app.state.i14y_client, "base_url", "https://api.i14y.admin.ch/api/public/v1/")
        return {
            "sourceUrl": source_url,
            "status": last.status if last else "never",
            "lastSuccessfulAt": successful.completed_at if successful else None,
            "conceptCount": count,
            "lastRun": last,
        }

    @router.post("/i14y/concepts/sync", response_model=I14ySyncRunResponse, tags=["I14Y concepts"])
    async def sync_i14y_concepts(request: Request, session: SessionDep, actor: ActorDep) -> I14ySyncRun:
        _require_any_assignment(session, actor)
        client = request.app.state.i14y_client
        source_url = getattr(client, "base_url", "https://api.i14y.admin.ch/api/public/v1/")
        run = I14ySyncRun(
            id=uuid.uuid4(),
            status="running",
            source_url=source_url,
            triggered_by_user_id=actor,
            started_at=utc_now(),
        )
        session.add(run)
        session.commit()
        try:
            refresh_contract = getattr(client, "refresh_contract", None)
            if refresh_contract is not None:
                await refresh_contract()
            else:
                ensure_verified = getattr(client, "ensure_verified", None)
                if ensure_verified is not None:
                    await ensure_verified()
            source_url = getattr(
                client,
                "base_url",
                "https://api.i14y.admin.ch/api/public/v1/",
            )
            staged: list[dict[str, Any]] = []
            page_number = 1
            while True:
                page = await client.list_concepts(page=page_number, page_size=100)
                for raw in page.items:
                    # Validate and normalize every page in memory before the cache
                    # transaction begins, so a later page failure cannot expose a
                    # partial full-sync result.
                    concept_to_cache_dict(normalize_concept(raw))
                    staged.append(raw)
                if page.pagination.has_next is False:
                    break
                if page.pagination.has_next is None and len(page.items) < 100:
                    break
                page_number += 1
                if page_number > 1000:
                    raise RuntimeError("I14Y pagination exceeded the safety limit")
            for raw in staged:
                _row, changed = _upsert_concept(
                    session,
                    raw,
                    f"{source_url.rstrip('/')}/concepts/{raw.get('id', '')}",
                    detail_loaded=False,
                )
                run.concepts_seen += 1
                run.concepts_upserted += int(changed)
                run.concepts_unchanged += int(not changed)
            run.source_url = source_url
            run.status = "succeeded"
            run.completed_at = utc_now()
            session.commit()
            return run
        except Exception as exc:
            session.rollback()
            run = session.get(I14ySyncRun, run.id)
            if run is None:
                raise HTTPException(502, "I14Y synchronization failed before status persistence") from exc
            run.status = "failed"
            run.error = str(exc)[:1000]
            run.completed_at = utc_now()
            session.commit()
            raise HTTPException(502, "I14Y concept synchronization failed; inspect sync status") from exc

    @router.post(
        "/i14y/concepts/{concept_id}/refresh",
        response_model=I14yConceptResponse,
        tags=["I14Y concepts"],
    )
    async def refresh_i14y_concept(
        concept_id: uuid.UUID, request: Request, session: SessionDep, actor: ActorDep
    ) -> dict[str, Any]:
        _require_any_assignment(session, actor)
        raw = await request.app.state.i14y_client.get_concept(str(concept_id))
        source_url = f"{request.app.state.i14y_client.base_url.rstrip('/')}/concepts/{concept_id}"
        row, _changed = _upsert_concept(session, raw, source_url, detail_loaded=True)
        session.commit()
        return _concept_response(row)

    @router.post(
        "/i14y/concepts/{concept_id}/code-list-entries/sync",
        response_model=list[I14yCodeListEntryResponse],
        tags=["I14Y concepts"],
    )
    async def sync_code_list_entries(
        concept_id: uuid.UUID, request: Request, session: SessionDep, actor: ActorDep
    ) -> list[I14yCodeListEntry]:
        _require_any_assignment(session, actor)
        concept = session.get(I14yConcept, concept_id)
        if concept is None or concept.concept_type != "CodeList":
            raise HTTPException(422, "Code-list entries can only be synchronized for CodeList concepts")
        export = await request.app.state.i14y_client.get_code_list_entries(str(concept_id), format="Json")
        entries = normalize_code_list_export(export)
        session.query(I14yCodeListEntry).filter(I14yCodeListEntry.concept_id == concept_id).delete()
        for position, normalized in enumerate(entries):
            item = code_list_entry_to_cache_dict(normalized)
            external_id = item["external_id"]
            try:
                entry_id = uuid.UUID(str(external_id)) if external_id else uuid.uuid5(concept_id, item["code"])
            except ValueError:
                entry_id = uuid.uuid5(concept_id, str(external_id))
            session.add(
                I14yCodeListEntry(
                    id=entry_id,
                    concept_id=concept_id,
                    code=item["code"],
                    parent_code=item["parent_code"],
                    name=item["name"],
                    description=item["description"],
                    annotations=item["annotations"],
                    position=position,
                    valid_from=_parse_date(item["valid_from"]),
                    valid_to=_parse_date(item["valid_to"]),
                    payload_hash=item["payload_hash"],
                    raw_payload=item["raw_payload"],
                    fetched_at=utc_now(),
                )
            )
        session.commit()
        return list(
            session.scalars(
                select(I14yCodeListEntry)
                .where(I14yCodeListEntry.concept_id == concept_id)
                .order_by(I14yCodeListEntry.position)
            )
        )

    return router
