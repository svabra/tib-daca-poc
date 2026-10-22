from __future__ import annotations

from decimal import Decimal

import pyarrow as pa
import pyarrow.fs as pafs
import pyarrow.parquet as pq

from .settings import Settings


def synthetic_mapping_demo_table() -> pa.Table:
    return pa.table(
        {
            "VEHICLE_ID": pa.array(["V-1001", "V-1002", "V-1003"], type=pa.string()),
            "VEHICLE_TYPE_CODE": pa.array(["TRUCK", "CAR", "SPECIAL"], type=pa.string()),
            "DESIGNATION_DE": pa.array(["Lastwagen", "Personenwagen", "Spezialfahrzeug"], type=pa.string()),
            "OPERATIONAL_WEIGHT_KG": pa.array(
                [Decimal("7200.125"), Decimal("1850.500"), Decimal("12400.000")],
                type=pa.decimal128(12, 3),
            ),
            "IN_SERVICE": pa.array([True, True, False], type=pa.bool_()),
        }
    )


def seed_synthetic_parquet(settings: Settings) -> str:
    """Write the deterministic PoC object to an explicitly configured S3-compatible store."""
    if not all(
        (
            settings.daca_physical_s3_endpoint_url,
            settings.daca_physical_s3_bucket,
            settings.daca_physical_s3_access_key_id,
            settings.daca_physical_s3_secret_access_key,
        )
    ):
        raise RuntimeError("DACA physical S3 settings are incomplete")
    from urllib.parse import urlsplit

    parsed = urlsplit(settings.daca_physical_s3_endpoint_url)
    filesystem = pafs.S3FileSystem(
        access_key=settings.daca_physical_s3_access_key_id.get_secret_value(),
        secret_key=settings.daca_physical_s3_secret_access_key.get_secret_value(),
        region=settings.daca_physical_s3_region,
        scheme=parsed.scheme,
        endpoint_override=parsed.netloc + parsed.path,
        force_virtual_addressing=False,
        allow_bucket_creation=True,
    )
    filesystem.create_dir(settings.daca_physical_s3_bucket, recursive=True)
    prefix = settings.daca_physical_s3_prefix.strip("/")
    object_key = f"{prefix}/vehicle_inventory_mapping_demo.parquet" if prefix else "vehicle_inventory_mapping_demo.parquet"
    target = f"{settings.daca_physical_s3_bucket}/{object_key}"
    table = synthetic_mapping_demo_table()
    pq.write_table(table, target, filesystem=filesystem)
    return f"s3://{settings.daca_physical_s3_bucket}/{object_key}"


def main() -> None:
    print(seed_synthetic_parquet(Settings()))


if __name__ == "__main__":
    main()
