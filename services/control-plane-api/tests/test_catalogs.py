from fastapi.testclient import TestClient


def test_liveness_readiness_and_service_document(client: TestClient) -> None:
    assert client.get("/health/live").json()["status"] == "ok"
    assert client.get("/health/ready").json() == {
        "status": "ready",
        "database": "available",
    }
    assert client.get("/").json()["federationSyncImplemented"] is False


def test_catalog_crud_uses_camel_case_etags_and_audit(client: TestClient) -> None:
    created = client.post(
        "/api/v1/catalogs",
        headers={"X-Request-ID": "request-123", "X-DiDaCa-Actor": "tester"},
        json={
            "urn": "urn:didaca:catalog:federal",
            "name": "Federal catalog",
            "organization": "BIT",
            "environment": "poc",
            "endpoint": "http://catalog-api:8001/",
            "apiVersion": "v1",
            "capabilities": ["metadata", "lineage"],
        },
    )
    assert created.status_code == 201
    assert created.headers["etag"] == '"1"'
    assert created.headers["x-request-id"] == "request-123"
    body = created.json()
    assert body["apiVersion"] == "v1"
    assert body["desiredRevision"] == 1
    assert body["endpoint"] == "http://catalog-api:8001"

    missing = client.patch(f"/api/v1/catalogs/{body['id']}", json={"name": "Renamed"})
    assert missing.status_code == 428
    assert missing.headers["content-type"].startswith("application/problem+json")
    assert missing.json()["requestId"]

    stale = client.patch(
        f"/api/v1/catalogs/{body['id']}",
        headers={"If-Match": '"0"'},
        json={"name": "Renamed"},
    )
    assert stale.status_code == 412

    updated = client.patch(
        f"/api/v1/catalogs/{body['id']}",
        headers={"If-Match": created.headers["etag"]},
        json={"name": "Renamed"},
    )
    assert updated.status_code == 200
    assert updated.headers["etag"] == '"2"'
    assert updated.json()["name"] == "Renamed"

    events = client.get("/api/v1/audit-events", params={"aggregateId": body["id"]}).json()["items"]
    assert [event["action"] for event in events] == [
        "catalog.created",
        "catalog.updated",
    ]
    assert events[0]["actor"] == "tester"
    assert events[0]["requestId"] == "request-123"


def test_validation_and_duplicate_conflicts_are_problem_json(client: TestClient) -> None:
    invalid = client.post(
        "/api/v1/catalogs",
        json={
            "urn": "not-a-urn",
            "name": "Broken",
            "organization": "BIT",
            "environment": "test",
            "endpoint": "ftp://example.test",
        },
    )
    assert invalid.status_code == 422
    assert invalid.headers["content-type"].startswith("application/problem+json")
    assert invalid.json()["type"] == "urn:didaca:problem:validation"
    assert len(invalid.json()["errors"]) == 2

    payload = {
        "urn": "urn:didaca:catalog:duplicate",
        "name": "First",
        "organization": "BIT",
        "environment": "test",
        "endpoint": "https://example.test",
    }
    assert client.post("/api/v1/catalogs", json=payload).status_code == 201
    duplicate = client.post("/api/v1/catalogs", json=payload)
    assert duplicate.status_code == 409
    assert duplicate.json()["type"] == "urn:didaca:problem:conflict"


def test_cursor_pagination_is_stable(client: TestClient) -> None:
    for suffix in ("one", "two", "three"):
        response = client.post(
            "/api/v1/catalogs",
            json={
                "urn": f"urn:didaca:catalog:{suffix}",
                "name": suffix,
                "organization": "BIT",
                "environment": "test",
                "endpoint": f"https://{suffix}.example.test",
            },
        )
        assert response.status_code == 201

    first = client.get("/api/v1/catalogs", params={"limit": 2}).json()
    assert len(first["items"]) == 2
    assert first["nextCursor"]
    second = client.get(
        "/api/v1/catalogs", params={"limit": 2, "cursor": first["nextCursor"]}
    ).json()
    assert len(second["items"]) == 1
    assert second["nextCursor"] is None
    assert {item["id"] for item in first["items"]}.isdisjoint(
        {item["id"] for item in second["items"]}
    )

    bad_cursor = client.get("/api/v1/catalogs", params={"cursor": "%%%"})
    assert bad_cursor.status_code == 400
