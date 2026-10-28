"""Shared semantic layouts and revision-checked domain relationships."""

import sqlalchemy as sa
from alembic import op

revision = "0040_semantic_graph_states"
down_revision = "0039_mapping_canvas_layouts"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "semantic_graph_states",
        sa.Column("graph_key", sa.String(200), primary_key=True),
        sa.Column("domain_id", sa.Uuid(), sa.ForeignKey("domains.id", ondelete="RESTRICT")),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("positions", sa.JSON(), nullable=False),
        sa.Column("relations", sa.JSON(), nullable=False),
        sa.Column("updated_by_user_id", sa.String(200), sa.ForeignKey("demo_users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_semantic_graph_revision"),
    )


def downgrade():
    op.drop_table("semantic_graph_states")
