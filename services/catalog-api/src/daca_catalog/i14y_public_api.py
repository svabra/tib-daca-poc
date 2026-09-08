"""Typed, read-only access to the public I14Y API.

The public wire contract is deliberately kept outside DaCa's persistence and API schemas.  I14Y
has shipped additive fields and temporarily omitted fields marked as required in OpenAPI, so this
module validates the endpoint surface while preserving resource payloads as tolerant dictionaries.
Callers can normalize those dictionaries with :mod:`daca_catalog.i14y_concepts`.
"""

from __future__ import annotations

import asyncio
import email.utils
import re
from collections.abc import AsyncIterator, Awaitable, Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Protocol, Self, runtime_checkable
from urllib.parse import quote, urlsplit

import httpx

I14Y_RELEASE_URL = "https://apiconsole.i14y.admin.ch/public/v1/Release.json"
I14Y_PRODUCTION_URL = "https://api.i14y.admin.ch/api/public/v1/"

EXPECTED_PUBLIC_READ_PATHS = frozenset(
    {
        "/agents",
        "/agents/{agentId}",
        "/catalogs",
        "/catalogs/{catalogId}",
        "/catalogs/{catalogId}/dcat/exports/{dataFormat}",
        "/catalogs/{catalogId}/records",
        "/catalogs/{catalogId}/records/{recordId}",
        "/concepts",
        "/concepts/{conceptId}",
        "/concepts/{conceptId}/exports/json",
        "/concepts/{conceptId}/codelist-entries/exports/{dataFormat}",
        "/concepts/{conceptId}/codelist-entries/search",
        "/concepts/{conceptId}/codelist-entries/search/exports/{dataFormat}",
        "/dataservices",
        "/dataservices/{dataServiceId}",
        "/datasets",
        "/datasets/{datasetId}",
        "/datasets/{datasetId}/structures/exports/{dataFormat}",
        "/mappingtables",
        "/mappingtables/{mappingTableId}",
        "/mappingtables/{mappingTableId}/relations/exports/{dataFormat}",
        "/publicservices",
        "/publicservices/{publicServiceId}",
        "/search",
    }
)


class CatalogExportFormat(StrEnum):
    RDF = "RDF"
    TTL = "TTL"


class CodeListEntriesDataFormat(StrEnum):
    JSON = "Json"
    CSV = "Csv"


class CodeListEntrySortProperty(StrEnum):
    CODE = "Code"
    POSITION = "Position"


class CodeListEntryValueType(StrEnum):
    STRING = "String"
    NUMERIC = "Numeric"


class ConceptType(StrEnum):
    CODE_LIST = "CodeList"
    DATE = "Date"
    NUMERIC = "Numeric"
    STRING = "String"


class CreationType(StrEnum):
    MANUAL = "Manual"
    AUTOMATED = "Automated"


class DcatCatalogType(StrEnum):
    DATASET = "Dataset"
    DATA_SERVICE = "DataService"


class Language(StrEnum):
    DE = "de"
    EN = "en"
    FR = "fr"
    IT = "it"
    RM = "rm"


class LinkedDataFormat(StrEnum):
    TURTLE = "Ttl"
    RDF = "Rdf"
    JSON_LD = "JsonLd"


class MappingRelationsDataFormat(StrEnum):
    JSON = "Json"
    CSV = "Csv"


class PublicationLevel(StrEnum):
    INTERNAL = "Internal"
    PUBLIC = "Public"


class RegistrationStatus(StrEnum):
    INCOMPLETE = "Incomplete"
    CANDIDATE = "Candidate"
    RECORDED = "Recorded"
    QUALIFIED = "Qualified"
    STANDARD = "Standard"
    PREFERRED_STANDARD = "PreferredStandard"
    SUPERSEDED = "Superseded"
    RETIRED = "Retired"


class SearchResourceType(StrEnum):
    DATASET = "Dataset"
    DATA_SERVICE = "DataService"
    PUBLIC_SERVICE = "PublicService"
    CONCEPT = "Concept"
    MAPPING_TABLE = "MappingTable"


class SearchStructureOption(StrEnum):
    WITH_STRUCTURE = "WithStructure"
    WITHOUT_STRUCTURE = "WithoutStructure"


class VCardKind(StrEnum):
    ORGANIZATION = "Organization"


class I14YError(RuntimeError):
    """Base exception for contract and transport failures."""


class I14YContractError(I14YError):
    """The downloaded OpenAPI document is not the supported public read contract."""


class I14YWireError(I14YError):
    """A successful HTTP response cannot be interpreted as the expected wire envelope."""


@dataclass(frozen=True, slots=True)
class I14YContract:
    openapi_version: str
    api_version: str | None
    deployment_version: str | None
    assembly_version: str | None
    production_url: str
    read_paths: frozenset[str]


def _string(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def select_production_server(document: Mapping[str, Any]) -> str:
    """Select the server explicitly labelled ``PROD`` and reject ambiguous documents."""

    servers = document.get("servers")
    if not isinstance(servers, Sequence) or isinstance(servers, (str, bytes)):
        raise I14YContractError("OpenAPI servers must be an array")
    matches: list[str] = []
    for server in servers:
        if not isinstance(server, Mapping):
            continue
        if _string(server.get("description", "")) != "PROD":
            continue
        url = _string(server.get("url"))
        if url is None:
            raise I14YContractError("The PROD server has no URL")
        parsed = urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise I14YContractError("The PROD server must be a credential-free HTTPS URL")
        matches.append(url.rstrip("/") + "/")
    if len(matches) != 1:
        raise I14YContractError("OpenAPI must declare exactly one server labelled PROD")
    return matches[0]


_DEPLOYMENT_PATTERN = re.compile(r"Deployment info:\s*([^,\s]+)", re.IGNORECASE)
_ASSEMBLY_PATTERN = re.compile(r"Assembly:\s*([^,\s]+)", re.IGNORECASE)


def validate_openapi_contract(document: Mapping[str, Any]) -> I14YContract:
    """Validate the complete official read surface and return deploy metadata.

    Additive paths, schemas, fields, and methods are accepted.  This catches accidental use of a
    non-public or incomplete specification without coupling imports to every generated schema.
    """

    openapi_version = _string(document.get("openapi"))
    if openapi_version is None or not openapi_version.startswith("3."):
        raise I14YContractError("I14Y Release.json must be an OpenAPI 3 document")
    raw_paths = document.get("paths")
    if not isinstance(raw_paths, Mapping):
        raise I14YContractError("OpenAPI paths must be an object")
    path_names = frozenset(str(path) for path in raw_paths)
    missing = sorted(EXPECTED_PUBLIC_READ_PATHS - path_names)
    if missing:
        raise I14YContractError(f"OpenAPI is missing public read paths: {', '.join(missing)}")
    without_get = sorted(
        path
        for path in EXPECTED_PUBLIC_READ_PATHS
        if not isinstance(raw_paths.get(path), Mapping)
        or not isinstance(raw_paths[path].get("get"), Mapping)
    )
    if without_get:
        raise I14YContractError(f"OpenAPI paths have no GET operation: {', '.join(without_get)}")

    info = document.get("info") if isinstance(document.get("info"), Mapping) else {}
    description = _string(info.get("description")) or ""
    deployment = _DEPLOYMENT_PATTERN.search(description)
    assembly = _ASSEMBLY_PATTERN.search(description)
    return I14YContract(
        openapi_version=openapi_version,
        api_version=_string(info.get("version")),
        deployment_version=deployment.group(1) if deployment else None,
        assembly_version=assembly.group(1) if assembly else None,
        production_url=select_production_server(document),
        read_paths=path_names,
    )


async def fetch_release_contract(
    client: httpx.AsyncClient,
    *,
    release_url: str = I14Y_RELEASE_URL,
) -> tuple[I14YContract, dict[str, Any]]:
    """Fetch and validate Release.json at runtime without persisting remote state."""

    response = await client.get(release_url, headers={"Accept": "application/json"})
    response.raise_for_status()
    try:
        payload = response.json()
    except ValueError as exc:
        raise I14YContractError("I14Y Release.json is not valid JSON") from exc
    if not isinstance(payload, dict):
        raise I14YContractError("I14Y Release.json must contain a JSON object")
    return validate_openapi_contract(payload), payload


@dataclass(frozen=True, slots=True)
class I14YPagination:
    page: int | None = None
    page_size: int | None = None
    total_pages: int | None = None
    total_rows: int | None = None

    @property
    def has_next(self) -> bool | None:
        if self.page is None or self.total_pages is None:
            return None
        return self.page < self.total_pages

    @classmethod
    def from_headers(cls, headers: Mapping[str, str]) -> I14YPagination:
        lowered = {key.casefold(): value for key, value in headers.items()}

        def integer(name: str) -> int | None:
            value = lowered.get(name)
            try:
                parsed = int(value) if value is not None else None
            except (TypeError, ValueError):
                return None
            return parsed if parsed is not None and parsed >= 0 else None

        return cls(
            page=integer("x-paging-page"),
            page_size=integer("x-paging-pagesize"),
            total_pages=integer("x-paging-totalpages"),
            total_rows=integer("x-paging-totalrows"),
        )


@dataclass(frozen=True, slots=True)
class I14YPage[T]:
    items: list[T]
    pagination: I14YPagination = field(default_factory=I14YPagination)
    raw: object | None = field(default=None, repr=False, compare=False)


@dataclass(frozen=True, slots=True)
class I14YExport:
    content: bytes
    content_type: str | None
    url: str

    @property
    def text(self) -> str:
        return self.content.decode("utf-8-sig")

    def json(self) -> object:
        import json

        return json.loads(self.text)


@dataclass(frozen=True, slots=True)
class I14YRetryPolicy:
    # Total attempts: the initial request plus three bounded backoff retries by default.
    attempts: int = 4
    base_delay_seconds: float = 0.2
    max_delay_seconds: float = 3.0
    retry_statuses: frozenset[int] = frozenset({429, 500, 502, 503, 504})

    def __post_init__(self) -> None:
        if self.attempts < 1:
            raise ValueError("attempts must be at least one")
        if self.base_delay_seconds < 0 or self.max_delay_seconds < 0:
            raise ValueError("retry delays cannot be negative")


Resource = dict[str, Any]


@runtime_checkable
class I14YPublicApiPort(Protocol):
    """Read-only application port covering every official public API group."""

    async def list_agents(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...
    async def get_agent(self, agent_id: str) -> Resource: ...
    async def list_catalogs(self, *, page: int = 1, page_size: int = 25) -> I14YPage[Resource]: ...
    async def get_catalog(self, catalog_id: str) -> Resource: ...
    async def export_catalog_dcat(self, catalog_id: str, data_format: CatalogExportFormat | str) -> I14YExport: ...
    async def list_catalog_records(self, catalog_id: str, *, page: int = 1, page_size: int = 25) -> I14YPage[Resource]: ...
    async def get_catalog_record(self, catalog_id: str, record_id: str) -> Resource: ...
    async def list_concepts(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...
    async def get_concept(self, concept_id: str) -> Resource: ...
    async def export_concept_json(self, concept_id: str) -> I14YExport: ...
    async def get_code_list_entries(self, concept_id: str, *, format: CodeListEntriesDataFormat | str = CodeListEntriesDataFormat.JSON, with_annotations: bool = True) -> I14YExport: ...
    async def search_code_list_entries(self, concept_id: str, *, language: Language | str, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...
    async def export_code_list_entry_search(self, concept_id: str, *, data_format: CodeListEntriesDataFormat | str, language: Language | str, **filters: Any) -> I14YExport: ...
    async def list_data_services(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...
    async def get_data_service(self, data_service_id: str) -> Resource: ...
    async def list_datasets(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...
    async def get_dataset(self, dataset_id: str) -> Resource: ...
    async def get_dataset_structure(self, dataset_id: str, data_format: LinkedDataFormat | str = LinkedDataFormat.TURTLE) -> I14YExport: ...
    async def list_mapping_tables(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...
    async def get_mapping_table(self, mapping_table_id: str) -> Resource: ...
    async def get_mapping_relations(self, mapping_table_id: str, data_format: MappingRelationsDataFormat | str = MappingRelationsDataFormat.JSON) -> I14YExport: ...
    async def list_public_services(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...
    async def get_public_service(self, public_service_id: str) -> Resource: ...
    async def search(self, *, resource_type: SearchResourceType | str | None = None, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]: ...


def _wire_collection(payload: object) -> list[Resource]:
    candidate = payload.get("data") if isinstance(payload, Mapping) else payload
    if candidate is None:
        return []
    if not isinstance(candidate, list):
        raise I14YWireError("I14Y collection must be an array or a data-wrapped array")
    if not all(isinstance(item, Mapping) for item in candidate):
        raise I14YWireError("I14Y collection contains a non-object resource")
    return [dict(item) for item in candidate]


def _wire_resource(payload: object) -> Resource:
    candidate = payload.get("data") if isinstance(payload, Mapping) and "data" in payload else payload
    if not isinstance(candidate, Mapping):
        raise I14YWireError("I14Y resource must be an object or a data-wrapped object")
    return dict(candidate)


def _query_items(values: Mapping[str, Any]) -> list[tuple[str, str]]:
    params: list[tuple[str, str]] = []
    for key, raw in values.items():
        if raw is None:
            continue
        wire_key = {
            "page_size": "pageSize",
            "resource_type": "types",
            "with_annotations": "withAnnotations",
            "sort_property": "sortProperty",
        }.get(key, key)
        candidates: Iterable[object]
        if isinstance(raw, (list, tuple, set, frozenset)):
            candidates = raw
        else:
            candidates = (raw,)
        for value in candidates:
            if value is None:
                continue
            if isinstance(value, bool):
                encoded = "true" if value else "false"
            elif isinstance(value, StrEnum):
                encoded = value.value
            else:
                encoded = str(value)
            params.append((wire_key, encoded))
    return params


def _retry_after_seconds(value: str | None, *, now: datetime | None = None) -> float | None:
    if value is None:
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            parsed = email.utils.parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None
        current = now or datetime.now(UTC)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        seconds = (parsed - current).total_seconds()
    return max(0.0, seconds)


class I14YHttpClient(I14YPublicApiPort):
    """Bounded-concurrency httpx adapter for safe, cache-oriented GET synchronization."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient | None = None,
        base_url: str = I14Y_PRODUCTION_URL,
        timeout: float = 10.0,
        max_concurrency: int = 4,
        retry_policy: I14YRetryPolicy | None = None,
        sleeper: Callable[[float], Awaitable[None]] = asyncio.sleep,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be at least one")
        parsed = urlsplit(base_url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            # MockTransport tests commonly use an HTTPS test host, so host pinning belongs in
            # Release.json validation rather than in this general adapter constructor.
            raise ValueError("base_url must be a credential-free HTTPS URL")
        self.base_url = base_url.rstrip("/") + "/"
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout, transport=transport)
        self._retry = retry_policy or I14YRetryPolicy()
        self._semaphore = asyncio.Semaphore(max_concurrency)
        self._sleeper = sleeper

    @classmethod
    def from_openapi_document(
        cls,
        document: Mapping[str, Any],
        **kwargs: Any,
    ) -> I14YHttpClient:
        contract = validate_openapi_contract(document)
        return cls(base_url=contract.production_url, **kwargs)

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def _get(
        self,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        accept: str = "application/json",
    ) -> httpx.Response:
        url = self.base_url + path.lstrip("/")
        query = _query_items(params or {})
        last_transport_error: httpx.TransportError | None = None
        for attempt in range(self._retry.attempts):
            try:
                async with self._semaphore:
                    response = await self._client.get(
                        url,
                        params=query,
                        headers={"Accept": accept},
                    )
            except httpx.TransportError as exc:
                last_transport_error = exc
                if attempt + 1 >= self._retry.attempts:
                    raise
                await self._sleeper(self._delay(attempt, None))
                continue
            if response.status_code not in self._retry.retry_statuses:
                response.raise_for_status()
                return response
            if attempt + 1 >= self._retry.attempts:
                response.raise_for_status()
            await self._sleeper(self._delay(attempt, response.headers.get("Retry-After")))
        if last_transport_error is not None:  # pragma: no cover - loop guards make this defensive
            raise last_transport_error
        raise AssertionError("retry loop terminated without a response")

    def _delay(self, attempt: int, retry_after: str | None) -> float:
        requested = _retry_after_seconds(retry_after)
        exponential = self._retry.base_delay_seconds * (2**attempt)
        return min(self._retry.max_delay_seconds, requested if requested is not None else exponential)

    async def _json(self, path: str, *, params: Mapping[str, Any] | None = None) -> object:
        response = await self._get(path, params=params)
        try:
            return response.json()
        except ValueError as exc:
            raise I14YWireError(f"I14Y returned invalid JSON for {path}") from exc

    async def _page(
        self,
        path: str,
        *,
        page: int,
        page_size: int,
        params: Mapping[str, Any] | None = None,
    ) -> I14YPage[Resource]:
        if page < 1 or page_size < 1:
            raise ValueError("page and page_size must be positive")
        response = await self._get(
            path,
            params={**(params or {}), "page": page, "page_size": page_size},
        )
        try:
            payload = response.json()
        except ValueError as exc:
            raise I14YWireError(f"I14Y returned invalid JSON for {path}") from exc
        return I14YPage(
            items=_wire_collection(payload),
            pagination=I14YPagination.from_headers(response.headers),
            raw=payload,
        )

    async def _resource(self, path: str) -> Resource:
        return _wire_resource(await self._json(path))

    async def _export(
        self,
        path: str,
        *,
        params: Mapping[str, Any] | None = None,
        accept: str = "*/*",
    ) -> I14YExport:
        response = await self._get(path, params=params, accept=accept)
        return I14YExport(
            content=response.content,
            content_type=response.headers.get("Content-Type"),
            url=str(response.url),
        )

    async def list_agents(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]:
        return await self._page("agents", page=page, page_size=page_size, params=filters)

    async def get_agent(self, agent_id: str) -> Resource:
        return await self._resource(f"agents/{quote(agent_id, safe='')}")

    async def list_catalogs(self, *, page: int = 1, page_size: int = 25) -> I14YPage[Resource]:
        return await self._page("catalogs", page=page, page_size=page_size)

    async def get_catalog(self, catalog_id: str) -> Resource:
        return await self._resource(f"catalogs/{quote(catalog_id, safe='')}")

    async def export_catalog_dcat(self, catalog_id: str, data_format: CatalogExportFormat | str) -> I14YExport:
        return await self._export(
            f"catalogs/{quote(catalog_id, safe='')}/dcat/exports/{quote(str(data_format), safe='')}"
        )

    async def list_catalog_records(self, catalog_id: str, *, page: int = 1, page_size: int = 25) -> I14YPage[Resource]:
        return await self._page(
            f"catalogs/{quote(catalog_id, safe='')}/records",
            page=page,
            page_size=page_size,
        )

    async def get_catalog_record(self, catalog_id: str, record_id: str) -> Resource:
        return await self._resource(
            f"catalogs/{quote(catalog_id, safe='')}/records/{quote(record_id, safe='')}"
        )

    async def list_concepts(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]:
        return await self._page("concepts", page=page, page_size=page_size, params=filters)

    async def get_concept(self, concept_id: str) -> Resource:
        return await self._resource(f"concepts/{quote(concept_id, safe='')}")

    async def export_concept_json(self, concept_id: str) -> I14YExport:
        return await self._export(f"concepts/{quote(concept_id, safe='')}/exports/json")

    async def get_code_list_entries(
        self,
        concept_id: str,
        *,
        format: CodeListEntriesDataFormat | str = CodeListEntriesDataFormat.JSON,
        with_annotations: bool = True,
    ) -> I14YExport:
        return await self._export(
            f"concepts/{quote(concept_id, safe='')}/codelist-entries/exports/{quote(str(format), safe='')}",
            params={"with_annotations": with_annotations},
        )

    async def search_code_list_entries(
        self,
        concept_id: str,
        *,
        language: Language | str,
        page: int = 1,
        page_size: int = 25,
        **filters: Any,
    ) -> I14YPage[Resource]:
        return await self._page(
            f"concepts/{quote(concept_id, safe='')}/codelist-entries/search",
            page=page,
            page_size=page_size,
            params={"language": language, **filters},
        )

    async def export_code_list_entry_search(
        self,
        concept_id: str,
        *,
        data_format: CodeListEntriesDataFormat | str,
        language: Language | str,
        **filters: Any,
    ) -> I14YExport:
        return await self._export(
            f"concepts/{quote(concept_id, safe='')}/codelist-entries/search/exports/{quote(str(data_format), safe='')}",
            params={"language": language, **filters},
        )

    async def list_data_services(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]:
        return await self._page("dataservices", page=page, page_size=page_size, params=filters)

    async def get_data_service(self, data_service_id: str) -> Resource:
        return await self._resource(f"dataservices/{quote(data_service_id, safe='')}")

    async def list_datasets(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]:
        return await self._page("datasets", page=page, page_size=page_size, params=filters)

    async def get_dataset(self, dataset_id: str) -> Resource:
        return await self._resource(f"datasets/{quote(dataset_id, safe='')}")

    async def get_dataset_structure(
        self,
        dataset_id: str,
        data_format: LinkedDataFormat | str = LinkedDataFormat.TURTLE,
    ) -> I14YExport:
        return await self._export(
            f"datasets/{quote(dataset_id, safe='')}/structures/exports/{quote(str(data_format), safe='')}"
        )

    async def list_mapping_tables(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]:
        return await self._page("mappingtables", page=page, page_size=page_size, params=filters)

    async def get_mapping_table(self, mapping_table_id: str) -> Resource:
        return await self._resource(f"mappingtables/{quote(mapping_table_id, safe='')}")

    async def get_mapping_relations(
        self,
        mapping_table_id: str,
        data_format: MappingRelationsDataFormat | str = MappingRelationsDataFormat.JSON,
    ) -> I14YExport:
        return await self._export(
            f"mappingtables/{quote(mapping_table_id, safe='')}/relations/exports/{quote(str(data_format), safe='')}"
        )

    async def list_public_services(self, *, page: int = 1, page_size: int = 25, **filters: Any) -> I14YPage[Resource]:
        return await self._page("publicservices", page=page, page_size=page_size, params=filters)

    async def get_public_service(self, public_service_id: str) -> Resource:
        return await self._resource(f"publicservices/{quote(public_service_id, safe='')}")

    async def search(
        self,
        *,
        resource_type: SearchResourceType | str | None = None,
        page: int = 1,
        page_size: int = 25,
        **filters: Any,
    ) -> I14YPage[Resource]:
        params = dict(filters)
        if resource_type is not None:
            params["resource_type"] = resource_type
        return await self._page("search", page=page, page_size=page_size, params=params)

    async def iter_concept_pages(
        self,
        *,
        page_size: int = 100,
        max_pages: int | None = None,
        **filters: Any,
    ) -> AsyncIterator[I14YPage[Resource]]:
        async for page in iter_i14y_pages(
            lambda number, size: self.list_concepts(
                page=number,
                page_size=size,
                **filters,
            ),
            page_size=page_size,
            max_pages=max_pages,
        ):
            yield page

    async def get_concept_details(
        self,
        concept_ids: Sequence[str],
        *,
        concurrency: int = 4,
    ) -> list[Resource]:
        return await map_concurrently(concept_ids, self.get_concept, limit=concurrency)


class VerifiedI14YPublicApi(I14YPublicApiPort):
    """Lazy Release.json-first I14Y port.

    Construction and application import perform no network I/O.  The first public API operation
    verifies the current OpenAPI document, selects its single ``PROD`` server, and initializes one
    bounded adapter.  Concurrent first callers share the same verification lock.
    """

    def __init__(
        self,
        *,
        release_url: str = I14Y_RELEASE_URL,
        timeout: float = 10.0,
        max_concurrency: int = 3,
        retry_policy: I14YRetryPolicy | None = None,
        sleeper: Callable[[float], Awaitable[None]] = asyncio.sleep,
        transport: httpx.AsyncBaseTransport | None = None,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if client is not None and transport is not None:
            raise ValueError("client and transport are mutually exclusive")
        parsed = urlsplit(release_url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("release_url must be a credential-free HTTPS URL")
        if max_concurrency < 1:
            raise ValueError("max_concurrency must be at least one")
        self.release_url = release_url
        self._owns_client = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout, transport=transport)
        self._max_concurrency = max_concurrency
        self._retry_policy = retry_policy or I14YRetryPolicy()
        self._sleeper = sleeper
        self._contract: I14YContract | None = None
        self._adapter: I14YHttpClient | None = None
        self._verification_lock = asyncio.Lock()

    @property
    def contract(self) -> I14YContract | None:
        return self._contract

    @property
    def contract_verified(self) -> bool:
        return self._contract is not None

    @property
    def base_url(self) -> str:
        """Return the verified API URL, or the contract URL before first use."""

        return self._contract.production_url if self._contract is not None else self.release_url

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def ensure_verified(self) -> I14YContract:
        await self._verified_adapter()
        if self._contract is None:  # pragma: no cover - guarded by _verified_adapter
            raise AssertionError("verified adapter has no contract")
        return self._contract

    async def refresh_contract(self) -> I14YContract:
        """Revalidate Release.json and atomically replace the read adapter.

        Full synchronization calls this boundary before requesting resources.  Ordinary reads
        keep using :meth:`ensure_verified` and therefore retain the lazy, process-local adapter.
        A failed refresh leaves that last verified adapter intact, but propagates the failure so
        the synchronization run cannot continue against a stale contract.
        """

        await self._verified_adapter(force_refresh=True)
        if self._contract is None:  # pragma: no cover - guarded by _verified_adapter
            raise AssertionError("refreshed adapter has no contract")
        return self._contract

    async def _verified_adapter(self, *, force_refresh: bool = False) -> I14YHttpClient:
        if not force_refresh and self._adapter is not None:
            return self._adapter
        async with self._verification_lock:
            if not force_refresh and self._adapter is not None:
                return self._adapter
            try:
                contract, document = await fetch_release_contract(
                    self._client,
                    release_url=self.release_url,
                )
            except httpx.HTTPError as exc:
                raise I14YContractError(
                    "I14Y Release.json could not be fetched; the public API contract remains "
                    "unverified and no resource request was sent"
                ) from exc
            # Validate again at the adapter boundary so no caller can bypass PROD selection.
            adapter = I14YHttpClient.from_openapi_document(
                document,
                client=self._client,
                max_concurrency=self._max_concurrency,
                retry_policy=self._retry_policy,
                sleeper=self._sleeper,
            )
            self._contract = contract
            self._adapter = adapter
            return adapter

    async def list_agents(
        self, *, page: int = 1, page_size: int = 25, **filters: Any
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_agents(
            page=page, page_size=page_size, **filters
        )

    async def get_agent(self, agent_id: str) -> Resource:
        return await (await self._verified_adapter()).get_agent(agent_id)

    async def list_catalogs(
        self, *, page: int = 1, page_size: int = 25
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_catalogs(
            page=page, page_size=page_size
        )

    async def get_catalog(self, catalog_id: str) -> Resource:
        return await (await self._verified_adapter()).get_catalog(catalog_id)

    async def export_catalog_dcat(
        self, catalog_id: str, data_format: CatalogExportFormat | str
    ) -> I14YExport:
        return await (await self._verified_adapter()).export_catalog_dcat(
            catalog_id, data_format
        )

    async def list_catalog_records(
        self, catalog_id: str, *, page: int = 1, page_size: int = 25
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_catalog_records(
            catalog_id, page=page, page_size=page_size
        )

    async def get_catalog_record(self, catalog_id: str, record_id: str) -> Resource:
        return await (await self._verified_adapter()).get_catalog_record(catalog_id, record_id)

    async def list_concepts(
        self, *, page: int = 1, page_size: int = 25, **filters: Any
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_concepts(
            page=page, page_size=page_size, **filters
        )

    async def get_concept(self, concept_id: str) -> Resource:
        return await (await self._verified_adapter()).get_concept(concept_id)

    async def export_concept_json(self, concept_id: str) -> I14YExport:
        return await (await self._verified_adapter()).export_concept_json(concept_id)

    async def get_code_list_entries(
        self,
        concept_id: str,
        *,
        format: CodeListEntriesDataFormat | str = CodeListEntriesDataFormat.JSON,
        with_annotations: bool = True,
    ) -> I14YExport:
        return await (await self._verified_adapter()).get_code_list_entries(
            concept_id,
            format=format,
            with_annotations=with_annotations,
        )

    async def search_code_list_entries(
        self,
        concept_id: str,
        *,
        language: Language | str,
        page: int = 1,
        page_size: int = 25,
        **filters: Any,
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).search_code_list_entries(
            concept_id,
            language=language,
            page=page,
            page_size=page_size,
            **filters,
        )

    async def export_code_list_entry_search(
        self,
        concept_id: str,
        *,
        data_format: CodeListEntriesDataFormat | str,
        language: Language | str,
        **filters: Any,
    ) -> I14YExport:
        return await (await self._verified_adapter()).export_code_list_entry_search(
            concept_id,
            data_format=data_format,
            language=language,
            **filters,
        )

    async def list_data_services(
        self, *, page: int = 1, page_size: int = 25, **filters: Any
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_data_services(
            page=page, page_size=page_size, **filters
        )

    async def get_data_service(self, data_service_id: str) -> Resource:
        return await (await self._verified_adapter()).get_data_service(data_service_id)

    async def list_datasets(
        self, *, page: int = 1, page_size: int = 25, **filters: Any
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_datasets(
            page=page, page_size=page_size, **filters
        )

    async def get_dataset(self, dataset_id: str) -> Resource:
        return await (await self._verified_adapter()).get_dataset(dataset_id)

    async def get_dataset_structure(
        self,
        dataset_id: str,
        data_format: LinkedDataFormat | str = LinkedDataFormat.TURTLE,
    ) -> I14YExport:
        return await (await self._verified_adapter()).get_dataset_structure(
            dataset_id, data_format
        )

    async def list_mapping_tables(
        self, *, page: int = 1, page_size: int = 25, **filters: Any
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_mapping_tables(
            page=page, page_size=page_size, **filters
        )

    async def get_mapping_table(self, mapping_table_id: str) -> Resource:
        return await (await self._verified_adapter()).get_mapping_table(mapping_table_id)

    async def get_mapping_relations(
        self,
        mapping_table_id: str,
        data_format: MappingRelationsDataFormat | str = MappingRelationsDataFormat.JSON,
    ) -> I14YExport:
        return await (await self._verified_adapter()).get_mapping_relations(
            mapping_table_id, data_format
        )

    async def list_public_services(
        self, *, page: int = 1, page_size: int = 25, **filters: Any
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).list_public_services(
            page=page, page_size=page_size, **filters
        )

    async def get_public_service(self, public_service_id: str) -> Resource:
        return await (await self._verified_adapter()).get_public_service(public_service_id)

    async def search(
        self,
        *,
        resource_type: SearchResourceType | str | None = None,
        page: int = 1,
        page_size: int = 25,
        **filters: Any,
    ) -> I14YPage[Resource]:
        return await (await self._verified_adapter()).search(
            resource_type=resource_type,
            page=page,
            page_size=page_size,
            **filters,
        )


async def iter_i14y_pages[T](
    fetch_page: Callable[[int, int], Awaitable[I14YPage[T]]],
    *,
    page_size: int = 100,
    max_pages: int | None = None,
) -> AsyncIterator[I14YPage[T]]:
    """Walk a header-paginated collection without assuming undocumented API defaults."""

    if page_size < 1:
        raise ValueError("page_size must be positive")
    if max_pages is not None and max_pages < 1:
        raise ValueError("max_pages must be positive")
    number = 1
    while max_pages is None or number <= max_pages:
        result = await fetch_page(number, page_size)
        yield result
        paging = result.pagination
        if paging.total_pages is not None:
            current = paging.page if paging.page is not None else number
            if current >= paging.total_pages:
                break
        elif len(result.items) < page_size:
            break
        number += 1


async def collect_i14y_pages[T](
    fetch_page: Callable[[int, int], Awaitable[I14YPage[T]]],
    *,
    page_size: int = 100,
    max_pages: int | None = None,
) -> list[T]:
    items: list[T] = []
    async for page in iter_i14y_pages(fetch_page, page_size=page_size, max_pages=max_pages):
        items.extend(page.items)
    return items


async def map_concurrently[T, U](
    values: Sequence[T],
    worker: Callable[[T], Awaitable[U]],
    *,
    limit: int = 4,
) -> list[U]:
    """Apply an async worker with a strict upper bound while preserving input order."""

    if limit < 1:
        raise ValueError("limit must be at least one")
    semaphore = asyncio.Semaphore(limit)

    async def run(value: T) -> U:
        async with semaphore:
            return await worker(value)

    return list(await asyncio.gather(*(run(value) for value in values)))
