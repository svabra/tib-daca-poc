"""Allow explicit archival of CSV structure inventories; keep other lifecycles unchanged."""
from alembic import op

revision = "0036_structure_inventory_archive"
down_revision = "0035_csv_physical_models"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_physical_source_lifecycle", "physical_sources", type_="check")
    op.create_check_constraint("ck_physical_source_lifecycle", "physical_sources",
                               "lifecycle IN ('active', 'retired') OR (adapter_type = 'csv' AND lifecycle = 'archived')")


def downgrade():
    # Restore or explicitly retire archived inventories before removing support.
    op.drop_constraint("ck_physical_source_lifecycle", "physical_sources", type_="check")
    op.create_check_constraint("ck_physical_source_lifecycle", "physical_sources", "lifecycle IN ('active', 'retired')")
