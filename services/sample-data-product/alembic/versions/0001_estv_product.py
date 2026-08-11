"""Create the protected synthetic ESTV data product.

Revision ID: 0001_estv_product
Revises:
"""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001_estv_product"
down_revision = None
branch_labels = None
depends_on = None

PRODUCT_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")


def upgrade() -> None:
    op.create_table(
        "tax_statistics",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canton_code", sa.String(2), nullable=False),
        sa.Column("tax_year", sa.Integer(), nullable=False),
        sa.Column("taxpayers", sa.Integer(), nullable=False),
        sa.Column("taxable_income_million_chf", sa.Numeric(14, 2), nullable=False),
        sa.Column("source_note", sa.Text(), nullable=False),
    )
    op.create_index("ix_tax_statistics_product_id", "tax_statistics", ["product_id"])
    op.create_table(
        "policy_entitlements",
        sa.Column("product_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("subject_id", sa.String(200), primary_key=True),
        sa.Column("action", sa.String(100), primary_key=True),
        sa.Column("protocol", sa.String(32), primary_key=True),
        sa.Column("policy_revision", sa.BigInteger(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "policy_deployments",
        sa.Column("product_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("revision", sa.BigInteger(), nullable=False),
        sa.Column(
            "deployed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    tax_table = sa.table(
        "tax_statistics",
        sa.column("id", sa.Integer),
        sa.column("product_id", postgresql.UUID(as_uuid=True)),
        sa.column("canton_code", sa.String),
        sa.column("tax_year", sa.Integer),
        sa.column("taxpayers", sa.Integer),
        sa.column("taxable_income_million_chf", sa.Numeric),
        sa.column("source_note", sa.Text),
    )
    op.bulk_insert(
        tax_table,
        [
            {
                "id": 1,
                "product_id": PRODUCT_ID,
                "canton_code": "SG",
                "tax_year": 2024,
                "taxpayers": 312450,
                "taxable_income_million_chf": 18420.50,
                "source_note": "Synthetic aggregate for the DiDaCa proof of concept",
            },
            {
                "id": 2,
                "product_id": PRODUCT_ID,
                "canton_code": "BE",
                "tax_year": 2024,
                "taxpayers": 671230,
                "taxable_income_million_chf": 36510.25,
                "source_note": "Synthetic aggregate for the DiDaCa proof of concept",
            },
            {
                "id": 3,
                "product_id": PRODUCT_ID,
                "canton_code": "ZH",
                "tax_year": 2024,
                "taxpayers": 954880,
                "taxable_income_million_chf": 72110.75,
                "source_note": "Synthetic aggregate for the DiDaCa proof of concept",
            },
        ],
    )
    op.execute(
        sa.text(
            """
            INSERT INTO policy_entitlements
                (product_id, subject_id, action, protocol, policy_revision, active)
            VALUES
                (:product_id, 'kanton-st-gallen', 'data.read', 'http-rest', 1, true),
                (:product_id, 'kanton-st-gallen', 'data.read', 'postgresql', 1, true)
            """
        ).bindparams(product_id=PRODUCT_ID)
    )
    op.execute(
        sa.text(
            "INSERT INTO policy_deployments (product_id, revision) VALUES (:product_id, 1)"
        ).bindparams(product_id=PRODUCT_ID)
    )

    op.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC")
    op.execute(
        'GRANT USAGE ON SCHEMA public TO didaca_sample_api, didaca_policy_projector, '
        '"kanton-st-gallen", "kanton-bern"'
    )
    op.execute(
        'GRANT SELECT ON tax_statistics TO didaca_sample_api, "kanton-st-gallen", "kanton-bern"'
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON policy_entitlements TO didaca_policy_projector"
    )
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON policy_deployments TO didaca_policy_projector"
    )

    op.execute(
        """
        CREATE FUNCTION didaca_effective_subject() RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT CASE
            WHEN session_user = 'didaca_sample_api'
              THEN NULLIF(current_setting('didaca.subject_id', true), '')
            ELSE session_user::text
          END
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION didaca_effective_protocol() RETURNS text
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT CASE
            WHEN session_user = 'didaca_sample_api'
              THEN COALESCE(NULLIF(current_setting('didaca.protocol', true), ''), 'http-rest')
            ELSE 'postgresql'
          END
        $$
        """
    )
    op.execute(
        """
        CREATE FUNCTION didaca_can_read(target_product uuid) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
          SELECT EXISTS (
            SELECT 1
            FROM policy_entitlements entitlement
            WHERE entitlement.product_id = target_product
              AND entitlement.subject_id = didaca_effective_subject()
              AND entitlement.action = 'data.read'
              AND entitlement.protocol = didaca_effective_protocol()
              AND entitlement.active
          )
        $$
        """
    )
    op.execute(
        'REVOKE ALL ON FUNCTION didaca_effective_subject() FROM PUBLIC; '
        'REVOKE ALL ON FUNCTION didaca_effective_protocol() FROM PUBLIC; '
        'REVOKE ALL ON FUNCTION didaca_can_read(uuid) FROM PUBLIC'
    )
    op.execute(
        'GRANT EXECUTE ON FUNCTION didaca_effective_subject(), didaca_effective_protocol(), '
        'didaca_can_read(uuid) TO didaca_sample_api, "kanton-st-gallen", "kanton-bern"'
    )
    op.execute("ALTER TABLE tax_statistics ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tax_statistics FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY didaca_product_read ON tax_statistics FOR SELECT USING "
        "(didaca_can_read(product_id))"
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS didaca_product_read ON tax_statistics")
    op.execute("DROP FUNCTION IF EXISTS didaca_can_read(uuid)")
    op.execute("DROP FUNCTION IF EXISTS didaca_effective_protocol()")
    op.execute("DROP FUNCTION IF EXISTS didaca_effective_subject()")
    op.drop_table("policy_deployments")
    op.drop_table("policy_entitlements")
    op.drop_index("ix_tax_statistics_product_id", table_name="tax_statistics")
    op.drop_table("tax_statistics")

