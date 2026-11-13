"""Support rolling data-basis windows without rewriting existing requests or audit."""

import sqlalchemy as sa
from alembic import op

revision = "0052_creation_windows"
down_revision = "0051_creation_requirements"
branch_labels = depends_on = None

OLD_REQUIREMENTS = "(tax_year IS NOT NULL AND canton_code IS NOT NULL AND basis_from IS NULL AND basis_until IS NULL AND legal_basis IS NULL AND update_frequency IS NULL) OR (tax_year IS NULL AND canton_code IS NULL AND basis_from IS NOT NULL AND basis_until IS NOT NULL AND legal_basis IS NOT NULL AND update_frequency IS NOT NULL)"
NEW_REQUIREMENTS = "(tax_year IS NOT NULL AND canton_code IS NOT NULL AND basis_window_type = 'fixed' AND basis_from IS NULL AND basis_until IS NULL AND legal_basis IS NULL AND update_frequency IS NULL) OR (tax_year IS NULL AND canton_code IS NULL AND legal_basis IS NOT NULL AND update_frequency IS NOT NULL AND ((basis_window_type = 'fixed' AND basis_from IS NOT NULL AND basis_until IS NOT NULL) OR basis_window_type = 'rolling'))"
WINDOW = "(basis_window_type = 'fixed' AND rolling_window_size IS NULL AND rolling_window_unit IS NULL) OR (basis_window_type = 'rolling' AND basis_from IS NULL AND basis_until IS NULL AND rolling_window_size IS NOT NULL AND rolling_window_size BETWEEN 1 AND 10000 AND rolling_window_unit IS NOT NULL AND rolling_window_unit IN ('days', 'weeks', 'months', 'years'))"


def upgrade():
    op.add_column("product_creation_requests", sa.Column("basis_window_type", sa.String(16), nullable=False, server_default="fixed"))
    op.add_column("product_creation_requests", sa.Column("rolling_window_size", sa.Integer(), nullable=True))
    op.add_column("product_creation_requests", sa.Column("rolling_window_unit", sa.String(8), nullable=True))
    op.drop_constraint("ck_product_creation_requirements", "product_creation_requests", type_="check")
    op.create_check_constraint("ck_product_creation_requirements", "product_creation_requests", NEW_REQUIREMENTS)
    op.create_check_constraint("ck_product_creation_window", "product_creation_requests", WINDOW)


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM product_creation_requests WHERE basis_window_type = 'rolling'")):
        raise RuntimeError("Downgrade would lose stored rolling-window requirements.")
    op.drop_constraint("ck_product_creation_window", "product_creation_requests", type_="check")
    op.drop_constraint("ck_product_creation_requirements", "product_creation_requests", type_="check")
    for name in ("rolling_window_unit", "rolling_window_size", "basis_window_type"):
        op.drop_column("product_creation_requests", name)
    op.create_check_constraint("ck_product_creation_requirements", "product_creation_requests", OLD_REQUIREMENTS)
