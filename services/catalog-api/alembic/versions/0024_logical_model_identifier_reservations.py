"""Reserve one case-insensitive identifier per logical model root.

Revision ID: 0024_model_identifier
Revises: 0023_physical_models_s3
Create Date: 2026-09-15
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_model_identifier"
down_revision: str | None = "0023_physical_models_s3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("logical_model_versions") as batch:
        batch.add_column(
            sa.Column("identifier_mode", sa.String(32), nullable=False, server_default="manual")
        )
        batch.create_check_constraint(
            "ck_logical_model_identifier_mode",
            "identifier_mode IN ('manual', 'organization_derived')",
        )
    op.create_table(
        "logical_model_identifier_reservations",
        sa.Column("logical_model_id", sa.Uuid(), nullable=False),
        sa.Column("identifier", sa.String(500), nullable=False),
        sa.Column("normalized_identifier", sa.String(500), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "length(normalized_identifier) >= 1",
            name="ck_logical_model_identifier_normalized",
        ),
        sa.ForeignKeyConstraint(
            ["logical_model_id"], ["logical_models.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("logical_model_id"),
        sa.UniqueConstraint(
            "normalized_identifier", name="uq_logical_model_identifier_normalized"
        ),
    )
    # Existing versions stored their identifiers in a JSON array.  Logical
    # models now have exactly one identifier, so reserve the identifier of the
    # latest immutable version for each model root.
    op.execute(
        """
        INSERT INTO logical_model_identifier_reservations
            (logical_model_id, identifier, normalized_identifier, updated_at)
        SELECT latest.logical_model_id,
               latest.identifiers ->> 0,
               lower(latest.identifiers ->> 0),
               now()
        FROM (
            SELECT DISTINCT ON (logical_model_versions.logical_model_id)
                   logical_model_versions.logical_model_id,
                   dcat_dataset_versions.identifiers
            FROM logical_model_versions
            JOIN dcat_dataset_versions
              ON dcat_dataset_versions.id = logical_model_versions.dataset_version_id
            WHERE json_array_length(dcat_dataset_versions.identifiers) > 0
            ORDER BY logical_model_versions.logical_model_id,
                     logical_model_versions.revision DESC
        ) AS latest
        ON CONFLICT (normalized_identifier) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_table("logical_model_identifier_reservations")
    with op.batch_alter_table("logical_model_versions") as batch:
        batch.drop_constraint("ck_logical_model_identifier_mode", type_="check")
        batch.drop_column("identifier_mode")
