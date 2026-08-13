"""Add subject type and validity to policy entitlements.

Revision ID: 0002_timed_entitlements
Revises: 0001_estv_product
Create Date: 2026-08-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_timed_entitlements"
down_revision: str | None = "0001_estv_product"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("policy_entitlements", sa.Column("subject_type", sa.String(32), nullable=False, server_default="person"))
    op.add_column("policy_entitlements", sa.Column("valid_from", sa.Date(), nullable=False, server_default="0001-01-01"))
    op.add_column("policy_entitlements", sa.Column("valid_until", sa.Date(), nullable=False, server_default="9999-12-31"))
    op.add_column("policy_entitlements", sa.Column("data_variant", sa.String(32), nullable=False, server_default="original"))
    op.drop_constraint("policy_entitlements_pkey", "policy_entitlements", type_="primary")
    op.create_primary_key(
        "policy_entitlements_pkey",
        "policy_entitlements",
        ["product_id", "subject_id", "subject_type", "action", "protocol"],
    )
    op.execute(
        """
        INSERT INTO tax_statistics (product_id, canton_code, tax_year, taxpayers, taxable_income_million_chf, source_note)
        SELECT '9c9a0112-d4ef-57d0-862c-0d27872c82c2'::uuid, canton_code, tax_year,
               taxpayers, taxable_income_million_chf,
               'Synthetische DAAIF-Demo · ' || source_note
        FROM tax_statistics
        WHERE product_id = '11111111-1111-4111-8111-111111111111'::uuid
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION daca_can_read(target_product uuid) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM policy_entitlements entitlement
            WHERE entitlement.product_id = target_product
              AND entitlement.subject_id = daca_effective_subject()
              AND entitlement.subject_type = CASE
                WHEN session_user = 'daca_sample_api'
                  THEN COALESCE(NULLIF(current_setting('daca.subject_type', true), ''), 'person')
                ELSE 'person'
              END
              AND entitlement.action = 'data.read'
              AND entitlement.protocol = daca_effective_protocol()
              AND entitlement.active
              AND CURRENT_DATE BETWEEN entitlement.valid_from AND entitlement.valid_until
          )
        $$
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM tax_statistics WHERE product_id = '9c9a0112-d4ef-57d0-862c-0d27872c82c2'::uuid")
    op.execute(
        """
        CREATE OR REPLACE FUNCTION daca_can_read(target_product uuid) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM policy_entitlements entitlement
            WHERE entitlement.product_id = target_product
              AND entitlement.subject_id = daca_effective_subject()
              AND entitlement.action = 'data.read'
              AND entitlement.protocol = daca_effective_protocol()
              AND entitlement.active
          )
        $$
        """
    )
    op.drop_constraint("policy_entitlements_pkey", "policy_entitlements", type_="primary")
    op.create_primary_key(
        "policy_entitlements_pkey",
        "policy_entitlements",
        ["product_id", "subject_id", "action", "protocol"],
    )
    op.drop_column("policy_entitlements", "data_variant")
    op.drop_column("policy_entitlements", "valid_until")
    op.drop_column("policy_entitlements", "valid_from")
    op.drop_column("policy_entitlements", "subject_type")
