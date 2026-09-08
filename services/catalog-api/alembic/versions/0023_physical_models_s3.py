"""Model PostgreSQL relations and S3 Parquet datasets as physical models.

Revision ID: 0023_physical_models_s3
Revises: 0022_model_domain_review
Create Date: 2026-09-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0023_physical_models_s3"
down_revision: str | None = "0022_model_domain_review"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_physical_adapter", "physical_sources", type_="check")
    op.create_check_constraint(
        "ck_physical_adapter",
        "physical_sources",
        "adapter_type IN ('postgresql', 's3', 'fixture')",
    )
    op.drop_constraint("ck_physical_table_kind", "physical_tables", type_="check")
    op.create_check_constraint(
        "ck_physical_table_kind",
        "physical_tables",
        "kind IN ('table', 'view', 'materialized_view', 'parquet')",
    )
    with op.batch_alter_table("physical_tables") as batch:
        batch.add_column(sa.Column("storage_location", sa.String(2000), nullable=True))
        batch.add_column(sa.Column("media_type", sa.String(255), nullable=True))
        batch.add_column(sa.Column("object_count", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("size_bytes", sa.BigInteger(), nullable=True))
        batch.add_column(sa.Column("schema_confidence", sa.String(32), nullable=True))
        batch.add_column(sa.Column("partition_keys", sa.JSON(), nullable=True))
        batch.create_check_constraint(
            "ck_physical_table_object_count",
            "object_count IS NULL OR object_count >= 1",
        )
        batch.create_check_constraint(
            "ck_physical_table_size",
            "size_bytes IS NULL OR size_bytes >= 0",
        )
        batch.create_check_constraint(
            "ck_physical_table_schema_confidence",
            "schema_confidence IS NULL OR schema_confidence IN ('declared', 'embedded', 'inferred')",
        )


def downgrade() -> None:
    # The previous revision cannot represent S3 sources or Parquet relations.
    # Remove their versioned dependants before restoring the narrower check
    # constraints. This is intentionally lossy: retaining these rows would
    # leave the database in a state that revision 0022 cannot validate.
    op.execute(
        """
        DELETE FROM asset_mappings
        WHERE physical_source_id IN (
            SELECT id FROM physical_sources WHERE adapter_type = 's3'
        )
        OR id IN (
            SELECT DISTINCT mapping_version.asset_mapping_id
            FROM asset_mapping_versions AS mapping_version
            JOIN asset_mapping_physical_columns AS mapping_column
              ON mapping_column.asset_mapping_version_id = mapping_version.id
            JOIN physical_columns AS physical_column
              ON physical_column.id = mapping_column.physical_column_id
            JOIN physical_tables AS physical_table
              ON physical_table.id = physical_column.physical_table_id
            WHERE physical_table.kind = 'parquet'
        )
        """
    )
    op.execute(
        """
        DELETE FROM physical_drift_reports
        WHERE source_id IN (
            SELECT id FROM physical_sources WHERE adapter_type = 's3'
        )
        """
    )
    op.execute(
        """
        DELETE FROM physical_schema_snapshots
        WHERE source_id IN (
            SELECT id FROM physical_sources WHERE adapter_type = 's3'
        )
        """
    )
    op.execute("DELETE FROM physical_sources WHERE adapter_type = 's3'")
    op.execute("DELETE FROM physical_tables WHERE kind = 'parquet'")

    with op.batch_alter_table("physical_tables") as batch:
        batch.drop_constraint("ck_physical_table_schema_confidence", type_="check")
        batch.drop_constraint("ck_physical_table_size", type_="check")
        batch.drop_constraint("ck_physical_table_object_count", type_="check")
        batch.drop_column("partition_keys")
        batch.drop_column("schema_confidence")
        batch.drop_column("size_bytes")
        batch.drop_column("object_count")
        batch.drop_column("media_type")
        batch.drop_column("storage_location")
    op.drop_constraint("ck_physical_table_kind", "physical_tables", type_="check")
    op.create_check_constraint(
        "ck_physical_table_kind",
        "physical_tables",
        "kind IN ('table', 'view', 'materialized_view')",
    )
    op.drop_constraint("ck_physical_adapter", "physical_sources", type_="check")
    op.create_check_constraint(
        "ck_physical_adapter",
        "physical_sources",
        "adapter_type IN ('postgresql', 'fixture')",
    )
