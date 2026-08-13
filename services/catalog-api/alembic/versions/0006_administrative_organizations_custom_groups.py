"""Add federal organization hierarchy and owner-managed identity groups.

Revision ID: 0006_org_custom_groups
Revises: 0005_identity_directory
Create Date: 2026-08-12
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_org_custom_groups"
down_revision: str | None = "0005_identity_directory"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "administrative_organizations",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("department_code", sa.String(20), nullable=False),
        sa.Column("office_code", sa.String(40)),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("organization_type", sa.String(32), nullable=False),
        sa.Column("department_order", sa.Integer(), nullable=False),
        sa.Column("office_order", sa.Integer(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "organization_type IN ('federal_council', 'chancellery', 'department', 'office', 'affiliated')",
            name="ck_administrative_organization_type",
        ),
        sa.UniqueConstraint(
            "department_code", "office_code", name="uq_administrative_organization_codes"
        ),
    )
    op.create_index(
        "ix_administrative_organization_sort",
        "administrative_organizations",
        ["department_order", "office_order"],
    )
    with op.batch_alter_table("identity_directory_entries") as batch:
        batch.add_column(sa.Column("organization_id", sa.String(100)))
        batch.create_foreign_key(
            "fk_identity_directory_organization",
            "administrative_organizations",
            ["organization_id"],
            ["id"],
            ondelete="SET NULL",
        )
    with op.batch_alter_table("identity_groups") as batch:
        batch.add_column(sa.Column("owner_user_id", sa.String(200)))
        batch.add_column(
            sa.Column("system_managed", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.create_foreign_key(
            "fk_identity_group_owner",
            "demo_users",
            ["owner_user_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("identity_groups") as batch:
        batch.drop_constraint("fk_identity_group_owner", type_="foreignkey")
        batch.drop_column("system_managed")
        batch.drop_column("owner_user_id")
    with op.batch_alter_table("identity_directory_entries") as batch:
        batch.drop_constraint("fk_identity_directory_organization", type_="foreignkey")
        batch.drop_column("organization_id")
    op.drop_index(
        "ix_administrative_organization_sort", table_name="administrative_organizations"
    )
    op.drop_table("administrative_organizations")
