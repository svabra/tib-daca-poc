"""Project weekly IANA-zone availability into PostgreSQL RLS.

Revision ID: 0003_weekly_availability
Revises: 0002_timed_entitlements
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from app.migration_context import function_search_path, proxy_session_condition

revision: str = "0003_weekly_availability"
down_revision: str | None = "0002_timed_entitlements"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    search_path = function_search_path()
    proxy_condition = proxy_session_condition()
    op.add_column("policy_entitlements", sa.Column("weekly_days", sa.String(32)))
    op.add_column("policy_entitlements", sa.Column("weekly_start_time", sa.Time()))
    op.add_column("policy_entitlements", sa.Column("weekly_end_time", sa.Time()))
    op.add_column("policy_entitlements", sa.Column("weekly_time_zone", sa.String(100)))
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION daca_can_read(target_product uuid) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = {search_path}
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM policy_entitlements entitlement
            WHERE entitlement.product_id = target_product
              AND entitlement.subject_id = daca_effective_subject()
              AND entitlement.subject_type = CASE
                WHEN {proxy_condition}
                  THEN COALESCE(NULLIF(current_setting('daca.subject_type', true), ''), 'person')
                ELSE 'person'
              END
              AND entitlement.action = 'data.read'
              AND entitlement.protocol = daca_effective_protocol()
              AND entitlement.active
              AND COALESCE(
                    (CURRENT_TIMESTAMP AT TIME ZONE entitlement.weekly_time_zone)::date,
                    CURRENT_DATE
                  ) BETWEEN entitlement.valid_from AND entitlement.valid_until
              AND (
                (
                  entitlement.weekly_days IS NULL
                  AND entitlement.weekly_start_time IS NULL
                  AND entitlement.weekly_end_time IS NULL
                  AND entitlement.weekly_time_zone IS NULL
                )
                OR (
                  entitlement.weekly_days IS NOT NULL
                  AND entitlement.weekly_start_time IS NOT NULL
                  AND entitlement.weekly_end_time IS NOT NULL
                  AND entitlement.weekly_time_zone IS NOT NULL
                  AND position(
                    ',' || EXTRACT(ISODOW FROM CURRENT_TIMESTAMP AT TIME ZONE entitlement.weekly_time_zone)::int::text || ','
                    IN ',' || entitlement.weekly_days || ','
                  ) > 0
                  AND (CURRENT_TIMESTAMP AT TIME ZONE entitlement.weekly_time_zone)::time
                        >= entitlement.weekly_start_time
                  AND (CURRENT_TIMESTAMP AT TIME ZONE entitlement.weekly_time_zone)::time
                        < entitlement.weekly_end_time
                )
              )
          )
        $$
        """
    )


def downgrade() -> None:
    search_path = function_search_path()
    proxy_condition = proxy_session_condition()
    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION daca_can_read(target_product uuid) RETURNS boolean
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = {search_path}
        AS $$
          SELECT EXISTS (
            SELECT 1 FROM policy_entitlements entitlement
            WHERE entitlement.product_id = target_product
              AND entitlement.subject_id = daca_effective_subject()
              AND entitlement.subject_type = CASE
                WHEN {proxy_condition}
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
    op.drop_column("policy_entitlements", "weekly_time_zone")
    op.drop_column("policy_entitlements", "weekly_end_time")
    op.drop_column("policy_entitlements", "weekly_start_time")
    op.drop_column("policy_entitlements", "weekly_days")
