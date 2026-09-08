from __future__ import annotations

from decimal import Decimal

import pyarrow as pa
import pyarrow.fs as pafs
import pyarrow.parquet as pq

from .settings import Settings


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
    )
    prefix = settings.daca_physical_s3_prefix.strip("/")
    object_key = f"{prefix}/vehicle_inventory.parquet" if prefix else "vehicle_inventory.parquet"
    target = f"{settings.daca_physical_s3_bucket}/{object_key}"
    table = pa.table(
        {
            "vehicle_id": pa.array(["V-1001", "V-1002", "V-1003"], type=pa.string()),
            "vehicle_category_code": pa.array(["TRUCK", "CAR", "SPECIAL"], type=pa.string()),
            "designation_de": pa.array(["Lastwagen", "Personenwagen", "Spezialfahrzeug"], type=pa.string()),
            "operational_weight_kg": pa.array(
                [Decimal("7200.125"), Decimal("1850.500"), Decimal("12400.000")],
                type=pa.decimal128(12, 3),
            ),
            "in_service": pa.array([True, True, False], type=pa.bool_()),
        }
    )
    pq.write_table(table, target, filesystem=filesystem)
    return f"s3://{settings.daca_physical_s3_bucket}/{object_key}"


def main() -> None:
    print(seed_synthetic_parquet(Settings()))


if __name__ == "__main__":
    main()
