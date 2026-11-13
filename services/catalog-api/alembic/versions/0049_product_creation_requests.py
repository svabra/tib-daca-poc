"""Persist commissioned data products and their task context."""

import sqlalchemy as sa
from alembic import op

revision = "0049_product_creation_requests"
down_revision = "0048_open_ended_access_requests"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "product_creation_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_number", sa.String(40), nullable=False, unique=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column(
            "requester_user_id", sa.String(200), sa.ForeignKey("demo_users.id"), nullable=False
        ),
        sa.Column("owner_user_id", sa.String(200), sa.ForeignKey("demo_users.id"), nullable=False),
        sa.Column("source_product_ids", sa.JSON(), nullable=False),
        sa.Column("proposed_title", sa.String(255), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("canton_code", sa.String(2), nullable=False),
        sa.Column("formats", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("decision_comment", sa.Text()),
        sa.Column(
            "result_product_id", sa.Uuid(), sa.ForeignKey("data_products.id", ondelete="RESTRICT")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('submitted', 'in_progress', 'fulfilled', 'rejected')",
            name="ck_product_creation_status",
        ),
        sa.CheckConstraint("tax_year BETWEEN 1900 AND 2100", name="ck_product_creation_year"),
    )
    op.create_index(
        "ix_product_creation_requester",
        "product_creation_requests",
        ["requester_user_id", "status"],
    )
    op.create_index(
        "ix_product_creation_owner", "product_creation_requests", ["owner_user_id", "status"]
    )
    op.add_column(
        "workflow_tasks", sa.Column("product_creation_request_id", sa.Uuid(), nullable=True)
    )
    op.create_foreign_key(
        "fk_workflow_creation_request",
        "workflow_tasks",
        "product_creation_requests",
        ["product_creation_request_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_workflow_tasks_product_creation_request_id",
        "workflow_tasks",
        ["product_creation_request_id"],
    )


def downgrade():
    op.drop_index("ix_workflow_tasks_product_creation_request_id", "workflow_tasks")
    op.drop_constraint("fk_workflow_creation_request", "workflow_tasks", type_="foreignkey")
    op.drop_column("workflow_tasks", "product_creation_request_id")
    op.drop_table("product_creation_requests")
