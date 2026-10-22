"""CSV structure inventories with original per-table and per-field metadata.

Existing sources and historical snapshots are unchanged; JSON is nullable and
requires no backfill. Downgrade requires removal of CSV sources via an explicit
retention decision, rather than silently discarding catalog evidence.
"""
import sqlalchemy as sa
from alembic import op

revision = "0035_csv_physical_models"
down_revision = "0034_unassigned_model_domains"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_constraint("ck_physical_adapter", "physical_sources", type_="check")
    op.create_check_constraint("ck_physical_adapter", "physical_sources", "adapter_type IN ('postgresql', 's3', 'fixture', 'csv')")
    op.add_column("physical_tables", sa.Column("import_metadata", sa.JSON(), nullable=True))
    op.add_column("physical_columns", sa.Column("import_metadata", sa.JSON(), nullable=True))


def downgrade():
    op.drop_constraint("ck_physical_adapter", "physical_sources", type_="check")
    op.create_check_constraint("ck_physical_adapter", "physical_sources", "adapter_type IN ('postgresql', 's3', 'fixture')")
    op.drop_column("physical_columns", "import_metadata")
    op.drop_column("physical_tables", "import_metadata")
