"""Persist general derived-product requirements without rewriting existing requests."""

import sqlalchemy as sa
from alembic import op

revision = "0051_creation_requirements"
down_revision = "0050_product_comments"
branch_labels = depends_on = None


def upgrade():
    op.alter_column(
        "product_creation_requests", "tax_year", existing_type=sa.Integer(), nullable=True
    )
    op.alter_column(
        "product_creation_requests", "canton_code", existing_type=sa.String(2), nullable=True
    )
    op.add_column("product_creation_requests", sa.Column("basis_from", sa.Date(), nullable=True))
    op.add_column("product_creation_requests", sa.Column("basis_until", sa.Date(), nullable=True))
    op.add_column("product_creation_requests", sa.Column("legal_basis", sa.Text(), nullable=True))
    op.add_column(
        "product_creation_requests", sa.Column("update_frequency", sa.String(32), nullable=True)
    )
    op.create_check_constraint(
        "ck_product_creation_basis_dates",
        "product_creation_requests",
        "basis_from IS NULL OR basis_until >= basis_from",
    )
    op.create_check_constraint(
        "ck_product_creation_frequency",
        "product_creation_requests",
        "update_frequency IS NULL OR update_frequency IN ('once', 'realtime', 'hourly', 'daily', 'weekly', 'annually')",
    )
    op.create_check_constraint(
        "ck_product_creation_requirements",
        "product_creation_requests",
        "(tax_year IS NOT NULL AND canton_code IS NOT NULL AND basis_from IS NULL AND basis_until IS NULL AND legal_basis IS NULL AND update_frequency IS NULL) OR (tax_year IS NULL AND canton_code IS NULL AND basis_from IS NOT NULL AND basis_until IS NOT NULL AND legal_basis IS NOT NULL AND update_frequency IS NOT NULL)",
    )


def downgrade():
    connection = op.get_bind()
    if connection.scalar(
        sa.text(
            "SELECT count(*) FROM product_creation_requests WHERE tax_year IS NULL OR canton_code IS NULL"
        )
    ):
        raise RuntimeError(
            "General requests require migration 0051; downgrade would lose their requirements."
        )
    op.drop_constraint(
        "ck_product_creation_requirements", "product_creation_requests", type_="check"
    )
    op.drop_constraint("ck_product_creation_frequency", "product_creation_requests", type_="check")
    op.drop_constraint(
        "ck_product_creation_basis_dates", "product_creation_requests", type_="check"
    )
    for name in ("update_frequency", "legal_basis", "basis_until", "basis_from"):
        op.drop_column("product_creation_requests", name)
    op.alter_column(
        "product_creation_requests", "tax_year", existing_type=sa.Integer(), nullable=False
    )
    op.alter_column(
        "product_creation_requests", "canton_code", existing_type=sa.String(2), nullable=False
    )
