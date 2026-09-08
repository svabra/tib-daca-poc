"""Lossless-to-domain normalization for I14Y concepts and code-list entries."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import quote

from daca_catalog.i14y_public_api import I14YExport, I14YWireError

I14Y_CONCEPT_REGISTER_BASE = "https://register.ld.admin.ch/i14y/concept"
I14Y_LANGUAGES = ("de", "en", "fr", "it", "rm")


def _mapping(value: object) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _resource(payload: Mapping[str, Any]) -> dict[str, Any]:
    nested = payload.get("data")
    return dict(nested) if isinstance(nested, Mapping) else dict(payload)


def _text(value: object) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def normalize_multilingual(value: object) -> dict[str, str]:
    """Keep known and future language tags while discarding blank/non-string values."""

    if isinstance(value, str):
        normalized = value.strip()
        return {"und": normalized} if normalized else {}
    if not isinstance(value, Mapping):
        return {}
    return {
        str(language): text.strip()
        for language, text in value.items()
        if isinstance(language, str) and isinstance(text, str) and text.strip()
    }


def _string_list(value: object) -> tuple[str, ...]:
    if isinstance(value, str):
        text = value.strip()
        return (text,) if text else ()
    if not isinstance(value, Sequence) or isinstance(value, (bytes, bytearray)):
        return ()
    return tuple(text for item in value if (text := _text(item)) is not None)


def _resource_uris(value: object) -> tuple[str, ...]:
    candidates: Sequence[object]
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        candidates = value
    else:
        candidates = (value,)
    uris: list[str] = []
    for candidate in candidates:
        if isinstance(candidate, Mapping):
            uri = _text(candidate.get("uri"))
        else:
            uri = _text(candidate)
        if uri and uri not in uris:
            uris.append(uri)
    return tuple(uris)


def _datetime(value: object) -> datetime | None:
    text = _text(value)
    if text is None:
        return None
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def payload_sha256(payload: Mapping[str, Any]) -> str:
    """Create a stable content identity independent of JSON object key ordering."""

    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


@dataclass(frozen=True, slots=True)
class NormalizedConcept:
    external_id: str
    identifiers: tuple[str, ...]
    legacy_identifier: str | None
    version: str | None
    concept_type: str | None
    name: dict[str, str]
    description: dict[str, str]
    keywords: tuple[dict[str, Any], ...]
    themes: tuple[dict[str, Any], ...]
    conforms_to: tuple[str, ...]
    constraints: dict[str, Any]
    code_list: dict[str, Any]
    publisher_id: str | None
    publisher_identifier: str | None
    publisher_name: dict[str, str]
    publication_level: str | None
    publication_level_proposal: str | None
    registration_status: str | None
    registration_status_proposal: str | None
    responsible_person: dict[str, Any] | None
    responsible_deputy: dict[str, Any] | None
    valid_from: str | None
    valid_to: str | None
    system_created_at: datetime | None
    system_modified_at: datetime | None
    replaces: tuple[str, ...]
    is_replaced_by: tuple[str, ...]
    raw_payload: dict[str, Any]
    payload_hash: str

    @property
    def preferred_identifier(self) -> str | None:
        return self.identifiers[0] if self.identifiers else self.legacy_identifier

    @property
    def register_uri(self) -> str | None:
        identifier = self.preferred_identifier
        if identifier is None or self.version is None:
            return None
        return (
            f"{I14Y_CONCEPT_REGISTER_BASE}/{quote(identifier, safe='')}"
            f"/version/{quote(self.version, safe='')}"
        )

    @property
    def source_modified_at(self) -> datetime | None:
        return self.system_modified_at or self.system_created_at


def normalize_concept(payload: Mapping[str, Any]) -> NormalizedConcept:
    """Normalize a concept while preserving the complete, forward-compatible wire object.

    ``responsiblePerson`` is intentionally optional here even though older Release.json documents
    marked it required.  The production API has omitted it on valid public concepts and has added
    ``replaces``/``isReplacedBy`` ahead of parts of the generated contract.
    """

    raw = _resource(payload)
    external_id = _text(raw.get("id"))
    if external_id is None:
        raise I14YWireError("An I14Y concept needs an id for cache identity")
    publisher = _mapping(raw.get("publisher"))
    system = _mapping(raw.get("system"))
    keywords = raw.get("keywords")
    normalized_keywords: list[dict[str, Any]] = []
    if isinstance(keywords, Sequence) and not isinstance(keywords, (str, bytes, bytearray)):
        normalized_keywords.extend(dict(item) for item in keywords if isinstance(item, Mapping))
    themes = raw.get("themes")
    normalized_themes: list[dict[str, Any]] = []
    if isinstance(themes, Sequence) and not isinstance(themes, (str, bytes, bytearray)):
        normalized_themes.extend(dict(item) for item in themes if isinstance(item, Mapping))
    constraints = {
        key: raw.get(key)
        for key in (
            "minLength",
            "maxLength",
            "minValue",
            "maxValue",
            "numberDecimals",
            "pattern",
            "measurementUnit",
        )
    }
    code_list = {
        key: raw.get(key)
        for key in (
            "codeListEntryDefaultSortProperty",
            "codeListEntryValueMaxLength",
            "codeListEntryValueType",
            "codeListEntries",
        )
    }
    identifiers = _string_list(raw.get("identifiers"))
    legacy_identifier = _text(raw.get("identifier"))
    if not identifiers and legacy_identifier:
        identifiers = (legacy_identifier,)

    return NormalizedConcept(
        external_id=external_id,
        identifiers=identifiers,
        legacy_identifier=legacy_identifier,
        version=_text(raw.get("version")),
        concept_type=_text(raw.get("conceptType")),
        name=normalize_multilingual(raw.get("name")),
        description=normalize_multilingual(raw.get("description")),
        keywords=tuple(normalized_keywords),
        themes=tuple(normalized_themes),
        conforms_to=_resource_uris(raw.get("conformsTo")),
        constraints=constraints,
        code_list=code_list,
        publisher_id=_text(publisher.get("id")),
        publisher_identifier=_text(publisher.get("identifier")),
        publisher_name=normalize_multilingual(publisher.get("name")),
        publication_level=_text(raw.get("publicationLevel")),
        publication_level_proposal=_text(raw.get("publicationLevelProposal")),
        registration_status=_text(raw.get("registrationStatus")),
        registration_status_proposal=_text(raw.get("registrationStatusProposal")),
        responsible_person=(
            _mapping(raw.get("responsiblePerson"))
            if isinstance(raw.get("responsiblePerson"), Mapping)
            else None
        ),
        responsible_deputy=(
            _mapping(raw.get("responsibleDeputy"))
            if isinstance(raw.get("responsibleDeputy"), Mapping)
            else None
        ),
        valid_from=_text(raw.get("validFrom")),
        valid_to=_text(raw.get("validTo")),
        system_created_at=_datetime(system.get("createdAt")),
        system_modified_at=_datetime(system.get("modifiedAt")),
        replaces=_resource_uris(raw.get("replaces")),
        is_replaced_by=_resource_uris(raw.get("isReplacedBy")),
        raw_payload=raw,
        payload_hash=payload_sha256(raw),
    )


def concept_to_cache_dict(concept: NormalizedConcept) -> dict[str, Any]:
    """Return a storage-neutral snake_case DTO for a cache/upsert service."""

    return {
        "external_id": concept.external_id,
        "identifiers": list(concept.identifiers),
        "legacy_identifier": concept.legacy_identifier,
        "version": concept.version,
        "concept_type": concept.concept_type,
        "name": concept.name,
        "description": concept.description,
        "keywords": list(concept.keywords),
        "themes": list(concept.themes),
        "conforms_to": list(concept.conforms_to),
        "constraints": concept.constraints,
        "code_list": concept.code_list,
        "register_uri": concept.register_uri,
        "publisher_id": concept.publisher_id,
        "publisher_identifier": concept.publisher_identifier,
        "publisher_name": concept.publisher_name,
        "publisher": concept.raw_payload.get("publisher", {}),
        "publication_level": concept.publication_level,
        "publication_level_proposal": concept.publication_level_proposal,
        "registration_status": concept.registration_status,
        "registration_status_proposal": concept.registration_status_proposal,
        "responsible_person": concept.responsible_person,
        "responsible_deputy": concept.responsible_deputy,
        "valid_from": concept.valid_from,
        "valid_to": concept.valid_to,
        "system_created_at": concept.system_created_at,
        "system_modified_at": concept.system_modified_at,
        "source_system": concept.raw_payload.get("system", {}),
        "source_modified_at": concept.source_modified_at,
        "replaces": list(concept.replaces),
        "is_replaced_by": list(concept.is_replaced_by),
        "raw_payload": concept.raw_payload,
        "payload_hash": concept.payload_hash,
    }


@dataclass(frozen=True, slots=True)
class NormalizedCodeListEntry:
    external_id: str | None
    concept_external_id: str
    code: str
    parent_code: str | None
    name: dict[str, str]
    description: dict[str, str]
    annotations: tuple[dict[str, Any], ...]
    valid_from: str | None
    valid_to: str | None
    raw_payload: dict[str, Any]
    payload_hash: str


def normalize_code_list_entry(payload: Mapping[str, Any]) -> NormalizedCodeListEntry:
    raw = _resource(payload)
    concept_id = _text(raw.get("conceptId"))
    code = _text(raw.get("code"))
    if concept_id is None or code is None:
        raise I14YWireError("An I14Y code-list entry needs conceptId and code")
    annotations = raw.get("annotations")
    normalized_annotations: list[dict[str, Any]] = []
    if isinstance(annotations, Sequence) and not isinstance(
        annotations, (str, bytes, bytearray)
    ):
        normalized_annotations.extend(
            dict(item) for item in annotations if isinstance(item, Mapping)
        )
    return NormalizedCodeListEntry(
        external_id=_text(raw.get("id")),
        concept_external_id=concept_id,
        code=code,
        parent_code=_text(raw.get("parentCode")),
        name=normalize_multilingual(raw.get("name")),
        description=normalize_multilingual(raw.get("description")),
        annotations=tuple(normalized_annotations),
        valid_from=_text(raw.get("validFrom")),
        valid_to=_text(raw.get("validTo")),
        raw_payload=raw,
        payload_hash=payload_sha256(raw),
    )


def code_list_entry_to_cache_dict(entry: NormalizedCodeListEntry) -> dict[str, Any]:
    return {
        "external_id": entry.external_id,
        "concept_external_id": entry.concept_external_id,
        "code": entry.code,
        "parent_code": entry.parent_code,
        "name": entry.name,
        "description": entry.description,
        "annotations": list(entry.annotations),
        "valid_from": entry.valid_from,
        "valid_to": entry.valid_to,
        "raw_payload": entry.raw_payload,
        "payload_hash": entry.payload_hash,
    }


def normalize_code_list_export(
    payload: I14YExport | bytes | str | object,
) -> list[NormalizedCodeListEntry]:
    """Decode the JSON export variants observed as arrays or ``data`` wrappers."""

    candidate: object
    if isinstance(payload, I14YExport):
        candidate = payload.json()
    elif isinstance(payload, bytes):
        candidate = json.loads(payload.decode("utf-8-sig"))
    elif isinstance(payload, str):
        candidate = json.loads(payload)
    else:
        candidate = payload
    if isinstance(candidate, Mapping) and "data" in candidate:
        candidate = candidate["data"]
    if not isinstance(candidate, list) or not all(isinstance(item, Mapping) for item in candidate):
        raise I14YWireError("The I14Y code-list JSON export must contain an array of objects")
    return [normalize_code_list_entry(item) for item in candidate]
