"""Read-only organization explorer, derived from trusted catalog/directory metadata."""

from __future__ import annotations

import hashlib
from collections import defaultdict
from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_session
from .domain_ownership import domain_organization_ids
from .governance import can_view_private_product
from .lineage_access import access_actor
from .models import (
    DataProduct,
    DataProductDomain,
    Domain,
    DomainLocalization,
    IdentityDirectoryEntry,
    LineageEdge,
)
from .organization_display import OrganizationDisplay
from .organization_localization import localize_organization_nodes
from .organization_policy_relations import policy_recipient_organizations


def organization_network(session: Session, actor: str) -> dict:
    from .models import GlossaryTerm
    from .semantic_read import semantic_read

    domains = list(session.scalars(select(Domain).where(Domain.lifecycle == "active")))
    terms = list(session.scalars(select(GlossaryTerm).where(GlossaryTerm.lifecycle == "active")))
    with semantic_read(session, domains=domains, terms=terms, actor=actor):
        return _organization_network(session, actor)


def _organization_network(session: Session, actor: str) -> dict:
    directory = OrganizationDisplay(session)
    nodes = {}
    departments = {
        row.department_code: row.id for row in directory.organizations.values()
        if row.active and row.organization_type in {"department", "chancellery"}
    }

    def node(identity, parent, code, label, kind, description="", registry=True):
        nodes[identity] = {
            "id": identity, "parentId": parent, "code": code, "label": label,
            "kind": kind, "description": description or label, "registry": registry,
            "productCount": 0, "directProductCount": 0, "domainIds": [],
            "consumedProductCount": 0, "directConsumedProductCount": 0,
        }

    for org in sorted(directory.organizations.values(), key=lambda row: (row.department_order, row.office_order, row.id)):
        if not org.active or org.organization_type == "federal_council":
            continue
        parent = org.parent_id if org.parent_id in directory.organizations and directory.organizations[org.parent_id].organization_type != "federal_council" else None
        if parent is None and org.organization_type in {"office", "affiliated"}:
            # Legacy registry rows predate parent_id but retain a trusted department code.
            parent = departments.get(org.department_code)
        node(org.id, parent, org.office_code or org.department_code, org.display_name, org.organization_type)
    for identity, code, label in (
        ("context:cantons", "Kantone", "Kantone"),
        ("context:banks", "Kantonalbanken", "Kantonalbanken"),
        ("context:public", "Weitere", "Weitere öffentliche Organisationen"),
    ):
        node(identity, None, code, label, "group", "Kontextgruppe; Einträge stammen aus dem Katalogverzeichnis. Keine Aussage über Beteiligungsquoten.", False)

    external_people = {}
    external_names = {}
    for entry in session.scalars(select(IdentityDirectoryEntry).where(IdentityDirectoryEntry.active.is_(True))):
        if entry.source == "federal":
            continue
        name = entry.organization
        identity = "external:" + hashlib.sha256(name.casefold().encode()).hexdigest()[:16]
        parent = "context:cantons" if entry.source in {"cantonal", "municipal"} else "context:public"
        if "kantonalbank" in name.casefold():
            parent = "context:banks"
        code = "SBB" if "sbb" in name.casefold() else "Post" if "schweizerische post" in name.casefold() else name.removeprefix("Kanton ")
        if identity not in nodes:
            node(identity, parent, code, name, entry.source, registry=False)
        external_people[entry.id] = identity
        external_names[name.casefold()] = identity

    def person_org(user_id):
        if user_id in directory.membership_users:
            identity = directory.primary.get(user_id)
        else:
            identity = directory.directory.get(user_id) or external_people.get(user_id)
        return identity if identity in nodes else None

    def ancestors(identity):
        seen = set()
        while identity in nodes and identity not in seen:
            seen.add(identity)
            yield identity
            identity = nodes[identity]["parentId"]

    products = {
        product.urn: product
        for product in session.scalars(select(DataProduct).where(DataProduct.lifecycle == "active"))
        if can_view_private_product(session, product, actor)
    }
    product_orgs = {}
    for urn, product in products.items():
        identity = person_org(product.owner_user_id)
        if identity is None:
            identity = external_names.get(product.owner.casefold())
        if identity is None:
            continue
        product_orgs[urn] = identity
        nodes[identity]["directProductCount"] += 1
        for parent in ancestors(identity):
            nodes[parent]["productCount"] += 1

    domain_nodes = []
    product_domains = defaultdict(set)
    ids = {p.id for p in products.values()}
    if ids:
        for link in session.scalars(select(DataProductDomain).where(DataProductDomain.data_product_id.in_(ids))):
            product_domains[link.domain_id].add(link.data_product_id)
    for domain, label in session.execute(select(Domain, DomainLocalization).join(DomainLocalization).where(Domain.lifecycle == "active", DomainLocalization.language == "de")):
        organizations = set()
        for identity in domain_organization_ids(session, domain):
            organizations.update(ancestors(identity))
        for identity in organizations:
            nodes[identity]["domainIds"].append(str(domain.id))
        domain_nodes.append({"id": str(domain.id), "label": label.preferred_label, "description": label.definition, "organizationIds": sorted(organizations), "productCount": len(product_domains[domain.id])})

    # Offering is ownership; consumption is a directed catalog relationship.
    # Sets prevent multiple people, grants or downstream products from counting
    # the same source product more than once within an organizational subtree.
    consumed_products = defaultdict(set)
    direct_consumed_products = defaultdict(set)

    def consume(target, urn):
        direct_consumed_products[target].add(urn)
        for parent in ancestors(target):
            consumed_products[parent].add(urn)

    relations = defaultdict(lambda: {"count": 0, "inferred": False, "evidence": []})
    relation_products = defaultdict(set)
    for urn, product in products.items():
        source = product_orgs.get(urn)
        if not source:
            continue
        usage = (product.extra_metadata or {}).get("catalogUsage", {})
        if not isinstance(usage, dict):
            usage = {}
        targets = defaultdict(set)
        for key in ("consumerUserIds", "sharedWithUserIds"):
            values = usage.get(key, [])
            if isinstance(values, list):
                for value in values:
                    if isinstance(value, str) and (target := person_org(value)):
                        targets[target].add("catalog")
        for target in policy_recipient_organizations(session, product, person_org):
            targets[target].add("published-policy")
        for target, evidence in targets.items():
            consume(target, urn)
            if target == source:
                continue
            relation = relations[(source, target)]
            relation_products[(source, target)].add(urn)
            relation["evidence"] = sorted(set(relation["evidence"]) | evidence)
    for edge in session.scalars(select(LineageEdge).where(LineageEdge.state.in_(("active", "inferred")))):
        source, target = product_orgs.get(edge.source_urn), product_orgs.get(edge.target_urn)
        # Never resolve hidden/unknown products by parsing a caller-controlled URN.
        if not source or not target:
            continue
        if edge.state == "active":
            consume(target, edge.source_urn)
        if source == target:
            continue
        key = (source, target)
        relation_products[key].add(edge.source_urn)
        relations[key]["inferred"] |= edge.state == "inferred"
        if "lineage" not in relations[key]["evidence"]:
            relations[key]["evidence"].append("lineage")
    for key, relation in relations.items():
        # A product contributes one point even with multiple people, policies,
        # or downstream lineage products in the same consumer organization.
        relation["count"] = len(relation_products[key])
    for identity, n in nodes.items():
        n["consumedProductCount"] = len(consumed_products[identity])
        n["directConsumedProductCount"] = len(direct_consumed_products[identity])
    own = person_org(actor)
    home = next((identity for identity in ancestors(own) if nodes[identity]["kind"] in {"department", "chancellery"}), own)
    satellites = [n["id"] for n in nodes.values() if n["parentId"] is None and n["id"] != home]
    for n in nodes.values():
        if n["code"] in {"SBB", "Post", "ETH-Bereich"} and n["id"] not in satellites and n["id"] != home:
            satellites.append(n["id"])
    localize_organization_nodes(session, nodes)
    from .organization_search_scope import attach_search_scopes

    attach_search_scopes(session, actor, nodes, domain_nodes, person_org, ancestors, consumed_products)
    return {
        "homeId": home, "ownOrganizationId": own, "nodes": list(nodes.values()),
        "satelliteIds": satellites, "domains": domain_nodes,
        "relations": [{"sourceId": source, "targetId": target, **value} for (source, target), value in sorted(relations.items())],
    }


def create_organization_network_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1/organization-network", tags=["organization explorer"])
    from .organization_view import create_organization_view_router
    # Mount the independent private-view routes at their absolute API prefix.
    view_router = create_organization_view_router()

    @router.get("")
    def read_network(
        response: Response,
        session: Annotated[Session, Depends(get_session)],
        actor: Annotated[str, Depends(access_actor)],
    ) -> dict:
        response.headers["Cache-Control"] = "no-store"
        return organization_network(session, actor)

    combined = APIRouter()
    combined.include_router(router)
    combined.include_router(view_router)
    return combined
