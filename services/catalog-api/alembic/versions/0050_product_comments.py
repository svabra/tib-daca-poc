"""Persist public and owner-private product comments."""

import sqlalchemy as sa
from alembic import op

revision = "0050_product_comments"
down_revision = "0049_product_creation_requests"
branch_labels = depends_on = None


def upgrade():
    op.create_table(
        "data_product_comments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "data_product_id",
            sa.Uuid(),
            sa.ForeignKey("data_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author_user_id", sa.String(200), sa.ForeignKey("demo_users.id"), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("visibility", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "visibility IN ('public', 'private')", name="ck_product_comment_visibility"
        ),
        sa.CheckConstraint("length(trim(text)) BETWEEN 1 AND 4000", name="ck_product_comment_text"),
    )
    op.create_index(
        "ix_product_comments_visible",
        "data_product_comments",
        ["data_product_id", "visibility", "created_at", "id"],
    )


def downgrade():
    op.drop_index("ix_product_comments_visible", table_name="data_product_comments")
    op.drop_table("data_product_comments")
