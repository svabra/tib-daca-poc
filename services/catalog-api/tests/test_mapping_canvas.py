from concurrent.futures import ThreadPoolExecutor
from uuid import UUID

import pytest
from daca_catalog.modeling_seed import S3_PHYSICAL_SOURCE_ID, seed_modeling_catalog
from daca_catalog.models import AuditEvent, MappingCanvasLayout
from sqlalchemy import func, select
from test_model_representations import HEADERS, body_for, context


def paths(model):
    root = f"/api/v1/logical-models/{model['id']}"
    return f"{root}/mapping-drafts", f"{root}/canvas-layout"


def test_shared_layout_survives_seed_and_is_readable_by_other_people_without_model_revision(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    write, read = paths(model)
    assert client.get(read, headers=HEADERS).json() == {"revision": 0, "positions": {}}
    positions = {"logical": {"x": 120, "y": 90}, f"physical:{table['id']}": {"x": 650, "y": 150}}
    body = {**body_for(model, snapshot, table), "canvasLayout": {"revision": 0, "positions": positions}}
    response = client.post(write, headers={**HEADERS, "If-Match": etag}, json=body)
    assert response.status_code == 200, response.text
    assert response.json()["canvasLayout"] == {"revision": 1, "positions": positions}
    with session_factory() as session:
        seed_modeling_catalog(session)
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.resource_type == "mapping-canvas")) == 1
    for actor in ("christian.man", "christian.spider", "sibilla.micheli"):
        result = client.get(read, headers={"X-DaCa-User": actor})
        assert result.status_code == 200, result.text
        assert result.json() == {"revision": 1, "positions": positions}
    current = client.get(f"/api/v1/logical-models/{model['id']}", headers=HEADERS).json()
    assert current["versionId"] == model["versionId"]
    # A deputy can read the shared presentation, but cannot overwrite it.
    body["canvasLayout"]["revision"] = 1
    assert client.post(write, headers={"X-DaCa-User": "sibilla.micheli", "If-Match": etag}, json=body).status_code == 403


@pytest.mark.parametrize("positions", [
    {"logical": {"x": -1, "y": 15}},
    {"logical": {"x": 100_001, "y": 15}},
    {"unexpected": {"x": 20, "y": 20}},
    {"physical:00000000-0000-0000-0000-000000000000": {"x": 20, "y": 20}},
])
def test_invalid_layout_rolls_back_new_representation(client, session_factory, positions):
    model, etag, snapshot, table = context(client, session_factory)
    write, read = paths(model)
    body = {**body_for(model, snapshot, table), "canvasLayout": {"revision": 0, "positions": positions}}
    response = client.post(write, headers={**HEADERS, "If-Match": etag}, json=body)
    assert response.status_code == 422, response.text
    assert client.get(read, headers=HEADERS).json()["revision"] == 0
    items = client.get(f"/api/v1/logical-models/{model['id']}/representations", headers=HEADERS).json()["items"]
    assert table["id"] not in {item["physicalTableId"] for item in items}


def test_returned_source_positions_are_hidden_and_cannot_be_changed_but_are_preserved(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    write, read = paths(model)
    key = f"physical:{table['id']}"
    body = {**body_for(model, snapshot, table), "canvasLayout": {"revision": 0, "positions": {key: {"x": 600, "y": 80}}}}
    assert client.post(write, headers={**HEADERS, "If-Match": etag}, json=body).status_code == 200
    assert client.post(f"/api/v1/physical-sources/{S3_PHYSICAL_SOURCE_ID}/access/relinquish", headers=HEADERS).status_code == 204
    assert client.get(read, headers=HEADERS).json() == {"revision": 1, "positions": {}}
    logical_only = {"logicalModelVersionId": model["versionId"], "canvasLayout": {"revision": 1, "positions": {key: {"x": 700, "y": 90}}}}
    assert client.post(write, headers={**HEADERS, "If-Match": etag}, json=logical_only).status_code == 422
    logical_only["canvasLayout"]["positions"] = {"logical": {"x": 180, "y": 120}}
    response = client.post(write, headers={**HEADERS, "If-Match": etag}, json=logical_only)
    assert response.status_code == 200, response.text
    assert key not in response.json()["canvasLayout"]["positions"]
    with session_factory() as session:
        assert session.get(MappingCanvasLayout, UUID(model["id"])).positions[key] == {"x": 600, "y": 80}


def test_concurrent_layout_saves_accept_one_and_reject_stale_draft_atomically(client, session_factory):
    model, etag, snapshot, table = context(client, session_factory)
    write, read = paths(model)

    def save(x):
        body = {**body_for(model, snapshot, table), "canvasLayout": {"revision": 0, "positions": {"logical": {"x": x, "y": 30}}}}
        return client.post(write, headers={**HEADERS, "If-Match": etag}, json=body)

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, [100, 200]))
    assert sorted(response.status_code for response in results) == [200, 409]
    saved = client.get(read, headers=HEADERS).json()
    assert saved["revision"] == 1 and saved["positions"]["logical"]["x"] in {100, 200}
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(AuditEvent.resource_type == "mapping-canvas")) == 1
