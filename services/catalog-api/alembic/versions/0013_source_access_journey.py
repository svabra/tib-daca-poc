"""Add discoverable source catalog, source requests, and grants.

Revision ID: 0013_source_access_journey
Revises: 0012_access_renewals
Create Date: 2026-08-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_source_access_journey"
down_revision: str | None = "0012_access_renewals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "source_catalog_entries",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("database_name", sa.String(128), nullable=False),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("organization", sa.String(255), nullable=False),
        sa.Column("owner_user_id", sa.String(200), nullable=False),
        sa.Column("sites", sa.JSON(), nullable=False),
        sa.Column("search_objects", sa.JSON(), nullable=False),
        sa.Column("discoverability_group_ids", sa.JSON(), nullable=False),
        sa.Column("mock_profile", sa.JSON(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_type IN ('oracle')", name="ck_source_catalog_type"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["demo_users.id"]),
    )
    op.create_index("ix_source_catalog_type_name", "source_catalog_entries", ["source_type", "database_name"])
    op.create_index("ix_source_catalog_owner", "source_catalog_entries", ["owner_user_id"])

    op.create_table(
        "source_access_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_number", sa.String(32), nullable=False, unique=True),
        sa.Column("client_request_id", sa.String(128), nullable=False),
        sa.Column("source_id", sa.String(200), nullable=False),
        sa.Column("requester_id", sa.String(200), nullable=False),
        sa.Column("requester_name", sa.String(255), nullable=False),
        sa.Column("requester_organization", sa.String(255), nullable=False),
        sa.Column("owner_user_id", sa.String(200), nullable=False),
        sa.Column("request_title", sa.String(255), nullable=False),
        sa.Column("subject_type", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.String(200), nullable=False),
        sa.Column("subject_label", sa.String(255), nullable=False),
        sa.Column("group_revision", sa.Integer()),
        sa.Column("group_snapshot", sa.JSON()),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("legal_basis", sa.Text(), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date()),
        sa.Column("conditions_accepted", sa.Boolean(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="submitted"),
        sa.Column("decision_by", sa.String(200)),
        sa.Column("decision_comment", sa.Text()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("subject_type IN ('person', 'group')", name="ck_source_request_subject"),
        sa.CheckConstraint("status IN ('submitted', 'approved', 'rejected')", name="ck_source_request_status"),
        sa.CheckConstraint("valid_until IS NULL OR valid_until >= valid_from", name="ck_source_request_dates"),
        sa.ForeignKeyConstraint(["source_id"], ["source_catalog_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["requester_id"], ["demo_users.id"]),
        sa.ForeignKeyConstraint(["owner_user_id"], ["demo_users.id"]),
        sa.UniqueConstraint("requester_id", "client_request_id", name="uq_source_request_client"),
    )
    op.create_index("ix_source_request_requester", "source_access_requests", ["requester_id", "created_at"])
    op.create_index("ix_source_request_owner", "source_access_requests", ["owner_user_id", "status"])
    op.create_index("ix_source_request_source", "source_access_requests", ["source_id"])
    op.create_index(
        "uq_source_request_open_subject",
        "source_access_requests",
        ["source_id", "subject_type", "subject_id"],
        unique=True,
        sqlite_where=sa.text("status = 'submitted'"),
        postgresql_where=sa.text("status = 'submitted'"),
    )

    op.create_table(
        "source_access_grants",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_access_request_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("source_id", sa.String(200), nullable=False),
        sa.Column("subject_type", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.String(200), nullable=False),
        sa.Column("subject_label", sa.String(255), nullable=False),
        sa.Column("group_revision", sa.Integer()),
        sa.Column("group_snapshot", sa.JSON()),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date()),
        sa.Column("granted_by", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("subject_type IN ('person', 'group')", name="ck_source_grant_subject"),
        sa.CheckConstraint("valid_until IS NULL OR valid_until >= valid_from", name="ck_source_grant_dates"),
        sa.ForeignKeyConstraint(["source_access_request_id"], ["source_access_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["source_catalog_entries.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["granted_by"], ["demo_users.id"]),
    )
    op.create_index("ix_source_grant_subject", "source_access_grants", ["subject_type", "subject_id"])
    op.create_index("ix_source_grant_source", "source_access_grants", ["source_id"])

    with op.batch_alter_table("workflow_tasks") as batch:
        batch.alter_column("data_product_id", existing_type=sa.Uuid(), nullable=True)
        batch.add_column(sa.Column("source_access_request_id", sa.Uuid()))
        batch.create_foreign_key(
            "fk_workflow_task_source_access_request",
            "source_access_requests",
            ["source_access_request_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_index("ix_workflow_task_source_access_request", ["source_access_request_id"])


def downgrade() -> None:
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.drop_index("ix_workflow_task_source_access_request")
        batch.drop_constraint("fk_workflow_task_source_access_request", type_="foreignkey")
        batch.drop_column("source_access_request_id")
        batch.alter_column("data_product_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_table("source_access_grants")
    op.drop_table("source_access_requests")
    op.drop_table("source_catalog_entries")
