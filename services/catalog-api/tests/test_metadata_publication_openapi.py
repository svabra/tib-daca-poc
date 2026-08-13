from __future__ import annotations

import importlib.util
from pathlib import Path

from didaca_catalog.main import app


def load_renderer():
    path = Path(__file__).resolve().parents[3] / "scripts" / "render_metadata_publication_openapi.py"
    spec = importlib.util.spec_from_file_location("render_metadata_publication_openapi", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_focused_openapi_is_current_and_documents_contract():
    renderer = load_renderer()
    checked_in = renderer.OUTPUT.read_text(encoding="utf-8")
    assert checked_in == renderer.expected_content()
    spec = renderer.focused_spec()
    publication = spec["paths"]["/api/v1/metadata-publications"]["post"]
    assert {"200", "404", "409", "422", "503"}.issubset(publication["responses"])
    examples = spec["components"]["schemas"]["MetadataPublicationCreate"]["examples"]
    assert {example["publicationMode"] for example in examples} == {"governance_review", "automatic"}
    assert "DIDACA_OPEN_METADATA_PUBLICATION" in spec["info"]["description"]


def test_live_fastapi_schema_contains_same_publication_operation():
    live = app.openapi()["paths"]["/api/v1/metadata-publications"]["post"]
    assert live["summary"] == "Publish REST metadata from an external curation platform"
    assert live["requestBody"]["content"]["application/json"]["schema"]["$ref"].endswith("MetadataPublicationCreate")
