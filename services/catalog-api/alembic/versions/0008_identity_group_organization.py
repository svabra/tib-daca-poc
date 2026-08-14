"""Associate identity groups with administrative organizations.

Revision ID: 0008_group_organization
Revises: 0007_governance_submissions
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_group_organization"
down_revision: str | None = "0007_governance_submissions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("identity_groups") as batch:
        batch.add_column(sa.Column("organization_id", sa.String(100)))
        batch.create_foreign_key(
            "fk_identity_group_organization",
            "administrative_organizations",
            ["organization_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("identity_groups") as batch:
        batch.drop_constraint("fk_identity_group_organization", type_="foreignkey")
        batch.drop_column("organization_id")
