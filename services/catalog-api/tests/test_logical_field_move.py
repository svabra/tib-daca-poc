import uuid
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy

import pytest
from daca_catalog.modeling_seed import PERSONNEL_MODEL_ID, seed_modeling_catalog
from daca_catalog.modeling_service import logical_write_from_payload
from daca_catalog.models import AuditEvent, LogicalField
from fastapi import HTTPException
from sqlalchemy import select

HEADERS = {"X-DaCa-User": "cinthya.thor"}


def prepare(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    source = client.get(f"/api/v1/logical-models/{PERSONNEL_MODEL_ID}", headers=HEADERS).json()
    write = logical_write_from_payload(source).model_dump(mode="json", by_alias=True)
    write["identifiers"] = [f"move-{uuid.uuid4()}"]
    write["entities"] = [{**write["entities"][0], "id": None, "fields": [
        {**write["entities"][0]["fields"][0], "id": None, "name": "existing_target_field"}
    ]}]
    response = client.post("/api/v1/logical-models", headers=HEADERS, json=write)
    assert response.status_code == 201, response.text
    target = response.json()
    field = source["entities"][0]["fields"][0]
    body = {"sourceVersionId": source["versionId"], "targetModelId": target["id"],
            "targetVersionId": target["versionId"], "targetEntityId": target["entities"][0]["id"]}
    path = f"/api/v1/logical-models/{source['id']}/fields/{field['id']}/move"
    return source, target, field, body, path


def test_move_versions_both_models_and_preserves_historical_fields_and_audit(client, session_factory):
    source, target, field, body, path = prepare(client, session_factory)
    mappings_before = client.get(f"/api/v1/asset-mappings?logicalModelId={source['id']}", headers=HEADERS).json()["items"]
    moved = client.post(path, headers=HEADERS, json=body)
    assert moved.status_code == 200, moved.text
    assert moved.json()["revision"] == source["revision"] + 1
    assert field["name"] not in [f["name"] for e in moved.json()["entities"] for f in e["fields"]]
    changed = client.get(f"/api/v1/logical-models/{target['id']}", headers=HEADERS).json()
    assert changed["revision"] == target["revision"] + 1
    copied = changed["entities"][0]["fields"][-1]
    for key in ("name", "dataType", "shortDescription", "classification", "businessObjectVersionId", "conceptIds"):
        assert copied[key] == field[key]
    assert copied["id"] != field["id"]
    assert copied["position"] == 1
    mappings_after = client.get(f"/api/v1/asset-mappings?logicalModelId={source['id']}", headers=HEADERS).json()["items"]
    for mapping in mappings_before:
        if field["fieldVersionId"] in mapping["logicalFieldVersionIds"]:
            assert next(item for item in mappings_after if item["id"] == mapping["id"])["status"] == "superseded"
    historical = client.get(f"/api/v1/logical-models/{source['id']}/versions", headers=HEADERS)
    assert historical.status_code == 200
    original = next(item for item in historical.json()["items"] if item["versionId"] == source["versionId"])
    assert original["entities"][0]["fields"][0]["id"] == field["id"]
    with session_factory() as session:
        assert session.get(LogicalField, uuid.UUID(field["id"])).lifecycle == "retired"
        audit = session.scalar(select(AuditEvent).where(AuditEvent.action == "moved", AuditEvent.resource_id == field["id"]))
        assert audit.actor == "cinthya.thor"
        assert audit.details["targetFieldId"] == copied["id"]
    assert client.post(path, headers=HEADERS, json=body).status_code == 409


def test_target_failure_rolls_back_source_and_audit(client, session_factory, monkeypatch):
    from daca_catalog import modeling_api
    source, target, field, body, path = prepare(client, session_factory)
    original = modeling_api.create_logical_successor
    def fail_target(session, model, *args, **kwargs):
        if str(model.id) == target["id"]:
            raise HTTPException(409, "Simulated target conflict")
        return original(session, model, *args, **kwargs)
    monkeypatch.setattr(modeling_api, "create_logical_successor", fail_target)
    assert client.post(path, headers=HEADERS, json=body).status_code == 409
    assert client.get(f"/api/v1/logical-models/{source['id']}", headers=HEADERS).json()["versionId"] == source["versionId"]
    with session_factory() as session:
        assert session.get(LogicalField, uuid.UUID(field["id"])).lifecycle == "active"
        assert session.scalar(select(AuditEvent).where(AuditEvent.action == "moved", AuditEvent.resource_id == field["id"])) is None


@pytest.mark.parametrize("change,status", [("stale_source",409),("stale_target",409),("same_model",422),("foreign_entity",422),("missing_field",404),("deputy",403)])
def test_rejected_move_changes_neither_model(client, session_factory, change, status):
    source, target, _field, body, path = prepare(client, session_factory)
    request = deepcopy(body)
    headers = HEADERS
    if change == "stale_source": request["sourceVersionId"] = str(uuid.uuid4())
    if change == "stale_target": request["targetVersionId"] = str(uuid.uuid4())
    if change == "same_model": request["targetModelId"] = source["id"]
    if change == "foreign_entity": request["targetEntityId"] = source["entities"][0]["id"]
    if change == "missing_field": path = path.replace(_field["id"], str(uuid.uuid4()))
    if change == "deputy": headers = {"X-DaCa-User":"sibilla.micheli"}
    result = client.post(path, headers=headers, json=request)
    assert result.status_code == status, result.text
    for model in (source, target):
        current = client.get(f"/api/v1/logical-models/{model['id']}", headers=HEADERS).json()
        assert current["versionId"] == model["versionId"]


def test_concurrent_moves_have_one_winner(client, session_factory):
    source, target, _field, body, path = prepare(client, session_factory)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post(path, headers=HEADERS, json=body).status_code, range(2)))
    assert sorted(results) == [200,409]
    for model in (source, target):
        assert client.get(f"/api/v1/logical-models/{model['id']}", headers=HEADERS).json()["revision"] == model["revision"] + 1


def test_last_field_and_duplicate_name_are_rejected(client, session_factory):
    source, target, field, body, path = prepare(client, session_factory)
    reverse = {"sourceVersionId":target["versionId"],"targetModelId":source["id"],"targetVersionId":source["versionId"],"targetEntityId":source["entities"][0]["id"]}
    reverse_path=f"/api/v1/logical-models/{target['id']}/fields/{target['entities'][0]['fields'][0]['id']}/move"
    assert client.post(reverse_path,headers=HEADERS,json=reverse).status_code == 409
    write=logical_write_from_payload(target).model_dump(mode="json",by_alias=True)
    write["entities"][0]["fields"][0]["name"]=field["name"]
    updated=client.put(f"/api/v1/logical-models/{target['id']}/versions/{target['versionId']}",headers={**HEADERS,"If-Match":f'"{target["lockVersion"]}"'},json=write)
    assert updated.status_code == 200, updated.text
    body["targetVersionId"]=updated.json()["versionId"]
    assert client.post(path,headers=HEADERS,json=body).status_code == 409
