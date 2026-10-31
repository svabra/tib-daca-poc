"""Private search presets and immutable, recipient-addressed copies."""
import sqlalchemy as sa
from alembic import op

revision = "0046_personal_search_views"
down_revision = "0045_mapping_workspace_visits"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "search_views",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_search_view_revision"),
    )
    op.create_index("ix_search_view_owner", "search_views", ["owner_user_id", "updated_at"])
    op.create_table(
        "search_view_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("sender_user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_view_id", sa.Uuid(), sa.ForeignKey("search_views.id", ondelete="SET NULL")),
        sa.Column("source_revision", sa.Integer(), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("message", sa.String(1000), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_view_id", sa.Uuid(), sa.ForeignKey("search_views.id", ondelete="SET NULL")),
        sa.Column("dismissed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("source_view_id", "source_revision", "recipient_user_id", name="uq_search_view_share_revision"),
        sa.CheckConstraint("sender_user_id <> recipient_user_id", name="ck_search_view_share_other_user"),
        sa.CheckConstraint("source_revision >= 1", name="ck_search_view_share_revision"),
        sa.CheckConstraint("accepted_at IS NULL OR dismissed_at IS NULL", name="ck_search_view_share_decision"),
    )
    op.create_index("ix_search_view_share_recipient", "search_view_shares", ["recipient_user_id", "sent_at"])
    op.add_column("workflow_tasks", sa.Column("search_view_share_id", sa.Uuid(), sa.ForeignKey("search_view_shares.id", ondelete="CASCADE")))
    op.create_index("ix_workflow_tasks_search_view_share_id", "workflow_tasks", ["search_view_share_id"])


def downgrade():
    op.drop_index("ix_workflow_tasks_search_view_share_id", table_name="workflow_tasks")
    op.drop_column("workflow_tasks", "search_view_share_id")
    op.drop_table("search_view_shares")
    op.drop_table("search_views")
