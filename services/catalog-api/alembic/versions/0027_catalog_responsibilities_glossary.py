"""Persist object responsibilities and glossary display fields.

Revision ID: 0027_responsibilities_glossary
Revises: 0026_demo_sessions
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027_responsibilities_glossary"
down_revision: str | None = "0026_demo_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("glossary_terms", sa.Column("abbreviation", sa.String(80)))
    op.add_column(
        "glossary_terms",
        sa.Column("is_termdat", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("glossary_term_localizations", sa.Column("short_description", sa.Text()))
    op.add_column("glossary_term_localizations", sa.Column("detailed_description", sa.Text()))
    op.create_table(
        "catalog_object_responsibilities",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.String(200), sa.ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("organization_id", sa.String(100), sa.ForeignKey("administrative_organizations.id", ondelete="RESTRICT")),
        sa.Column("domain_id", sa.Uuid(), sa.ForeignKey("domains.id", ondelete="CASCADE")),
        sa.Column("logical_model_id", sa.Uuid(), sa.ForeignKey("logical_models.id", ondelete="CASCADE")),
        sa.Column("physical_source_id", sa.Uuid(), sa.ForeignKey("physical_sources.id", ondelete="CASCADE")),
        sa.Column("physical_table_key", sa.String(1500)),
        sa.Column("data_product_id", sa.Uuid(), sa.ForeignKey("data_products.id", ondelete="CASCADE")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("provenance", sa.String(40), nullable=False, server_default="explicit"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "role IN ('data_owner', 'deputy_data_owner', 'data_steward')",
            name="ck_catalog_object_responsibility_role",
        ),
        sa.CheckConstraint(
            "(CASE WHEN domain_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN logical_model_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN physical_source_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN data_product_id IS NULL THEN 0 ELSE 1 END) = 1",
            name="ck_catalog_object_responsibility_target",
        ),
        sa.CheckConstraint(
            "physical_table_key IS NULL OR physical_source_id IS NOT NULL",
            name="ck_catalog_object_responsibility_table_source",
        ),
    )
    op.create_index("ix_catalog_object_responsibility_user", "catalog_object_responsibilities", ["user_id", "active"])
    op.create_index("ix_catalog_object_responsibility_domain", "catalog_object_responsibilities", ["domain_id"])
    op.create_index("ix_catalog_object_responsibility_model", "catalog_object_responsibilities", ["logical_model_id"])
    op.create_index("ix_catalog_object_responsibility_source", "catalog_object_responsibilities", ["physical_source_id"])
    op.create_index("ix_catalog_object_responsibility_product", "catalog_object_responsibilities", ["data_product_id"])


def downgrade() -> None:
    op.drop_table("catalog_object_responsibilities")
    op.drop_column("glossary_term_localizations", "detailed_description")
    op.drop_column("glossary_term_localizations", "short_description")
    op.drop_column("glossary_terms", "is_termdat")
    op.drop_column("glossary_terms", "abbreviation")
