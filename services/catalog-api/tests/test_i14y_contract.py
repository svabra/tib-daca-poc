from __future__ import annotations

import asyncio
import copy
import hashlib
import json
from pathlib import Path

import httpx
import pytest
from daca_catalog.i14y_public_api import (
    EXPECTED_PUBLIC_READ_PATHS,
    I14YContractError,
    I14YPublicApiPort,
    VerifiedI14YPublicApi,
    fetch_release_contract,
    select_production_server,
    validate_openapi_contract,
)

FIXTURES = Path(__file__).parent / "fixtures" / "i14y"


def _release() -> dict:
    return json.loads(
        (FIXTURES / "release-1.15.4-build.45.sanitized.json").read_text(encoding="utf-8")
    )


def test_official_release_fixture_covers_the_complete_read_contract():
    contract = validate_openapi_contract(_release())

    assert contract.openapi_version == "3.0.4"
    assert contract.api_version == "v1"
    assert contract.deployment_version == "1.15.4-build.45"
    assert contract.assembly_version == "1.15.4.0"
    assert contract.production_url == "https://api.i14y.admin.ch/api/public/v1/"
    assert EXPECTED_PUBLIC_READ_PATHS <= contract.read_paths
    assert len(EXPECTED_PUBLIC_READ_PATHS) == 24


def test_contract_validation_fails_closed_for_an_incomplete_release():
    release = _release()
    del release["paths"]["/concepts/{conceptId}"]

    with pytest.raises(I14YContractError, match="missing public read paths"):
        validate_openapi_contract(release)


def test_production_selection_rejects_ambiguous_or_unsafe_servers():
    release = _release()
    release["servers"].append(copy.deepcopy(release["servers"][0]))
    with pytest.raises(I14YContractError, match="exactly one"):
        select_production_server(release)

    release = _release()
    release["servers"][0]["url"] = "http://api.i14y.admin.ch/api/public/v1/"
    with pytest.raises(I14YContractError, match="HTTPS"):
        select_production_server(release)


@pytest.mark.asyncio
async def test_runtime_release_fetch_is_validated_through_mock_transport_only():
    release = _release()

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://contract.test/Release.json"
        return httpx.Response(200, json=release)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        contract, payload = await fetch_release_contract(
            client,
            release_url="https://contract.test/Release.json",
        )

    assert contract.production_url.endswith("/api/public/v1/")
    assert payload["info"]["version"] == "v1"


@pytest.mark.asyncio
async def test_lazy_port_fetches_release_first_and_uses_its_prod_server():
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        if request.url == "https://contract.test/Release.json":
            return httpx.Response(200, json=_release())
        assert request.url.host == "api.i14y.admin.ch"
        assert request.url.path == "/api/public/v1/concepts"
        assert request.extensions["timeout"]["read"] == 10.0
        return httpx.Response(
            200,
            json={"data": []},
            headers={"x-paging-page": "1", "x-paging-totalpages": "1"},
        )

    port = VerifiedI14YPublicApi(
        release_url="https://contract.test/Release.json",
        transport=httpx.MockTransport(handler),
    )
    assert isinstance(port, I14YPublicApiPort)
    assert seen == []
    assert port.contract_verified is False

    async with port:
        page = await port.list_concepts(page=1, page_size=1)

    assert page.items == []
    assert seen[0] == "https://contract.test/Release.json"
    assert seen[1].startswith("https://api.i14y.admin.ch/api/public/v1/concepts?")
    assert port.base_url == "https://api.i14y.admin.ch/api/public/v1/"
    assert port.contract_verified is True


@pytest.mark.asyncio
async def test_lazy_port_fails_closed_offline_before_any_resource_request():
    seen: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        raise httpx.ConnectError("offline", request=request)

    async with VerifiedI14YPublicApi(
        release_url="https://contract.test/Release.json",
        transport=httpx.MockTransport(handler),
    ) as port:
        with pytest.raises(I14YContractError, match="contract remains unverified"):
            await port.get_concept("concept-1")

    assert seen == ["https://contract.test/Release.json"]
    assert port.contract_verified is False


@pytest.mark.asyncio
async def test_lazy_port_defaults_to_at_most_three_concurrent_resource_requests():
    active = 0
    peak = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal active, peak
        if request.url == "https://contract.test/Release.json":
            return httpx.Response(200, json=_release())
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        return httpx.Response(200, json={"data": {"id": request.url.path.rsplit("/", 1)[-1]}})

    async with VerifiedI14YPublicApi(
        release_url="https://contract.test/Release.json",
        transport=httpx.MockTransport(handler),
    ) as port:
        await asyncio.gather(*(port.get_concept(str(index)) for index in range(9)))

    assert peak == 3


def test_fixture_manifest_records_upstream_version_ids_formats_and_hashes():
    manifest = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))

    assert manifest["observedAt"] == "2026-09-07"
    assert manifest["retrievedAt"] == "2026-09-07T18:41:55Z"
    assert manifest["upstreamContract"]["deployment"] == "1.15.4-build.45"
    fixtures = {entry["file"]: entry for entry in manifest["fixtures"]}
    for file_name, fixture in fixtures.items():
        content = (FIXTURES / file_name).read_bytes()
        assert fixture["retrievedAt"].endswith("Z")
        assert fixture["fixtureBytes"] == len(content)
        assert fixture["fixtureSha256"] == hashlib.sha256(content).hexdigest()
    assert fixtures["concept-legal-form-1.2.0.sanitized.json"]["resourceId"] == (
        "89bc55cc-3858-4c13-a5c8-7dc935dff29b"
    )
    structure = fixtures["dataset-structure-ce087cbd-excerpt.ttl"]
    assert structure["resourceId"] == "ce087cbd-83a5-409f-a0c7-41175c6d5e0d"
    assert structure["upstreamMediaType"] == "text/turtle"
    assert len(structure["upstreamSha256"]) == 64
