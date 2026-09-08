"""Add the official federal organization hierarchy and person memberships.

Revision ID: 0020_federal_orgs
Revises: 0019_asset_mappings
Create Date: 2026-09-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0020_federal_orgs"
down_revision: str | None = "0019_asset_mappings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "federal_organization_import_runs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_url", sa.String(1000), nullable=False),
        sa.Column("source_retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("snapshot_hash", sa.String(64), nullable=False),
        sa.Column("node_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(snapshot_hash) = 64", name="ck_federal_org_import_hash"),
        sa.CheckConstraint("node_count >= 0", name="ck_federal_org_import_count"),
        sa.CheckConstraint("status IN ('running', 'succeeded', 'failed')", name="ck_federal_org_import_status"),
    )
    with op.batch_alter_table("administrative_organizations") as batch:
        batch.add_column(sa.Column("parent_id", sa.String(100), nullable=True))
        batch.add_column(sa.Column("source_id", sa.String(100), nullable=True))
        batch.add_column(sa.Column("source_uri", sa.String(1000), nullable=True))
        batch.add_column(sa.Column("valid_from", sa.Date(), nullable=True))
        batch.add_column(sa.Column("valid_to", sa.Date(), nullable=True))
        batch.add_column(sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("content_hash", sa.String(64), nullable=True))
        batch.add_column(sa.Column("import_run_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_administrative_org_parent", "administrative_organizations", ["parent_id"], ["id"], ondelete="RESTRICT"
        )
        batch.create_foreign_key(
            "fk_administrative_org_import", "federal_organization_import_runs", ["import_run_id"], ["id"], ondelete="SET NULL"
        )
        batch.create_unique_constraint("uq_administrative_org_source_id", ["source_id"])
        batch.create_check_constraint(
            "ck_administrative_org_validity", "valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from"
        )
    op.create_index("ix_administrative_org_parent", "administrative_organizations", ["parent_id", "active"])
    op.create_table(
        "administrative_organization_labels",
        sa.Column("organization_id", sa.String(100), nullable=False),
        sa.Column("language", sa.String(8), nullable=False),
        sa.Column("label", sa.String(500), nullable=False),
        sa.Column("short_label", sa.String(120), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["administrative_organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("organization_id", "language"),
        sa.CheckConstraint("language IN ('de', 'fr', 'it', 'en', 'rm')", name="ck_administrative_org_label_language"),
    )
    op.create_table(
        "federal_person_memberships",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.String(200), nullable=False),
        sa.Column("organization_id", sa.String(100), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_to", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["demo_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["administrative_organizations.id"], ondelete="RESTRICT"),
        sa.CheckConstraint("valid_to IS NULL OR valid_to >= valid_from", name="ck_federal_person_membership_dates"),
        sa.UniqueConstraint("user_id", "organization_id", "valid_from", name="uq_federal_person_membership_period"),
    )
    op.create_index("ix_federal_person_membership_org", "federal_person_memberships", ["organization_id", "valid_to"])
    op.create_index(
        "uq_federal_person_primary_active",
        "federal_person_memberships",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_primary = true AND valid_to IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("federal_person_memberships")
    op.drop_table("administrative_organization_labels")
    op.drop_index("ix_administrative_org_parent", table_name="administrative_organizations")
    with op.batch_alter_table("administrative_organizations") as batch:
        batch.drop_constraint("ck_administrative_org_validity", type_="check")
        batch.drop_constraint("uq_administrative_org_source_id", type_="unique")
        batch.drop_constraint("fk_administrative_org_import", type_="foreignkey")
        batch.drop_constraint("fk_administrative_org_parent", type_="foreignkey")
        for column in ("import_run_id", "content_hash", "retired_at", "valid_to", "valid_from", "source_uri", "source_id", "parent_id"):
            batch.drop_column(column)
    op.drop_table("federal_organization_import_runs")
