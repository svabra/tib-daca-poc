from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest
from daca_catalog.i14y_public_api import (
    CatalogExportFormat,
    CodeListEntriesDataFormat,
    I14YHttpClient,
    I14YPage,
    I14YPagination,
    I14YRetryPolicy,
    Language,
    LinkedDataFormat,
    MappingRelationsDataFormat,
    SearchResourceType,
    collect_i14y_pages,
    map_concurrently,
)

FIXTURES = Path(__file__).parent / "fixtures" / "i14y"


@pytest.mark.asyncio
async def test_collections_accept_wrappers_and_bare_arrays_and_read_header_paging():
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/mappingtables"):
            return httpx.Response(200, json=[{"id": "mapping-1", "future": True}])
        return httpx.Response(
            200,
            json={"data": [{"id": "concept-1", "unknown": {"kept": True}}]},
            headers={
                "x-paging-page": "2",
                "x-paging-pagesize": "10",
                "x-paging-totalpages": "7",
                "x-paging-totalrows": "61",
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport_client:
        client = I14YHttpClient(client=transport_client, base_url="https://api.test/v1/")
        concepts = await client.list_concepts(
            page=2,
            page_size=10,
            publisherIdentifier="CH1",
        )
        mappings = await client.list_mapping_tables(page=1, page_size=25)

    assert concepts.items[0]["unknown"] == {"kept": True}
    assert concepts.pagination == I14YPagination(2, 10, 7, 61)
    assert concepts.pagination.has_next is True
    assert mappings.items == [{"id": "mapping-1", "future": True}]
    assert requests[0].url.params["pageSize"] == "10"
    assert requests[0].url.params["publisherIdentifier"] == "CH1"


@pytest.mark.asyncio
async def test_search_serializes_arrays_as_repeated_form_query_keys():
    captured: list[tuple[str, str]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured.extend(request.url.params.multi_items())
        return httpx.Response(200, json={"data": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport_client:
        client = I14YHttpClient(client=transport_client, base_url="https://api.test/v1/")
        await client.search(
            resource_type=SearchResourceType.CONCEPT,
            themes=["one", "two"],
            publicationLevels=["Public", "Internal"],
            page=1,
            page_size=5,
        )

    assert ("types", "Concept") in captured
    assert [value for key, value in captured if key == "themes"] == ["one", "two"]
    assert [value for key, value in captured if key == "publicationLevels"] == [
        "Public",
        "Internal",
    ]


@pytest.mark.asyncio
async def test_retry_is_bounded_and_honors_retry_after_without_real_sleep():
    attempts = 0
    delays: list[float] = []

    async def handler(_: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, headers={"Retry-After": "0.25"})
        return httpx.Response(200, json={"data": {"id": "concept-1"}})

    async def sleeper(delay: float) -> None:
        delays.append(delay)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport_client:
        client = I14YHttpClient(
            client=transport_client,
            base_url="https://api.test/v1/",
            retry_policy=I14YRetryPolicy(attempts=2, max_delay_seconds=1),
            sleeper=sleeper,
        )
        result = await client.get_concept("concept-1")

    assert result == {"id": "concept-1"}
    assert attempts == 2
    assert delays == [0.25]


@pytest.mark.asyncio
async def test_adapter_defaults_to_ten_second_timeout_and_three_backoff_retries():
    attempts = 0
    observed_timeouts: list[dict[str, float]] = []
    backoffs: list[float] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        observed_timeouts.append(request.extensions["timeout"])
        return httpx.Response(503)

    async def sleeper(delay: float) -> None:
        backoffs.append(delay)

    async with I14YHttpClient(
        base_url="https://api.test/v1/",
        transport=httpx.MockTransport(handler),
        sleeper=sleeper,
    ) as client:
        with pytest.raises(httpx.HTTPStatusError):
            await client.get_concept("concept-1")

    assert attempts == 4
    assert backoffs == [0.2, 0.4, 0.8]
    assert observed_timeouts == [
        {"connect": 10.0, "read": 10.0, "write": 10.0, "pool": 10.0},
    ] * 4


@pytest.mark.asyncio
async def test_page_walker_uses_header_total_pages_and_does_not_assume_defaults():
    calls: list[tuple[int, int]] = []

    async def fetch(page: int, page_size: int) -> I14YPage[int]:
        calls.append((page, page_size))
        return I14YPage(
            [page],
            I14YPagination(
                page=page,
                page_size=page_size,
                total_pages=2,
                total_rows=2,
            ),
        )

    assert await collect_i14y_pages(fetch, page_size=37) == [1, 2]
    assert calls == [(1, 37), (2, 37)]


@pytest.mark.asyncio
async def test_concurrent_mapping_is_bounded_and_order_preserving():
    active = 0
    peak = 0

    async def worker(value: int) -> int:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        return value * 2

    assert await map_concurrently(list(range(8)), worker, limit=3) == [
        value * 2 for value in range(8)
    ]
    assert peak == 3


@pytest.mark.asyncio
async def test_adapter_routes_every_public_read_group_and_export_offline():
    seen: set[str] = set()
    code_list = json.loads(
        (FIXTURES / "codelist-legal-form-page-1.sanitized.json").read_text(
            encoding="utf-8"
        )
    )

    async def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path.removeprefix("/v1/")
        seen.add(path)
        if "/exports/" in path or path.endswith("/exports/json"):
            return httpx.Response(200, content=b"[]", headers={"Content-Type": "application/json"})
        if path.endswith("codelist-entries/search"):
            return httpx.Response(200, json=code_list)
        collections = {
            "agents",
            "catalogs",
            "catalogs/catalog-1/records",
            "concepts",
            "dataservices",
            "datasets",
            "mappingtables",
            "publicservices",
            "search",
        }
        return httpx.Response(
            200,
            json={"data": [] if path in collections else {"id": path.rsplit("/", 1)[-1]}},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport_client:
        client = I14YHttpClient(client=transport_client, base_url="https://api.test/v1/")
        await client.list_agents()
        await client.get_agent("agent-1")
        await client.list_catalogs()
        await client.get_catalog("catalog-1")
        await client.export_catalog_dcat("catalog-1", CatalogExportFormat.TTL)
        await client.list_catalog_records("catalog-1")
        await client.get_catalog_record("catalog-1", "record-1")
        await client.list_concepts()
        await client.get_concept("concept-1")
        await client.export_concept_json("concept-1")
        await client.get_code_list_entries("concept-1", format=CodeListEntriesDataFormat.JSON)
        await client.search_code_list_entries("concept-1", language=Language.DE)
        await client.export_code_list_entry_search(
            "concept-1",
            data_format=CodeListEntriesDataFormat.CSV,
            language=Language.DE,
        )
        await client.list_data_services()
        await client.get_data_service("service-1")
        await client.list_datasets()
        await client.get_dataset("dataset-1")
        await client.get_dataset_structure("dataset-1", LinkedDataFormat.JSON_LD)
        await client.list_mapping_tables()
        await client.get_mapping_table("mapping-1")
        await client.get_mapping_relations("mapping-1", MappingRelationsDataFormat.CSV)
        await client.list_public_services()
        await client.get_public_service("public-service-1")
        await client.search(resource_type=SearchResourceType.CONCEPT)

    assert {
        "agents",
        "catalogs",
        "concepts",
        "dataservices",
        "datasets",
        "mappingtables",
        "publicservices",
        "search",
    } <= seen
    assert "datasets/dataset-1/structures/exports/JsonLd" in seen
    assert "mappingtables/mapping-1/relations/exports/Csv" in seen
