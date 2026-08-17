from __future__ import annotations

import pytest
from app.migration_context import (
    function_search_path,
    proxy_session_condition,
    sample_schema,
    shared_postgres_enabled,
)
from app.settings import Settings
from pydantic import ValidationError
from sqlalchemy.engine import make_url


def test_shared_sample_and_projector_use_same_encoded_url() -> None:
    settings = Settings(
        _env_file=None,
        sample_database_url=None,
        policy_projector_database_url=None,
        pg_host="postgres.example.internal",
        pg_port=5432,
        pg_oltp_database="evo1_oltp",
        pg_user="shared_user",
        pg_password="p@ss:/?#%word",
        daca_sample_schema="daca_sample",
        daca_shared_postgres=True,
    )

    sample_url = make_url(settings.resolved_sample_database_url)
    projector_url = make_url(settings.resolved_policy_projector_database_url)
    assert sample_url == projector_url
    assert sample_url.database == "evo1_oltp"
    assert sample_url.password == "p@ss:/?#%word"


def test_explicit_sample_urls_keep_precedence() -> None:
    settings = Settings(
        _env_file=None,
        sample_database_url="postgresql+psycopg://sample:sample@db/sample",
        policy_projector_database_url="postgresql+psycopg://projector:projector@db/sample",
        daca_shared_postgres=True,
    )
    assert settings.resolved_sample_database_url.endswith("sample:sample@db/sample")
    assert settings.resolved_policy_projector_database_url.endswith(
        "projector:projector@db/sample"
    )


@pytest.mark.parametrize("schema", ["daca-sample", "Public", "daca sample", ""])
def test_sample_schema_rejects_unsafe_identifiers(schema: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, daca_sample_schema=schema)


def test_migration_context_uses_schema_and_shared_proxy(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DACA_SAMPLE_SCHEMA", "daca_sample")
    monkeypatch.setenv("DACA_SHARED_POSTGRES", "true")

    assert sample_schema() == "daca_sample"
    assert function_search_path() == '"daca_sample", public, pg_temp'
    assert shared_postgres_enabled() is True
    assert "current_setting('daca.subject_id'" in proxy_session_condition()


def test_migration_context_keeps_dedicated_role_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DACA_SAMPLE_SCHEMA", raising=False)
    monkeypatch.delenv("DACA_SHARED_POSTGRES", raising=False)

    assert sample_schema() == "public"
    assert function_search_path() == "public, pg_temp"
    assert shared_postgres_enabled() is False
    assert proxy_session_condition() == "session_user = 'daca_sample_api'"
