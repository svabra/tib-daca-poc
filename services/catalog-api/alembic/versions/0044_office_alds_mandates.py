"""Persist explicit LDSD and office ALDS appointments without granting any default mandates."""

import sqlalchemy as sa
from alembic import op

revision = "0044_office_alds_mandates"
down_revision = "0043_deputy_steward_role"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "organization_steward_mandates",
        sa.Column("organization_id", sa.String(100), sa.ForeignKey("administrative_organizations.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("mandate_type", sa.String(20), nullable=False),
        sa.Column("deputy_user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="RESTRICT")),
        sa.CheckConstraint("mandate_type IN ('ldsd','alds')", name="ck_steward_mandate_type"),
        sa.CheckConstraint("deputy_user_id IS NULL OR deputy_user_id <> user_id", name="ck_steward_mandate_deputy"),
        sa.Column("appointed_by", sa.String(255), nullable=False),
        sa.Column("decision_reference", sa.String(1000), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("revision >= 1", name="ck_steward_mandate_revision"),
    )


def downgrade():
    op.drop_table("organization_steward_mandates")
