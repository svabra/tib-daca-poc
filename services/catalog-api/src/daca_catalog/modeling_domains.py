"""Current catalog domain assignments; imported physical snapshots stay immutable."""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import select

from .modeling_core import canonical_hash
from .models import (
    Domain,
    DomainLocalization,
    PhysicalDatabase,
    PhysicalDomainAssignment,
    PhysicalSchema,
    PhysicalSchemaSnapshot,
    PhysicalSource,
    PhysicalTable,
)
from .physical_source_access import require_source_access


def domain_reference(session, domain_id):
    domain = session.get(Domain, domain_id)
    label = session.get(DomainLocalization, (domain_id, "de"))
    return {"id": domain.id, "displayName": label.preferred_label if label else domain.urn,
            "lifecycle": domain.lifecycle}


def physical_domain_state(session, source_id, table_key):
    ids = sorted(set(session.scalars(select(PhysicalDomainAssignment.domain_id).where(
        PhysicalDomainAssignment.physical_source_id == source_id,
        PhysicalDomainAssignment.physical_table_key == table_key,
    ))), key=str)
    return {"dataDomains": [domain_reference(session, domain_id) for domain_id in ids],
            "domainVersion": canonical_hash({"sourceId": str(source_id), "tableKey": table_key,
                                              "domainIds": [str(item) for item in ids]})}


def physical_table_context(session, table_id):
    row = session.execute(select(PhysicalTable, PhysicalDatabase.snapshot_id,
                                 PhysicalSchemaSnapshot.source_id)
        .join(PhysicalSchema, PhysicalSchema.id == PhysicalTable.physical_schema_id)
        .join(PhysicalDatabase, PhysicalDatabase.id == PhysicalSchema.physical_database_id)
        .join(PhysicalSchemaSnapshot, PhysicalSchemaSnapshot.id == PhysicalDatabase.snapshot_id)
        .where(PhysicalTable.id == table_id)).first()
    if row is None:
        raise HTTPException(404, "Physical object not found")
    return row


def apply_domain_targets(session, actor, domain_id, targets, department_code, organization_id):
    if not targets:
        return
    # Runtime import keeps payload enrichment independent of the HTTP router.
    from .modeling_api import _compatible_representation_scope, _require_scope
    from .modeling_service import record_audit, utc_now

    domain = session.get(Domain, domain_id) if domain_id else None
    if domain is None or domain.lifecycle != "active":
        raise HTTPException(422, "Select an active domain for physical assignments")
    rows = [(target, physical_table_context(session, target.physical_table_id)) for target in targets]
    # Lock source identities, including across historical snapshots of the same object.
    source_ids = sorted({row[2] for _target, row in rows}, key=str)
    sources = {item.id: item for item in session.scalars(select(PhysicalSource).where(
        PhysicalSource.id.in_(source_ids)).order_by(PhysicalSource.id).with_for_update())}
    seen = set()
    validated = []
    for target, (table, snapshot_id, source_id) in rows:
        source = sources[source_id]
        require_source_access(session, actor, source.id)
        _require_scope(session, actor, source.department_code, source.organization_id,
                       roles={"data_owner", "data_steward"})
        if source.lifecycle != "active" or not _compatible_representation_scope(source, department_code, organization_id):
            raise HTTPException(422, "Physical source must share the model's active scope")
        if target.physical_snapshot_id != snapshot_id:
            raise HTTPException(422, "Physical object does not belong to the selected snapshot")
        state = physical_domain_state(session, source_id, table.stable_key)
        if state["domainVersion"] != target.expected_domain_version:
            raise HTTPException(409, "Physical domain assignments changed; reopen the dialog")
        key = (source_id, table.stable_key)
        if key not in seen:
            validated.append((table, source_id, state))
            seen.add(key)
    for table, source_id, state in validated:
        if domain_id in {item["id"] for item in state["dataDomains"]}:
            continue
        identity = uuid.uuid5(uuid.NAMESPACE_URL, f"daca:physical-domain:{source_id}:{table.stable_key}:{domain_id}")
        session.add(PhysicalDomainAssignment(id=identity, physical_source_id=source_id,
            physical_table_key=table.stable_key, domain_id=domain_id, provenance="explicit",
            created_at=utc_now()))
        record_audit(session, "physical-domain-assignment", identity, "assigned", actor, 1,
                     {"physicalSourceId": str(source_id), "physicalTableKey": table.stable_key,
                      "domainId": str(domain_id)})
    session.flush()
