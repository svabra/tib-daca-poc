"""Persist one shared, revision-checked canvas arrangement per logical model."""

import sqlalchemy as sa
from alembic import op

revision = "0039_mapping_canvas_layouts"
down_revision = "0038_model_assistance_origins"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "mapping_canvas_layouts",
        sa.Column("logical_model_id", sa.Uuid(), sa.ForeignKey("logical_models.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("positions", sa.JSON(), nullable=False),
        sa.Column("updated_by_user_id", sa.String(200), sa.ForeignKey("demo_users.id"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_mapping_canvas_revision"),
    )


def downgrade():
    op.drop_table("mapping_canvas_layouts")
