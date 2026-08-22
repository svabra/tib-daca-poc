"""Add an explicit deputy data owner to catalog products.

Revision ID: 0014_deputy_data_owner
Revises: 0013_source_access_journey
Create Date: 2026-08-22
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_deputy_data_owner"
down_revision: str | None = "0013_source_access_journey"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("data_products") as batch:
        batch.add_column(sa.Column("deputy_owner_user_id", sa.String(200)))
        batch.create_foreign_key(
            "fk_data_product_deputy_owner",
            "demo_users",
            ["deputy_owner_user_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_check_constraint(
            "ck_product_deputy_not_owner",
            "deputy_owner_user_id IS NULL OR owner_user_id IS NULL "
            "OR deputy_owner_user_id <> owner_user_id",
        )


def downgrade() -> None:
    with op.batch_alter_table("data_products") as batch:
        batch.drop_constraint("ck_product_deputy_not_owner", type_="check")
        batch.drop_constraint("fk_data_product_deputy_owner", type_="foreignkey")
        batch.drop_column("deputy_owner_user_id")
