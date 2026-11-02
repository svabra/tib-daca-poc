"""Allow an initial data-product access request without an end date."""

import sqlalchemy as sa
from alembic import op

revision = "0048_open_ended_access_requests"
down_revision = "0047_domain_network_views"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column("access_requests", "valid_until", existing_type=sa.Date(), nullable=True)
    op.drop_constraint("ck_access_request_dates", "access_requests", type_="check")
    op.create_check_constraint("ck_access_request_dates", "access_requests", "valid_until IS NULL OR valid_until >= valid_from")
    op.create_check_constraint("ck_access_request_renewal_end", "access_requests", "request_kind != 'renewal' OR valid_until IS NOT NULL")


def downgrade():
    if op.get_bind().execute(sa.text("SELECT count(*) FROM access_requests WHERE valid_until IS NULL")).scalar_one():
        raise RuntimeError("Cannot downgrade while open-ended access requests exist; their requested validity must be preserved")
    op.drop_constraint("ck_access_request_renewal_end", "access_requests", type_="check")
    op.drop_constraint("ck_access_request_dates", "access_requests", type_="check")
    op.create_check_constraint("ck_access_request_dates", "access_requests", "valid_until >= valid_from")
    op.alter_column("access_requests", "valid_until", existing_type=sa.Date(), nullable=False)
