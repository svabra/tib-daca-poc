import asyncio
import socket

import pytest
from didaca_control_plane.api import router
from didaca_control_plane.auth import require_mutation_actor
from didaca_control_plane.config import Settings
from didaca_control_plane.health import check_catalog_health
from didaca_control_plane.main import create_app
from didaca_control_plane.models import CatalogInstance
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker


def catalog_payload(suffix: str, endpoint: str) -> dict[str, object]:
    return {
        "urn": f"urn:didaca:catalog:security-{suffix}",
        "name": f"Security test {suffix}",
        "organization": "BIT",
        "environment": "test",
        "endpoint": endpoint,
        "apiVersion": "v1",
        "capabilities": ["metadata"],
    }


def test_every_mutating_route_has_demo_actor_gate() -> None:
    mutations = []
    missing = []
    for route_item in router.routes:
        methods = set(route_item.methods) & {"POST", "PUT", "PATCH", "DELETE"}
        if not methods:
            continue
        mutations.extend(f"{method} {route_item.path}" for method in sorted(methods))
        dependencies = route_item.dependant.dependencies
        if not any(dependency.call is require_mutation_actor for dependency in dependencies):
            missing.extend(f"{method} {route_item.path}" for method in sorted(methods))

    assert len(mutations) == 9
    assert missing == []


def test_mutation_requires_nonblank_actor_but_reads_remain_public(client: TestClient) -> None:
    assert client.get("/api/v1/catalogs", headers={"X-DiDaCa-Actor": ""}).status_code == 200

    response = client.post(
        "/api/v1/catalogs",
        headers={"X-DiDaCa-Actor": "   "},
        json=catalog_payload("missing-actor", "http://catalog-api:8001"),
    )

    assert response.status_code == 401
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["type"] == "urn:didaca:problem:identity-required"


def test_disabled_demo_auth_fails_mutations_closed_and_keeps_reads_available(
    session_factory: sessionmaker[Session],
) -> None:
    application = create_app(
        settings=Settings(
            database_url="sqlite+pysqlite://",
            health_poll_interval_seconds=0,
            seed_on_startup=False,
            demo_auth=False,
            endpoint_host_allowlist="catalog-api",
        ),
        session_factory=session_factory,
    )
    with TestClient(application) as disabled_client:
        assert disabled_client.get("/api/v1/catalogs").status_code == 200
        response = disabled_client.post(
            "/api/v1/catalogs",
            headers={"X-DiDaCa-Actor": "demo-control-admin"},
            json=catalog_payload("disabled-auth", "http://catalog-api:8001"),
        )

    assert response.status_code == 503
    assert response.json()["type"] == "urn:didaca:problem:identity-unavailable"


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://127.0.0.1:8001",
        "http://[::1]:8001",
        "http://10.2.3.4:8001",
        "http://169.254.169.254/latest/meta-data",
        "http://192.0.2.1",
        "http://224.0.0.1",
        "http://0.0.0.0",
    ],
)
def test_registration_rejects_non_public_address_ranges(client: TestClient, endpoint: str) -> None:
    response = client.post(
        "/api/v1/catalogs",
        json=catalog_payload(endpoint.replace(":", "-").replace("/", "-")[0:40], endpoint),
    )

    assert response.status_code == 422
    assert response.json()["type"] == "urn:didaca:problem:unsafe-catalog-endpoint"


@pytest.mark.parametrize(
    "endpoint",
    [
        "ftp://catalog-api:21",
        "http://user:password@catalog-api:8001",
        "http://catalog-api:8001/#internal",
    ],
)
def test_registration_rejects_non_http_credentials_and_fragments(
    client: TestClient, endpoint: str
) -> None:
    response = client.post(
        "/api/v1/catalogs",
        json=catalog_payload("bad-url", endpoint),
    )

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")


def test_registration_rejects_unresolvable_and_private_dns(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def unresolvable(*_args, **_kwargs):
        raise socket.gaierror("not found")

    monkeypatch.setattr("didaca_control_plane.endpoint_security.socket.getaddrinfo", unresolvable)
    unresolved = client.post(
        "/api/v1/catalogs",
        json=catalog_payload("unresolved", "https://unresolved.didaca.example"),
    )
    assert unresolved.status_code == 422
    assert "cannot be resolved" in unresolved.json()["detail"]

    def private_dns(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.20.30.40", 443))]

    monkeypatch.setattr("didaca_control_plane.endpoint_security.socket.getaddrinfo", private_dns)
    private = client.post(
        "/api/v1/catalogs",
        json=catalog_payload("private-dns", "https://private.didaca.example"),
    )
    assert private.status_code == 422
    assert "non-public address" in private.json()["detail"]


def test_public_dns_and_explicit_docker_allowlist_are_accepted(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    def public_dns(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    monkeypatch.setattr("didaca_control_plane.endpoint_security.socket.getaddrinfo", public_dns)
    public = client.post(
        "/api/v1/catalogs",
        json=catalog_payload("public-dns", "https://public.didaca.example"),
    )
    assert public.status_code == 201

    def dns_must_not_run(*_args, **_kwargs):
        raise AssertionError("allowlisted catalog-api should bypass DNS classification")

    monkeypatch.setattr(
        "didaca_control_plane.endpoint_security.socket.getaddrinfo", dns_must_not_run
    )
    docker = client.post(
        "/api/v1/catalogs",
        json=catalog_payload("docker", "http://catalog-api:8001"),
    )
    assert docker.status_code == 201


def test_catalog_patch_revalidates_endpoint(client: TestClient) -> None:
    created = client.post(
        "/api/v1/catalogs",
        json=catalog_payload("patch", "http://catalog-api:8001"),
    )
    assert created.status_code == 201

    response = client.patch(
        f"/api/v1/catalogs/{created.json()['id']}",
        headers={"If-Match": created.headers["etag"]},
        json={"endpoint": "http://127.0.0.1:8001"},
    )

    assert response.status_code == 422
    assert response.json()["type"] == "urn:didaca:problem:unsafe-catalog-endpoint"
    assert client.get(f"/api/v1/catalogs/{created.json()['id']}").json()["desiredRevision"] == 1


def test_probe_blocks_legacy_private_targets_without_network_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class NetworkMustNotRun:
        def __init__(self, *_args, **_kwargs) -> None:
            raise AssertionError("blocked endpoints must never reach the HTTP client")

    monkeypatch.setattr("didaca_control_plane.health.httpx.AsyncClient", NetworkMustNotRun)
    catalog = CatalogInstance(
        id="11111111-1111-4111-8111-111111111119",
        urn="urn:didaca:catalog:legacy-private",
        name="Legacy private",
        organization="BIT",
        environment="test",
        endpoint="http://127.0.0.1:8001",
        api_version="v1",
        capabilities=[],
    )

    observation = asyncio.run(check_catalog_health(catalog, 1, ()))

    assert observation is not None
    assert observation.status == "unreachable"
    assert observation.message.startswith("Probe blocked by endpoint security policy:")


def test_seed_placeholder_domain_is_intentionally_unprobed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class NetworkMustNotRun:
        def __init__(self, *_args, **_kwargs) -> None:
            raise AssertionError("reserved .invalid endpoints must never reach the HTTP client")

    monkeypatch.setattr("didaca_control_plane.health.httpx.AsyncClient", NetworkMustNotRun)
    catalog = CatalogInstance(
        id="11111111-1111-4111-8111-111111111118",
        urn="urn:didaca:catalog:seed-placeholder",
        name="Seed placeholder",
        organization="BIT",
        environment="test",
        endpoint="http://catalog-st-gallen.invalid",
        api_version="v1",
        capabilities=[],
    )

    assert asyncio.run(check_catalog_health(catalog, 1, ())) is None
