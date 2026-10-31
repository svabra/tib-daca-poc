"""Cross-department discovery with private presentation and existing object access checks."""

from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .database import get_session
from .domain_ownership import domain_organization_ids, person_organization_ids
from .lineage_access import access_actor
from .mapping_canvas import CanvasPosition
from .modeling_service import record_audit
from .models import (
    AdministrativeOrganization,
    DataProduct,
    DataProductDomain,
    DcatDatasetVersion,
    DcatDatasetVersionLocalization,
    DemoUser,
    Domain,
    DomainNetworkView,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    LogicalModel,
    LogicalModelVersion,
    PhysicalDatabase,
    PhysicalDomainAssignment,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
    utc_now,
)
from .schemas import ApiModel

SessionDep = Annotated[Session, Depends(get_session)]
ActorDep = Annotated[str, Depends(access_actor)]
ObjectKind = Literal["product", "term", "logical", "physical"]


def department_codes(session, user_id):
    return {
        organization.department_code
        for identity in person_organization_ids(session, user_id)
        if (organization := session.get(AdministrativeOrganization, identity))
        and organization.active
    }


def domain_scope(session, domain, actor=None):
    departments, offices = set(), set()
    for identity in domain_organization_ids(session, domain):
        organization = session.get(AdministrativeOrganization, identity)
        if organization is None or not organization.active:
            continue
        departments.add(organization.department_code)
        visited = set()
        while organization and organization.id not in visited:
            visited.add(organization.id)
            if organization.organization_type == "office":
                if organization.office_code:
                    offices.add(organization.office_code)
                break
            organization = (
                session.get(AdministrativeOrganization, organization.parent_id)
                if organization.parent_id
                else None
            )
    own = department_codes(session, actor) if actor else set()
    return {
        "departmentCodes": sorted(departments),
        "officeCodes": sorted(offices),
        "foreignDepartment": bool(own and departments and not own.intersection(departments)),
    }


class NetworkConfiguration(ApiModel):
    model_config = ConfigDict(extra="forbid")
    schema_version: Literal[1] = 1
    added_domain_ids: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    hidden_domain_ids: list[uuid.UUID] = Field(default_factory=list, max_length=2000)
    positions: dict[str, CanvasPosition] = Field(default_factory=dict, max_length=2000)
    visible_kinds: list[ObjectKind] = Field(default_factory=lambda: ["product"], max_length=4)


class NetworkViewWrite(ApiModel):
    model_config = ConfigDict(extra="forbid")
    revision: int = Field(ge=0)
    configuration: NetworkConfiguration


def view_response(row):
    return {
        "revision": row.revision if row else 0,
        "configuration": NetworkConfiguration.model_validate(
            row.configuration if row else {}
        ).model_dump(mode="json", by_alias=True),
    }


def network_objects(session: Session, actor: str, domain_ids: list[uuid.UUID]):
    from .governance import can_view_private_product
    from .modeling_api import _assignments
    from .modeling_service import snapshot_summary
    from .physical_source_access import returned_source_ids

    selected = set(domain_ids)
    nodes = {}
    people = {
        user.id: user.display_name
        for user in session.scalars(select(DemoUser).where(DemoUser.active.is_(True)))
    }

    def add(kind, identity, domain_id, label, description, owner, urn, route, params=None):
        key = f"{kind}:{identity}"
        if key not in nodes:
            nodes[key] = {
                "key": key,
                "id": str(identity),
                "kind": kind,
                "label": label,
                "description": description or "",
                "ownerName": people.get(owner, owner or "Nicht erfasst"),
                "urn": urn,
                "route": route,
                "params": params or {},
                "domainIds": [],
            }
        if str(domain_id) not in nodes[key]["domainIds"]:
            nodes[key]["domainIds"].append(str(domain_id))

    for product, link in session.execute(
        select(DataProduct, DataProductDomain)
        .join(DataProductDomain)
        .where(DataProductDomain.domain_id.in_(selected), DataProduct.lifecycle != "retired")
    ):
        if can_view_private_product(session, product, actor):
            add(
                "product",
                product.id,
                link.domain_id,
                product.title,
                product.description,
                product.owner_user_id,
                product.urn,
                ["/products", str(product.id), "overview"],
            )
    from .object_governance import term_owner_pair

    for term, link, label in session.execute(
        select(GlossaryTerm, GlossaryTermDomain, GlossaryTermLocalization)
        .join(GlossaryTermDomain, GlossaryTermDomain.term_id == GlossaryTerm.id)
        .join(GlossaryTermLocalization, GlossaryTermLocalization.term_id == GlossaryTerm.id)
        .where(
            GlossaryTermDomain.domain_id.in_(selected),
            GlossaryTerm.lifecycle == "active",
            GlossaryTermLocalization.language == "de",
        )
    ):
        owner, _ = term_owner_pair(session, term.id)
        add(
            "term",
            term.id,
            link.domain_id,
            label.preferred_label,
            label.definition,
            owner,
            term.urn,
            ["/domains/terminology"],
            {"termId": str(term.id), "q": label.preferred_label},
        )
    for model, version, dataset, label in session.execute(
        select(
            LogicalModel, LogicalModelVersion, DcatDatasetVersion, DcatDatasetVersionLocalization
        )
        .join(
            LogicalModelVersion,
            (LogicalModelVersion.logical_model_id == LogicalModel.id)
            & (LogicalModelVersion.revision == LogicalModel.revision),
        )
        .join(DcatDatasetVersion, DcatDatasetVersion.id == LogicalModelVersion.dataset_version_id)
        .join(
            DcatDatasetVersionLocalization,
            DcatDatasetVersionLocalization.dataset_version_id == DcatDatasetVersion.id,
        )
        .where(
            DcatDatasetVersion.data_domain_id.in_(selected),
            LogicalModel.lifecycle == "active",
            DcatDatasetVersionLocalization.language == "de",
        )
    ):
        add(
            "logical",
            model.id,
            dataset.data_domain_id,
            label.title,
            label.description,
            dataset.data_owner_user_id,
            model.urn,
            ["/models", str(model.id)],
        )
    scopes = {(role.department_code, role.organization_id) for role in _assignments(session, actor)}
    returned = returned_source_ids(session, actor)
    for source in session.scalars(
        select(PhysicalSource).where(PhysicalSource.lifecycle == "active")
    ):
        if source.id in returned or (source.department_code, source.organization_id) not in scopes:
            continue
        snapshot = session.scalar(
            select(PhysicalSchemaSnapshot)
            .where(PhysicalSchemaSnapshot.source_id == source.id)
            .order_by(PhysicalSchemaSnapshot.sequence.desc())
            .limit(1)
        )
        if snapshot is None:
            continue
        source_owner = snapshot_summary(session, snapshot, source=source)["dataOwnerName"]
        for table, schema, database, assignment in session.execute(
            select(PhysicalTable, PhysicalSchema, PhysicalDatabase, PhysicalDomainAssignment)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .join(
                PhysicalDomainAssignment,
                (PhysicalDomainAssignment.physical_source_id == source.id)
                & (PhysicalDomainAssignment.physical_table_key == PhysicalTable.stable_key),
            )
            .where(
                PhysicalDatabase.snapshot_id == snapshot.id,
                PhysicalDomainAssignment.domain_id.in_(selected),
            )
        ):
            label = table.storage_location or f"{database.name}.{schema.name}.{table.name}"
            category = (
                "Physische Deklaration"
                if source.adapter_type == "csv"
                else "Physische Repräsentation"
            )
            add(
                "physical",
                table.id,
                assignment.domain_id,
                label,
                f"{category} · {source.name}",
                source_owner or source.created_by_user_id,
                table.urn,
                ["/physical-models", str(source.id)],
                {"snapshotId": str(snapshot.id), "tableId": str(table.id)},
            )
            nodes[f"physical:{table.id}"]["structureKind"] = table.kind
    values = sorted(
        nodes.values(), key=lambda node: (node["kind"], node["label"].casefold(), node["key"])
    )
    return {"items": values[:2000], "truncated": len(values) > 2000}


def create_domain_network_router():
    router = APIRouter(prefix="/api/v1/domain-network", tags=["domains & glossary"])

    @router.get("/view")
    def read_view(session: SessionDep, actor: ActorDep, response: Response):
        response.headers["Cache-Control"] = "no-store"
        return view_response(session.get(DomainNetworkView, actor))

    @router.put("/view")
    def save_view(body: NetworkViewWrite, session: SessionDep, actor: ActorDep):
        session.execute(
            select(
                func.pg_advisory_xact_lock(
                    uuid.uuid5(uuid.NAMESPACE_URL, f"domain-view:{actor}").int % 2**63
                )
            )
        )
        row = session.get(DomainNetworkView, actor)
        if body.revision != (row.revision if row else 0):
            raise HTTPException(409, "Your domain-network view changed; reload before saving")
        known = {str(identity) for identity in session.scalars(select(Domain.id))}
        config = body.configuration
        if {
            str(identity) for identity in [*config.added_domain_ids, *config.hidden_domain_ids]
        } - known:
            raise HTTPException(422, "The view must reference existing domains")
        if any(not key.startswith("domain:") or key[7:] not in known for key in config.positions):
            raise HTTPException(422, "Only existing domain positions may be saved")
        if len(set(config.visible_kinds)) != len(config.visible_kinds):
            raise HTTPException(422, "Object types must be unique")
        if row is None:
            row = DomainNetworkView(user_id=actor, revision=0, configuration={})
            session.add(row)
        row.revision += 1
        row.configuration = config.model_dump(mode="json", by_alias=True)
        row.updated_at = utc_now()
        record_audit(
            session,
            "domain-network-view",
            actor,
            "view-saved",
            actor,
            row.revision,
            {"addedDomainCount": len(config.added_domain_ids)},
        )
        session.flush()
        result = view_response(row)
        session.commit()
        return result

    @router.get("/objects")
    def read_objects(
        session: SessionDep,
        actor: ActorDep,
        response: Response,
        domain_id: Annotated[list[uuid.UUID], Query(max_length=200)],
    ):
        response.headers["Cache-Control"] = "no-store"
        return network_objects(session, actor, domain_id)

    return router
