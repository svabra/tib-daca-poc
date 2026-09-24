"""Read-only projections for catalog documentation and responsibility perspectives."""

from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .governance import can_view_private_product
from .modeling_seed import VIBDBU_PHYSICAL_SOURCE_ID
from .models import (
    AdministrativeOrganization,
    AssetMapping,
    AssetMappingPhysicalColumn,
    AssetMappingVersion,
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DataProduct,
    DataProductDomain,
    DcatDatasetVersion,
    DcatDatasetVersionLocalization,
    DemoUser,
    Domain,
    DomainLocalization,
    LogicalModel,
    LogicalModelVersion,
    PhysicalColumn,
    PhysicalDatabase,
    PhysicalDomainAssignment,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
    RoleChangeEvent,
    SiteGlossaryLocalization,
    SiteGlossaryTerm,
)


def _localized(rows: list[Any], language: str) -> Any | None:
    return next((row for row in rows if row.language == language), None) or next(
        (row for row in rows if row.language == "de"), None
    ) or (rows[0] if rows else None)


def glossary_entries(session: Session, language: str = "de", query: str = "") -> list[dict[str, Any]]:
    localizations: dict[uuid.UUID, list[SiteGlossaryLocalization]] = defaultdict(list)
    for row in session.scalars(select(SiteGlossaryLocalization)):
        localizations[row.term_id].append(row)
    needle = query.strip().casefold()
    result: list[dict[str, Any]] = []
    for term in session.scalars(select(SiteGlossaryTerm).where(SiteGlossaryTerm.lifecycle == "active")):
        rows = localizations[term.id]
        entry = _localized(rows, language)
        if entry is None:
            continue
        if needle and not any(
            needle in text.casefold()
            for text in [term.abbreviation or "", *(row.preferred_label for row in rows),
                         entry.short_description]
        ):
            continue
        result.append({
            "id": str(term.id),
            "abbreviation": term.abbreviation,
            "term": entry.preferred_label,
            "shortDescription": entry.short_description,
            "detailedDescription": entry.detailed_description,
            "isTermdat": term.is_termdat,
            "language": entry.language,
            "availableLanguages": sorted(row.language for row in rows),
        })
    return sorted(result, key=lambda item: item["term"].casefold())


def catalog_responsibilities(session: Session, actor: str, language: str = "de") -> dict[str, Any]:
    users = {row.id: row for row in session.scalars(select(DemoUser).where(DemoUser.active.is_(True)))}
    organizations = {row.id: row.display_name for row in session.scalars(select(AdministrativeOrganization))}
    role_rows = list(session.scalars(select(DataModelRoleAssignment).where(DataModelRoleAssignment.active.is_(True))))
    role_scopes: dict[str, list[dict[str, str]]] = defaultdict(list)
    scopes_by_user: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for row in role_rows:
        if row.user_id not in users:
            continue
        role_scopes[row.user_id].append({
            "role": row.role,
            "organizationId": row.organization_id,
            "organizationName": organizations.get(row.organization_id, row.organization_id),
        })
        scopes_by_user[row.user_id].add((row.organization_id, row.role))

    extras = list(session.scalars(select(CatalogObjectResponsibility).where(CatalogObjectResponsibility.active.is_(True))))
    objects: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}

    def add_object(key: str, category: str, name: str, description: str, href: str,
                   domain_ids: list[str] | None = None) -> dict[str, Any]:
        item = {"id": key, "category": category, "name": name,
                "description": description, "href": href,
                "domainIds": domain_ids or [], "responsibilities": []}
        objects.append(item)
        by_key[key] = item
        return item

    def add_person(item: dict[str, Any], user_id: str | None, role: str, basis: str) -> None:
        if user_id not in users:
            return
        if any(row["userId"] == user_id and row["role"] == role for row in item["responsibilities"]):
            return
        item["responsibilities"].append({"userId": user_id, "role": role, "basis": basis})

    domains = list(session.scalars(select(Domain).where(Domain.lifecycle == "active")))
    domain_labels: dict[uuid.UUID, str] = {}
    for domain in domains:
        labels = list(session.scalars(select(DomainLocalization).where(DomainLocalization.domain_id == domain.id)))
        label = _localized(labels, language)
        name = label.preferred_label if label else str(domain.id)
        domain_labels[domain.id] = name
        item = add_object(f"domain:{domain.id}", "domain", name,
                          label.definition if label else "", f"/domains/{domain.id}", [str(domain.id)])
        add_person(item, domain.owner_user_id, "data_owner", "domain_owner")
        add_person(item, domain.deputy_owner_user_id, "deputy_data_owner", "domain_deputy")

    latest_models: dict[uuid.UUID, LogicalModelVersion] = {}
    for version in session.scalars(select(LogicalModelVersion).order_by(LogicalModelVersion.revision.desc())):
        latest_models.setdefault(version.logical_model_id, version)
    model_domains: dict[uuid.UUID, uuid.UUID] = {}
    for model in session.scalars(select(LogicalModel).where(LogicalModel.lifecycle == "active")):
        version = latest_models.get(model.id)
        if version is None:
            continue
        dataset = session.get(DcatDatasetVersion, version.dataset_version_id)
        if dataset is None:
            continue
        model_domains[model.id] = dataset.data_domain_id
        labels = list(session.scalars(select(DcatDatasetVersionLocalization).where(
            DcatDatasetVersionLocalization.dataset_version_id == dataset.id)))
        label = _localized(labels, language)
        item = add_object(f"logical_model:{model.id}", "logical_model",
                          label.title if label else model.urn,
                          label.description if label else "", f"/models/{model.id}",
                          [str(dataset.data_domain_id)])
        add_person(item, dataset.data_owner_user_id, "data_owner", "model_owner")
        add_person(item, dataset.deputy_owner_user_id, "deputy_data_owner", "model_deputy")
        if (dataset.organization_id, "data_steward") in scopes_by_user.get(model.created_by_user_id, set()):
            add_person(item, model.created_by_user_id, "data_steward", "model_creator_scope")

    source_domains: dict[tuple[uuid.UUID, str], set[str]] = defaultdict(set)
    for link in session.scalars(select(PhysicalDomainAssignment)):
        source_domains[(link.physical_source_id, link.physical_table_key)].add(str(link.domain_id))
    mapped_tables = session.execute(
        select(AssetMapping.physical_source_id, AssetMapping.logical_model_id, PhysicalTable.stable_key)
        .join(AssetMappingVersion, AssetMappingVersion.asset_mapping_id == AssetMapping.id)
        .join(AssetMappingPhysicalColumn, AssetMappingPhysicalColumn.asset_mapping_version_id == AssetMappingVersion.id)
        .join(PhysicalColumn, PhysicalColumn.id == AssetMappingPhysicalColumn.physical_column_id)
        .join(PhysicalTable, PhysicalTable.id == PhysicalColumn.physical_table_id)
        .where(AssetMapping.lifecycle == "active", AssetMappingVersion.revision == AssetMapping.revision)
        .distinct()
    )
    for source_id, model_id, table_key in mapped_tables:
        domain_id = model_domains.get(model_id)
        if domain_id:
            source_domains[(source_id, table_key)].add(str(domain_id))
    actor_scopes = {row.organization_id for row in role_rows if row.user_id == actor}
    for source in session.scalars(select(PhysicalSource).where(PhysicalSource.lifecycle == "active")):
        if source.organization_id not in actor_scopes and source.id != VIBDBU_PHYSICAL_SOURCE_ID:
            continue
        latest = session.scalar(select(PhysicalSchemaSnapshot).where(
            PhysicalSchemaSnapshot.source_id == source.id).order_by(PhysicalSchemaSnapshot.sequence.desc()).limit(1))
        if latest is None:
            continue
        table_rows = session.execute(
            select(PhysicalTable, PhysicalSchema.name, PhysicalDatabase.name)
            .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
            .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
            .where(PhysicalDatabase.snapshot_id == latest.id)
            .order_by(PhysicalDatabase.position, PhysicalSchema.position, PhysicalTable.position)
        )
        for table, schema_name, database_name in table_rows:
            item = add_object(
                f"physical_representation:{source.id}:{table.stable_key}",
                "physical_representation", f"{source.name} · {database_name}.{schema_name}.{table.name}",
                table.comment or source.description or "", f"/physical-models/{source.id}",
                sorted(source_domains[(source.id, table.stable_key)]),
            )
            for row in role_rows:
                if row.organization_id == source.organization_id and row.role == "data_steward":
                    add_person(item, row.user_id, "data_steward", "organization_scope")

    product_domains: dict[uuid.UUID, list[str]] = defaultdict(list)
    for link in session.scalars(select(DataProductDomain)):
        product_domains[link.data_product_id].append(str(link.domain_id))
    for product in session.scalars(select(DataProduct).where(DataProduct.lifecycle != "retired")):
        if not can_view_private_product(session, product, actor):
            continue
        item = add_object(f"data_product:{product.id}", "data_product", product.title,
                          product.description, f"/products/{product.id}/overview",
                          product_domains[product.id])
        add_person(item, product.owner_user_id, "data_owner", "product_owner")
        add_person(item, product.deputy_owner_user_id, "deputy_data_owner", "product_deputy")

    for row in extras:
        if row.user_id not in users:
            continue
        target = (
            f"domain:{row.domain_id}" if row.domain_id else
            f"logical_model:{row.logical_model_id}" if row.logical_model_id else
            f"data_product:{row.data_product_id}" if row.data_product_id else None
        )
        if target and target in by_key:
            add_person(by_key[target], row.user_id, row.role, "explicit")
        if row.physical_source_id:
            prefix = f"physical_representation:{row.physical_source_id}:"
            for key, item in by_key.items():
                if key.startswith(prefix) and (row.physical_table_key is None or key == prefix + row.physical_table_key):
                    add_person(item, row.user_id, row.role, "explicit")

    relevant_users = {row["userId"] for item in objects for row in item["responsibilities"]}
    relevant_users.update(role_scopes)
    people = [{
        "id": user.id, "name": user.display_name, "organization": user.organization,
        "avatarUrl": user.avatar_url, "roles": role_scopes[user.id],
    } for user in users.values() if user.id in relevant_users]
    people.sort(key=lambda person: person["name"].casefold())
    objects.sort(key=lambda item: (item["category"], item["name"].casefold()))
    return {"people": people, "objects": objects, "domains": [
        {"id": str(domain_id), "name": name}
        for domain_id, name in sorted(domain_labels.items(), key=lambda row: row[1].casefold())
    ]}


def role_change_history(
    session: Session, actor: str, language: str = "de", *, limit: int = 50,
    before: int | None = None,
) -> dict[str, Any]:
    """List only changes whose present-day scope is visible in the perspectives."""
    index = catalog_responsibilities(session, actor, language)
    visible: dict[str, set[str]] = defaultdict(set)
    labels: dict[tuple[str, str], str] = {}
    for item in index["objects"]:
        category = item["category"]
        object_id = item["id"].split(":", 2)[1]
        visible[category].add(object_id)
        labels[(category, object_id)] = item["name"]
    for person in index["people"]:
        for role in person["roles"]:
            organization_id = role["organizationId"]
            visible["organization"].add(organization_id)
            labels[("organization", organization_id)] = role["organizationName"]
    # Keep a revoked organization's last event discoverable even if its final
    # active role row has disappeared from the current-person projection.
    for organization in session.scalars(select(AdministrativeOrganization)):
        visible["organization"].add(organization.id)
        labels[("organization", organization.id)] = organization.display_name
    model_ids = {uuid.UUID(value) for value in visible["logical_model"]}
    if model_ids:
        for version in session.scalars(select(LogicalModelVersion).where(
            LogicalModelVersion.logical_model_id.in_(model_ids)
        )):
            visible["dataset_version"].add(str(version.dataset_version_id))
            labels[("dataset_version", str(version.dataset_version_id))] = labels.get(
                ("logical_model", str(version.logical_model_id)), str(version.dataset_version_id)
            )
    predicates = [
        (RoleChangeEvent.scope_type == scope_type) & (RoleChangeEvent.scope_id.in_(values))
        for scope_type, values in visible.items() if values
    ]
    if not predicates:
        return {"items": [], "nextBefore": None}
    statement = select(RoleChangeEvent).where(or_(*predicates))
    if before is not None:
        statement = statement.where(RoleChangeEvent.sequence < before)
    events = list(session.scalars(statement.order_by(RoleChangeEvent.sequence.desc()).limit(limit + 1)))
    users = {row.id: row.display_name for row in session.scalars(select(DemoUser))}
    page = events[:limit]
    return {
        "items": [{
            "sequence": row.sequence,
            "occurredAt": row.occurred_at.isoformat(),
            "actorUserId": row.actor_user_id,
            "actorName": users.get(row.actor_user_id, row.actor_user_id),
            "action": row.action,
            "scopeType": row.scope_type,
            "scopeId": row.scope_id,
            "entityId": row.entity_id,
            "scopeName": labels.get((row.scope_type, row.scope_id), row.scope_id),
            "role": row.role,
            "subjectUserId": row.subject_user_id,
            "subjectName": users.get(row.subject_user_id, row.subject_user_id),
            "before": row.before_state,
            "after": row.after_state,
        } for row in page],
        "nextBefore": page[-1].sequence if len(events) > limit else None,
    }
