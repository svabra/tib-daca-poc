from __future__ import annotations

import hashlib
import json
import posixpath
import uuid
from collections.abc import Mapping
from typing import Any, Protocol
from urllib.parse import urlsplit

from pydantic import SecretStr
from rapidfuzz.fuzz import ratio
from sqlalchemy import create_engine, text


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def stable_uuid(value: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"urn:daca:modeling:{value}")


def normalize_postgresql_type(raw_type: str) -> str:
    normalized = raw_type.strip().casefold()
    if normalized in {
        "character varying", "varchar", "character", "char", "text", "citext", "string",
        "large_string", "string_view",
    }:
        return "string"
    if normalized in {
        "smallint", "integer", "bigint", "smallserial", "serial", "bigserial",
        "int8", "int16", "int32", "int64", "uint8", "uint16", "uint32", "uint64",
    }:
        return "integer"
    if normalized in {
        "numeric", "decimal", "real", "double precision", "money", "float", "float16",
        "float32", "float64", "double",
    } or normalized.startswith("decimal"):
        return "decimal"
    if normalized in {"boolean", "bool"}:
        return "boolean"
    if normalized == "date":
        return "date"
    if "timestamp" in normalized:
        return "datetime"
    if normalized.startswith("time"):
        return "time"
    if normalized == "uuid":
        return "uuid"
    if normalized in {"json", "jsonb"}:
        return "json"
    if normalized in {"bytea", "bit", "bit varying", "binary", "large_binary", "binary_view"}:
        return "binary"
    if normalized == "array" or normalized.endswith("[]") or normalized.startswith(("list<", "large_list<")):
        return "array"
    return normalized.replace(" ", "_")


class PhysicalMetadataAdapter(Protocol):
    def inspect(self, *, variant: str | None = None) -> dict[str, Any]: ...


_BASELINE_FIXTURE: dict[str, Any] = {
    "databases": [
        {
            "name": "logistics_db",
            "schemas": [
                {
                    "name": "logistics",
                    "tables": [
                        {
                            "name": "vehicle_inventory",
                            "kind": "table",
                            "comment": "Synthetische technische Metadaten; keine Datensätze.",
                            "columns": [
                                {"name": "vehicle_id", "dataType": "uuid", "nullable": False},
                                {
                                    "name": "vehicle_type_code",
                                    "dataType": "character varying",
                                    "characterLength": 12,
                                    "nullable": False,
                                },
                                {
                                    "name": "designation_de",
                                    "dataType": "character varying",
                                    "characterLength": 160,
                                    "nullable": False,
                                },
                                {
                                    "name": "operational_weight_kg",
                                    "dataType": "numeric",
                                    "numericPrecision": 10,
                                    "numericScale": 2,
                                    "nullable": True,
                                },
                                {"name": "in_service", "dataType": "boolean", "nullable": False},
                            ],
                        }
                    ],
                }
            ],
        },
        {
            "name": "hr_core",
            "schemas": [
                {
                    "name": "public",
                    "tables": [
                        {
                            "name": "org_unit",
                            "kind": "table",
                            "comment": "Synthetische Organisationsstruktur-Metadaten.",
                            "columns": [
                                {"name": "org_unit_id", "dataType": "uuid", "nullable": False},
                                {
                                    "name": "org_unit_code",
                                    "dataType": "character varying",
                                    "characterLength": 32,
                                    "nullable": False,
                                },
                                {
                                    "name": "name_de",
                                    "dataType": "character varying",
                                    "characterLength": 255,
                                    "nullable": False,
                                },
                                {"name": "parent_org_unit_id", "dataType": "uuid", "nullable": True},
                            ],
                        }
                    ],
                }
            ],
        },
    ]
}


def fixture_metadata(variant: str | None = None) -> dict[str, Any]:
    # A JSON round trip guarantees callers cannot mutate the module-level fixture.
    value = json.loads(json.dumps(_BASELINE_FIXTURE))
    if variant == "drift":
        vehicle = value["databases"][0]["schemas"][0]["tables"][0]
        vehicle["columns"][1]["name"] = "vehicle_category_code"
        vehicle["columns"][1]["characterLength"] = 16
        vehicle["columns"][2]["characterLength"] = 200
        vehicle["columns"][3]["numericPrecision"] = 12
        vehicle["columns"][3]["numericScale"] = 3
        vehicle["columns"][3]["nullable"] = False
        vehicle["columns"][4]["dataType"] = "character varying"
        vehicle["columns"][4]["characterLength"] = 5
        vehicle["columns"].append(
            {"name": "last_inspection_at", "dataType": "timestamp with time zone", "nullable": True}
        )
        org_unit = value["databases"][1]["schemas"][0]["tables"][0]
        org_unit["columns"] = [
            column for column in org_unit["columns"] if column["name"] != "parent_org_unit_id"
        ]
    return value


class FixturePhysicalMetadataAdapter:
    def inspect(self, *, variant: str | None = None) -> dict[str, Any]:
        return fixture_metadata(variant)


def fixture_s3_parquet_metadata(variant: str | None = None) -> dict[str, Any]:
    columns = [
        {"name": "vehicle_id", "dataType": "string", "nullable": False},
        {"name": "vehicle_category_code", "dataType": "string", "nullable": False},
        {"name": "designation_de", "dataType": "string", "nullable": True},
        {"name": "operational_weight_kg", "dataType": "decimal128(12, 3)", "numericPrecision": 12, "numericScale": 3, "nullable": True},
        {"name": "in_service", "dataType": "bool", "nullable": False},
    ]
    if variant == "drift":
        columns.append({"name": "snapshot_date", "dataType": "date32[day]", "nullable": False})
    location = "s3://vat-smoke-test/daca/physical-models/vehicle_inventory.parquet"
    return {
        "databases": [{
            "name": "vat-smoke-test",
            "stableKey": "s3://vat-smoke-test",
            "schemas": [{
                "name": "daca/physical-models",
                "stableKey": "s3://vat-smoke-test/daca/physical-models",
                "tables": [{
                    "name": "vehicle_inventory.parquet",
                    "stableKey": location,
                    "kind": "parquet",
                    "comment": "Deterministisches Parquet-Metadatenfixture für den DAAIF-kompatiblen S3-Speicher.",
                    "storageLocation": location,
                    "mediaType": "application/vnd.apache.parquet",
                    "objectCount": 1,
                    "sizeBytes": 4096,
                    "schemaConfidence": "embedded",
                    "partitionKeys": [],
                    "columns": columns,
                }],
            }],
        }],
    }


class FixtureS3PhysicalMetadataAdapter:
    def inspect(self, *, variant: str | None = None) -> dict[str, Any]:
        return fixture_s3_parquet_metadata(variant)


class S3ParquetPhysicalMetadataAdapter:
    """Read object listings and embedded Parquet schemas without materializing rows."""

    def __init__(
        self,
        *,
        endpoint_url: str,
        bucket: str,
        prefix: str,
        region: str,
        access_key_id: SecretStr,
        secret_access_key: SecretStr,
        max_objects: int = 500,
    ) -> None:
        self._endpoint_url = endpoint_url
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._region = region
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._max_objects = max_objects

    def __repr__(self) -> str:
        return "S3ParquetPhysicalMetadataAdapter(credentials=SecretStr('**********'))"

    def inspect(self, *, variant: str | None = None) -> dict[str, Any]:
        del variant
        import pyarrow as pa
        import pyarrow.fs as pafs
        import pyarrow.parquet as pq

        parsed = urlsplit(self._endpoint_url)
        endpoint_override = parsed.netloc + parsed.path
        filesystem = pafs.S3FileSystem(
            access_key=self._access_key_id.get_secret_value(),
            secret_key=self._secret_access_key.get_secret_value(),
            region=self._region,
            scheme=parsed.scheme,
            endpoint_override=endpoint_override,
            force_virtual_addressing=False,
        )
        base_dir = f"{self._bucket}/{self._prefix}".rstrip("/")
        entries = [
            item
            for item in filesystem.get_file_info(pafs.FileSelector(base_dir, recursive=True))
            if item.type == pafs.FileType.File and item.path.casefold().endswith(".parquet")
        ]
        if len(entries) > self._max_objects:
            raise ValueError(
                f"S3 metadata import found {len(entries)} Parquet objects; limit is {self._max_objects}"
            )
        schemas: dict[str, list[dict[str, Any]]] = {}
        for item in sorted(entries, key=lambda value: value.path):
            object_key = item.path.removeprefix(f"{self._bucket}/")
            parent = posixpath.dirname(object_key) or "(bucket root)"
            parquet_schema = pq.read_schema(item.path, filesystem=filesystem)
            columns: list[dict[str, Any]] = []
            for position, field in enumerate(parquet_schema, start=1):
                raw_type = str(field.type)
                precision = field.type.precision if pa.types.is_decimal(field.type) else None
                scale = field.type.scale if pa.types.is_decimal(field.type) else None
                columns.append({
                    "name": field.name,
                    "stableKey": f"s3://{self._bucket}/{object_key}#{field.name}",
                    "dataType": raw_type,
                    "numericPrecision": precision,
                    "numericScale": scale,
                    "nullable": field.nullable,
                    "ordinalPosition": position,
                })
            partition_keys = [
                segment.split("=", 1)[0]
                for segment in parent.split("/")
                if "=" in segment and segment.split("=", 1)[0]
            ]
            location = f"s3://{self._bucket}/{object_key}"
            schemas.setdefault(parent, []).append({
                "name": posixpath.basename(object_key),
                "stableKey": location,
                "kind": "parquet",
                "comment": "Schema aus dem eingebetteten Parquet-Footer; keine Datenzeilen katalogisiert.",
                "storageLocation": location,
                "mediaType": "application/vnd.apache.parquet",
                "objectCount": 1,
                "sizeBytes": item.size,
                "schemaConfidence": "embedded",
                "partitionKeys": partition_keys,
                "columns": columns,
            })
        return {
            "databases": [{
                "name": self._bucket,
                "stableKey": f"s3://{self._bucket}",
                "schemas": [
                    {
                        "name": name,
                        "stableKey": f"s3://{self._bucket}/{name}" if name != "(bucket root)" else f"s3://{self._bucket}",
                        "tables": tables,
                    }
                    for name, tables in sorted(schemas.items())
                ],
            }],
        }


class PostgreSQLPhysicalMetadataAdapter:
    def __init__(self, dsn: SecretStr):
        self._dsn = dsn

    def __repr__(self) -> str:
        return "PostgreSQLPhysicalMetadataAdapter(dsn=SecretStr('**********'))"

    def inspect(self, *, variant: str | None = None) -> dict[str, Any]:
        del variant
        engine = create_engine(self._dsn.get_secret_value(), pool_pre_ping=True)
        try:
            with engine.connect() as connection:
                connection.execute(text("SET TRANSACTION READ ONLY"))
                connection.execute(text("SET LOCAL statement_timeout = '10s'"))
                database_name = connection.scalar(
                    text(
                        "SELECT current_database() "
                        "FROM pg_catalog.pg_database "
                        "WHERE datname = current_database()"
                    )
                )
                rows = connection.execute(
                    text(
                        """
                        SELECT c.table_schema, c.table_name, t.table_type, c.column_name,
                               c.data_type, c.character_maximum_length, c.numeric_precision,
                               c.numeric_scale, c.is_nullable, c.ordinal_position
                          FROM information_schema.columns AS c
                          JOIN information_schema.tables AS t
                            ON t.table_catalog = c.table_catalog
                           AND t.table_schema = c.table_schema
                           AND t.table_name = c.table_name
                         WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
                         ORDER BY c.table_schema, c.table_name, c.ordinal_position
                        """
                    )
                ).mappings()
                schemas: dict[str, dict[str, dict[str, Any]]] = {}
                for row in rows:
                    schema = schemas.setdefault(str(row["table_schema"]), {})
                    table = schema.setdefault(
                        str(row["table_name"]),
                        {
                            "name": str(row["table_name"]),
                            "kind": "view" if str(row["table_type"]).upper() == "VIEW" else "table",
                            "columns": [],
                        },
                    )
                    table["columns"].append(
                        {
                            "name": str(row["column_name"]),
                            "dataType": str(row["data_type"]),
                            "characterLength": row["character_maximum_length"],
                            "numericPrecision": row["numeric_precision"],
                            "numericScale": row["numeric_scale"],
                            "nullable": str(row["is_nullable"]).upper() == "YES",
                            "ordinalPosition": int(row["ordinal_position"]),
                        }
                    )
                return {
                    "databases": [
                        {
                            "name": str(database_name),
                            "schemas": [
                                {"name": name, "tables": list(tables.values())}
                                for name, tables in schemas.items()
                            ],
                        }
                    ]
                }
        finally:
            engine.dispose()


def normalized_physical_metadata(raw: Mapping[str, Any]) -> dict[str, Any]:
    databases: list[dict[str, Any]] = []
    for database_position, database in enumerate(raw.get("databases", [])):
        database_name = str(database["name"]).strip()
        database_key = str(database.get("stableKey") or database_name).strip()
        schemas: list[dict[str, Any]] = []
        for schema_position, schema in enumerate(database.get("schemas", [])):
            schema_name = str(schema["name"]).strip()
            schema_key = str(schema.get("stableKey") or f"{database_key}.{schema_name}").strip()
            tables: list[dict[str, Any]] = []
            for table_position, table in enumerate(schema.get("tables", [])):
                table_name = str(table["name"]).strip()
                table_key = str(table.get("stableKey") or f"{database_key}.{schema_name}.{table_name}").strip()
                columns: list[dict[str, Any]] = []
                for fallback_position, column in enumerate(table.get("columns", []), start=1):
                    raw_type = str(column.get("dataType") or column.get("rawDataType") or "text")
                    column_name = str(column["name"]).strip()
                    columns.append(
                        {
                            "stableKey": str(column.get("stableKey") or f"{table_key}.{column_name}"),
                            "name": column_name,
                            "rawDataType": raw_type,
                            "normalizedDataType": normalize_postgresql_type(raw_type),
                            "characterLength": column.get("characterLength"),
                            "numericPrecision": column.get("numericPrecision"),
                            "numericScale": column.get("numericScale"),
                            "nullable": bool(column.get("nullable", True)),
                            "ordinalPosition": int(column.get("ordinalPosition", fallback_position)),
                            "comment": column.get("comment"),
                        }
                    )
                tables.append(
                    {
                        "stableKey": table_key,
                        "name": table_name,
                        "kind": table.get("kind", "table"),
                        "comment": table.get("comment"),
                        "position": table_position,
                        "storageLocation": table.get("storageLocation"),
                        "mediaType": table.get("mediaType"),
                        "objectCount": table.get("objectCount"),
                        "sizeBytes": table.get("sizeBytes"),
                        "schemaConfidence": table.get("schemaConfidence"),
                        "partitionKeys": list(table.get("partitionKeys") or []),
                        "columns": sorted(columns, key=lambda item: item["ordinalPosition"]),
                    }
                )
            schemas.append(
                {
                    "stableKey": schema_key,
                    "name": schema_name,
                    "position": schema_position,
                    "tables": sorted(tables, key=lambda item: item["name"]),
                }
            )
        databases.append(
            {
                "stableKey": database_key,
                "name": database_name,
                "position": database_position,
                "schemas": sorted(schemas, key=lambda item: item["name"]),
            }
        )
    return {"databases": sorted(databases, key=lambda item: item["name"])}


def flatten_physical_metadata(tree: Mapping[str, Any]) -> tuple[dict[str, dict], dict[str, dict]]:
    tables: dict[str, dict] = {}
    columns: dict[str, dict] = {}
    for database in tree.get("databases", []):
        for schema in database.get("schemas", []):
            for table in schema.get("tables", []):
                tables[table["stableKey"]] = dict(table)
                for column in table.get("columns", []):
                    columns[column["stableKey"]] = dict(column)
    return tables, columns


def detect_physical_drift(previous: Mapping[str, Any], current: Mapping[str, Any]) -> list[dict[str, Any]]:
    old_tables, old_columns = flatten_physical_metadata(previous)
    new_tables, new_columns = flatten_physical_metadata(current)
    changes: list[dict[str, Any]] = []
    for key in sorted(old_tables.keys() - new_tables.keys()):
        changes.append({"changeType": "table_removed", "assetKey": key, "before": old_tables[key]})
    for key in sorted(new_tables.keys() - old_tables.keys()):
        changes.append({"changeType": "table_added", "assetKey": key, "after": new_tables[key]})
    removed = old_columns.keys() - new_columns.keys()
    added = new_columns.keys() - old_columns.keys()
    for key in sorted(removed):
        changes.append({"changeType": "column_removed", "assetKey": key, "before": old_columns[key]})
    for key in sorted(added):
        changes.append({"changeType": "column_added", "assetKey": key, "after": new_columns[key]})
    comparisons = (
        ("rawDataType", "type_changed"),
        ("characterLength", "length_changed"),
        ("numericPrecision", "precision_changed"),
        ("numericScale", "scale_changed"),
        ("nullable", "nullability_changed"),
    )
    for key in sorted(old_columns.keys() & new_columns.keys()):
        for attribute, change_type in comparisons:
            before_value = old_columns[key].get(attribute)
            after_value = new_columns[key].get(attribute)
            comparison_before = before_value
            comparison_after = after_value
            if attribute == "rawDataType":
                comparison_before = str(before_value or "").strip().casefold()
                comparison_after = str(after_value or "").strip().casefold()
            if comparison_before != comparison_after:
                changes.append(
                    {
                        "changeType": change_type,
                        "assetKey": key,
                        "before": {attribute: before_value},
                        "after": {attribute: after_value},
                    }
                )
    for old_key in sorted(removed):
        old_parent, _, old_name = old_key.rpartition(".")
        candidates: list[tuple[float, str]] = []
        for new_key in added:
            new_parent, _, new_name = new_key.rpartition(".")
            if new_parent != old_parent:
                continue
            old_column = old_columns[old_key]
            new_column = new_columns[new_key]
            name_score = ratio(old_name, new_name) / 100
            type_score = float(
                old_column.get("normalizedDataType") == new_column.get("normalizedDataType")
            )
            position_delta = abs(
                int(old_column.get("ordinalPosition", 0))
                - int(new_column.get("ordinalPosition", 0))
            )
            position_score = max(0.0, 1.0 - (position_delta / 3))
            confidence = (0.6 * name_score) + (0.2 * type_score) + (0.2 * position_score)
            candidates.append((confidence, new_key))
        if candidates:
            confidence, new_key = max(candidates)
            if confidence >= 0.75:
                changes.append(
                    {
                        "changeType": "rename_candidate",
                        "assetKey": old_key,
                        "before": old_columns[old_key],
                        "after": new_columns[new_key],
                        "confidence": round(confidence, 4),
                        "reviewStatus": "pending",
                    }
                )
    return changes
