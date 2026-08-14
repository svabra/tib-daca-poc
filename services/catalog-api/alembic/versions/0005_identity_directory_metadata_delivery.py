"""Add the synthetic identity directory, groups and I14Y delivery outbox.

Revision ID: 0005_identity_directory
Revises: 0004_poc_simulation_events
Create Date: 2026-08-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_identity_directory"
down_revision: str | None = "0004_poc_simulation_events"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "identity_directory_entries",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("organization", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("source_system", sa.String(100), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source IN ('federal', 'cantonal', 'municipal', 'federal_related')",
            name="ck_identity_directory_source",
        ),
    )
    op.create_index(
        "ix_identity_directory_source_name",
        "identity_directory_entries",
        ["source", "display_name"],
    )
    op.create_index(
        "ix_identity_directory_organization",
        "identity_directory_entries",
        ["organization"],
    )

    op.create_table(
        "identity_groups",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("source", sa.String(32), nullable=False),
        sa.Column("membership_revision", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "source IN ('federal', 'cantonal', 'municipal', 'federal_related')",
            name="ck_identity_group_source",
        ),
    )
    op.create_index(
        "ix_identity_group_source_label",
        "identity_groups",
        ["source", "label"],
    )

    op.create_table(
        "identity_group_memberships",
        sa.Column("group_id", sa.String(200), nullable=False),
        sa.Column("identity_id", sa.String(200), nullable=False),
        sa.Column("valid_from", sa.Date()),
        sa.Column("valid_until", sa.Date()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from",
            name="ck_identity_group_membership_dates",
        ),
        sa.ForeignKeyConstraint(["group_id"], ["identity_groups.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["identity_id"], ["identity_directory_entries.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("group_id", "identity_id"),
    )
    op.create_index(
        "ix_identity_group_membership_identity",
        "identity_group_memberships",
        ["identity_id"],
    )

    op.create_table(
        "metadata_delivery_outbox",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("product_revision", sa.Integer(), nullable=False),
        sa.Column("policy_revision", sa.Integer(), nullable=False),
        sa.Column("channel", sa.String(32), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("channel IN ('i14y')", name="ck_metadata_delivery_channel"),
        sa.CheckConstraint(
            "status IN ('scheduled', 'simulated_delivered')",
            name="ck_metadata_delivery_status",
        ),
        sa.CheckConstraint("valid_until >= valid_from", name="ck_metadata_delivery_dates"),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "data_product_id",
            "product_revision",
            "channel",
            name="uq_metadata_delivery_product_revision_channel",
        ),
    )
    op.create_index(
        "ix_metadata_delivery_status",
        "metadata_delivery_outbox",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_metadata_delivery_status", table_name="metadata_delivery_outbox")
    op.drop_table("metadata_delivery_outbox")
    op.drop_index(
        "ix_identity_group_membership_identity",
        table_name="identity_group_memberships",
    )
    op.drop_table("identity_group_memberships")
    op.drop_index("ix_identity_group_source_label", table_name="identity_groups")
    op.drop_table("identity_groups")
    op.drop_index(
        "ix_identity_directory_organization",
        table_name="identity_directory_entries",
    )
    op.drop_index(
        "ix_identity_directory_source_name",
        table_name="identity_directory_entries",
    )
    op.drop_table("identity_directory_entries")
