"""Track unmapped logical fields and their owner/steward decisions.

Revision ID: 0032_mapping_inconsistencies
Revises: 0031_central_catalog_description
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0032_mapping_inconsistencies"
down_revision: str | None = "0031_central_catalog_description"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "logical_mapping_inconsistencies",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("logical_model_id", sa.Uuid(), sa.ForeignKey("logical_models.id", ondelete="CASCADE"), nullable=False),
        sa.Column("logical_field_id", sa.Uuid(), sa.ForeignKey("logical_fields.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("owner_user_id", sa.String(), sa.ForeignKey("demo_users.id"), nullable=False),
        sa.Column("assigned_steward_user_id", sa.String(), sa.ForeignKey("demo_users.id")),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("decision_comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("logical_model_id", "logical_field_id", name="uq_logical_mapping_inconsistency_field"),
        sa.CheckConstraint("status IN ('open', 'accepted', 'assigned', 'resolved')", name="ck_logical_mapping_inconsistency_status"),
    )
    op.create_index("ix_logical_mapping_inconsistency_owner", "logical_mapping_inconsistencies", ["owner_user_id", "status"])
    op.add_column("workflow_tasks", sa.Column("logical_model_id", sa.Uuid(), sa.ForeignKey("logical_models.id", ondelete="SET NULL")))
    op.add_column("workflow_tasks", sa.Column("logical_mapping_issue_id", sa.Uuid(), sa.ForeignKey("logical_mapping_inconsistencies.id", ondelete="SET NULL")))


def downgrade() -> None:
    op.drop_column("workflow_tasks", "logical_mapping_issue_id")
    op.drop_column("workflow_tasks", "logical_model_id")
    op.drop_index("ix_logical_mapping_inconsistency_owner", table_name="logical_mapping_inconsistencies")
    op.drop_table("logical_mapping_inconsistencies")
