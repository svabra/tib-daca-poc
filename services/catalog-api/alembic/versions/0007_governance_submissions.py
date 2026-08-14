"""Add four-eyes governance submissions and supervisor assignments.

Revision ID: 0007_governance_submissions
Revises: 0006_org_custom_groups
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_governance_submissions"
down_revision: str | None = "0006_org_custom_groups"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("demo_users") as batch:
        batch.add_column(sa.Column("supervisor_user_id", sa.String(200)))
        batch.create_foreign_key(
            "fk_demo_user_supervisor",
            "demo_users",
            ["supervisor_user_id"],
            ["id"],
            ondelete="SET NULL",
        )

    op.create_table(
        "governance_submissions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("policy_revision_id", sa.Uuid(), nullable=False),
        sa.Column("owner_user_id", sa.String(200), nullable=False),
        sa.Column("approver_user_id", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("review_snapshot", sa.JSON(), nullable=False),
        sa.Column("archive_evidence", sa.JSON(), nullable=False),
        sa.Column("decision", sa.String(16)),
        sa.Column("decision_comment", sa.Text()),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending_approval', 'approved_deploying', 'approved', "
            "'rejected', 'deployment_failed')",
            name="ck_governance_submission_status",
        ),
        sa.CheckConstraint(
            "decision IS NULL OR decision IN ('approve', 'reject')",
            name="ck_governance_submission_decision",
        ),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["policy_revision_id"], ["policy_revisions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["demo_users.id"]),
        sa.ForeignKeyConstraint(["approver_user_id"], ["demo_users.id"]),
        sa.UniqueConstraint("policy_revision_id", name="uq_governance_submission_policy"),
    )
    op.create_index(
        "ix_governance_submission_product",
        "governance_submissions",
        ["data_product_id", "submitted_at"],
    )
    op.create_index(
        "ix_governance_submission_approver",
        "governance_submissions",
        ["approver_user_id", "status"],
    )
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.add_column(sa.Column("governance_submission_id", sa.Uuid()))
        batch.create_foreign_key(
            "fk_workflow_task_governance_submission",
            "governance_submissions",
            ["governance_submission_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.drop_constraint("fk_workflow_task_governance_submission", type_="foreignkey")
        batch.drop_column("governance_submission_id")
    op.drop_index("ix_governance_submission_approver", table_name="governance_submissions")
    op.drop_index("ix_governance_submission_product", table_name="governance_submissions")
    op.drop_table("governance_submissions")
    with op.batch_alter_table("demo_users") as batch:
        batch.drop_constraint("fk_demo_user_supervisor", type_="foreignkey")
        batch.drop_column("supervisor_user_id")
