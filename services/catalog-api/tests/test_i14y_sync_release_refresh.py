from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from daca_catalog.i14y_public_api import (
    I14YPage,
    I14YPagination,
    VerifiedI14YPublicApi,
)
from daca_catalog.modeling_seed import seed_modeling_catalog

FIXTURES = Path(__file__).parent / "fixtures" / "i14y"


def _release() -> dict[str, Any]:
    return json.loads(
        (FIXTURES / "release-1.15.4-build.45.sanitized.json").read_text(
            encoding="utf-8"
        )
    )


@pytest.mark.asyncio
async def test_explicit_refresh_reloads_release_and_replaces_the_prod_adapter() -> None:
    release_calls = 0
    resource_urls: list[str] = []
    replacement_url = "https://replacement.i14y.test/api/public/v1/"

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal release_calls
        if request.url == "https://contract.test/Release.json":
            release_calls += 1
            document = copy.deepcopy(_release())
            if release_calls == 2:
                prod = next(
                    server
                    for server in document["servers"]
                    if server.get("description") == "PROD"
                )
                prod["url"] = replacement_url
            return httpx.Response(200, json=document)
        resource_urls.append(str(request.url))
        return httpx.Response(
            200,
            json={"data": []},
            headers={"x-paging-page": "1", "x-paging-totalpages": "1"},
        )

    async with VerifiedI14YPublicApi(
        release_url="https://contract.test/Release.json",
        transport=httpx.MockTransport(handler),
    ) as port:
        await port.ensure_verified()
        await port.ensure_verified()
        assert release_calls == 1

        contract = await port.refresh_contract()
        assert contract.production_url == replacement_url
        assert port.base_url == replacement_url
        await port.list_concepts(page=1, page_size=100)

    assert release_calls == 2
    assert len(resource_urls) == 1
    assert resource_urls[0].startswith(f"{replacement_url}concepts?")


class _RefreshAwareI14YClient:
    base_url = "https://api.test/public/v1/"

    def __init__(self) -> None:
        self.refresh_calls = 0
        self.ensure_calls = 0
        self.list_calls = 0

    async def refresh_contract(self) -> None:
        self.refresh_calls += 1

    async def ensure_verified(self) -> None:
        self.ensure_calls += 1

    async def list_concepts(self, *, page: int, page_size: int) -> I14YPage[dict[str, Any]]:
        self.list_calls += 1
        return I14YPage(
            items=[],
            pagination=I14YPagination(page=page, page_size=page_size, total_pages=1),
        )


def test_every_full_sync_refreshes_release_before_listing(client, session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)

    fake = _RefreshAwareI14YClient()
    previous = client.app.state.i14y_client
    client.app.state.i14y_client = fake
    try:
        for _ in range(2):
            response = client.post(
                "/api/v1/i14y/concepts/sync",
                headers={"X-DaCa-User": "cinthya.thor"},
            )
            assert response.status_code == 200, response.text
    finally:
        client.app.state.i14y_client = previous

    assert fake.refresh_calls == 2
    assert fake.ensure_calls == 0
    assert fake.list_calls == 2
