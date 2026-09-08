from __future__ import annotations

import copy
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

from daca_catalog.i14y_concepts import (
    concept_to_cache_dict,
    normalize_code_list_export,
    normalize_concept,
    payload_sha256,
)
from daca_catalog.modeling_api import _upsert_concept
from daca_catalog.models import I14yConcept

FIXTURES = Path(__file__).parent / "fixtures" / "i14y"


def _json_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_real_concept_normalization_tolerates_contract_drift_and_builds_permalink():
    fixture = _json_fixture("concept-legal-form-1.2.0.sanitized.json")

    concept = normalize_concept(fixture)

    assert concept.external_id == "89bc55cc-3858-4c13-a5c8-7dc935dff29b"
    assert concept.identifiers == ("legalForm",)
    assert concept.legacy_identifier is None
    assert concept.responsible_person is None
    assert concept.raw_payload["replaces"] == []
    assert concept.name["de"] == "Rechtsform eines Unternehmens"
    assert concept.publisher_identifier == "CH1"
    assert [theme["code"] for theme in concept.themes] == ["118", "125"]
    assert concept.constraints == {
        "minLength": None,
        "maxLength": None,
        "minValue": None,
        "maxValue": None,
        "numberDecimals": None,
        "pattern": None,
        "measurementUnit": None,
    }
    assert concept.code_list["codeListEntryValueMaxLength"] == 4
    assert concept.code_list["codeListEntryValueType"] == "String"
    assert concept.register_uri == (
        "https://register.ld.admin.ch/i14y/concept/legalForm/version/1.2.0"
    )
    assert concept.source_modified_at.isoformat() == "2026-02-10T10:11:14.407980+00:00"


def test_normalized_concept_has_a_stable_lossless_cache_dto():
    fixture = _json_fixture("concept-legal-form-1.2.0.sanitized.json")
    wire = fixture["data"]
    reordered = dict(reversed(list(wire.items())))

    assert payload_sha256(wire) == payload_sha256(reordered)
    cached = concept_to_cache_dict(normalize_concept(fixture))
    assert cached["external_id"] == wire["id"]
    assert cached["payload_hash"] == payload_sha256(wire)
    assert cached["raw_payload"] == wire
    assert cached["registration_status"] == "Standard"
    assert cached["themes"][0]["code"] == "118"
    assert cached["constraints"]["maxLength"] is None
    assert cached["code_list"]["codeListEntryValueType"] == "String"
    assert cached["publisher"]["identifier"] == "CH1"
    assert cached["source_system"]["modifiedAt"].startswith("2026-02-10")


def test_real_code_list_page_normalizes_hierarchy_and_multilingual_labels():
    fixture = _json_fixture("codelist-legal-form-page-1.sanitized.json")

    entries = normalize_code_list_export(fixture)

    assert [entry.code for entry in entries] == ["0328", "0221", "0232"]
    assert entries[0].parent_code == "03"
    assert entries[1].name["fr"] == "Unité de l'administration cantonale"
    assert all(
        entry.concept_external_id == "89bc55cc-3858-4c13-a5c8-7dc935dff29b"
        for entry in entries
    )


def test_cache_skips_an_unchanged_release_and_never_downgrades_loaded_detail(
    session_factory,
) -> None:
    detail = copy.deepcopy(_json_fixture("concept-legal-form-1.2.0.sanitized.json"))
    concept_id = uuid.uuid4()
    detail["data"]["id"] = str(concept_id)
    fixed_fetch_time = datetime(2020, 1, 2, 3, 4, 5, tzinfo=UTC)

    with session_factory() as session:
        row, changed = _upsert_concept(
            session,
            detail,
            f"https://api.test/concepts/{concept_id}",
            detail_loaded=True,
        )
        assert changed is True
        row.fetched_at = fixed_fetch_time
        session.commit()

    with session_factory() as session:
        row, changed = _upsert_concept(
            session,
            detail,
            f"https://api.test/concepts/{concept_id}",
            detail_loaded=True,
        )
        assert changed is False
        assert row.fetched_at is not None
        assert row.fetched_at.replace(tzinfo=UTC) == fixed_fetch_time

        summary = {
            "data": {
                "id": str(concept_id),
                "identifiers": ["legalForm"],
                "version": "1.2.0",
                "conceptType": "CodeList",
                "name": {"de": "Rechtsform eines Unternehmens"},
                "system": detail["data"]["system"],
            }
        }
        row, changed = _upsert_concept(
            session,
            summary,
            f"https://api.test/concepts/{concept_id}",
            detail_loaded=False,
        )
        assert changed is False
        assert row.detail_loaded is True
        assert row.description["de"].startswith("Die Codierung")
        assert row.raw_payload == detail["data"]
        assert row.fetched_at is not None
        assert row.fetched_at.replace(tzinfo=UTC) == fixed_fetch_time

        changed_summary = copy.deepcopy(summary)
        changed_summary["data"]["system"]["modifiedAt"] = "2026-03-01T00:00:00+00:00"
        row, changed = _upsert_concept(
            session,
            changed_summary,
            f"https://api.test/concepts/{concept_id}",
            detail_loaded=False,
        )
        assert changed is True
        assert row.detail_loaded is False
        assert row.description == {}
        assert session.get(I14yConcept, concept_id) is row
