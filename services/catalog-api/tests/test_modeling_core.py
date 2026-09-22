from __future__ import annotations

import pytest
from daca_catalog.modeling_core import (
    FixtureS3PhysicalMetadataAdapter,
    PostgreSQLPhysicalMetadataAdapter,
    S3ParquetPhysicalMetadataAdapter,
    canonical_hash,
    detect_physical_drift,
    fixture_metadata,
    normalize_postgresql_type,
    normalized_physical_metadata,
    vibdbu_postgresql_metadata,
)
from daca_catalog.settings import Settings
from pydantic import SecretStr, ValidationError


def test_fixture_drift_covers_required_changes_and_pending_rename() -> None:
    baseline = normalized_physical_metadata(fixture_metadata("baseline"))
    drift = normalized_physical_metadata(fixture_metadata("drift"))

    changes = detect_physical_drift(baseline, drift)
    change_types = {change["changeType"] for change in changes}

    assert {
        "column_added",
        "column_removed",
        "type_changed",
        "length_changed",
        "precision_changed",
        "scale_changed",
        "nullability_changed",
        "rename_candidate",
    } <= change_types
    rename = next(
        change
        for change in changes
        if change["changeType"] == "rename_candidate"
        and change["assetKey"].endswith("vehicle_type_code")
    )
    assert rename["after"]["name"] == "vehicle_category_code"
    assert rename["reviewStatus"] == "pending"
    assert rename["confidence"] >= 0.75


def test_physical_normalization_is_deterministic_and_type_aware() -> None:
    first = normalized_physical_metadata(fixture_metadata())
    second = normalized_physical_metadata(fixture_metadata())

    assert canonical_hash(first) == canonical_hash(second)
    assert normalize_postgresql_type("character varying") == "string"
    assert normalize_postgresql_type("xsd:string") == "string"
    assert normalize_postgresql_type("numeric") == "decimal"
    assert normalize_postgresql_type("xsd:dateTime") == "datetime"
    assert normalize_postgresql_type("timestamp with time zone") == "datetime"


def test_vibdbu_seed_snapshot_matches_the_released_physical_structure() -> None:
    metadata = normalized_physical_metadata(vibdbu_postgresql_metadata())
    table = metadata["databases"][0]["schemas"][0]["tables"][0]

    assert table["name"] == "VIBDBU"
    assert table["kind"] == "table"
    assert len(table["columns"]) == 47
    assert table["columns"][0]["name"] == "SGENR"
    assert table["columns"][0]["normalizedDataType"] == "string"
    assert table["columns"][7]["name"] == "VALIDFROM"
    assert table["columns"][7]["normalizedDataType"] == "date"
    assert table["columns"][13]["name"] == "ZZBASISJAHR"
    assert table["columns"][13]["numericPrecision"] == 4


def test_postgresql_adapter_representation_never_exposes_dsn() -> None:
    secret = "postgresql+psycopg://catalog:do-not-leak@db.example/catalog"
    adapter = PostgreSQLPhysicalMetadataAdapter(SecretStr(secret))

    assert secret not in repr(adapter)
    assert "do-not-leak" not in repr(adapter)
    assert "**********" in repr(adapter)


def test_s3_parquet_fixture_is_mapping_ready_and_credentials_are_redacted() -> None:
    metadata = normalized_physical_metadata(FixtureS3PhysicalMetadataAdapter().inspect())
    table = metadata["databases"][0]["schemas"][0]["tables"][0]
    secret = "never-log-this-s3-secret"
    adapter = S3ParquetPhysicalMetadataAdapter(
        endpoint_url="https://objects.example.admin.ch",
        bucket="federal-data",
        prefix="models",
        region="us-east-1",
        access_key_id=SecretStr("catalog-reader"),
        secret_access_key=SecretStr(secret),
    )

    assert table["kind"] == "parquet"
    assert table["storageLocation"].startswith("s3://")
    assert table["schemaConfidence"] == "embedded"
    assert {column["name"] for column in table["columns"]} >= {"vehicle_id", "designation_de"}
    assert secret not in repr(adapter)
    assert "**********" in repr(adapter)


def test_physical_metadata_dsn_is_redacted_by_settings() -> None:
    secret = "postgresql+psycopg://catalog:do-not-leak@db.example/catalog"
    settings = Settings(daca_physical_postgres_dsn=secret)

    assert secret not in repr(settings)
    assert secret not in str(settings.model_dump())
    assert settings.daca_physical_postgres_dsn.get_secret_value() == secret


def test_physical_s3_secrets_are_redacted_by_settings() -> None:
    secret = "never-log-this-s3-secret"
    settings = Settings(
        daca_physical_s3_endpoint_url="https://objects.example.admin.ch",
        daca_physical_s3_bucket="federal-data",
        daca_physical_s3_access_key_id="catalog-reader",
        daca_physical_s3_secret_access_key=secret,
    )

    assert secret not in repr(settings)
    assert secret not in str(settings.model_dump())
    assert settings.daca_physical_s3_secret_access_key.get_secret_value() == secret


@pytest.mark.parametrize(
    "dsn",
    [
        "https://db.example/catalog",
        "postgresql-not://catalog:secret@db.example/catalog",
        "postgresql+asyncpg://catalog:secret@db.example/catalog",
        "postgresql+psycopg:///missing-host",
    ],
)
def test_physical_metadata_dsn_accepts_only_supported_postgresql_drivers(dsn: str) -> None:
    with pytest.raises(ValidationError):
        Settings(daca_physical_postgres_dsn=dsn)
