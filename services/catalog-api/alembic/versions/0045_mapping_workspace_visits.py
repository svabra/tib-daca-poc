"""Private recent mapping work, independent of catalog revisions and login lifetime."""

import sqlalchemy as sa
from alembic import op

revision = "0045_mapping_workspace_visits"
down_revision = "0044_office_alds_mandates"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "mapping_workspace_visits",
        sa.Column("user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("logical_model_id", sa.Uuid(), sa.ForeignKey("logical_models.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("physical_snapshot_id", sa.Uuid(), sa.ForeignKey("physical_schema_snapshots.id", ondelete="SET NULL")),
        sa.Column("physical_table_id", sa.Uuid(), sa.ForeignKey("physical_tables.id", ondelete="SET NULL")),
        sa.Column("view", sa.String(16), nullable=False),
        sa.Column("visited_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("view IN ('graph', 'table', 'drift')", name="ck_mapping_visit_view"),
    )
    op.create_index("ix_mapping_visit_user_time", "mapping_workspace_visits", ["user_id", "visited_at"])


def downgrade():
    op.drop_table("mapping_workspace_visits")
