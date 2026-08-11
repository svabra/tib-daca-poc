"""Persist data-product access requests.

Revision ID: 0002_access_requests
Revises: 0001_catalog
Create Date: 2026-08-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_access_requests"
down_revision: str | None = "0001_catalog"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "access_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("request_number", sa.String(32), nullable=False),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("requester_id", sa.String(200), nullable=False),
        sa.Column("requester_name", sa.String(255), nullable=False),
        sa.Column("requester_organization", sa.String(255), nullable=False),
        sa.Column("contact_email", sa.String(320), nullable=False),
        sa.Column("consumer_type", sa.String(32), nullable=False),
        sa.Column("machine_id", sa.String(255), nullable=True),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("legal_basis", sa.Text(), nullable=False),
        sa.Column("requested_protocol", sa.String(32), nullable=False),
        sa.Column("requested_variant", sa.String(32), nullable=False),
        sa.Column("valid_from", sa.Date(), nullable=False),
        sa.Column("valid_until", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "consumer_type IN ('person', 'machine')",
            name="ck_access_request_consumer_type",
        ),
        sa.CheckConstraint(
            "requested_protocol IN ('http', 'postgresql', 'both')",
            name="ck_access_request_protocol",
        ),
        sa.CheckConstraint(
            "requested_variant IN ('original', 'modified', 'either')",
            name="ck_access_request_variant",
        ),
        sa.CheckConstraint(
            "status IN ('submitted', 'identity_review', 'legal_review', 'conditions_review', "
            "'granted_modified', 'granted_original', 'rejected', 'withdrawn')",
            name="ck_access_request_status",
        ),
        sa.CheckConstraint("valid_until >= valid_from", name="ck_access_request_dates"),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_number"),
    )
    op.create_index("ix_access_request_product", "access_requests", ["data_product_id"])
    op.create_index("ix_access_request_requester", "access_requests", ["requester_id"])


def downgrade() -> None:
    op.drop_index("ix_access_request_requester", table_name="access_requests")
    op.drop_index("ix_access_request_product", table_name="access_requests")
    op.drop_table("access_requests")
