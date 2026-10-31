"""Shared presentation never changes glossary approval or catalog access policies."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException
from pydantic import Field
from sqlalchemy import func, select

from .mapping_canvas import CanvasPosition
from .modeling_api import ActorDep, SessionDep, _assignments
from .modeling_schemas import ApiModel
from .modeling_service import record_audit, utc_now
from .models import (
    CatalogObjectResponsibility,
    DataProductDomain,
    DemoUser,
    Domain,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermRelation,
    SemanticGraphState,
)
from .object_governance import active_actor, governs_domain, governs_term
from .semantic_organization import can_edit_organization_layout, organization_objects


def governs_network_domain(session, actor, domain):
    from .domain_network import domain_scope
    return bool(domain and governs_domain(session, actor, domain)
                and not domain_scope(session, domain, actor)["foreignDepartment"])


class DomainLink(ApiModel):
    source_id: uuid.UUID
    target_id: uuid.UUID
    relation_type: Literal["related", "partOf", "interfacesWith", "overlapsWith"]


class SemanticGraphWrite(ApiModel):
    revision: int = Field(ge=0)
    positions: dict[Annotated[str, Field(min_length=1, max_length=1500)], CanvasPosition] = Field(default_factory=dict, max_length=2000)
    relations: list[DomainLink] | None = Field(default=None, max_length=2000)
    hidden_node_ids: list[str] | None = Field(default=None, max_length=2000)
    additional_node_ids: list[str] | None = Field(default=None, max_length=2000)


class SemanticGraphResponse(ApiModel):
    organization_name: str | None = None
    scope_domain_ids: list[uuid.UUID] = Field(default_factory=list)
    scope_term_ids: list[uuid.UUID] = Field(default_factory=list)
    revision: int
    positions: dict[str, CanvasPosition]
    relations: list[DomainLink]
    can_edit_layout: bool
    can_edit_relations: bool
    hidden_node_ids: list[str]
    additional_node_ids: list[str]
    deletable_node_ids: list[str]
    retired_node_ids: list[str]
    can_create_domains: bool
    relation_source_node_ids: list[str]


def graph_context(session, actor, domain_id, organization_id=None):
    if organization_id:
        organization, domains, terms = organization_objects(session, organization_id)
        return f"organizations:{organization_id}", can_edit_organization_layout(session, actor, organization, domains, terms), False
    user = session.get(DemoUser, actor)
    owned = any(governs_network_domain(session, actor, domain) for domain in session.scalars(select(Domain)))
    domain = session.get(Domain, domain_id) if domain_id else None
    if domain_id and domain is None:
        raise HTTPException(404, "Domain not found")
    explicit = session.scalar(select(CatalogObjectResponsibility.id).where(CatalogObjectResponsibility.user_id == actor, CatalogObjectResponsibility.active.is_(True)).limit(1)) is not None
    can_layout = explicit or owned or bool({"data_owner", "data_steward"}.intersection(user.roles or [])) or any(
        assignment.role in {"data_owner", "data_steward"} for assignment in _assignments(session, actor)
    ) or bool(domain and actor in {domain.owner_user_id, domain.deputy_owner_user_id})
    if domain and domain.lifecycle != "active":
        can_layout = False
    return f"concepts:{domain_id}" if domain_id else "domains", can_layout, owned


def known_nodes(session, domain_id, additional=(), organization_id=None):
    if organization_id:
        _, domains, terms = organization_objects(session, organization_id)
        return {*(f"domain:{identity}" for identity in domains), *(f"term:{identity}" for identity in terms), *additional}
    if domain_id is None:
        return {f"domain:{identity}" for identity in session.scalars(select(Domain.id))}
    term_ids = set(session.scalars(select(GlossaryTermDomain.term_id).where(GlossaryTermDomain.domain_id == domain_id)))
    term_ids.update(uuid.UUID(key.removeprefix("term:")) for key in additional if key.startswith("term:"))
    nodes = {f"domain:{domain_id}", *(f"term:{identity}" for identity in term_ids)}
    graph = session.get(SemanticGraphState, "domains")
    if graph:
        active_domains = {str(identity) for identity in session.scalars(select(Domain.id).where(Domain.lifecycle == "active"))}
        for link in graph.relations:
            if str(domain_id) in {link["sourceId"], link["targetId"]} and {link["sourceId"], link["targetId"]} <= active_domains:
                nodes.update({f'domain:{link["sourceId"]}', f'domain:{link["targetId"]}'})
    nodes.update(additional)
    nodes.update(f"product:{identity}" for identity in session.scalars(select(DataProductDomain.data_product_id).where(DataProductDomain.domain_id == domain_id)))
    for relation in session.scalars(select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id.in_(term_ids))):
        nodes.add(f"term:{relation.target_term_id}" if relation.target_term_id else f"uri:{relation.target_uri}")
    return nodes


def validate_relations(session, links, previous=()):
    domains = {str(row.id): row for row in session.scalars(select(Domain).order_by(Domain.id).with_for_update().execution_options(populate_existing=True))}
    pairs = set()
    hierarchy: dict[str, list[str]] = {}
    for link in links:
        source, target = str(link.source_id), str(link.target_id)
        if source == target:
            raise HTTPException(422, "Eine Domäne kann nicht mit sich selbst verbunden werden.")
        unchanged = link.model_dump(mode="json", by_alias=True) in previous
        if any(identity not in domains or (domains[identity].lifecycle != "active" and not unchanged) for identity in (source, target)):
            raise HTTPException(422, "Beziehungen benötigen zwei aktive Domänen.")
        pair = tuple(sorted((source, target)))
        if pair in pairs:
            raise HTTPException(422, "Zwischen diesen Domänen besteht bereits eine Beziehung.")
        pairs.add(pair)
        if link.relation_type == "partOf":
            hierarchy.setdefault(source, []).append(target)
    indegrees = dict.fromkeys({*hierarchy, *(target for targets in hierarchy.values() for target in targets)}, 0)
    for targets in hierarchy.values():
        for target in targets:
            indegrees[target] += 1
    ready = [node for node, count in indegrees.items() if count == 0]
    visited = 0
    while ready:
        node = ready.pop()
        visited += 1
        for target in hierarchy.get(node, []):
            indegrees[target] -= 1
            if indegrees[target] == 0:
                ready.append(target)
    if visited != len(indegrees):
        raise HTTPException(422, "Unterdomänen dürfen keinen Kreis bilden.")


def create_semantic_graph_router():
    router = APIRouter(prefix="/api/v1/semantic-graphs", tags=["domains & glossary"])

    def response(session, actor, domain_id, organization_id=None):
        key, can_layout, can_relations = graph_context(session, actor, domain_id, organization_id)
        row = session.get(SemanticGraphState, key)
        additional = row.additional_node_ids if row else []
        nodes = known_nodes(session, domain_id, additional, organization_id)
        retired = {f"term:{identity}" for identity in session.scalars(select(GlossaryTerm.id).where(GlossaryTerm.lifecycle == "retired"))} if domain_id or organization_id else {f"domain:{identity}" for identity in session.scalars(select(Domain.id).where(Domain.lifecycle == "retired"))}
        sources = sorted(f"domain:{domain.id}" for domain in session.scalars(select(Domain)) if governs_network_domain(session, actor, domain))
        if domain_id or organization_id:
            active = {f"term:{identity}" for identity in session.scalars(select(GlossaryTerm.id).where(GlossaryTerm.lifecycle == "active")) if governs_term(session, actor, identity)}
        else:
            active = {f"domain:{domain.id}" for domain in session.scalars(select(Domain).where(Domain.lifecycle == "active")) if governs_domain(session, actor, domain)}
        deletable = sorted(nodes & active)
        organization, scope_domains, scope_terms = organization_objects(session, organization_id) if organization_id else (None, set(), set())
        return {"organizationName": organization.display_name if organization else None, "scopeDomainIds": sorted(scope_domains), "scopeTermIds": sorted(scope_terms),
                "revision": row.revision if row else 0,
                "positions": {key: value for key, value in row.positions.items() if key in nodes} if row else {},
                "relations": row.relations if row else [], "canEditLayout": can_layout,
                "canEditRelations": can_relations and domain_id is None,
                "hiddenNodeIds": [key for key in row.hidden_node_ids if key in nodes] if row else [],
                "additionalNodeIds": additional, "deletableNodeIds": deletable,
                "retiredNodeIds": sorted(nodes & retired),
                "canCreateDomains": active_actor(session, actor),
                "relationSourceNodeIds": sources if domain_id is None else []}

    def save(body, session, actor, domain_id, organization_id=None):
        key, can_layout, can_relations = graph_context(session, actor, domain_id, organization_id)
        if not can_layout:
            raise HTTPException(403, "Zum Speichern des Layouts ist eine fachliche Bearbeitungsrolle erforderlich.")
        # Also serialize a first save, when no row exists yet.
        lock_id = uuid.uuid5(uuid.NAMESPACE_URL, f"daca:semantic-graph:{key}").int % (2**63)
        session.execute(select(func.pg_advisory_xact_lock(lock_id)))
        if domain_id:
            domain = session.scalar(select(Domain).where(Domain.id == domain_id).with_for_update().execution_options(populate_existing=True))
            if domain.lifecycle != "active":
                raise HTTPException(403, "Das Layout einer stillgelegten Domäne kann nicht geändert werden.")
        row = session.get(SemanticGraphState, key)
        if body.revision != (row.revision if row else 0):
            raise HTTPException(409, "Das gemeinsame Netz wurde geändert. Laden Sie die Seite neu; Ihr lokaler Entwurf bleibt erhalten.")
        additional = body.additional_node_ids if body.additional_node_ids is not None else (row.additional_node_ids if row else [])
        if additional and domain_id is None and organization_id is None:
            raise HTTPException(422, "Das Domänennetz erlaubt nur Domänenkarten.")
        previous_additional = row.additional_node_ids if row else []
        for node_key in additional:
            try:
                identity = uuid.UUID(node_key.removeprefix("term:")) if node_key.startswith("term:") else None
            except ValueError:
                identity = None
            term = session.get(GlossaryTerm, identity) if identity else None
            if term is None or node_key != f"term:{identity}" or (term.lifecycle != "active" and node_key not in previous_additional):
                raise HTTPException(422, "Zusätzliche Karten müssen bestehende Begriffe referenzieren.")
        nodes = known_nodes(session, domain_id, additional, organization_id)
        hidden = body.hidden_node_ids if body.hidden_node_ids is not None else (row.hidden_node_ids if row else [])
        if (body.positions.keys() | set(hidden)) - nodes:
            raise HTTPException(422, "Das Layout enthält Karten, die nicht zu diesem Netz gehören.")
        relations = row.relations if row else []
        if body.relations is not None:
            requested = [link.model_dump(mode="json", by_alias=True) for link in body.relations]
            if requested != relations:
                if domain_id or organization_id or not can_relations:
                    raise HTTPException(403, "Domänenbeziehungen benötigen eine Objektverantwortung. Begriffsbeziehungen benötigen die bestehende Freigabe.")
                validate_relations(session, body.relations, relations)
                old = {(link["sourceId"], link["targetId"], link["relationType"]) for link in relations}
                new = {(link["sourceId"], link["targetId"], link["relationType"]) for link in requested}
                if any(not governs_network_domain(session, actor, session.get(Domain, uuid.UUID(source))) for source, _, _ in old ^ new):
                    raise HTTPException(403, "Nur Data Owner oder Stellvertretung der Ausgangsdomäne dürfen diese Beziehung ändern.")
                relations = requested
        previous = row.relations if row else []
        if row is None:
            row = SemanticGraphState(graph_key=key, domain_id=domain_id, revision=0)
            session.add(row)
        row.revision += 1
        row.positions = {key: value.model_dump() for key, value in body.positions.items()}
        row.relations = relations
        row.hidden_node_ids = list(dict.fromkeys(hidden))
        row.additional_node_ids = list(dict.fromkeys(additional))
        row.updated_by_user_id = actor
        row.updated_at = utc_now()
        record_audit(session, "semantic-graph", key, "graph-saved", actor, row.revision,
                     {"nodeCount": len(row.positions), "hiddenNodeIds": row.hidden_node_ids,
                      "additionalNodeIds": row.additional_node_ids, "previousRelations": previous, "relations": relations})
        session.flush()
        result = response(session, actor, domain_id, organization_id)
        session.commit()
        return result

    @router.get("/domains", response_model=SemanticGraphResponse)
    def read_domains(session: SessionDep, actor: ActorDep):
        return response(session, actor, None)

    @router.put("/domains", response_model=SemanticGraphResponse)
    def save_domains(body: SemanticGraphWrite, session: SessionDep, actor: ActorDep):
        return save(body, session, actor, None)

    @router.get("/concepts/{domain_id}", response_model=SemanticGraphResponse)
    def read_concepts(domain_id: uuid.UUID, session: SessionDep, actor: ActorDep):
        return response(session, actor, domain_id)

    @router.put("/concepts/{domain_id}", response_model=SemanticGraphResponse)
    def save_concepts(domain_id: uuid.UUID, body: SemanticGraphWrite, session: SessionDep, actor: ActorDep):
        return save(body, session, actor, domain_id)

    @router.get("/organizations/{organization_id}", response_model=SemanticGraphResponse)
    def read_organization(organization_id: str, session: SessionDep, actor: ActorDep):
        return response(session, actor, None, organization_id)

    @router.put("/organizations/{organization_id}", response_model=SemanticGraphResponse)
    def save_organization(organization_id: str, body: SemanticGraphWrite, session: SessionDep, actor: ActorDep):
        return save(body, session, actor, None, organization_id)

    return router
