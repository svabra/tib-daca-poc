import base64
import uuid

from daca_catalog import structure_inventory_api
from daca_catalog.modeling_seed import VEHICLE_MODEL_ID, seed_modeling_catalog
from daca_catalog.models import AuditEvent, PhysicalSchemaSnapshot, PhysicalSource, PhysicalTable
from fastapi import HTTPException
from sqlalchemy import func, select

HEADERS = {"X-DaCa-User": "christian.man"}


def create_inventory(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    content = base64.b64encode(b"Tabelle;Feldname;Datentyp;System\nVEHICLE;vehicle_id;CHAR;QA\n").decode()
    preview = client.post("/api/v1/physical-model-csv/preview", headers=HEADERS, json={"contentBase64": content})
    assert preview.status_code == 200, preview.text
    body = {"contentBase64": content, "fingerprint": preview.json()["fingerprint"], "name": "Testinventar",
            "filename": "inventory.csv", "departmentCode": "VBS", "organizationId": "vbs-verteidigung"}
    imported = client.post("/api/v1/physical-model-csv/imports", headers=HEADERS, json=body)
    assert imported.status_code == 201, imported.text
    return imported.json(), body


def path(inventory, suffix=""):
    return "/api/v1/structure-inventories/" + inventory["sourceId"] + suffix


def headers(revision=1):
    return {**HEADERS, "If-Match": f'"{revision}"'}


def test_archive_is_readable_excluded_from_active_selection_and_restorable(client, session_factory):
    inventory, _body = create_inventory(client, session_factory)
    snapshot_id = inventory["snapshot"]["snapshot"]["id"]
    archived = client.post(path(inventory, "/archive"), headers=headers())
    assert archived.status_code == 200, archived.text
    assert archived.json()["lifecycle"] == "archived" and archived.headers["etag"] == '"2"'
    assert archived.json()["inventoryManageable"]
    active = client.get("/api/v1/physical-sources", headers=HEADERS).json()["items"]
    assert inventory["sourceId"] not in {source["id"] for source in active}
    all_sources = client.get("/api/v1/physical-sources?includeArchived=true", headers=HEADERS).json()["items"]
    source = next(source for source in all_sources if source["id"] == inventory["sourceId"])
    assert source["inventoryManageable"] and source["systemName"] == "Strukturinventar"
    assert client.get(f"/api/v1/physical-snapshots/{snapshot_id}", headers=HEADERS).status_code == 200
    models = client.get("/api/v1/physical-models?sourceType=csv", headers=HEADERS).json()
    assert models["total"] == 0
    restored = client.post(path(inventory, "/restore"), headers=headers(2))
    assert restored.status_code == 200 and restored.json()["lifecycle"] == "active"
    events = client.get("/api/v1/structure-inventories/audit-events", headers=HEADERS).json()
    assert [event["action"] for event in events] == ["restored", "archived", "imported"]
    assert all(event["actor"] == "christian.man" and event["occurredAt"] for event in events)


def test_delete_removes_structure_but_preserves_scoped_append_only_audit_and_safe_reimport(client, session_factory):
    inventory, body = create_inventory(client, session_factory)
    snapshot_id = uuid.UUID(inventory["snapshot"]["snapshot"]["id"])
    table_id = uuid.UUID(inventory["snapshot"]["databases"][0]["schemas"][0]["tables"][0]["id"])
    deleted = client.delete(path(inventory), headers=headers())
    assert deleted.status_code == 204, deleted.text
    with session_factory() as session:
        assert session.get(PhysicalSource, uuid.UUID(inventory["sourceId"])) is None
        assert session.get(PhysicalSchemaSnapshot, snapshot_id) is None
        assert session.get(PhysicalTable, table_id) is None
        # Import audit evidence is deliberately independent from source/snapshot FKs.
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.resource_id == str(snapshot_id), AuditEvent.action == "imported")) == 1
    events = client.get("/api/v1/structure-inventories/audit-events", headers=HEADERS).json()
    assert [event["action"] for event in events] == ["deleted", "imported"]
    assert events[0]["details"]["name"] == "Testinventar"
    assert events[0]["details"]["tableCount"] == 1
    assert client.get("/api/v1/structure-inventories/audit-events", headers={"X-DaCa-User": "kassandra.valdata"}).status_code == 403
    outsider = client.get("/api/v1/structure-inventories/audit-events", headers={"X-DaCa-User": "giuseppe.starwars"})
    assert outsider.status_code == 200 and outsider.json() == []
    again = client.post("/api/v1/physical-model-csv/imports", headers=HEADERS, json=body)
    assert again.status_code == 201 and again.json()["sourceId"] == inventory["sourceId"]
    sources = client.get("/api/v1/physical-sources", headers=HEADERS).json()["items"]
    assert next(source for source in sources if source["id"] == inventory["sourceId"])["revision"] == 3
    assert client.delete(path(inventory), headers=headers()).status_code == 412


def test_model_bindings_block_delete_but_allow_archive(client, session_factory):
    inventory, _body = create_inventory(client, session_factory)
    model = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}", headers=HEADERS)
    table_id = inventory["snapshot"]["databases"][0]["schemas"][0]["tables"][0]["id"]
    snapshot_id = inventory["snapshot"]["snapshot"]["id"]
    bound = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**HEADERS, "If-Match": model.headers["etag"]}, json={
        "logicalModelVersionId": model.json()["versionId"], "representations": [{"physicalSnapshotId": snapshot_id, "physicalTableId": table_id}], "mappings": []})
    assert bound.status_code == 200, bound.text
    deleted = client.delete(path(inventory), headers=headers())
    assert deleted.status_code == 409 and "archivieren" in deleted.json()["detail"]
    assert client.post(path(inventory, "/archive"), headers=headers()).status_code == 200
    # An unchanged archived binding must not block saves elsewhere in the workspace.
    saved = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**HEADERS, "If-Match": model.headers["etag"]}, json={
        "logicalModelVersionId": model.json()["versionId"], "representations": [{"physicalSnapshotId": snapshot_id, "physicalTableId": table_id}], "mappings": []})
    assert saved.status_code == 200, saved.text
    read = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/representations", headers=HEADERS)
    assert table_id in {item["physicalTableId"] for item in read.json()["items"]}
    assert client.get(f"/api/v1/physical-snapshots/{snapshot_id}", headers=HEADERS).status_code == 200


def test_mapping_history_blocks_deletion_and_archive_rejects_new_mappings(client, session_factory):
    inventory, _body = create_inventory(client, session_factory)
    old = client.get(f"/api/v1/asset-mappings?logicalModelId={VEHICLE_MODEL_ID}", headers=HEADERS).json()["items"][0]
    value = {key: old[key] for key in ("logicalModelVersionId", "physicalSnapshotId", "mappingType", "classification",
                                     "responsibleUserId", "validFrom", "logicalFieldVersionIds", "physicalColumnIds")}
    table = inventory["snapshot"]["databases"][0]["schemas"][0]["tables"][0]
    value.update(physicalSnapshotId=inventory["snapshot"]["snapshot"]["id"], physicalColumnIds=[table["columns"][0]["id"]])
    created = client.post("/api/v1/asset-mappings", headers=HEADERS, json=value)
    assert created.status_code == 201, created.text
    mapping = created.json()
    owner = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}", headers=HEADERS).json()["dataOwnerUserId"]
    retired = client.post(f'/api/v1/asset-mappings/{mapping["id"]}/versions/{mapping["versionId"]}/retire',
                          headers={"X-DaCa-User": owner, "If-Match": created.headers["etag"]})
    assert retired.status_code == 200, retired.text
    assert client.delete(path(inventory), headers=headers()).status_code == 409
    assert client.post(path(inventory, "/archive"), headers=headers()).status_code == 200
    denied = client.post("/api/v1/asset-mappings", headers=HEADERS, json=value)
    assert denied.status_code == 409 and "archiviert" in denied.json()["detail"]


def test_permissions_versions_source_types_and_import_reactivation_are_enforced(client, session_factory):
    inventory, body = create_inventory(client, session_factory)
    for method, suffix in [(client.post, "/archive"), (client.post, "/restore"), (client.delete, "")]:
        assert method(path(inventory, suffix), headers={"X-DaCa-User": "kassandra.valdata", "If-Match": '"1"'}).status_code == 403
    assert client.post(path(inventory, "/archive"), headers=HEADERS).status_code == 428
    assert client.post(path(inventory, "/archive"), headers=headers(99)).status_code == 412
    assert client.post(path(inventory, "/restore"), headers=headers()).status_code == 409
    sources = client.get("/api/v1/physical-sources", headers=HEADERS).json()["items"]
    pg_source = next(source for source in sources if source["adapterType"] != "csv" and source["organizationId"] == "vbs-verteidigung")
    denied = client.delete("/api/v1/structure-inventories/" + pg_source["id"], headers=headers(pg_source["revision"]))
    assert denied.status_code == 422
    assert client.post(path(inventory, "/archive"), headers=headers()).status_code == 200
    assert client.post("/api/v1/physical-model-csv/imports", headers=HEADERS, json=body).status_code == 409


def test_audit_failure_rolls_back_lifecycle_change(client, session_factory, monkeypatch):
    inventory, _body = create_inventory(client, session_factory)
    original = structure_inventory_api.record_audit

    def failed(*args, **kwargs):
        original(*args, **kwargs)
        raise HTTPException(503, "Synthetic audit failure")

    monkeypatch.setattr(structure_inventory_api, "record_audit", failed)
    assert client.post(path(inventory, "/archive"), headers=headers()).status_code == 503
    with session_factory() as session:
        source = session.get(PhysicalSource, uuid.UUID(inventory["sourceId"]))
        assert source.lifecycle == "active" and source.revision == 1
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.resource_id == inventory["sourceId"])) == 1
