"""Request-local bulk reads for semantic list projections; never retained across requests."""

from collections import defaultdict
from contextlib import contextmanager

from sqlalchemy import func, or_, select

from .models import (
    AdministrativeOrganization,
    CatalogObjectResponsibility,
    DataProductDomain,
    DemoUser,
    DomainLocalization,
    FederalPersonMembership,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    GlossaryTermRelation,
    IdentityDirectoryEntry,
    OrganizationStewardMandate,
    utc_now,
)


class SemanticRead:
    def __init__(self, session, domains, terms, actor):
        self.today = utc_now().date()
        domain_ids, term_ids = [row.id for row in domains], [row.id for row in terms]
        self.domain_ids, self.term_ids, self.actor = set(domain_ids), set(term_ids), actor
        self.roles = list(session.scalars(select(CatalogObjectResponsibility).where(
            CatalogObjectResponsibility.active.is_(True), or_(
                CatalogObjectResponsibility.domain_id.in_(domain_ids),
                CatalogObjectResponsibility.glossary_term_id.in_(term_ids),
            ),
        )))
        people = {actor} | {person for row in domains for person in (row.owner_user_id, row.deputy_owner_user_id)} | {row.user_id for row in self.roles}
        self.people = people - {None}
        # Strong references keep session.get calls in the existing authority helpers local.
        self.users = {row.id: row for row in session.scalars(select(DemoUser).where(DemoUser.id.in_(people - {None})))}
        self.organizations = {row.id: row for row in session.scalars(select(AdministrativeOrganization))}
        self.memberships = defaultdict(list)
        for row in session.scalars(select(FederalPersonMembership).where(
            FederalPersonMembership.user_id.in_(people - {None}), FederalPersonMembership.is_primary.is_(True),
        )):
            self.memberships[row.user_id].append(row)
        self.directory = {row.id: row for row in session.scalars(select(IdentityDirectoryEntry).where(IdentityDirectoryEntry.id.in_(people - {None})))}
        self.mandates = list(session.scalars(select(OrganizationStewardMandate).where(
            OrganizationStewardMandate.active.is_(True),
            (OrganizationStewardMandate.user_id == actor) | (OrganizationStewardMandate.deputy_user_id == actor),
        ).order_by(OrganizationStewardMandate.organization_id))) if actor else []
        self.domain_labels, self.term_labels, self.term_domains, self.term_relations = (defaultdict(list) for _ in range(4))
        self.product_counts, self.term_counts = {}, {}
        if domain_ids:
            for row in session.scalars(select(DomainLocalization).where(DomainLocalization.domain_id.in_(domain_ids)).order_by(DomainLocalization.language)):
                self.domain_labels[row.domain_id].append(row)
            self.product_counts = dict(session.execute(select(DataProductDomain.domain_id, func.count()).where(DataProductDomain.domain_id.in_(domain_ids)).group_by(DataProductDomain.domain_id)).all())
            self.term_counts = dict(session.execute(select(GlossaryTermDomain.domain_id, func.count()).where(GlossaryTermDomain.domain_id.in_(domain_ids)).group_by(GlossaryTermDomain.domain_id)).all())
        if term_ids:
            relations = list(session.scalars(select(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id.in_(term_ids))))
            for row in relations:
                self.term_relations[row.source_term_id].append(row)
            label_ids = set(term_ids) | {row.target_term_id for row in relations if row.target_term_id}
            for row in session.scalars(select(GlossaryTermLocalization).where(GlossaryTermLocalization.term_id.in_(label_ids)).order_by(GlossaryTermLocalization.language)):
                self.term_labels[row.term_id].append(row)
            for term_id, domain_id in session.execute(select(GlossaryTermDomain.term_id, GlossaryTermDomain.domain_id).where(GlossaryTermDomain.term_id.in_(term_ids))):
                self.term_domains[term_id].append(domain_id)

    def person_scopes(self, user_id):
        history = self.memberships[user_id]
        if history:
            return {row.organization_id for row in history if row.valid_from <= self.today and (row.valid_to is None or self.today <= row.valid_to)}
        person = self.directory.get(user_id)
        return {person.organization_id} if person and person.active and person.source == "federal" and person.organization_id else set()

    def domain_scopes(self, domain):
        roles = [row for row in self.roles if row.domain_id == domain.id]
        explicit = {row.organization_id for row in roles if row.organization_id}
        if explicit:
            return explicit
        return set() if any(row.provenance == "domain-handover" for row in roles) else self.person_scopes(domain.owner_user_id)

    def active_organizations(self, ids):
        return [row for identity in ids if (row := self.organizations.get(identity)) and row.active
                and (row.valid_from is None or row.valid_from <= self.today)
                and (row.valid_to is None or self.today <= row.valid_to)]

    def descendants(self, identity):
        result, pending = {identity}, [identity]
        while pending:
            parent = pending.pop()
            for row in self.organizations.values():
                if row.active and row.parent_id == parent and row.id not in result:
                    result.add(row.id)
                    pending.append(row.id)
        return result


@contextmanager
def semantic_read(session, *, domains=(), terms=(), actor=None):
    previous = session.info.get("semantic_read")
    snapshot = SemanticRead(session, domains, terms, actor)
    session.info["semantic_read"] = snapshot
    try:
        yield snapshot
    finally:
        if previous is None:
            session.info.pop("semantic_read", None)
        else:
            session.info["semantic_read"] = previous
