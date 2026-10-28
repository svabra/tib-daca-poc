"""Trusted, object-scoped governance; a global profile label grants no object authority."""

from sqlalchemy import exists, or_, select

from .models import (
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DataProduct,
    DemoUser,
    Domain,
    GlossaryTermDomain,
    RoleChangeEvent,
)

OWNER_ROLES = {"data_owner", "deputy_data_owner"}
OBJECT_ROLES = OWNER_ROLES | {"data_steward", "deputy_data_steward"}


def active_actor(session, actor):
    user = session.get(DemoUser, actor)
    return bool(user and user.active)


def domain_owners(session, domain):
    if domain is None:
        return set()
    owners = {domain.owner_user_id, domain.deputy_owner_user_id}
    owners.update(
        session.scalars(
            select(CatalogObjectResponsibility.user_id).where(
                CatalogObjectResponsibility.domain_id == domain.id,
                CatalogObjectResponsibility.role.in_(OWNER_ROLES),
                CatalogObjectResponsibility.active.is_(True),
            )
        )
    )
    return {actor for actor in owners if active_actor(session, actor)}


def governs_domain(session, actor, domain):
    return actor in domain_owners(session, domain)


def product_owners(session, product):
    if product is None:
        return set()
    owners = {product.owner_user_id, product.deputy_owner_user_id}
    owners.update(session.scalars(select(CatalogObjectResponsibility.user_id).where(
        CatalogObjectResponsibility.data_product_id == product.id,
        CatalogObjectResponsibility.role.in_(OWNER_ROLES),
        CatalogObjectResponsibility.active.is_(True),
    )))
    return {actor for actor in owners if active_actor(session, actor)}


def product_editors(session, product):
    editors = product_owners(session, product)
    if product is None:
        return editors
    editors.update(actor for actor in session.scalars(select(CatalogObjectResponsibility.user_id).where(
        CatalogObjectResponsibility.data_product_id == product.id,
        CatalogObjectResponsibility.role.in_(OBJECT_ROLES),
        CatalogObjectResponsibility.active.is_(True),
    )) if active_actor(session, actor))
    return editors


def product_assignment_filter(actor, *, owners_only=False):
    """SQL equivalent of the active object assignment check for paginated lists."""
    return exists(select(DemoUser.id).where(DemoUser.id == actor, DemoUser.active.is_(True))) & or_(
        DataProduct.owner_user_id == actor,
        DataProduct.deputy_owner_user_id == actor,
        exists(select(CatalogObjectResponsibility.id).where(
            CatalogObjectResponsibility.data_product_id == DataProduct.id,
            CatalogObjectResponsibility.user_id == actor,
            CatalogObjectResponsibility.active.is_(True),
            CatalogObjectResponsibility.role.in_(OWNER_ROLES if owners_only else OBJECT_ROLES),
        )),
    )


def term_owners(session, term_id):
    owners = set(
        session.scalars(
            select(CatalogObjectResponsibility.user_id).where(
                CatalogObjectResponsibility.glossary_term_id == term_id,
                CatalogObjectResponsibility.role.in_(OWNER_ROLES),
                CatalogObjectResponsibility.active.is_(True),
            )
        )
    )
    return {actor for actor in owners if active_actor(session, actor)}


def governs_term(session, actor, term_id):
    return actor in term_owners(session, term_id)


def may_create_domain(session, actor):
    if not active_actor(session, actor):
        return False
    return bool(
        "data_owner" in (session.get(DemoUser, actor).roles or [])
        or session.scalar(
            select(Domain.id)
            .where((Domain.owner_user_id == actor) | (Domain.deputy_owner_user_id == actor))
            .limit(1)
        )
        or session.scalar(
            select(CatalogObjectResponsibility.id)
            .where(
                CatalogObjectResponsibility.user_id == actor,
                CatalogObjectResponsibility.active.is_(True),
                CatalogObjectResponsibility.role.in_(OWNER_ROLES),
            )
            .limit(1)
        )
        or session.scalar(
            select(DataModelRoleAssignment.id)
            .where(
                DataModelRoleAssignment.user_id == actor,
                DataModelRoleAssignment.active.is_(True),
                DataModelRoleAssignment.role.in_(OWNER_ROLES),
            )
            .limit(1)
        )
    )


def term_owner_pair(session, term_id):
    rows = session.scalars(
        select(CatalogObjectResponsibility)
        .where(
            CatalogObjectResponsibility.glossary_term_id == term_id,
            CatalogObjectResponsibility.active.is_(True),
        )
        .order_by(CatalogObjectResponsibility.created_at, CatalogObjectResponsibility.id)
    )
    roles = {row.role: row.user_id for row in rows if row.role in OWNER_ROLES}
    return roles.get("data_owner"), roles.get("deputy_data_owner")


def ensure_term_owners(session, term_id, preferred_domain_id=None):
    """Initialize explicit ownership on acceptance; classification changes never reassign it."""
    if session.scalar(
        select(CatalogObjectResponsibility.id)
        .where(CatalogObjectResponsibility.glossary_term_id == term_id)
        .limit(1)
    ):
        return
    if session.scalar(
        select(RoleChangeEvent.sequence)
        .where(
            RoleChangeEvent.scope_type == "glossary_term",
            RoleChangeEvent.scope_id == str(term_id),
            RoleChangeEvent.action == "removed",
        )
        .limit(1)
    ):
        return
    import uuid

    domain = (
        session.get(Domain, preferred_domain_id)
        if preferred_domain_id
        else session.scalar(
            select(Domain)
            .join(GlossaryTermDomain)
            .where(GlossaryTermDomain.term_id == term_id)
            .order_by(Domain.created_at, Domain.id)
            .limit(1)
        )
    )
    if domain:
        for role, user_id in (
            ("data_owner", domain.owner_user_id),
            ("deputy_data_owner", domain.deputy_owner_user_id),
        ):
            session.add(
                CatalogObjectResponsibility(
                    id=uuid.uuid5(uuid.NAMESPACE_URL, f"daca:term-responsibility:{term_id}:{role}"),
                    user_id=user_id,
                    role=role,
                    glossary_term_id=term_id,
                    provenance="initial-owner",
                )
            )
