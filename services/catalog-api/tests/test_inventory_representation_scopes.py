"""Inventories are reusable metadata; model and inventory rights stay independent."""
import base64
import uuid

from daca_catalog.modeling_seed import (
    REAL_ESTATE_ORGANIZATION_ID,
    VEHICLE_MODEL_ID,
    seed_modeling_catalog,
)
from daca_catalog.models import DataModelRoleAssignment
from sqlalchemy import select

HEADERS = {"X-DaCa-User": "christian.man"}


def setup_inventory(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    content = base64.b64encode(b"Tabelle;Feldname;Datentyp\nVEHICLE;vehicle_id;CHAR\n").decode()
    preview = client.post("/api/v1/physical-model-csv/preview", headers=HEADERS, json={"contentBase64": content})
    imported = client.post("/api/v1/physical-model-csv/imports", headers=HEADERS, json={
        "contentBase64": content, "fingerprint": preview.json()["fingerprint"], "name": "Shared building inventory",
        "filename": "inventory.csv", "departmentCode": "VBS", "organizationId": REAL_ESTATE_ORGANIZATION_ID})
    assert imported.status_code == 201, imported.text
    inventory = imported.json()
    model = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}", headers=HEADERS)
    table = inventory["snapshot"]["databases"][0]["schemas"][0]["tables"][0]
    snapshot_id = inventory["snapshot"]["snapshot"]["id"]
    payload = {"logicalModelVersionId": model.json()["versionId"],
               "representations": [{"physicalSnapshotId": snapshot_id, "physicalTableId": table["id"]}], "mappings": []}
    return inventory, model, table, payload


def mapping_value(client, table, snapshot_id):
    previous = client.get(f"/api/v1/asset-mappings?logicalModelId={VEHICLE_MODEL_ID}", headers=HEADERS).json()["items"][0]
    value = {key: previous[key] for key in ("logicalModelVersionId", "physicalSnapshotId", "mappingType", "classification",
                                           "responsibleUserId", "validFrom", "logicalFieldVersionIds", "physicalColumnIds")}
    return {**value, "physicalSnapshotId": snapshot_id, "physicalColumnIds": [table["columns"][0]["id"]]}


def test_inventory_from_another_authorized_organization_can_be_added_mapped_and_reloaded(client, session_factory):
    inventory, model, table, payload = setup_inventory(client, session_factory)
    sources = client.get(f"/api/v1/physical-sources?logicalModelId={VEHICLE_MODEL_ID}", headers=HEADERS)
    assert sources.status_code == 200, sources.text
    choice = next(source for source in sources.json()["items"] if source["id"] == inventory["sourceId"])
    assert choice["organizationId"] != model.json()["organizationId"]
    assert choice["representationAttachable"] and choice["representationDisabledReason"] is None
    snapshot_id = payload["representations"][0]["physicalSnapshotId"]
    value = mapping_value(client, table, snapshot_id)
    payload["mappings"] = [{"clientId": "inventory-cross-scope", "value": value}]
    saved = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**HEADERS, "If-Match": model.headers["etag"]}, json=payload)
    assert saved.status_code == 200, saved.text
    assert saved.json()["mappings"][0]["mapping"]["physicalSnapshotId"] == snapshot_id
    assert saved.json()["mappings"][0]["mapping"]["status"] == "draft"
    memberships = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/representations", headers=HEADERS).json()["items"]
    assert table["id"] in {item["physicalTableId"] for item in memberships}
    workspace = client.get(f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}?physicalSnapshotId={snapshot_id}", headers=HEADERS)
    assert workspace.status_code == 200, workspace.text
    # The individual mapping endpoint must apply the same source/model rules.
    individual = client.post("/api/v1/asset-mappings", headers=HEADERS, json=value)
    assert individual.status_code == 201, individual.text
    state = client.get(f'/api/v1/physical-tables/{table["id"]}/domains', headers=HEADERS).json()
    assigned = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/domain-assignment", headers={**HEADERS, "If-Match": model.headers["etag"]}, json={
        "logicalModelVersionId": model.json()["versionId"], "dataDomainId": model.json()["dataDomainId"],
        "physicalDomainTargets": [{"physicalSnapshotId": snapshot_id, "physicalTableId": table["id"], "expectedDomainVersion": state["domainVersion"]}]})
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["physicalDomainAssignments"]


def test_inventory_access_cannot_be_inferred_from_model_edit_rights(client, session_factory):
    inventory, model, table, payload = setup_inventory(client, session_factory)
    snapshot_id = payload["representations"][0]["physicalSnapshotId"]
    value = mapping_value(client, table, snapshot_id)
    payload["mappings"] = [{"clientId": "before-revocation", "value": value}]
    saved = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**HEADERS, "If-Match": model.headers["etag"]}, json=payload)
    assert saved.status_code == 200, saved.text
    mapping_id = saved.json()["mappings"][0]["mapping"]["id"]
    with session_factory() as session:
        assignment = session.scalar(select(DataModelRoleAssignment).where(
            DataModelRoleAssignment.user_id == "christian.man", DataModelRoleAssignment.organization_id == REAL_ESTATE_ORGANIZATION_ID))
        assignment.active = False
        session.commit()
    listed = client.get(f"/api/v1/physical-sources?logicalModelId={VEHICLE_MODEL_ID}", headers=HEADERS)
    assert inventory["sourceId"] not in {source["id"] for source in listed.json()["items"]}
    assert client.get(f"/api/v1/physical-snapshots/{snapshot_id}", headers=HEADERS).status_code == 403
    denied = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**HEADERS, "If-Match": model.headers["etag"]}, json=payload)
    assert denied.status_code == 403
    assert client.post("/api/v1/asset-mappings", headers=HEADERS, json=value).status_code == 403
    assert client.get(f"/api/v1/asset-mappings/{mapping_id}", headers=HEADERS).status_code == 403
    assert client.get(f"/api/v1/asset-mappings/{mapping_id}/versions", headers=HEADERS).status_code == 403
    mappings = client.get(f"/api/v1/asset-mappings?logicalModelId={VEHICLE_MODEL_ID}", headers=HEADERS).json()["items"]
    assert mapping_id not in {item["id"] for item in mappings}
    assert client.get(f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}?physicalSnapshotId={snapshot_id}", headers=HEADERS).status_code == 403
    automatic = client.get(f"/api/v1/mapping-workspaces/{VEHICLE_MODEL_ID}", headers=HEADERS)
    assert automatic.status_code == 200 and automatic.json()["physicalSnapshotId"] != snapshot_id
    memberships = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/representations", headers=HEADERS).json()["items"]
    assert table["id"] in {item["physicalTableId"] for item in memberships}  # Existing membership is not silently removed.
    # Inventory access alone cannot list candidates or attach to a foreign model.
    outsider = {"X-DaCa-User": "mirjam.keller"}
    assert client.get(f"/api/v1/physical-sources?logicalModelId={VEHICLE_MODEL_ID}", headers=outsider).status_code == 403
    assert client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**outsider, "If-Match": model.headers["etag"]}, json=payload).status_code == 403


def test_connected_sources_keep_the_same_organization_requirement(client, session_factory):
    _inventory, model, _table, _payload = setup_inventory(client, session_factory)
    source = client.post("/api/v1/physical-sources", headers=HEADERS, json={"name": "Foreign connected fixture", "adapterType": "fixture",
        "configRef": f"fixture.scope-{uuid.uuid4()}", "departmentCode": "VBS", "organizationId": REAL_ESTATE_ORGANIZATION_ID})
    assert source.status_code == 201, source.text
    imported = client.post(f'/api/v1/physical-sources/{source.json()["id"]}/imports', headers={**HEADERS, "If-Match": source.headers["etag"]}, json={"fixtureVariant": "baseline"})
    assert imported.status_code == 200, imported.text
    tree = imported.json()
    table = tree["databases"][0]["schemas"][0]["tables"][0]
    choices = client.get(f"/api/v1/physical-sources?logicalModelId={VEHICLE_MODEL_ID}", headers=HEADERS).json()["items"]
    choice = next(item for item in choices if item["id"] == source.json()["id"])
    assert choice["representationAttachable"] is False and "Angebundene Quelle" in choice["representationDisabledReason"]
    snapshot_id = tree["snapshot"]["id"]
    result = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**HEADERS, "If-Match": model.headers["etag"]}, json={
        "logicalModelVersionId": model.json()["versionId"], "representations": [{"physicalSnapshotId": snapshot_id, "physicalTableId": table["id"]}], "mappings": []})
    assert result.status_code == 422
    assert client.post("/api/v1/asset-mappings", headers=HEADERS, json=mapping_value(client, table, snapshot_id)).status_code == 422
