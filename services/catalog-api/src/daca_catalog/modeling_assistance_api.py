from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import Field

from .modeling_api import require_modeling_actor
from .schemas import ApiModel, reject_unsafe_service_level_text

ActorDep = Annotated[str, Depends(require_modeling_actor)]
_termdat_filter_cache: dict[str, tuple[float, list[int]]] = {}
_translation_cache: dict[tuple[str, tuple[str, ...]], dict[str, str]] = {}


class TranslationRequest(ApiModel):
    source_text: str = Field(min_length=1, max_length=8000)
    source_language: Literal["DE"] = "DE"
    target_languages: list[Literal["FR", "IT", "EN"]] = Field(
        default_factory=lambda: ["FR", "IT", "EN"]
    )
    classification: Literal["unclassified", "internal", "confidential", "secret"]

    @classmethod
    def _safe(cls, value: str) -> str:
        return reject_unsafe_service_level_text(value)


class TranslationResponse(ApiModel):
    source_text_hash: str
    translations: dict[str, str]
    provider: Literal["deepl"] = "deepl"
    machine_translated: bool = True
    retrieved_at: datetime
    payload_hash: str


def _transport(request: Request) -> httpx.AsyncBaseTransport | None:
    return getattr(request.app.state, "assistance_transport", None)


def _ids(value: Any) -> list[int]:
    rows = (
        value
        if isinstance(value, list)
        else value.get("items", [])
        if isinstance(value, dict)
        else []
    )
    result: list[int] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        candidate = row.get("id") or row.get("value") or row.get("code")
        try:
            result.append(int(candidate))
        except TypeError, ValueError:
            continue
    return result


def _language_details(entry: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for detail in entry.get("languageDetails") or []:
        if not isinstance(detail, dict):
            continue
        language = str(detail.get("languageIsoCode") or "").lower()
        if language and (language not in result or int(detail.get("sequence") or 99) == 1):
            description_type = "definition"
            description = detail.get("definition") or ""
            source = detail.get("definitionSource") or ""
            if not str(description).strip():
                description_type = "note"
                description = detail.get("note") or ""
                source = detail.get("noteSource") or ""
            if not str(description).strip():
                description_type = "context"
                description = detail.get("context") or ""
                source = detail.get("contextSource") or ""
            if not str(description).strip():
                description_type = "none"
            result[language] = {
                "term": detail.get("terminus") or detail.get("name") or "",
                "definition": description,
                "descriptionType": description_type,
                "source": source or detail.get("terminusSource") or detail.get("nameSource") or "",
            }
    return result


def normalize_termdat_entry(entry: dict[str, Any]) -> dict[str, Any]:
    entry_id = str(entry.get("id") or "")
    languages = _language_details(entry)
    preferred = languages.get("de") or next(
        iter(languages.values()),
        {"term": "", "definition": "", "descriptionType": "none", "source": ""},
    )
    status = entry.get("status") if isinstance(entry.get("status"), dict) else {}
    reliability = entry.get("reliability") if isinstance(entry.get("reliability"), dict) else {}
    collection = entry.get("collection") if isinstance(entry.get("collection"), dict) else {}
    classification = (
        entry.get("classification") if isinstance(entry.get("classification"), dict) else {}
    )
    payload_hash = hashlib.sha256(
        json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "entryId": entry_id,
        "uri": f"https://register.ld.admin.ch/termdat/{entry_id}",
        "preferredTerm": preferred["term"],
        "definition": preferred["definition"],
        "descriptionType": preferred["descriptionType"],
        "languages": languages,
        "status": status.get("text") or status.get("name") or status.get("code"),
        "reliability": reliability.get("text")
        or reliability.get("name")
        or reliability.get("code"),
        "collection": collection.get("name") or collection.get("text") or collection.get("code"),
        "classification": classification.get("name")
        or classification.get("text")
        or classification.get("code"),
        "subjects": [
            item.get("name") or item.get("text")
            for item in (entry.get("subject") or [])
            if isinstance(item, dict)
        ],
        "source": preferred["source"],
        "sourceModifiedAt": entry.get("modifiedAt") or entry.get("lastModified"),
        "retrievedAt": datetime.now(UTC),
        "retrievedFrom": entry.get("url") or "https://api.termdat.bk.admin.ch/v2",
        "payloadHash": payload_hash,
        "rawPayload": entry,
    }


async def _filter_ids(
    client: httpx.AsyncClient, base_url: str, resource: str, language: str
) -> list[int]:
    key = f"{base_url}:{resource}:{language}"
    cached = _termdat_filter_cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    response = await client.get(f"{base_url}/{resource}", params={"languageCode": language})
    response.raise_for_status()
    values = _ids(response.json())
    _termdat_filter_cache[key] = (time.monotonic() + 86400, values)
    return values


def _termdat_rows(value: Any) -> list[dict[str, Any]]:
    rows = (
        value
        if isinstance(value, list)
        else value.get("items", [])
        if isinstance(value, dict)
        else []
    )
    return [row for row in rows if isinstance(row, dict)]


def _termdat_search_query(value: str) -> str:
    literal = value.strip()
    escaped = re.sub(r'([+\-!(){}\[\]^"~*?:\\/]|&&|\|\|)', r"\\\1", literal)
    return f'"{escaped}"' if any(character.isspace() for character in literal) else f"*{escaped}*"


def _merge_termdat_entries(responses: list[Any]) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for response in responses:
        for row in _termdat_rows(response):
            entry_id = str(row.get("id") or "")
            if not entry_id:
                continue
            if entry_id not in merged:
                merged[entry_id] = dict(row)
                merged[entry_id]["languageDetails"] = []
                order.append(entry_id)
            target = merged[entry_id]
            for key, value in row.items():
                if key != "languageDetails" and value not in (None, "", [], {}):
                    target[key] = value
            details = target["languageDetails"]
            known = {
                (
                    str(item.get("languageIsoCode") or "").lower(),
                    item.get("id"),
                    item.get("sequence"),
                )
                for item in details
                if isinstance(item, dict)
            }
            for detail in row.get("languageDetails") or []:
                if not isinstance(detail, dict):
                    continue
                identity = (
                    str(detail.get("languageIsoCode") or "").lower(),
                    detail.get("id"),
                    detail.get("sequence"),
                )
                if identity not in known:
                    details.append(detail)
                    known.add(identity)
    return [merged[entry_id] for entry_id in order]


async def _fetch_multilingual_entries(
    client: httpx.AsyncClient,
    base_url: str,
    entry_ids: list[int],
    input_language: str,
) -> list[dict[str, Any]]:
    if not entry_ids:
        return []
    output_languages = [
        language for language in ("de", "fr", "it", "en", "rm") if language != input_language
    ]

    async def fetch(output_language: str) -> Any:
        params: list[tuple[str, str | int]] = [
            ("InLanguageCode", input_language),
            ("OutLanguageCode", output_language),
        ]
        params.extend(("EntryIds", entry_id) for entry_id in entry_ids)
        response = await client.get(f"{base_url}/Entry", params=params)
        response.raise_for_status()
        return response.json()

    return _merge_termdat_entries(
        list(await asyncio.gather(*(fetch(language) for language in output_languages)))
    )


def create_modeling_assistance_router() -> APIRouter:
    router = APIRouter(prefix="/api/v1", tags=["modeling assistance"])

    @router.get("/assistance/status")
    def assistance_status(request: Request, actor: ActorDep) -> dict[str, Any]:
        del actor
        settings = request.app.state.settings
        return {
            "translation": {
                "provider": "deepl",
                "configured": settings.daca_deepl_api_key is not None,
                "languages": ["fr", "it", "en"],
            },
            "termdat": {"configured": True, "minimumQueryLength": 3},
            "externalDataRule": "unclassified-only",
        }

    @router.post("/assistance/translations", response_model=TranslationResponse)
    async def translate(
        body: TranslationRequest, request: Request, actor: ActorDep
    ) -> dict[str, Any]:
        del actor
        if body.classification != "unclassified":
            raise HTTPException(
                422, "Only unclassified text may be sent to an external translation provider"
            )
        settings = request.app.state.settings
        if settings.daca_deepl_api_key is None:
            raise HTTPException(
                503, "DeepL Free is not configured; manual translation remains available"
            )
        source_text = reject_unsafe_service_level_text(body.source_text)
        source_hash = hashlib.sha256(source_text.encode("utf-8")).hexdigest()
        targets = tuple(dict.fromkeys(body.target_languages))
        key = (source_hash, targets)
        if key in _translation_cache:
            translated = _translation_cache[key]
            return {
                "sourceTextHash": source_hash,
                "translations": translated,
                "retrievedAt": datetime.now(UTC),
                "payloadHash": hashlib.sha256(
                    json.dumps(translated, sort_keys=True).encode()
                ).hexdigest(),
            }
        headers = {
            "Authorization": f"DeepL-Auth-Key {settings.daca_deepl_api_key.get_secret_value()}"
        }
        timeout = httpx.Timeout(10.0)
        try:
            async with httpx.AsyncClient(transport=_transport(request), timeout=timeout) as client:

                async def one(target: str) -> tuple[str, str]:
                    response = await client.post(
                        settings.daca_deepl_api_url,
                        headers=headers,
                        data={"text": source_text, "source_lang": "DE", "target_lang": target},
                    )
                    response.raise_for_status()
                    rows = response.json().get("translations") or []
                    if not rows or not str(rows[0].get("text") or "").strip():
                        raise httpx.HTTPError("DeepL returned no translation")
                    return target.lower(), str(rows[0]["text"])

                translated = dict(await asyncio.gather(*(one(target) for target in targets)))
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(
                503, "DeepL Free is temporarily unavailable; existing text was not changed"
            ) from exc
        _translation_cache[key] = translated
        return {
            "sourceTextHash": source_hash,
            "translations": translated,
            "retrievedAt": datetime.now(UTC),
            "payloadHash": hashlib.sha256(
                json.dumps(translated, sort_keys=True).encode()
            ).hexdigest(),
        }

    @router.get("/termdat/search")
    async def search_termdat(
        request: Request,
        actor: ActorDep,
        q: Annotated[str, Query(min_length=3, max_length=200)],
        language: Literal["de", "fr", "it", "en"] = "de",
        limit: Annotated[int, Query(ge=1, le=25)] = 10,
    ) -> dict[str, Any]:
        del actor
        base_url = request.app.state.settings.daca_termdat_api_url.rstrip("/")
        try:
            async with httpx.AsyncClient(transport=_transport(request), timeout=10.0) as client:
                collection_ids, classification_ids = await asyncio.gather(
                    _filter_ids(client, base_url, "Collection", language),
                    _filter_ids(client, base_url, "Classification", language),
                )
                params: list[tuple[str, str | int | bool]] = [
                    ("InLanguageCode", language),
                    ("SearchTerm", _termdat_search_query(q)),
                    ("ReturnType", "Summary"),
                    ("MaxEntryCount", limit),
                    ("Field.Terminus", True),
                    ("Field.Name", True),
                    ("Field.Abbreviation", True),
                    ("Field.Phraseology", True),
                    ("Field.Definition", False),
                ]
                params.extend(("CollectionIds", value) for value in collection_ids)
                params.extend(("ClassificationIds", value) for value in classification_ids)
                response = await client.get(f"{base_url}/Search", params=params)
                response.raise_for_status()
                search_rows = _termdat_rows(response.json())
                entry_ids = [
                    int(row["id"]) for row in search_rows if str(row.get("id") or "").isdigit()
                ]
                raw = await _fetch_multilingual_entries(client, base_url, entry_ids, language)
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(503, "TERMDAT is temporarily unavailable") from exc
        items = [normalize_termdat_entry(item) for item in raw]
        return {"items": items[:limit], "total": len(items), "query": q, "language": language}

    @router.get("/termdat/entries/{entry_id}")
    async def get_termdat_entry(entry_id: int, request: Request, actor: ActorDep) -> dict[str, Any]:
        del actor
        base_url = request.app.state.settings.daca_termdat_api_url.rstrip("/")
        try:
            async with httpx.AsyncClient(transport=_transport(request), timeout=10.0) as client:
                raw = await _fetch_multilingual_entries(client, base_url, [entry_id], "de")
        except (httpx.HTTPError, ValueError) as exc:
            raise HTTPException(503, "TERMDAT is temporarily unavailable") from exc
        if not raw:
            raise HTTPException(404, "TERMDAT entry not found")
        return normalize_termdat_entry(raw[0])

    return router
