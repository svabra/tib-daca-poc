from __future__ import annotations

import pytest
from daca_catalog.settings import Settings
from pydantic import ValidationError
from sqlalchemy.engine import make_url


def test_catalog_settings_build_url_from_shared_pg_variables() -> None:
    settings = Settings(
        _env_file=None,
        database_url=None,
        pg_host="postgres.example.internal",
        pg_port=5432,
        pg_oltp_database="evo1_oltp",
        pg_user="shared_user",
        pg_password="p@ss:/?#%word",
        daca_catalog_schema="daca_catalog",
    )

    url = make_url(settings.resolved_database_url)
    assert url.drivername == "postgresql+psycopg"
    assert url.host == "postgres.example.internal"
    assert url.port == 5432
    assert url.database == "evo1_oltp"
    assert url.username == "shared_user"
    assert url.password == "p@ss:/?#%word"


def test_catalog_full_database_url_has_precedence() -> None:
    settings = Settings(
        _env_file=None,
        database_url="sqlite+pysqlite://",
        pg_host="ignored.internal",
    )
    assert settings.resolved_database_url == "sqlite+pysqlite://"


@pytest.mark.parametrize("schema", ["daca-catalog", "Public", "daca sample", ""])
def test_catalog_schema_rejects_unsafe_identifiers(schema: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, daca_catalog_schema=schema)
