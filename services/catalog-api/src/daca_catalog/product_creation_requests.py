"""Commission a new product without granting access to its source data."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal
from urllib.parse import urlencode

from fastapi import APIRouter, Header, HTTPException, Request, Response
from pydantic import Field, field_validator, model_validator
from sqlalchemy import or_, select

from .creation_request_windows import (
    BasisWindowType,
    RollingWindowUnit,
    published_window_matches,
    validate_basis_window,
)
from .modeling_api import ActorDep, SessionDep, _require_etag
from .modeling_service import record_audit
from .models import (
    DataProduct,
    DemoUser,
    MetadataPublication,
    ProductCreationRequest,
    WorkflowTask,
    utc_now,
)
from .schemas import ApiModel, reject_unsafe_service_level_text

CANTONS = frozenset(
    [
        "ZH",
        "BE",
        "LU",
        "UR",
        "SZ",
        "OW",
        "NW",
        "GL",
        "ZG",
        "FR",
        "SO",
        "BS",
        "BL",
        "SH",
        "AR",
        "AI",
        "SG",
        "GR",
        "AG",
        "TG",
        "TI",
        "VD",
        "VS",
        "NE",
        "GE",
        "JU",
    ]
)
UpdateFrequency = Literal["once", "realtime", "hourly", "daily", "weekly", "annually"]


class CreationWrite(ApiModel):
    source_product_ids: list[uuid.UUID] = Field(min_length=1, max_length=8)
    proposed_title: str = Field(min_length=3, max_length=255)
    purpose: str = Field(min_length=10, max_length=2000)
    tax_year: int | None = Field(default=None, ge=1900, le=2100)
    canton_code: str | None = None
    basis_from: date | None = None
    basis_until: date | None = None
    basis_window_type: BasisWindowType = "fixed"
    rolling_window_size: int | None = Field(default=None, ge=1, le=10000, strict=True)
    rolling_window_unit: RollingWindowUnit | None = None
    legal_basis: str | None = Field(default=None, min_length=5, max_length=2000)
    update_frequency: UpdateFrequency | None = None
    formats: list[Literal["xlsx", "parquet", "csv", "http-rest"]] = Field(
        default_factory=lambda: ["xlsx", "parquet", "csv"], min_length=1, max_length=4
    )

    @field_validator("proposed_title", "purpose", "legal_basis")
    @classmethod
    def safe_text(cls, value, info):
        if value is None:
            return None
        value = reject_unsafe_service_level_text(value).strip()
        minimum = {"purpose": 10, "proposed_title": 3, "legal_basis": 5}[info.field_name]
        if len(value) < minimum:
            raise ValueError("Provide a meaningful title and purpose")
        return value

    @field_validator("canton_code")
    @classmethod
    def known_canton(cls, value):
        if value is not None and value not in CANTONS:
            raise ValueError("Use a Swiss canton code, for example SG")
        return value

    @model_validator(mode="after")
    def complete_requirements(self):
        general = any(
            value is not None
            for value in (
                self.basis_from,
                self.basis_until,
                self.legal_basis,
                self.update_frequency,
                self.rolling_window_size,
                self.rolling_window_unit,
            )
        ) or self.basis_window_type == "rolling"
        if general:
            if not all(
                value is not None
                for value in (
                    self.legal_basis,
                    self.update_frequency,
                )
            ):
                raise ValueError(
                    "Provide the data-basis period, legal mandate and update frequency"
                )
            if self.tax_year is not None or self.canton_code is not None:
                raise ValueError(
                    "Use a data-basis period instead of canton/year on a general request"
                )
            validate_basis_window(self.basis_window_type, self.basis_from, self.basis_until,
                                  self.rolling_window_size, self.rolling_window_unit)
            if "formats" not in self.model_fields_set:
                raise ValueError("Select the requested delivery formats")
        elif self.tax_year is None or self.canton_code is None:
            raise ValueError(
                "Provide general requirements; canton/year are only supported for legacy requests"
            )
        if len(set(self.formats)) != len(self.formats):
            raise ValueError("Choose each delivery format once")
        return self


class CreationDecision(ApiModel):
    decision: Literal["accept", "reject"]
    comment: str = Field(default="", max_length=2000)


class CreationFulfillment(ApiModel):
    result_product_id: uuid.UUID


class CreationResponse(ApiModel):
    id: uuid.UUID
    request_number: str
    revision: int
    requester_user_id: str
    requester_name: str
    owner_user_id: str
    owner_name: str
    source_product_ids: list[str]
    source_titles: list[str]
    proposed_title: str
    purpose: str
    tax_year: int | None
    canton_code: str | None
    basis_from: date | None
    basis_until: date | None
    basis_window_type: BasisWindowType
    rolling_window_size: int | None
    rolling_window_unit: RollingWindowUnit | None
    legal_basis: str | None
    update_frequency: UpdateFrequency | None
    formats: list[str]
    status: Literal["submitted", "in_progress", "fulfilled", "rejected"]
    decision_comment: str | None
    result_product_id: uuid.UUID | None
    daaif_notebook_url: str | None
    created_at: datetime
    updated_at: datetime


def response_payload(session, row, request):
    owner = session.get(DemoUser, row.owner_user_id)
    requester = session.get(DemoUser, row.requester_user_id)
    source_titles = [
        product.title
        for value in row.source_product_ids
        if (product := session.get(DataProduct, uuid.UUID(value)))
    ]
    base = request.app.state.settings.daaif_ui_url
    return CreationResponse(
        **{
            field: getattr(row, field)
            for field in (
                "id",
                "request_number",
                "revision",
                "requester_user_id",
                "owner_user_id",
                "source_product_ids",
                "proposed_title",
                "purpose",
                "tax_year",
                "canton_code",
                "basis_from",
                "basis_until",
                "basis_window_type",
                "rolling_window_size",
                "rolling_window_unit",
                "legal_basis",
                "update_frequency",
                "formats",
                "status",
                "decision_comment",
                "result_product_id",
                "created_at",
                "updated_at",
            )
        },
        requester_name=requester.display_name if requester else row.requester_user_id,
        owner_name=owner.display_name if owner else row.owner_user_id,
        source_titles=source_titles,
        daaif_notebook_url=(
            f"{base.rstrip('/')}{'/notebooks/mwst-ertraege-st-gallen-2026' if row.tax_year is not None else '/'}?"
            + urlencode({"demoUser": row.owner_user_id, "creationRequest": str(row.id)})
            if base
            else None
        ),
    )


def _row(session, request_id, actor, *, owner_only=False, lock=False):
    row = session.scalar(
        select(ProductCreationRequest)
        .where(ProductCreationRequest.id == request_id)
        .with_for_update()
        if lock
        else select(ProductCreationRequest).where(ProductCreationRequest.id == request_id)
    )
    if row is None:
        raise HTTPException(404, "Product creation request not found")
    allowed = {row.owner_user_id} if owner_only else {row.owner_user_id, row.requester_user_id}
    if actor not in allowed:
        raise HTTPException(403, "Only the requester and assigned Data Owner may view this request")
    return row


def create_product_creation_router():
    router = APIRouter(prefix="/api/v1/product-creation-requests", tags=["product creation"])

    @router.get("", response_model=list[CreationResponse])
    def list_requests(request: Request, session: SessionDep, actor: ActorDep):
        rows = session.scalars(
            select(ProductCreationRequest)
            .where(
                or_(
                    ProductCreationRequest.requester_user_id == actor,
                    ProductCreationRequest.owner_user_id == actor,
                )
            )
            .order_by(ProductCreationRequest.created_at.desc())
        )
        return [response_payload(session, row, request) for row in rows]

    @router.post("", response_model=CreationResponse, status_code=201)
    def create_request(
        body: CreationWrite,
        request: Request,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ):
        from .main import require_product_view

        products = []
        for product_id in dict.fromkeys(body.source_product_ids):
            product = session.get(DataProduct, product_id)
            if product is None:
                raise HTTPException(404, "Source product not found")
            require_product_view(session, product, actor)
            products.append(product)
        owners = {product.owner_user_id for product in products}
        if len(owners) != 1 or None in owners:
            raise HTTPException(422, "Source products must share one assigned Data Owner")
        owner_id = next(iter(owners))
        owner = session.get(DemoUser, owner_id)
        if not owner or not owner.active or "data_owner" not in owner.roles:
            raise HTTPException(422, "The source needs an active Data Owner")
        row = ProductCreationRequest(
            id=uuid.uuid4(),
            request_number="NEW-" + uuid.uuid4().hex[:12].upper(),
            revision=1,
            requester_user_id=actor,
            owner_user_id=owner_id,
            source_product_ids=[str(product.id) for product in products],
            proposed_title=body.proposed_title,
            purpose=body.purpose,
            tax_year=body.tax_year,
            canton_code=body.canton_code,
            basis_from=body.basis_from,
            basis_until=body.basis_until,
            basis_window_type=body.basis_window_type,
            rolling_window_size=body.rolling_window_size,
            rolling_window_unit=body.rolling_window_unit,
            legal_basis=body.legal_basis,
            update_frequency=body.update_frequency,
            formats=list(dict.fromkeys(body.formats)),
            status="submitted",
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(row)
        session.flush()
        session.add(
            WorkflowTask(
                id=uuid.uuid4(),
                task_type="product_creation_review",
                task_kind="action",
                status="open",
                assignee_user_id=owner_id,
                data_product_id=products[0].id,
                product_creation_request_id=row.id,
                title=f"Neues Datenprodukt: {row.proposed_title}",
                detail=f"{actor} beantragt ein abgeleitetes Datenprodukt. {row.purpose}",
            )
        )
        record_audit(
            session,
            "product-creation-request",
            row.id,
            "submitted",
            actor,
            1,
            {
                "sourceProductIds": row.source_product_ids,
                "cantonCode": row.canton_code,
                "taxYear": row.tax_year,
            },
        )
        session.commit()
        response.headers["ETag"] = '"1"'
        return response_payload(session, row, request)

    @router.get("/{request_id}", response_model=CreationResponse)
    def read_request(
        request_id: uuid.UUID,
        request: Request,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
    ):
        row = _row(session, request_id, actor)
        response.headers["ETag"] = f'"{row.revision}"'
        return response_payload(session, row, request)

    @router.post("/{request_id}/decision", response_model=CreationResponse)
    def decide(
        request_id: uuid.UUID,
        body: CreationDecision,
        request: Request,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header()] = None,
    ):
        row = _row(session, request_id, actor, owner_only=True, lock=True)
        _require_etag(if_match, row.revision)
        if row.status != "submitted":
            raise HTTPException(409, "This request has already been decided")
        if body.decision == "reject" and len(body.comment.strip()) < 3:
            raise HTTPException(422, "A rejection reason is required")
        row.status = "in_progress" if body.decision == "accept" else "rejected"
        row.decision_comment = (
            reject_unsafe_service_level_text(body.comment) if body.comment else None
        )
        row.revision += 1
        row.updated_at = utc_now()
        for task in session.scalars(
            select(WorkflowTask).where(WorkflowTask.product_creation_request_id == row.id)
        ):
            task.status = "in_progress" if row.status == "in_progress" else "completed"
            if task.status == "completed":
                task.completed_at = utc_now()
        if row.status == "rejected":
            session.add(
                WorkflowTask(
                    id=uuid.uuid4(),
                    task_type="product_creation_result",
                    task_kind="information",
                    status="open",
                    assignee_user_id=row.requester_user_id,
                    product_creation_request_id=row.id,
                    title="Erstellungsantrag abgelehnt",
                    detail=row.decision_comment or "",
                )
            )
        record_audit(session, "product-creation-request", row.id, row.status, actor, row.revision)
        session.commit()
        response.headers["ETag"] = f'"{row.revision}"'
        return response_payload(session, row, request)

    @router.post("/{request_id}/fulfillment", response_model=CreationResponse)
    def fulfill(
        request_id: uuid.UUID,
        body: CreationFulfillment,
        request: Request,
        response: Response,
        session: SessionDep,
        actor: ActorDep,
        if_match: Annotated[str | None, Header()] = None,
    ):
        row = _row(session, request_id, actor, owner_only=True, lock=True)
        _require_etag(if_match, row.revision)
        if row.status != "in_progress":
            raise HTTPException(409, "Accept the request before assigning its result")
        product = session.get(DataProduct, body.result_product_id)
        if product is None or product.owner_user_id != actor:
            raise HTTPException(403, "Choose a result owned by the assigned Data Owner")
        publication = session.scalar(
            select(MetadataPublication).where(MetadataPublication.data_product_id == product.id)
        )
        if (
            not publication
            or publication.state != "published"
            or not product.discoverable
            or product.lifecycle != "active"
            or not product.active_policy_revision
        ):
            raise HTTPException(
                409, "Publish and activate the result before completing the request"
            )
        graph = publication.normalized_payload.get("businessMetadata", {}).get("graph", {})
        scope = graph.get("daca:productScope", {})
        legacy = row.tax_year is not None
        matched_scope = (
            scope.get("cantonCode") == row.canton_code and scope.get("taxYear") == row.tax_year
            if legacy
            else published_window_matches(scope, window_type=row.basis_window_type,
                start=row.basis_from, end=row.basis_until,
                size=row.rolling_window_size, unit=row.rolling_window_unit)
        )
        if not matched_scope or scope.get("creationRequestId") != str(row.id):
            raise HTTPException(
                422, "Result scope must match the requested period/scope and request id"
            )
        if not legacy:
            from .models import Endpoint

            available = graph.get("daca:downloadFormats", [])
            if any(value != "http-rest" and value not in available for value in row.formats):
                raise HTTPException(422, "The result must provide all requested file formats")
            if "http-rest" in row.formats and not session.scalar(
                select(Endpoint.id)
                .where(Endpoint.data_product_id == product.id, Endpoint.protocol == "http-rest")
                .limit(1)
            ):
                raise HTTPException(422, "The result needs the requested HTTP REST API endpoint")
        from .service_levels import summary_response

        if summary_response(session, product, actor).source != "published":
            raise HTTPException(
                409, "Publish the product-specific SLA before completing the request"
            )
        from .access_renewals import effective_access_response

        if not effective_access_response(session, product, row.requester_user_id).granted:
            raise HTTPException(
                409, "Activate the requester's access to the result before completing the request"
            )
        row.result_product_id = product.id
        row.status = "fulfilled"
        row.revision += 1
        row.updated_at = utc_now()
        for task in session.scalars(
            select(WorkflowTask).where(WorkflowTask.product_creation_request_id == row.id)
        ):
            task.status = "completed"
            task.completed_at = utc_now()
        session.add(
            WorkflowTask(
                id=uuid.uuid4(),
                task_type="product_creation_result",
                task_kind="information",
                status="open",
                assignee_user_id=row.requester_user_id,
                data_product_id=product.id,
                product_creation_request_id=row.id,
                title=f"Datenprodukt bereit: {product.title}",
                detail="Das beauftragte Datenprodukt ist veröffentlicht und für Sie freigegeben.",
            )
        )
        record_audit(
            session,
            "product-creation-request",
            row.id,
            "fulfilled",
            actor,
            row.revision,
            {"resultProductId": str(product.id)},
        )
        session.commit()
        response.headers["ETag"] = f'"{row.revision}"'
        return response_payload(session, row, request)

    return router
