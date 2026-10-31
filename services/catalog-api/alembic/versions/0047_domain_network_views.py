"""Private cross-department domain-network presentation."""

import sqlalchemy as sa
from alembic import op

revision = "0047_domain_network_views"
down_revision = "0046_personal_search_views"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "domain_network_views",
        sa.Column(
            "user_id",
            sa.String(200),
            sa.ForeignKey("demo_users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_domain_network_view_revision"),
    )


def downgrade():
    op.drop_table("domain_network_views")
