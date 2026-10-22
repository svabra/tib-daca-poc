"""Allow logical drafts to await their explicit catalog domain assignment.

Existing values remain unchanged. Review/publication requires an active domain in
the service. Physical domain assignments reuse the existing source/stable-key table.
"""
import sqlalchemy as sa
from alembic import op

revision = "0034_unassigned_model_domains"
down_revision = "0033_model_representations"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("dcat_dataset_versions", "data_domain_id", existing_type=sa.Uuid(), nullable=True)


def downgrade():
    # No arbitrary domain backfill: resolve unassigned drafts before downgrading.
    op.alter_column("dcat_dataset_versions", "data_domain_id", existing_type=sa.Uuid(), nullable=False)
