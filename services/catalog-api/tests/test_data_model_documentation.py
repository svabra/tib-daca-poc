from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from sqlalchemy import Column, Integer, MetaData, Table

ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "scripts/render_data_model.py"


def load_generator():
    spec = importlib.util.spec_from_file_location("render_data_model", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


generator = load_generator()


def test_checked_in_data_model_documentation_is_current() -> None:
    assert generator.update_documents(ROOT, check=True) == []


def test_schema_fingerprint_detects_structural_drift() -> None:
    initial = MetaData()
    Table("example", initial, Column("id", Integer, primary_key=True))
    changed = MetaData()
    Table(
        "example",
        changed,
        Column("id", Integer, primary_key=True),
        Column("revision", Integer, nullable=False),
    )
    assert generator.schema_signature(initial) != generator.schema_signature(changed)


def test_every_table_requires_a_description() -> None:
    metadata = MetaData()
    Table("undocumented", metadata, Column("id", Integer, primary_key=True))
    context = generator.ContextSpec(
        key="test",
        title="Test",
        model_path="unused",
        migrations_path="unused",
        database="unused",
        boundary="unused",
        table_descriptions={},
    )
    with pytest.raises(generator.DataModelDocumentationError, match="missing descriptions"):
        generator.validate_descriptions(metadata, context)


def test_unknown_persistence_context_is_rejected(tmp_path: Path) -> None:
    model = tmp_path / "services/new-api/models.py"
    model.parent.mkdir(parents=True)
    model.write_text(
        "from sqlalchemy.orm import DeclarativeBase\n"
        "class Base(DeclarativeBase): pass\n"
        "class Example(Base):\n"
        "    __tablename__ = 'examples'\n",
        encoding="utf-8",
    )
    with pytest.raises(generator.DataModelDocumentationError, match="unknown persistence"):
        generator.validate_context_inventory(tmp_path, contexts=())


def test_unconfigured_generated_document_is_rejected(tmp_path: Path) -> None:
    docs = tmp_path / "docs/data-model"
    docs.mkdir(parents=True)
    configured = docs / "README.md"
    configured.write_text("configured", encoding="utf-8")
    extra = docs / "unknown.md"
    extra.write_text(generator.GENERATED_START, encoding="utf-8")
    with pytest.raises(generator.DataModelDocumentationError, match="without a configured context"):
        generator.validate_document_set({configured: "configured"})


def test_contexts_are_qualified_and_include_both_audit_tables() -> None:
    rendered = generator.render_overview_region(ROOT)
    assert "`catalog.audit_events`" in rendered
    assert "`control-plane.audit_events`" in rendered
    assert "`sample-data-product.policy_entitlements`" in rendered
    assert rendered.count("```mermaid") == 1


def test_expected_documents_include_all_persistence_contexts() -> None:
    documents = {
        path.relative_to(ROOT).as_posix(): content
        for path, content in generator.expected_documents(ROOT).items()
    }
    assert set(documents) == {
        "docs/data-model/README.md",
        "docs/data-model/catalog.md",
        "docs/data-model/control-plane.md",
        "docs/data-model/sample-data-product.md",
    }
    for content in documents.values():
        assert generator.GENERATED_START in content
        assert generator.GENERATED_END in content
