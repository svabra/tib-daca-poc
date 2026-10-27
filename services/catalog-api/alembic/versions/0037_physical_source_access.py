"""Persist personal source opt-outs and owner-reviewed restoration requests."""

import sqlalchemy as sa
from alembic import op

revision = "0037_physical_source_access"
down_revision = "0036_structure_inventory_archive"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "physical_source_access_states",
        sa.Column(
            "source_id",
            sa.Uuid(),
            sa.ForeignKey("physical_sources.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            sa.String(200),
            sa.ForeignKey("demo_users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("relinquished_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("restored_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "physical_source_access_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "source_id",
            sa.Uuid(),
            sa.ForeignKey("physical_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("requester_id", sa.String(200), sa.ForeignKey("demo_users.id"), nullable=False),
        sa.Column("access_revision", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("decision_by", sa.String(200), sa.ForeignKey("demo_users.id")),
        sa.Column("decision_comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('submitted', 'approved', 'rejected')",
            name="ck_physical_source_access_request_status",
        ),
    )
    op.create_index(
        "uq_physical_source_access_request_open",
        "physical_source_access_requests",
        ["source_id", "requester_id"],
        unique=True,
        postgresql_where=sa.text("status = 'submitted'"),
        sqlite_where=sa.text("status = 'submitted'"),
    )
    op.add_column("workflow_tasks", sa.Column("physical_source_access_request_id", sa.Uuid()))
    op.create_foreign_key(
        "fk_task_physical_source_access",
        "workflow_tasks",
        "physical_source_access_requests",
        ["physical_source_access_request_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_workflow_tasks_physical_source_access_request_id",
        "workflow_tasks",
        ["physical_source_access_request_id"],
    )


def downgrade():
    op.drop_index(
        "ix_workflow_tasks_physical_source_access_request_id", table_name="workflow_tasks"
    )
    op.drop_constraint("fk_task_physical_source_access", "workflow_tasks", type_="foreignkey")
    op.drop_column("workflow_tasks", "physical_source_access_request_id")
    op.drop_table("physical_source_access_requests")
    op.drop_table("physical_source_access_states")
