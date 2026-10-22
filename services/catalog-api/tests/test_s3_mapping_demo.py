from __future__ import annotations

import pyarrow.fs as pafs
import pyarrow.parquet as pq
from daca_catalog.modeling_core import S3ParquetPhysicalMetadataAdapter, fixture_s3_parquet_metadata
from daca_catalog.s3_fixture_seed import synthetic_mapping_demo_table
from pydantic import SecretStr


def test_parquet_inspection_reads_footer_without_data_rows(tmp_path, monkeypatch):
    directory = tmp_path / "demo" / "physical"
    directory.mkdir(parents=True)
    table = synthetic_mapping_demo_table()
    pq.write_table(table, directory / "vehicle_inventory_mapping_demo.parquet")
    local = pafs.SubTreeFileSystem(str(tmp_path), pafs.LocalFileSystem())
    monkeypatch.setattr(pafs, "S3FileSystem", lambda **kwargs: local)

    def reject_rows(*args, **kwargs):
        raise AssertionError("Metadata inspection must not load data rows")

    monkeypatch.setattr(pq, "read_table", reject_rows)
    adapter = S3ParquetPhysicalMetadataAdapter(
        endpoint_url="http://example.invalid",
        bucket="demo",
        prefix="physical",
        region="local",
        access_key_id=SecretStr("test"),
        secret_access_key=SecretStr("test"),
    )
    metadata = adapter.inspect()
    obj = metadata["databases"][0]["schemas"][0]["tables"][0]
    assert obj["rowCount"] == 3
    assert obj["objectCount"] == 1
    assert obj["sizeBytes"] > 0
    assert [column["name"] for column in obj["columns"]] == table.column_names
    assert obj["columns"][3]["numericPrecision"] == 12
    assert obj["columns"][3]["numericScale"] == 3
    offline = fixture_s3_parquet_metadata()["databases"][0]["schemas"][0]["tables"][1]
    assert offline["sizeBytes"] == obj["sizeBytes"] and offline["rowCount"] == 3
