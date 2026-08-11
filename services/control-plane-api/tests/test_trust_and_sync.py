from fastapi.testclient import TestClient


def create_grant(
    client: TestClient,
    provider: dict,
    consumer: dict,
    *,
    state: str = "approved",
    scopes: list[str] | None = None,
) -> tuple[dict, str]:
    response = client.post(
        "/api/v1/trust-grants",
        json={
            "providerId": provider["id"],
            "consumerId": consumer["id"],
            "state": state,
            "allowedResourceTypes": scopes or ["metadata", "lineage", "provenance"],
        },
    )
    assert response.status_code == 201, response.text
    return response.json(), response.headers["etag"]


def sync_payload(provider: dict, consumer: dict, **overrides) -> dict:
    payload = {
        "name": "Federal to canton",
        "sourceId": provider["id"],
        "targetId": consumer["id"],
        "direction": "push",
        "resourceScopes": ["metadata", "lineage"],
        "schedule": "manual",
        "enabled": True,
    }
    payload.update(overrides)
    return payload


def test_enabled_sync_requires_matching_approved_directed_trust(
    client: TestClient, two_catalogs: tuple[dict, dict]
) -> None:
    provider, consumer = two_catalogs
    no_grant = client.post("/api/v1/sync-configurations", json=sync_payload(provider, consumer))
    assert no_grant.status_code == 422
    assert no_grant.json()["type"] == "urn:didaca:problem:sync-not-trusted"

    grant, grant_etag = create_grant(client, provider, consumer, state="pending")
    pending = client.post(
        "/api/v1/sync-configurations",
        json=sync_payload(provider, consumer, trustGrantId=grant["id"]),
    )
    assert pending.status_code == 422

    approved = client.patch(
        f"/api/v1/trust-grants/{grant['id']}",
        headers={"If-Match": grant_etag},
        json={"state": "approved"},
    )
    assert approved.status_code == 200

    configured = client.post(
        "/api/v1/sync-configurations",
        json=sync_payload(provider, consumer, trustGrantId=grant["id"]),
    )
    assert configured.status_code == 201, configured.text
    assert configured.json()["enabled"] is True
    assert configured.json()["syncImplemented"] is False
    assert configured.json()["conflictPolicy"] == "origin-wins"


def test_direction_scope_filters_and_policy_opt_in_are_enforced(
    client: TestClient, two_catalogs: tuple[dict, dict]
) -> None:
    provider, consumer = two_catalogs
    grant, _ = create_grant(
        client,
        provider,
        consumer,
        scopes=["metadata", "policy"],
    )

    reversed_route = client.post(
        "/api/v1/sync-configurations",
        json=sync_payload(
            consumer,
            provider,
            name="Reverse",
            trustGrantId=grant["id"],
            resourceScopes=["metadata"],
        ),
    )
    assert reversed_route.status_code == 422

    policy = client.post(
        "/api/v1/sync-configurations",
        json=sync_payload(
            provider,
            consumer,
            name="Policies",
            trustGrantId=grant["id"],
            resourceScopes=["policy"],
        ),
    )
    assert policy.status_code == 422
    assert policy.json()["type"] == "urn:didaca:problem:policy-sync-disabled"


def test_revoking_trust_safely_disables_enabled_configuration(
    client: TestClient, two_catalogs: tuple[dict, dict]
) -> None:
    provider, consumer = two_catalogs
    grant, grant_etag = create_grant(client, provider, consumer)
    created = client.post(
        "/api/v1/sync-configurations",
        json=sync_payload(provider, consumer, trustGrantId=grant["id"]),
    )
    assert created.status_code == 201

    revoked = client.patch(
        f"/api/v1/trust-grants/{grant['id']}",
        headers={"If-Match": grant_etag},
        json={"state": "revoked"},
    )
    assert revoked.status_code == 200

    configuration = client.get(f"/api/v1/sync-configurations/{created.json()['id']}").json()
    assert configuration["enabled"] is False
    assert configuration["revision"] == 2

    events = client.get(
        "/api/v1/audit-events",
        params={"aggregateId": configuration["id"]},
    ).json()["items"]
    assert "sync-configuration.auto-disabled" in [event["action"] for event in events]


def test_filter_restrictions_must_be_narrowed_in_sync(
    client: TestClient, two_catalogs: tuple[dict, dict]
) -> None:
    provider, consumer = two_catalogs
    response = client.post(
        "/api/v1/trust-grants",
        json={
            "providerId": provider["id"],
            "consumerId": consumer["id"],
            "state": "approved",
            "allowedResourceTypes": ["metadata"],
            "ownerFilters": ["ESTV"],
        },
    )
    grant = response.json()

    broad = client.post(
        "/api/v1/sync-configurations",
        json=sync_payload(
            provider,
            consumer,
            trustGrantId=grant["id"],
            resourceScopes=["metadata"],
        ),
    )
    assert broad.status_code == 422

    narrow = client.post(
        "/api/v1/sync-configurations",
        json=sync_payload(
            provider,
            consumer,
            trustGrantId=grant["id"],
            resourceScopes=["metadata"],
            ownerFilters=["ESTV"],
        ),
    )
    assert narrow.status_code == 201
