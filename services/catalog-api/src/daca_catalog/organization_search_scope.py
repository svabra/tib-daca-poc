"""Actor-readable object references for exact expert-search scope filters.

No search state is stored here. The explorer uses nonempty membership for menu
availability; the expert search intersects these references with its readable index.
"""

from collections import defaultdict

from sqlalchemy import func, select

from .domain_ownership import domain_organization_ids
from .governance import can_view_private_product
from .models import (
    CatalogObjectResponsibility,
    DataProduct,
    DataProductDomain,
    DcatDatasetVersion,
    DemoUser,
    Domain,
    GlossaryTerm,
    GlossaryTermDomain,
    LogicalModel,
    LogicalModelVersion,
    PhysicalDatabase,
    PhysicalDomainAssignment,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
)


def attach_search_scopes(session, actor, nodes, domains, person_org, ancestors, consumed_products):
    organizations = defaultdict(set)
    domain_objects = defaultdict(set)
    domain_ids = {item["id"] for item in domains}

    def add(key, organization_ids=(), assigned_domains=()):
        for identity in organization_ids:
            for parent in ancestors(identity):
                organizations[parent].add(key)
        for identity in assigned_domains:
            if str(identity) in domain_ids:
                domain_objects[str(identity)].add(key)

    # Private products are authorized before emitting even their identifiers.
    products = {p.id: p for p in session.scalars(select(DataProduct).where(DataProduct.lifecycle != "retired"))
                if can_view_private_product(session, p, actor)}
    product_domains = defaultdict(set)
    if products:
        for product_id, domain_id in session.execute(select(DataProductDomain.data_product_id, DataProductDomain.domain_id).where(DataProductDomain.data_product_id.in_(products))):
            product_domains[product_id].add(domain_id)
    urn_keys = {}
    for product in products.values():
        key = f"product:{product.id}"
        urn_keys[product.urn] = key
        identity = person_org(product.owner_user_id) or next((identity for identity, node in nodes.items() if node["label"].casefold() == product.owner.casefold()), None)
        add(key, [identity] if identity else [], product_domains[product.id])
    for identity, urns in consumed_products.items():
        organizations[identity].update(urn_keys[urn] for urn in urns if urn in urn_keys)

    for domain in session.scalars(select(Domain).where(Domain.lifecycle == "active")):
        direct = domain_organization_ids(session, domain) & nodes.keys()
        add(f"domain:{domain.id}", direct)
        # Actual assignments, not every ancestor or the domain itself.
        domain_objects[str(domain.id)].update(f"organization:{identity}" for identity in direct)

    # Terms follow explicit object scope, never their classification domain's owner.
    term_domains = defaultdict(set)
    for term_id, domain_id in session.execute(select(GlossaryTermDomain.term_id, GlossaryTermDomain.domain_id).join(Domain, Domain.id == GlossaryTermDomain.domain_id).where(Domain.lifecycle == "active")):
        term_domains[term_id].add(domain_id)
    term_scopes = defaultdict(set)
    term_owners = {}
    for term_id, organization_id, role, user_id in session.execute(select(CatalogObjectResponsibility.glossary_term_id, CatalogObjectResponsibility.organization_id, CatalogObjectResponsibility.role, CatalogObjectResponsibility.user_id).join(DemoUser, DemoUser.id == CatalogObjectResponsibility.user_id).where(
        CatalogObjectResponsibility.active.is_(True), DemoUser.active.is_(True),
        CatalogObjectResponsibility.glossary_term_id.is_not(None),
    )):
        if organization_id:
            term_scopes[term_id].add(organization_id)
        elif role == "data_owner":
            term_owners[term_id] = user_id
    for term in session.scalars(select(GlossaryTerm).where(GlossaryTerm.lifecycle == "active")):
        if term.id in term_domains:
            scoped = term_scopes[term.id]
            if not scoped and (identity := person_org(term_owners.get(term.id))):
                scoped = {identity}
            add(f"term:{term.id}", scoped, term_domains[term.id])

    for model, dataset in session.execute(select(LogicalModel, DcatDatasetVersion).join(LogicalModelVersion, (LogicalModelVersion.logical_model_id == LogicalModel.id) & (LogicalModelVersion.revision == LogicalModel.revision)).join(DcatDatasetVersion, DcatDatasetVersion.id == LogicalModelVersion.dataset_version_id).where(LogicalModel.lifecycle == "active")):
        add(f"logical:{model.id}", [dataset.organization_id], [dataset.data_domain_id])

    # Match the physical-source read endpoint, including inherited office scope,
    # explicit return-of-access and the synthetic VIBDBU demonstration exception.
    from .modeling_api import _assignments, _descendant_ids
    from .modeling_seed import VIBDBU_PHYSICAL_SOURCE_ID
    from .physical_source_access import returned_source_ids

    assignments = _assignments(session, actor)
    scopes = {(role.department_code, identity) for role in assignments for identity in _descendant_ids(session, role.organization_id)}
    returned = returned_source_ids(session, actor)
    sources = {s.id: s for s in session.scalars(select(PhysicalSource).where(PhysicalSource.lifecycle == "active"))
               if assignments and s.id not in returned and ((s.department_code, s.organization_id) in scopes or s.id == VIBDBU_PHYSICAL_SOURCE_ID)}
    if sources:
        latest = select(PhysicalSchemaSnapshot.id, PhysicalSchemaSnapshot.source_id, func.row_number().over(partition_by=PhysicalSchemaSnapshot.source_id, order_by=PhysicalSchemaSnapshot.sequence.desc()).label("position")).where(PhysicalSchemaSnapshot.source_id.in_(sources)).subquery()
        assigned = defaultdict(set)
        for row in session.scalars(select(PhysicalDomainAssignment).where(PhysicalDomainAssignment.physical_source_id.in_(sources))):
            assigned[(row.physical_source_id, row.physical_table_key)].add(row.domain_id)
        for table, source_id in session.execute(select(PhysicalTable, latest.c.source_id).join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id).join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id).join(latest, latest.c.id == PhysicalDatabase.snapshot_id).where(latest.c.position == 1)):
            add(f"table:{table.id}", [sources[source_id].organization_id], assigned[(source_id, table.stable_key)])

    for identity, node in nodes.items():
        node["objectKeys"] = sorted(organizations[identity])
    for domain in domains:
        domain["objectKeys"] = sorted(domain_objects[domain["id"]])
