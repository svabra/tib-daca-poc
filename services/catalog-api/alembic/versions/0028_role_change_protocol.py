"""Capture role and responsibility mutations in an append-only sequence.

Revision ID: 0028_role_change_protocol
Revises: 0027_responsibilities_glossary
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from daca_catalog.role_change_sql import CAPTURE_TABLES, install_statements

revision: str = "0028_role_change_protocol"
down_revision: str | None = "0027_responsibilities_glossary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "role_change_events",
        sa.Column("sequence", sa.BigInteger(), sa.Identity(always=True), primary_key=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("actor_user_id", sa.String(200), nullable=False),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("scope_type", sa.String(40), nullable=False),
        sa.Column("scope_id", sa.String(200), nullable=False),
        sa.Column("entity_id", sa.String(200), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("subject_user_id", sa.String(200), nullable=False),
        sa.Column("before_state", sa.JSON()),
        sa.Column("after_state", sa.JSON()),
        sa.CheckConstraint("action IN ('baseline', 'assigned', 'changed', 'removed')", name="ck_role_change_action"),
    )
    op.create_index("ix_role_change_scope", "role_change_events", ["scope_type", "scope_id", "sequence"])
    op.create_index("ix_role_change_subject", "role_change_events", ["subject_user_id", "sequence"])

    # Existing assignments have no trustworthy change timestamp. Mark them as
    # a migration baseline, rather than inventing a historical actor or action.
    for table, scope_type, owner_field in (
        ("domains", "domain", "owner_user_id"),
        ("data_products", "data_product", "owner_user_id"),
        ("dcat_dataset_versions", "dataset_version", "data_owner_user_id"),
    ):
        for role, field in (("data_owner", owner_field), ("deputy_data_owner", "deputy_owner_user_id")):
            op.execute(sa.text(f"""
                INSERT INTO role_change_events
                    (actor_user_id, action, scope_type, scope_id, entity_id, role,
                     subject_user_id, after_state)
                SELECT 'migration', 'baseline', '{scope_type}', id::text, id::text,
                       '{role}', {field}, json_build_object('userId', {field}, 'role', '{role}')
                FROM {table} WHERE {field} IS NOT NULL ORDER BY id
            """))
    op.execute(sa.text("""
        INSERT INTO role_change_events
            (actor_user_id, action, scope_type, scope_id, entity_id, role,
             subject_user_id, after_state)
        SELECT 'migration', 'baseline', 'organization', organization_id, id::text, role,
               user_id, json_build_object('userId', user_id, 'role', role,
               'organizationId', organization_id, 'active', active,
               'delegatedOwnerUserId', delegated_owner_user_id)
        FROM data_model_role_assignments WHERE active ORDER BY organization_id, user_id, role
    """))
    op.execute(sa.text("""
        INSERT INTO role_change_events
            (actor_user_id, action, scope_type, scope_id, entity_id, role,
             subject_user_id, after_state)
        SELECT 'migration', 'baseline',
               CASE WHEN domain_id IS NOT NULL THEN 'domain'
                    WHEN logical_model_id IS NOT NULL THEN 'logical_model'
                    WHEN physical_source_id IS NOT NULL THEN 'physical_representation'
                    ELSE 'data_product' END,
               COALESCE(domain_id, logical_model_id, physical_source_id, data_product_id)::text,
               id::text, role, user_id,
               json_build_object('userId', user_id, 'role', role,
                   'organizationId', organization_id, 'active', active,
                   'physicalTableKey', physical_table_key)
        FROM catalog_object_responsibilities WHERE active ORDER BY id
    """))
    for statement in install_statements():
        op.execute(statement)


def downgrade() -> None:
    op.execute("DROP TRIGGER trg_role_change_immutable ON role_change_events")
    for table in CAPTURE_TABLES:
        op.execute(f"DROP TRIGGER trg_role_change_{table} ON {table}")
    op.execute("DROP FUNCTION daca_reject_role_change_mutation()")
    op.execute("DROP FUNCTION daca_capture_role_change()")
    op.drop_index("ix_role_change_subject", table_name="role_change_events")
    op.drop_index("ix_role_change_scope", table_name="role_change_events")
    op.drop_table("role_change_events")
