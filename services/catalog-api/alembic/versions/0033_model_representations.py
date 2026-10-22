"""Persist snapshot-pinned representation membership and Parquet footer row counts."""

from __future__ import annotations

import hashlib
import json
import uuid

import sqlalchemy as sa
from alembic import op

revision = "0033_model_representations"
down_revision = "0032_mapping_inconsistencies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("physical_tables", sa.Column("row_count", sa.BigInteger(), nullable=True))
    table = op.create_table(
        "logical_model_representations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("urn", sa.String(700), nullable=False, unique=True),
        sa.Column(
            "logical_model_id",
            sa.Uuid(),
            sa.ForeignKey("logical_models.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "physical_snapshot_id",
            sa.Uuid(),
            sa.ForeignKey("physical_schema_snapshots.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "physical_table_id",
            sa.Uuid(),
            sa.ForeignKey("physical_tables.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column(
            "created_by_user_id", sa.String(), sa.ForeignKey("demo_users.id"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "logical_model_id", "physical_table_id", name="uq_model_representation_table"
        ),
    )
    # Only current, non-superseded links establish initial membership. Historical
    # versions remain untouched and continue to provide their original evidence.
    rows = op.get_bind().execute(
        sa.text("""
        SELECT DISTINCT m.logical_model_id, v.physical_snapshot_id, c.physical_table_id,
               m.created_by_user_id, m.created_at
        FROM asset_mappings m
        JOIN asset_mapping_versions v ON v.asset_mapping_id = m.id AND v.revision = m.revision
        JOIN asset_mapping_physical_columns r ON r.asset_mapping_version_id = v.id
        JOIN physical_columns c ON c.id = r.physical_column_id
        WHERE m.lifecycle = 'active' AND v.status <> 'superseded'
        ORDER BY m.created_at
    """)
    )
    seen = set()
    for row in rows:
        key = (row.logical_model_id, row.physical_table_id)
        if key in seen:
            continue
        seen.add(key)
        identity = uuid.uuid5(uuid.NAMESPACE_URL, f"daca:representation:{key[0]}:{key[1]}")
        payload = {
            "logicalModelId": str(key[0]),
            "physicalSnapshotId": str(row.physical_snapshot_id),
            "physicalTableId": str(key[1]),
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
        ).hexdigest()
        op.get_bind().execute(
            table.insert().values(
                id=identity,
                urn=f"urn:daca:representation:{identity}",
                logical_model_id=key[0],
                physical_snapshot_id=row.physical_snapshot_id,
                physical_table_id=key[1],
                content_hash=digest,
                created_by_user_id=row.created_by_user_id,
                created_at=row.created_at,
            )
        )


def downgrade() -> None:
    op.drop_table("logical_model_representations")
    op.drop_column("physical_tables", "row_count")
