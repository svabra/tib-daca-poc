import uuid

from daca_catalog.modeling_domains import physical_domain_state
from daca_catalog.modeling_seed import VEHICLE_MODEL_ID, seed_modeling_catalog
from daca_catalog.modeling_service import (
    get_logical_model,
    get_logical_version,
    logical_version_payload,
    logical_write_from_payload,
)
from daca_catalog.models import (
    DcatDatasetVersion,
    LogicalModelVersion,
    PhysicalDomainAssignment,
    PhysicalTable,
)
from sqlalchemy import func, select

HEADERS = {"X-DaCa-User": "christian.man"}


def setup_workspace(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        root = get_logical_model(session, VEHICLE_MODEL_ID)
        version = get_logical_version(session, root.id)
        original = logical_version_payload(session, root, version)
        body = logical_write_from_payload(original)
        body.identifiers = [f"DOMAIN-TEST-{uuid.uuid4()}"]
        body.data_domain_id = None
        for entity in body.entities:
            entity.id = None
            for field in entity.fields:
                field.id = None
    created = client.post("/api/v1/logical-models", json=body.model_dump(mode="json", by_alias=True), headers=HEADERS)
    assert created.status_code == 201, created.text
    model = created.json()
    snapshots = client.get("/api/v1/physical-snapshots", headers=HEADERS).json()["items"]
    targets = []
    for snapshot in snapshots:
        tree = client.get(f"/api/v1/physical-snapshots/{snapshot['id']}", headers=HEADERS)
        if tree.status_code != 200:
            continue
        for database in tree.json()["databases"]:
            for schema in database["schemas"]:
                for table in schema["tables"]:
                    if table["name"] in {"vehicle_inventory", "vehicle_inventory_mapping_demo.parquet"}:
                        targets.append({"physicalTableId": table["id"], "physicalSnapshotId": snapshot["id"],
                                        "expectedDomainVersion": table["domainVersion"]})
        if len(targets) >= 2 and len({item["physicalSnapshotId"] for item in targets}) >= 2:
            break
    # All selected fixtures share the vehicle model's source organization.
    attached = client.post(f"/api/v1/logical-models/{model['id']}/mapping-drafts", headers={**HEADERS, "If-Match": created.headers["etag"]},
                          json={"logicalModelVersionId": model["versionId"], "representations": [
                              {key: target[key] for key in ("physicalTableId", "physicalSnapshotId")} for target in targets], "mappings": []})
    assert attached.status_code == 200, attached.text
    return model, created.headers["etag"], targets, original["dataDomainId"]


def test_unassigned_draft_assigns_only_selected_physical_objects_and_preserves_history(client, session_factory):
    model, etag, targets, domain_id = setup_workspace(client, session_factory)
    assert model["dataDomainId"] is None
    submit = client.post(f"/api/v1/logical-models/{model['id']}/versions/{model['versionId']}/submit", headers={**HEADERS, "If-Match": etag})
    assert submit.status_code == 422
    response = client.post(f"/api/v1/logical-models/{model['id']}/domain-assignment", headers={**HEADERS, "If-Match": etag}, json={
        "logicalModelVersionId": model["versionId"], "dataDomainId": str(domain_id), "physicalDomainTargets": targets[:1]})
    assert response.status_code == 200, response.text
    assert response.json()["dataDomainId"] == str(domain_id)
    assert response.json()["dataDomainLabel"]
    assert len(response.json()["physicalDomainAssignments"]) == 1
    chosen = client.get(f"/api/v1/physical-tables/{targets[0]['physicalTableId']}/domains", headers=HEADERS).json()
    assert str(domain_id) in {item["id"] for item in chosen["dataDomains"]}
    omitted = client.get(f"/api/v1/physical-tables/{targets[-1]['physicalTableId']}/domains", headers=HEADERS).json()
    assert omitted["dataDomains"] == []
    with session_factory() as session:
        old = session.get(LogicalModelVersion, uuid.UUID(model["versionId"]))
        assert session.get(DcatDatasetVersion, old.dataset_version_id).data_domain_id is None
    stale = client.post(f"/api/v1/logical-models/{model['id']}/domain-assignment", headers={**HEADERS, "If-Match": etag}, json={
        "logicalModelVersionId": model["versionId"], "dataDomainId": str(domain_id), "physicalDomainTargets": []})
    assert stale.status_code == 412


def test_physical_conflict_rolls_back_the_logical_and_all_physical_assignments(client, session_factory):
    model, etag, targets, domain_id = setup_workspace(client, session_factory)
    bad = [{**target} for target in targets]
    bad[-1]["expectedDomainVersion"] = "0" * 64
    response = client.post(f"/api/v1/logical-models/{model['id']}/domain-assignment", headers={**HEADERS, "If-Match": etag}, json={
        "logicalModelVersionId": model["versionId"], "dataDomainId": str(domain_id), "physicalDomainTargets": bad})
    assert response.status_code == 409
    read = client.get(f"/api/v1/logical-models/{model['id']}", headers=HEADERS).json()
    assert read["versionId"] == model["versionId"] and read["dataDomainId"] is None
    for target in targets:
        assert client.get(f"/api/v1/physical-tables/{target['physicalTableId']}/domains", headers=HEADERS).json()["dataDomains"] == []


def test_direct_physical_assignment_checks_permissions_and_is_stable_across_snapshots(client, session_factory):
    _model, _etag, targets, domain_id = setup_workspace(client, session_factory)
    target = targets[0]
    path = f"/api/v1/physical-tables/{target['physicalTableId']}/domain-assignment"
    body = {"dataDomainId": str(domain_id), "physicalDomainTargets": [target]}
    denied = client.post(path, headers={"X-DaCa-User": "daca-test-editor"}, json=body)
    assert denied.status_code == 403
    wrong_snapshot = client.post(path, headers=HEADERS, json={**body, "physicalDomainTargets": [{**target, "physicalSnapshotId": str(uuid.uuid4())}]})
    assert wrong_snapshot.status_code == 422
    response = client.post(path, headers=HEADERS, json=body)
    assert response.status_code == 200, response.text
    current = response.json()
    # Repeating a stale action is rejected; reloading the current state makes an idempotent assignment possible.
    assert client.post(path, headers=HEADERS, json=body).status_code == 409
    body["physicalDomainTargets"][0]["expectedDomainVersion"] = current["domainVersion"]
    assert client.post(path, headers=HEADERS, json=body).status_code == 200
    with session_factory() as session:
        table = session.get(PhysicalTable, uuid.UUID(target["physicalTableId"]))
        link = session.scalar(select(PhysicalDomainAssignment).where(PhysicalDomainAssignment.physical_table_key == table.stable_key))
        state = physical_domain_state(session, link.physical_source_id, table.stable_key)
        assert str(state["dataDomains"][0]["id"]) == str(domain_id)
        assert session.scalar(select(func.count()).select_from(PhysicalDomainAssignment).where(
            PhysicalDomainAssignment.physical_source_id == link.physical_source_id,
            PhysicalDomainAssignment.physical_table_key == table.stable_key)) == 1


def test_full_editor_domain_save_preserves_owner_and_propagates_in_one_transaction(client, session_factory):
    model, etag, targets, domain_id = setup_workspace(client, session_factory)
    with session_factory() as session:
        root = get_logical_model(session, uuid.UUID(model["id"]))
        version = get_logical_version(session, root.id)
        body = logical_write_from_payload(logical_version_payload(session, root, version))
        body.data_domain_id = domain_id
        from daca_catalog.modeling_schemas import PhysicalDomainTarget
        body.physical_domain_targets = [PhysicalDomainTarget.model_validate(targets[0])]
    response = client.put(f"/api/v1/logical-models/{model['id']}/versions/{model['versionId']}",
        headers={**HEADERS, "If-Match": etag}, json=body.model_dump(mode="json", by_alias=True))
    assert response.status_code == 200, response.text
    assert response.json()["dataDomainId"] == str(domain_id)
    assert response.json()["dataOwnerUserId"] == model["dataOwnerUserId"]
    assert response.json()["deputyOwnerUserId"] == model["deputyOwnerUserId"]
    read = client.get(f"/api/v1/physical-tables/{targets[0]['physicalTableId']}/domains", headers=HEADERS).json()
    assert str(domain_id) in {item["id"] for item in read["dataDomains"]}


def test_domain_model_list_uses_explicit_memberships_and_source_visibility(client, session_factory):
    model, etag, targets, domain_id = setup_workspace(client, session_factory)
    path = f"/api/v1/domains/{domain_id}/models"
    before = client.get(path, headers=HEADERS)
    assert before.status_code == 200, before.text
    assert model["id"] not in {row["id"] for row in before.json()["logicalModels"]}
    assert client.post(f"/api/v1/logical-models/{model['id']}/domain-assignment",
        headers={**HEADERS, "If-Match": etag}, json={"logicalModelVersionId": model["versionId"],
        "dataDomainId": str(domain_id), "physicalDomainTargets": targets[:1]}).status_code == 200
    listing = client.get(path, headers=HEADERS).json()
    assert model["id"] in {row["id"] for row in listing["logicalModels"]}
    # No mappings were created for these explicit representation/domain bindings.
    assert targets[0]["physicalTableId"] in {row["id"] for row in listing["physicalModels"]}
    assert targets[-1]["physicalTableId"] not in {row["id"] for row in listing["physicalModels"]}
    # A reimport replaces the displayed snapshot, retaining stable-key membership.
    from daca_catalog.modeling_core import (
        FixturePhysicalMetadataAdapter,
        FixtureS3PhysicalMetadataAdapter,
    )
    from daca_catalog.modeling_domains import physical_table_context
    from daca_catalog.modeling_service import persist_physical_import
    from daca_catalog.models import PhysicalSource
    with session_factory() as session:
        table, _, source_id = physical_table_context(session, uuid.UUID(targets[0]["physicalTableId"]))
        source = session.get(PhysicalSource, source_id)
        adapter = FixtureS3PhysicalMetadataAdapter() if table.kind == "parquet" else FixturePhysicalMetadataAdapter()
        snapshot, _ = persist_physical_import(session, source, adapter, "christian.man", variant="drift")
        snapshot_id = str(snapshot.id)
        source_id = str(source_id)
        session.commit()
    reimported = client.get(path, headers=HEADERS).json()["physicalModels"]
    assert all(row["snapshotId"] == snapshot_id for row in reimported if row["sourceId"] == source_id)
    assert len([row for row in reimported if row["sourceId"] == source_id]) == 1
    assert targets[0]["physicalTableId"] not in {row["id"] for row in reimported}
    # Removing assigned objects persists technical drift without embedding current
    # domain UUIDs/governance in the immutable structural before/after evidence.
    class EmptyAdapter:
        def inspect(self, **_kwargs):
            return {"databases": []}
    with session_factory() as session:
        persist_physical_import(session, session.get(PhysicalSource, uuid.UUID(source_id)), EmptyAdapter(), "christian.man")
        session.commit()
    removed = client.get(path, headers=HEADERS).json()["physicalModels"]
    assert all(row["sourceId"] != source_id for row in removed)
    no_scope = client.get(path, headers={"X-DaCa-User": "daca-test-editor"})
    assert no_scope.status_code == 200
    assert no_scope.json()["physicalModels"] == []
    assert model["id"] in {row["id"] for row in no_scope.json()["logicalModels"]}
    assert client.get(f"/api/v1/domains/{uuid.uuid4()}/models", headers=HEADERS).status_code == 404


def test_personnel_demo_vocabulary_is_linked_and_preserves_user_edits(client, session_factory):
    from daca_catalog.modeling_core import stable_uuid
    from daca_catalog.modeling_seed import PERSONNEL_DOMAIN_ID
    from daca_catalog.models import GlossaryTerm, GlossaryTermLocalization, GlossaryTermRelation
    with session_factory() as session:
        seed_modeling_catalog(session)
    path = f"/api/v1/glossary/terms?domainId={PERSONNEL_DOMAIN_ID}"
    response = client.get(path, headers=HEADERS)
    assert response.status_code == 200, response.text
    terms = response.json()
    assert len(terms) == 10
    ids = {row["id"] for row in terms}
    assert sum(len(row["relations"]) for row in terms) == 10
    assert all(relation["targetTermId"] in ids for row in terms for relation in row["relations"])
    with session_factory() as session:
        identity = stable_uuid("personnel-glossary:person")
        label = session.get(GlossaryTermLocalization, (identity, "de"))
        label.definition = "Durch die Governance überarbeitete Definition."
        session.get(GlossaryTerm, identity).revision = 2
        session.commit()
        seed_modeling_catalog(session)
        assert session.get(GlossaryTermLocalization, (identity, "de")).definition == "Durch die Governance überarbeitete Definition."
        assert session.get(GlossaryTerm, identity).revision == 2
        assert session.scalar(select(func.count()).select_from(GlossaryTermRelation).where(GlossaryTermRelation.source_term_id.in_([uuid.UUID(value) for value in ids]))) == 10
