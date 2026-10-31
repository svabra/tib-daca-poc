"""Private, read-only projection of saved catalog edits, never a browsing history."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import String, and_, cast, func, literal, or_, select, tuple_, union_all
from sqlalchemy.orm import Session

from .database import get_session
from .governance import can_view_private_product
from .lineage_access import access_actor
from .modeling_api import _assignments
from .modeling_seed import VIBDBU_PHYSICAL_SOURCE_ID
from .models import (
    AssetMapping,
    AuditEvent,
    DataProduct,
    DcatDatasetVersionLocalization,
    Domain,
    DomainChangeRequest,
    DomainLocalization,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermProposal,
    LogicalModel,
    LogicalModelVersion,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalSourceAccessState,
)

LIMIT = 3


def _history(actor):
    def events(kind, resource_type, actions, target=None, related=None, target_id=None):
        statement = select(
            literal(kind).label("kind"),
            (cast(target_id, String) if target_id is not None else AuditEvent.resource_id).label("object_id"),
            AuditEvent.occurred_at.label("edited_at"),
        ).where(AuditEvent.actor == actor, AuditEvent.resource_type == resource_type, AuditEvent.action.in_(actions))
        if related is not None:
            statement = statement.join(related, AuditEvent.resource_id == cast(related.id, String))
        if target is not None:
            statement = statement.where(target.is_not(None))
        return statement

    sources = [
        events("product", "data-product", {"created", "metadata-updated", "endpoint-created", "semantic-mappings-updated", "glossary-term-attached", "quality-reviewed"}),
        events("domain", "domain", {"created", "updated", "create-approved", "update-approved", "ownership-transferred"}),
        events("term", "glossary-term", {"created", "updated", "create-approved", "update-approved"}),
        events("logical", "logical-model", {"created", "version-created", "draft-revised", "submitted", "published", "field-moved-in", "field-moved-out"}),
        events("logical", "asset-mapping", {"created", "version-created", "draft-revised", "validated", "updated"}, related=AssetMapping, target_id=AssetMapping.logical_model_id),
        events("physical", "physical-source", {"created", "updated"}),
        events("physical", "structure-inventory", {"imported", "restored"}),
        events("physical", "physical-schema-snapshot", {"imported"}, related=PhysicalSchemaSnapshot, target_id=PhysicalSchemaSnapshot.source_id),
        events("domain", "domain-change-request", {"submitted", "review-draft-updated"}, related=DomainChangeRequest, target=DomainChangeRequest.target_domain_id, target_id=DomainChangeRequest.target_domain_id),
        events("term", "glossary-term-proposal", {"submitted", "review-draft-updated"}, related=GlossaryTermProposal, target=GlossaryTermProposal.target_term_id, target_id=GlossaryTermProposal.target_term_id),
        # Version authorship also covers saved logical edits predating root audit
        # records. Ownership and general object.updated_at are never substitutes.
        select(literal("logical"), cast(LogicalModelVersion.logical_model_id, String), LogicalModelVersion.created_at).where(LogicalModelVersion.created_by_user_id == actor),
        select(literal("logical"), cast(LogicalModelVersion.logical_model_id, String), LogicalModelVersion.updated_at).where(LogicalModelVersion.updated_by_user_id == actor),
    ]
    history = union_all(*sources).subquery()
    return select(history.c.kind, history.c.object_id, func.max(history.c.edited_at).label("edited_at")).group_by(history.c.kind, history.c.object_id).subquery()


def recent_work(session: Session, actor: str):
    latest = _history(actor)
    categories = {key: [] for key in ("products", "models", "domains", "terms")}

    def item(identity, kind, title, edited_at, route, query=None):
        return {"id": str(identity), "kind": kind, "title": title, "editedAt": edited_at, "route": route, "queryParams": query or {}}

    # Authorize before applying the visible-item cap. A private or removed recent
    # product must neither leak its name nor displace an older accessible item.
    products = select(DataProduct, latest.c.edited_at).join(latest, and_(latest.c.kind == "product", latest.c.object_id == cast(DataProduct.id, String))).where(DataProduct.lifecycle != "retired").order_by(latest.c.edited_at.desc(), DataProduct.id).execution_options(yield_per=16)
    for product, edited in session.execute(products):
        if can_view_private_product(session, product, actor):
            categories["products"].append(item(product.id, "product", {"de": product.title}, edited, f"/products/{product.id}/overview"))
            if len(categories["products"]) == LIMIT:
                break

    logical = select(literal("logical").label("kind"), cast(LogicalModel.id, String).label("id"), latest.c.edited_at).join(latest, and_(latest.c.kind == "logical", latest.c.object_id == cast(LogicalModel.id, String))).where(LogicalModel.lifecycle == "active")
    assignments = _assignments(session, actor)
    model_queries = [logical]
    if assignments:
        scopes = {(row.department_code, row.organization_id) for row in assignments}
        returned = select(PhysicalSourceAccessState.source_id).where(PhysicalSourceAccessState.user_id == actor, PhysicalSourceAccessState.restored_at.is_(None))
        physical = select(literal("physical").label("kind"), cast(PhysicalSource.id, String).label("id"), latest.c.edited_at).join(latest, and_(latest.c.kind == "physical", latest.c.object_id == cast(PhysicalSource.id, String))).where(
            PhysicalSource.lifecycle == "active", PhysicalSource.id.not_in(returned),
            or_(tuple_(PhysicalSource.department_code, PhysicalSource.organization_id).in_(scopes), PhysicalSource.id == VIBDBU_PHYSICAL_SOURCE_ID),
        )
        model_queries.append(physical)
    models = union_all(*model_queries).subquery()
    selected_models = session.execute(select(models).order_by(models.c.edited_at.desc(), models.c.kind, models.c.id).limit(LIMIT)).all()
    logical_ids = [row.id for row in selected_models if row.kind == "logical"]
    physical_ids = [row.id for row in selected_models if row.kind == "physical"]
    logical_titles = {}
    if logical_ids:
        versions = select(LogicalModelVersion.logical_model_id, LogicalModelVersion.dataset_version_id, func.row_number().over(partition_by=LogicalModelVersion.logical_model_id, order_by=LogicalModelVersion.revision.desc()).label("position")).where(cast(LogicalModelVersion.logical_model_id, String).in_(logical_ids)).subquery()
        for identity, language, title in session.execute(select(versions.c.logical_model_id, DcatDatasetVersionLocalization.language, DcatDatasetVersionLocalization.title).join(DcatDatasetVersionLocalization, DcatDatasetVersionLocalization.dataset_version_id == versions.c.dataset_version_id).where(versions.c.position == 1)):
            logical_titles.setdefault(str(identity), {})[language] = title
    physical_titles = {str(source.id): {"de": source.name} for source in session.scalars(select(PhysicalSource).where(cast(PhysicalSource.id, String).in_(physical_ids)))} if physical_ids else {}
    for row in selected_models:
        titles = logical_titles.get(row.id) if row.kind == "logical" else physical_titles.get(row.id)
        if titles:
            categories["models"].append(item(row.id, row.kind, titles, row.edited_at, f"/models/{row.id}" if row.kind == "logical" else f"/physical-models/{row.id}"))

    for category, kind, model, localization, foreign_id in (
        ("domains", "domain", Domain, DomainLocalization, DomainLocalization.domain_id),
        ("terms", "term", GlossaryTerm, GlossaryTermLocalization, GlossaryTermLocalization.term_id),
    ):
        statement = select(model.id, latest.c.edited_at).join(latest, and_(latest.c.kind == kind, latest.c.object_id == cast(model.id, String))).where(model.lifecycle == "active")
        if kind == "term":
            # Match the terminology register: an active term whose domains were
            # all retired is no longer visible there and cannot be a valid link.
            statement = statement.where(select(GlossaryTermDomain.term_id).join(Domain, Domain.id == GlossaryTermDomain.domain_id).where(GlossaryTermDomain.term_id == GlossaryTerm.id, Domain.lifecycle == "active").exists())
        rows = session.execute(statement.order_by(latest.c.edited_at.desc(), model.id).limit(LIMIT)).all()
        titles = {}
        if rows:
            for identity, language, label in session.execute(select(foreign_id, localization.language, localization.preferred_label).where(foreign_id.in_([row.id for row in rows]))):
                titles.setdefault(identity, {})[language] = label
        for row in rows:
            title = titles.get(row.id)
            if title:
                query = {"termId": str(row.id), "ownOffice": "0", "view": "cards"} if kind == "term" else None
                categories[category].append(item(row.id, kind, title, row.edited_at, f"/domains/{row.id}" if kind == "domain" else "/domains/terminology", query))
    return {"categories": [{"id": key, "items": values} for key, values in categories.items()]}


def create_recent_work_router():
    router = APIRouter(prefix="/api/v1/me", tags=["personal work"])

    @router.get("/recent-work")
    def read_recent_work(response: Response, session: Annotated[Session, Depends(get_session)], actor: Annotated[str, Depends(access_actor)]):
        response.headers["Cache-Control"] = "no-store"
        return recent_work(session, actor)

    return router
