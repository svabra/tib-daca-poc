from __future__ import annotations

import logging
import uuid
from typing import Any, Self

from daca_catalog import modeling_api, modeling_core
from daca_catalog.modeling_core import (
    FixturePhysicalMetadataAdapter,
    PostgreSQLPhysicalMetadataAdapter,
    detect_physical_drift,
    fixture_metadata,
    normalized_physical_metadata,
)
from daca_catalog.modeling_seed import PHYSICAL_SOURCE_ID, VEHICLE_MODEL_ID, seed_modeling_catalog
from daca_catalog.models import (
    AssetMapping,
    AssetMappingPhysicalColumn,
    AssetMappingVersion,
    AuditEvent,
    PhysicalColumn,
    PhysicalSchemaSnapshot,
)
from pydantic import SecretStr
from sqlalchemy import select


def _headers(actor: str, etag: str | None = None) -> dict[str, str]:
    headers = {"X-DaCa-User": actor}
    if etag is not None:
        headers["If-Match"] = etag
    return headers


def _seed(session_factory) -> None:
    with session_factory() as session:
        seed_modeling_catalog(session)


class _FakeRows:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def mappings(self) -> _FakeRows:
        return self

    def __iter__(self):
        return iter(self._rows)


class _FakeConnection:
    def __init__(self):
        self.commands: list[str] = []

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def scalar(self, statement) -> str:
        self.commands.append(str(statement))
        return "catalog_metadata"

    def execute(self, statement):
        sql = str(statement)
        self.commands.append(sql)
        if "pg_catalog.pg_class" not in sql:
            return _FakeRows([])
        return _FakeRows(
            [
                {
                    "table_schema": "logistics",
                    "table_name": "vehicle_inventory",
                    "table_type": "BASE TABLE",
                    "column_name": "vehicle_id",
                    "data_type": "uuid",
                    "character_maximum_length": None,
                    "numeric_precision": None,
                    "numeric_scale": None,
                    "is_nullable": False,
                    "ordinal_position": 1,
                    "table_comment": None,
                    "column_comment": None,
                }
            ]
        )


class _FakeEngine:
    def __init__(self, connection: _FakeConnection):
        self.connection = connection
        self.disposed = False

    def connect(self) -> _FakeConnection:
        return self.connection

    def dispose(self) -> None:
        self.disposed = True


def test_postgresql_adapter_is_read_only_catalog_only_and_disposes_engine(monkeypatch) -> None:
    secret = "postgresql+psycopg://catalog:do-not-leak@db.example/catalog"
    connection = _FakeConnection()
    engine = _FakeEngine(connection)
    invocation: dict[str, Any] = {}

    def fake_create_engine(dsn: str, **kwargs: Any) -> _FakeEngine:
        invocation.update({"dsn": dsn, **kwargs})
        return engine

    monkeypatch.setattr(modeling_core, "create_engine", fake_create_engine)

    metadata = PostgreSQLPhysicalMetadataAdapter(SecretStr(secret)).inspect()

    assert invocation == {"dsn": secret, "pool_pre_ping": True}
    assert connection.commands[0].strip() == "SET TRANSACTION READ ONLY"
    assert connection.commands[1].strip() == "SET LOCAL statement_timeout = '10s'"
    selects = [
        command.casefold()
        for command in connection.commands
        if command.lstrip().casefold().startswith("select")
    ]
    assert selects
    assert all("information_schema." in command or "pg_catalog." in command for command in selects)
    assert all(secret not in command and "do-not-leak" not in command for command in connection.commands)
    assert metadata["databases"][0]["name"] == "catalog_metadata"
    assert metadata["databases"][0]["schemas"][0]["tables"][0]["columns"] == [
        {
            "name": "vehicle_id",
            "dataType": "uuid",
            "characterLength": None,
            "numericPrecision": None,
            "numericScale": None,
            "nullable": False,
            "ordinalPosition": 1,
            "comment": None,
        }
    ]
    assert engine.disposed is True


def test_fixture_versions_are_deterministic_and_cover_both_documented_tables() -> None:
    baseline = normalized_physical_metadata(fixture_metadata("baseline"))
    repeated = normalized_physical_metadata(fixture_metadata("baseline"))
    drift = normalized_physical_metadata(fixture_metadata("drift"))

    assert baseline == repeated
    table_keys = {
        table["stableKey"]
        for database in baseline["databases"]
        for schema in database["schemas"]
        for table in schema["tables"]
    }
    assert table_keys == {
        "logistics_db.logistics.vehicle_inventory",
        "hr_core.public.org_unit",
    }
    assert baseline != drift


def test_physical_model_search_finds_tables_columns_and_s3_parquet(client, session_factory) -> None:
    _seed(session_factory)

    by_column = client.get(
        "/api/v1/physical-models",
        params={"q": "designation_de"},
        headers=_headers("christian.man"),
    )
    s3_only = client.get(
        "/api/v1/physical-models",
        params={"q": "vehicle", "sourceType": "s3"},
        headers=_headers("christian.man"),
    )

    assert by_column.status_code == 200, by_column.text
    assert by_column.json()["total"] >= 2
    assert s3_only.status_code == 200, s3_only.text
    assert s3_only.json()["total"] == 1
    model = s3_only.json()["items"][0]
    assert model["sourceType"] == "s3"
    assert model["modelType"] == "parquet"
    assert model["qualifiedName"].startswith("s3://vat-smoke-test/")
    assert model["schemaConfidence"] == "embedded"


def test_drift_detects_raw_postgresql_type_changes_with_same_logical_family() -> None:
    previous = normalized_physical_metadata(
        {
            "databases": [
                {
                    "name": "catalog",
                    "schemas": [
                        {
                            "name": "public",
                            "tables": [
                                {
                                    "name": "items",
                                    "columns": [
                                        {"name": "amount", "dataType": "integer"}
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ]
        }
    )
    current = normalized_physical_metadata(
        {
            "databases": [
                {
                    "name": "catalog",
                    "schemas": [
                        {
                            "name": "public",
                            "tables": [
                                {
                                    "name": "items",
                                    "columns": [
                                        {"name": "amount", "dataType": "bigint"}
                                    ],
                                }
                            ],
                        }
                    ],
                }
            ]
        }
    )

    changes = detect_physical_drift(previous, current)

    assert changes == [
        {
            "changeType": "type_changed",
            "assetKey": "catalog.public.items.amount",
            "before": {"rawDataType": "integer"},
            "after": {"rawDataType": "bigint"},
        }
    ]


def test_identical_import_still_creates_a_new_hashed_snapshot(client, session_factory) -> None:
    _seed(session_factory)
    with session_factory() as session:
        baseline = session.scalar(
            select(PhysicalSchemaSnapshot).where(
                PhysicalSchemaSnapshot.source_id == PHYSICAL_SOURCE_ID,
                PhysicalSchemaSnapshot.sequence == 1,
            )
        )
        assert baseline is not None
        baseline_id = baseline.id
        baseline_fingerprint = baseline.fingerprint

    imported = client.post(
        f"/api/v1/physical-sources/{PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "baseline"},
        headers=_headers("christian.man", '"1"'),
    )

    assert imported.status_code == 200, imported.text
    snapshot = imported.json()["snapshot"]
    assert snapshot["sequence"] == 2
    assert snapshot["dataOwnerName"] == "Christian Spider"
    assert snapshot["catalogPath"] == "postgresql://hr_core/"
    assert snapshot["predecessorSnapshotId"] == str(baseline_id)
    assert snapshot["fingerprint"] == baseline_fingerprint
    drift = client.get(
        f"/api/v1/physical-snapshots/{snapshot['id']}/drift",
        headers=_headers("christian.man"),
    )
    assert drift.status_code == 200, drift.text
    assert drift.json()["summary"] == {}
    assert drift.json()["changes"] == []


def test_drift_preserves_validated_evidence_and_creates_system_audited_broken_successor(
    client, session_factory
) -> None:
    _seed(session_factory)
    with session_factory() as session:
        mapping_id, version_id = session.execute(
            select(AssetMapping.id, AssetMappingVersion.id)
            .join(
                AssetMappingVersion,
                AssetMappingVersion.asset_mapping_id == AssetMapping.id,
            )
            .join(
                AssetMappingPhysicalColumn,
                AssetMappingPhysicalColumn.asset_mapping_version_id == AssetMappingVersion.id,
            )
            .join(
                PhysicalColumn,
                PhysicalColumn.id == AssetMappingPhysicalColumn.physical_column_id,
            )
            .where(
                AssetMapping.physical_source_id == PHYSICAL_SOURCE_ID,
                AssetMappingVersion.revision == AssetMapping.revision,
                PhysicalColumn.stable_key.endswith(".vehicle_type_code"),
            )
        ).one()

    validated = client.post(
        f"/api/v1/asset-mappings/{mapping_id}/versions/{version_id}/validate",
        headers=_headers("christian.man", '"1"'),
    )
    assert validated.status_code == 200, validated.text
    assert validated.json()["status"] == "validated"
    validated_id = uuid.UUID(validated.json()["versionId"])

    unchanged = client.post(
        f"/api/v1/physical-sources/{PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "baseline"},
        headers=_headers("christian.man", '"1"'),
    )
    assert unchanged.status_code == 200, unchanged.text

    imported = client.post(
        f"/api/v1/physical-sources/{PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "drift"},
        headers=_headers("christian.man", '"2"'),
    )
    assert imported.status_code == 200, imported.text

    with session_factory() as session:
        immutable_validated = session.get(AssetMappingVersion, validated_id)
        latest = session.scalar(
            select(AssetMappingVersion)
            .where(AssetMappingVersion.asset_mapping_id == mapping_id)
            .order_by(AssetMappingVersion.revision.desc())
            .limit(1)
        )
        audit = session.scalar(
            select(AuditEvent)
            .where(
                AuditEvent.resource_type == "asset-mapping",
                AuditEvent.resource_id == str(mapping_id),
                AuditEvent.action == "broken-by-drift",
            )
            .order_by(AuditEvent.occurred_at.desc())
            .limit(1)
        )

        assert immutable_validated is not None
        assert immutable_validated.status == "validated"
        assert immutable_validated.validation_result["valid"] is True
        assert latest is not None
        assert latest.id != immutable_validated.id
        assert latest.predecessor_version_id == immutable_validated.id
        assert latest.status == "broken"
        assert latest.validation_result["drift"]["currentSnapshotId"] == imported.json()[
            "snapshot"
        ]["id"]
        assert audit is not None
        assert audit.actor == "system:drift-detector"
        assert audit.details["currentSnapshotId"] == imported.json()["snapshot"]["id"]


def test_drift_import_skips_successors_for_retired_logical_roots(client, session_factory) -> None:
    _seed(session_factory)
    logical = client.get(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}",
        headers=_headers("christian.man"),
    )
    assert logical.status_code == 200, logical.text
    submitted = client.post(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/versions/"
        f"{logical.json()['versionId']}/submit",
        headers=_headers("christian.man", logical.headers["etag"]),
    )
    assert submitted.status_code == 200, submitted.text
    review = client.get(
        f"/api/v1/logical-model-reviews/{submitted.json()['reviewId']}",
        headers=_headers("christian.man"),
    ).json()
    published = client.post(
        f"/api/v1/logical-model-reviews/{submitted.json()['reviewId']}/decision",
        json={"decision": "accept"},
        headers=_headers(review["reviewerUserId"], submitted.headers["etag"]),
    )
    assert published.status_code == 200, published.text
    retired = client.post(
        f"/api/v1/logical-models/{VEHICLE_MODEL_ID}/versions/"
        f"{published.json()['versionId']}/retire",
        headers=_headers("lawrence.hill", published.headers["etag"]),
    )
    assert retired.status_code == 200, retired.text

    with session_factory() as session:
        revisions_before = dict(
            session.execute(
                select(AssetMapping.id, AssetMapping.revision).where(
                    AssetMapping.logical_model_id == VEHICLE_MODEL_ID
                )
            ).all()
        )

    imported = client.post(
        f"/api/v1/physical-sources/{PHYSICAL_SOURCE_ID}/imports",
        json={"fixtureVariant": "drift"},
        headers=_headers("christian.man", '"1"'),
    )

    assert imported.status_code == 200, imported.text
    with session_factory() as session:
        revisions_after = dict(
            session.execute(
                select(AssetMapping.id, AssetMapping.revision).where(
                    AssetMapping.logical_model_id == VEHICLE_MODEL_ID
                )
            ).all()
        )
    assert revisions_after == revisions_before


def test_postgresql_import_is_disabled_without_server_side_dsn(client, session_factory) -> None:
    _seed(session_factory)
    client.app.state.settings.daca_physical_metadata_adapter = "postgresql"
    created = client.post(
        "/api/v1/physical-sources",
        headers=_headers("christian.man"),
        json={
            "name": "Configured PostgreSQL metadata",
            "adapterType": "postgresql",
            "configRef": "server-side.postgresql.metadata",
            "departmentCode": "VBS",
            "organizationId": "vbs-verteidigung",
        },
    )
    assert created.status_code == 201, created.text

    imported = client.post(
        f"/api/v1/physical-sources/{created.json()['id']}/imports",
        headers=_headers("christian.man", created.headers["etag"]),
        json={},
    )

    assert imported.status_code == 503
    assert "PostgreSQL metadata source is not configured" in imported.text
    assert "postgresql://" not in imported.text


def test_fixture_mode_blocks_real_adapter_even_when_a_dsn_exists(
    client, session_factory, monkeypatch
) -> None:
    _seed(session_factory)
    created = client.post(
        "/api/v1/physical-sources",
        headers=_headers("christian.man"),
        json={
            "name": "Configured PostgreSQL metadata",
            "adapterType": "postgresql",
            "configRef": "server-side.postgresql.metadata",
            "departmentCode": "VBS",
            "organizationId": "vbs-verteidigung",
        },
    )
    assert created.status_code == 201, created.text
    client.app.state.settings.daca_physical_postgres_dsn = SecretStr(
        "postgresql+psycopg://catalog:do-not-leak@db.example/catalog"
    )
    adapter_calls: list[str] = []

    def fake_postgresql_adapter(secret: SecretStr) -> FixturePhysicalMetadataAdapter:
        adapter_calls.append(secret.get_secret_value())
        return FixturePhysicalMetadataAdapter()

    monkeypatch.setattr(modeling_api, "PostgreSQLPhysicalMetadataAdapter", fake_postgresql_adapter)

    blocked = client.post(
        f"/api/v1/physical-sources/{created.json()['id']}/imports",
        headers=_headers("christian.man", created.headers["etag"]),
        json={},
    )
    assert blocked.status_code == 503
    assert "not enabled" in blocked.text
    assert adapter_calls == []

    client.app.state.settings.daca_physical_metadata_adapter = "postgresql"
    imported = client.post(
        f"/api/v1/physical-sources/{created.json()['id']}/imports",
        headers=_headers("christian.man", created.headers["etag"]),
        json={},
    )
    assert imported.status_code == 200, imported.text
    assert len(adapter_calls) == 1


def test_postgresql_adapter_failure_redacts_dsn_from_response_audit_and_logs(
    client, session_factory, monkeypatch, caplog
) -> None:
    _seed(session_factory)
    created = client.post(
        "/api/v1/physical-sources",
        headers=_headers("christian.man"),
        json={
            "name": "Failing PostgreSQL metadata",
            "adapterType": "postgresql",
            "configRef": "server-side.postgresql.metadata",
            "departmentCode": "VBS",
            "organizationId": "vbs-verteidigung",
        },
    )
    assert created.status_code == 201, created.text
    secret_value = "postgresql+psycopg://catalog:do-not-leak@db.example/catalog"
    client.app.state.settings.daca_physical_metadata_adapter = "postgresql"
    client.app.state.settings.daca_physical_postgres_dsn = SecretStr(secret_value)

    class FailingAdapter:
        def inspect(self, *, variant: str | None = None) -> dict[str, Any]:
            del variant
            raise RuntimeError(secret_value)

    monkeypatch.setattr(
        modeling_api,
        "PostgreSQLPhysicalMetadataAdapter",
        lambda _secret: FailingAdapter(),
    )

    with caplog.at_level(logging.DEBUG):
        imported = client.post(
            f"/api/v1/physical-sources/{created.json()['id']}/imports",
            headers=_headers("christian.man", created.headers["etag"]),
            json={},
        )

    assert imported.status_code == 503
    assert "metadata import failed" in imported.text
    assert secret_value not in imported.text
    assert "do-not-leak" not in caplog.text
    with session_factory() as session:
        audit_payloads = list(
            session.scalars(
                select(AuditEvent.details).where(
                    AuditEvent.resource_type.in_(
                        {"physical-source", "physical-schema-snapshot"}
                    )
                )
            )
        )
    assert secret_value not in str(audit_payloads)
