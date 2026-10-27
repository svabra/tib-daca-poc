import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
import pytest
from daca_catalog import structure_inventory_api
from daca_catalog.import_journey_api import ada_inventory_bytes, ada_source_id
from daca_catalog.import_journey_cli import local_url, reset_import
from daca_catalog.modeling_seed import VEHICLE_MODEL_ID, seed_modeling_catalog
from daca_catalog.models import AuditEvent, DataModelRoleAssignment, PhysicalSource
from daca_catalog.physical_csv import parse_inventory
from fastapi import HTTPException
from sqlalchemy import func, select

ACTOR = {"X-DaCa-User": "christian.man"}
SCOPE = {"departmentCode": "VBS", "organizationId": "vbs-verteidigung"}
STATUS = "/api/v1/import-journeys/ada"


def prepare(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    content = base64.b64encode(ada_inventory_bytes()).decode()
    preview = parse_inventory(content).preview()
    body = {**SCOPE, "name": "AdA example", "filename": "ada_bewirtschaftung.csv",
            "contentBase64": content, "fingerprint": preview["fingerprint"]}
    response = client.post("/api/v1/physical-model-csv/imports", headers=ACTOR, json=body)
    assert response.status_code == 201, response.text
    return response.json(), body


def test_download_is_the_exact_versioned_inventory_and_requires_modeling_access(client, session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
    response = client.get(STATUS + "/inventory.csv", headers=ACTOR)
    assert response.status_code == 200 and response.content == ada_inventory_bytes()
    assert 'filename="ada_bewirtschaftung.csv"' in response.headers["content-disposition"]
    repo_file = Path(__file__).resolve().parents[3] / "examples/ada-bewirtschaftung/ada_bewirtschaftung.csv"
    assert repo_file.read_bytes() == response.content
    preview = parse_inventory(base64.b64encode(response.content).decode()).preview()
    assert (preview["tableCount"], preview["fieldCount"]) == (11, 62)
    assert client.get(STATUS + "/inventory.csv", headers={"X-DaCa-User": "kassandra.valdata"}).status_code == 403


def test_reset_is_scoped_idempotent_preserves_other_sources_and_audit_and_allows_reimport(client, session_factory):
    imported, body = prepare(client, session_factory)
    with session_factory() as session:
        before = set(session.scalars(select(PhysicalSource.id)))
    source = client.get(STATUS, params=SCOPE, headers=ACTOR).json()["source"]
    assert source["id"] == imported["sourceId"] and source["revision"] == 1
    reset = client.post(STATUS + "/reset", json=SCOPE, headers={**ACTOR, "If-Match": '"1"'})
    assert reset.status_code == 200 and reset.json()["alreadyReset"] is False
    assert client.get(STATUS, params=SCOPE, headers=ACTOR).json()["source"] is None
    again = client.post(STATUS + "/reset", json=SCOPE, headers=ACTOR)
    assert again.status_code == 200 and again.json()["alreadyReset"] is True
    with session_factory() as session:
        assert set(session.scalars(select(PhysicalSource.id))) == before - {ada_source_id("VBS", "vbs-verteidigung")}
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.resource_type == "structure-inventory", AuditEvent.action == "deleted",
            AuditEvent.resource_id == imported["sourceId"])) == 1
    restored = client.post("/api/v1/physical-model-csv/imports", headers=ACTOR, json=body)
    assert restored.status_code == 201 and restored.json()["reused"] is False
    # A prior confirmation cannot reset a new import with the same stable source ID.
    assert client.post(STATUS + "/reset", json=SCOPE, headers={**ACTOR, "If-Match": '"1"'}).status_code == 412


def test_reset_requires_scope_and_current_revision_and_blocks_model_bindings(client, session_factory):
    imported, _body = prepare(client, session_factory)
    forbidden = {"X-DaCa-User": "giuseppe.starwars"}
    assert client.get(STATUS, params=SCOPE, headers=forbidden).status_code == 403
    assert client.post(STATUS + "/reset", json=SCOPE, headers={**forbidden, "If-Match": '"1"'}).status_code == 403
    assert client.post(STATUS + "/reset", json=SCOPE, headers=ACTOR).status_code == 428
    assert client.post(STATUS + "/reset", json=SCOPE, headers={**ACTOR, "If-Match": '"0"'}).status_code == 412
    model = client.get(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}", headers=ACTOR)
    table = imported["snapshot"]["databases"][0]["schemas"][0]["tables"][0]
    binding = client.post(f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/mapping-drafts", headers={**ACTOR, "If-Match": model.headers["etag"]}, json={
        "logicalModelVersionId": model.json()["versionId"], "representations": [{
            "physicalSnapshotId": imported["snapshot"]["snapshot"]["id"], "physicalTableId": table["id"]}], "mappings": []})
    assert binding.status_code == 200, binding.text
    assert client.post(STATUS + "/reset", json=SCOPE, headers={**ACTOR, "If-Match": '"1"'}).status_code == 409
    assert client.get(STATUS, params=SCOPE, headers=ACTOR).json()["source"]["id"] == imported["sourceId"]


def test_concurrent_resets_remove_once(client, session_factory):
    prepare(client, session_factory)
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: client.post(STATUS + "/reset", json=SCOPE, headers={**ACTOR, "If-Match": '"1"'}), range(2)))
    assert all(r.status_code == 200 for r in responses), [r.text for r in responses]
    assert sorted(r.json()["alreadyReset"] for r in responses) == [False, True]


def test_reset_rolls_back_when_audit_fails(client, session_factory, monkeypatch):
    imported, _body = prepare(client, session_factory)
    original = structure_inventory_api.record_audit

    def failed(*args, **kwargs):
        original(*args, **kwargs)
        raise HTTPException(503, "Synthetic audit failure")

    monkeypatch.setattr(structure_inventory_api, "record_audit", failed)
    response = client.post(STATUS + "/reset", json=SCOPE, headers={**ACTOR, "If-Match": '"1"'})
    assert response.status_code == 503
    assert client.get(STATUS, params=SCOPE, headers=ACTOR).json()["source"]["id"] == imported["sourceId"]
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(AuditEvent).where(
            AuditEvent.resource_id == imported["sourceId"], AuditEvent.action == "deleted")) == 0


def test_reset_rechecks_roles_after_target_preview(client, session_factory):
    prepare(client, session_factory)
    assert client.get(STATUS, params=SCOPE, headers=ACTOR).status_code == 200
    with session_factory() as session:
        for role in session.scalars(select(DataModelRoleAssignment).where(DataModelRoleAssignment.user_id == "christian.man")):
            role.active = False
        session.commit()
    assert client.post(STATUS + "/reset", json=SCOPE, headers={**ACTOR, "If-Match": '"1"'}).status_code == 403
    with session_factory() as session:
        assert session.get(PhysicalSource, ada_source_id("VBS", "vbs-verteidigung")) is not None


def test_download_and_reset_use_the_authenticated_session_even_with_a_conflicting_header(client, session_factory):
    prepare(client, session_factory)
    assert client.post('/api/v1/session/login', json={"userId": "christian.man"}).status_code == 200
    # The test client's default header is deliberately a different demo identity.
    assert client.get(STATUS + '/inventory.csv').status_code == 200
    assert client.get(STATUS, params=SCOPE, headers={"X-DaCa-User": "kassandra.valdata"}).status_code == 200
    assert client.post('/api/v1/session/login', json={"userId": "kassandra.valdata"}).status_code == 200
    assert client.post(STATUS + '/reset', json=SCOPE, headers={**ACTOR, "If-Match": '"1"'}).status_code == 403
    client.cookies.set('daca_session', 'invalid')
    assert client.get(STATUS + '/inventory.csv', headers=ACTOR).status_code == 401


@pytest.mark.parametrize("url", ["https://example.org", "http://user:secret@localhost", "file:///tmp", "http://localhost/api", "http://localhost?next=x"])
def test_cli_rejects_nonlocal_or_ambiguous_targets(url):
    with pytest.raises(argparse.ArgumentTypeError):
        local_url(url)


def test_cli_previews_until_confirmed_and_uses_session_and_revision():
    requests = []

    def server(request):
        requests.append(request)
        if request.url.path.endswith("/login"):
            return httpx.Response(200, json={"userId": "christian.man"}, headers={"Set-Cookie": "daca_session=test; Path=/"})
        assert request.headers["cookie"] == "daca_session=test"
        if request.method == "GET":
            return httpx.Response(200, json={"source": {"name": "AdA example", "revision": 7}})
        assert request.headers["if-match"] == '"7"'
        return httpx.Response(200, json={"alreadyReset": False})

    with httpx.Client(base_url="http://localhost", transport=httpx.MockTransport(server)) as client:
        assert "Erst --yes" in reset_import(client, user="christian.man", department="VBS", organization="vbs-verteidigung", confirmed=False)
        assert not any(r.url.path.endswith("/reset") for r in requests)
        assert "wurde zurückgesetzt" in reset_import(client, user="christian.man", department="VBS", organization="vbs-verteidigung", confirmed=True)


def test_cli_does_not_force_retry_conflicts():
    resets = []

    def server(request):
        if request.url.path.endswith("/login"):
            return httpx.Response(200, json={"userId": "christian.man"})
        if request.method == "GET":
            return httpx.Response(200, json={"source": {"name": "AdA", "revision": 1}})
        resets.append(request)
        return httpx.Response(409, json={"detail": "Modellverknüpfungen verhindern den Reset."})

    with (httpx.Client(base_url="http://localhost", transport=httpx.MockTransport(server)) as client,
          pytest.raises(RuntimeError, match="Modellverknüpfungen")):
        reset_import(client, user="christian.man", department="VBS", organization="vbs-verteidigung", confirmed=True)
    assert len(resets) == 1
