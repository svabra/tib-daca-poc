import uuid
from datetime import UTC, datetime, timedelta

import pytest
from daca_catalog.modeling_seed import seed_modeling_catalog
from daca_catalog.models import AuditEvent, DataProduct, LineageEdge, SourceCatalogEntry
from daca_catalog.seed import ESTV_PRODUCT_ID
from sqlalchemy import select

EDGE = "31111111-1111-4111-8111-222222222222"
SOURCE_EDGE = "31111111-1111-4111-8111-111111111111"
READ = f"/api/v1/data-products/{ESTV_PRODUCT_ID}/lineage/{EDGE}/access-events"
WRITE = f"/internal/v1/lineage/{EDGE}/access-events"
OWNER = {"X-DaCa-User": "kassandra.valdata"}
REPORTER = {"Authorization": "Bearer test-internal-token"}


@pytest.fixture(autouse=True)
def identities(session_factory):
    with session_factory() as session:
        seed_modeling_catalog(session)
        session.commit()


def event(**changes):
    return {"id": str(uuid.uuid4()), "occurredAt": datetime.now(UTC).isoformat(),
            "subjectId": "kanton-st-gallen", "subjectType": "person", "protocol": "http-rest",
            "outcome": "success", **changes}


def test_owner_capability_and_direct_url_are_strictly_object_scoped(client, session_factory):
    assert client.get(READ, headers=OWNER).status_code == 200
    for user in ("christian.man", "mirjam.keller", "kanton-st-gallen", "daca-test-editor"):
        denied = client.get(READ, headers={"X-DaCa-User": user})
        assert denied.status_code in (401, 403)
        assert "items" not in denied.json()
    assert client.get(READ, headers={"X-DaCa-User": ""}).status_code == 401
    for actor, allowed in (("kassandra.valdata", True), ("mirjam.keller", False)):
        lineage = client.get(f"/api/v1/data-products/{ESTV_PRODUCT_ID}/lineage", headers={"X-DaCa-User": actor}).json()
        assert next(edge for edge in lineage["edges"] if edge["id"] == EDGE)["canViewAccessLogs"] is allowed
        assert next(edge for edge in lineage["edges"] if edge["id"] == SOURCE_EDGE)["canViewAccessLogs"] is False
    assert client.get(READ.replace(EDGE, SOURCE_EDGE), headers=OWNER).status_code == 403
    assert client.get(READ.replace(str(ESTV_PRODUCT_ID), str(uuid.uuid4())), headers=OWNER).status_code == 404
    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        product.deputy_owner_user_id = "mirjam.keller"
        session.commit()
    assert client.get(READ, headers={"X-DaCa-User": "mirjam.keller"}).status_code == 403
    with session_factory() as session:
        product = session.get(DataProduct, ESTV_PRODUCT_ID)
        product.owner_user_id = "mirjam.keller"
        product.deputy_owner_user_id = None
        session.commit()
    assert client.get(READ, headers=OWNER).status_code == 403
    assert client.get(READ, headers={"X-DaCa-User": "mirjam.keller"}).status_code == 200


def test_receipts_require_reporter_and_are_idempotent_not_mutable(client, session_factory):
    body = event()
    assert client.post(WRITE, headers=OWNER, json=body).status_code == 401
    assert client.post(WRITE, headers={"Authorization": "Bearer wrong"}, json=body).status_code == 401
    assert client.post(WRITE, headers=REPORTER, json={**body, "payload": "must never be logged"}).status_code == 422
    assert client.post(WRITE, headers=REPORTER, json=body).status_code == 201
    assert client.post(WRITE, headers=REPORTER, json=body).status_code == 200
    assert client.post(WRITE, headers=REPORTER, json={**body, "subjectType": "machine"}).status_code == 409
    with session_factory() as session:
        receipt = session.get(AuditEvent, uuid.UUID(body["id"]))
        assert receipt.details == {"schemaVersion": 1, "resourceUrn": "urn:daca:ch:estv:tax-statistics-by-canton",
            "consumerUrn": "urn:daca:ch:sg:finance-dashboard", "subjectType": "person", "protocol": "http-rest", "outcome": "success"}
        assert receipt.actor == body["subjectId"]
    page = client.get(READ, headers=OWNER)
    assert page.headers["cache-control"] == "no-store"
    assert page.json()["items"][0]["subjectType"] == "person"
    assert page.json()["items"][0]["id"] == body["id"]


def test_filters_and_cursor_never_mix_other_edges_or_principals(client, session_factory):
    now = datetime.now(UTC)
    bodies = [event(occurredAt=(now - timedelta(minutes=index)).isoformat(),
        subjectId=f"svc-dashboard-{index}" if index % 2 else "kanton-st-gallen",
        subjectType="machine" if index % 2 else "person", outcome="denied" if index == 3 else "success") for index in range(5)]
    for body in bodies:
        assert client.post(WRITE, headers=REPORTER, json=body).status_code == 201
    other = event(subjectId="other-edge-reader")
    assert client.post(WRITE.replace(EDGE, SOURCE_EDGE), headers=REPORTER, json=other).status_code == 201
    first = client.get(READ, headers=OWNER, params={"limit": 2}).json()
    second = client.get(READ, headers=OWNER, params={"limit": 2, "cursor": first["nextCursor"]}).json()
    third = client.get(READ, headers=OWNER, params={"limit": 2, "cursor": second["nextCursor"]}).json()
    assert [row["id"] for page in (first, second, third) for row in page["items"]] == [body["id"] for body in bodies]
    assert third["nextCursor"] is None
    machines = client.get(READ, headers=OWNER, params={"subjectType": "machine", "outcome": "success"}).json()
    assert [row["subjectId"] for row in machines["items"]] == ["svc-dashboard-1"]
    assert len(client.get(READ, headers=OWNER, params={"after": (now-timedelta(seconds=30)).isoformat()}).json()["items"]) == 1
    for params in ({"cursor": "invalid"}, {"limit": 101}, {"after": "2026-01-01T00:00:00"}, {"subjectType": "admin"}):
        assert client.get(READ, headers=OWNER, params=params).status_code == 422
    # Even if an edge is retargeted, its current owner cannot read receipts for its former resource/consumer.
    with session_factory() as session:
        edge = session.get(LineageEdge, uuid.UUID(EDGE))
        edge.target_urn = "urn:daca:other:consumer"
        session.commit()
    assert client.get(READ, headers=OWNER).json()["items"] == []


def test_invalid_and_retired_receipts_do_not_create_evidence(client, session_factory):
    for changes in ({"occurredAt": "2026-01-01T12:00:00"}, {"occurredAt": (datetime.now(UTC)+timedelta(days=1)).isoformat()},
                    {"subjectId": "user\nsecret"}, {"subjectType": "group"}, {"protocol": "s3"}):
        assert client.post(WRITE, headers=REPORTER, json=event(**changes)).status_code == 422
    with session_factory() as session:
        edge = session.get(LineageEdge, uuid.UUID(EDGE))
        edge.state = "deprecated"
        session.commit()
    assert client.post(WRITE, headers=REPORTER, json=event()).status_code == 409
    with session_factory() as session:
        assert not list(session.scalars(select(AuditEvent).where(AuditEvent.resource_type == "lineage-access")))


def test_registered_source_owner_can_read_without_inheriting_downstream_product_ownership(client, session_factory):
    urn = "urn:daca:test:registered-source"
    with session_factory() as session:
        session.add(SourceCatalogEntry(id=urn, source_type="oracle", database_name="synthetic",
            display_name="Registered source", description="Metadata only", organization="VBS",
            owner_user_id="mirjam.keller", sites=[], search_objects=[], discoverability_group_ids=[], mock_profile={}, active=True))
        edge = session.get(LineageEdge, uuid.UUID(SOURCE_EDGE))
        edge.source_urn = urn
        session.commit()
    path = READ.replace(EDGE, SOURCE_EDGE)
    assert client.get(path, headers={"X-DaCa-User": "mirjam.keller"}).status_code == 200
    assert client.get(path, headers=OWNER).status_code == 403
    with session_factory() as session:
        session.get(SourceCatalogEntry, urn).active = False
        session.commit()
    assert client.get(path, headers={"X-DaCa-User": "mirjam.keller"}).status_code == 403
