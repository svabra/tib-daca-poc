"""Separate DaCa interface glossary from governed business terminology.

Revision ID: 0030_site_glossary
Revises: 0029_physical_domains
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0030_site_glossary"
down_revision: str | None = "0029_physical_domains"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "site_glossary_terms",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("key", sa.String(100), nullable=False, unique=True),
        sa.Column("abbreviation", sa.String(80)),
        sa.Column("is_termdat", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("lifecycle", sa.String(32), nullable=False, server_default="active"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_site_glossary_lifecycle"),
        sa.CheckConstraint("revision >= 1", name="ck_site_glossary_revision"),
    )
    op.create_table(
        "site_glossary_localizations",
        sa.Column("term_id", sa.Uuid(), sa.ForeignKey("site_glossary_terms.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("language", sa.String(35), primary_key=True),
        sa.Column("preferred_label", sa.String(255), nullable=False),
        sa.Column("short_description", sa.Text(), nullable=False),
        sa.Column("detailed_description", sa.Text(), nullable=False),
        sa.Column("normalized_label", sa.String(255), nullable=False),
    )
    op.create_index("ix_site_glossary_label", "site_glossary_localizations", ["language", "normalized_label"])

    # Only remove the seven deterministic UI seed rows from the old terminology
    # table when nobody has governed or referenced them there. Business terms,
    # including same-label terms with other IDs, remain untouched.
    connection = op.get_bind()
    for key in (
        "data-owner", "data-steward", "deputy-data-owner", "domain",
        "logical-model", "physical-representation", "data-product",
    ):
        legacy_id = uuid.uuid5(uuid.NAMESPACE_URL, f"urn:daca:site-glossary:{key}")
        connection.execute(sa.text("""
            DELETE FROM glossary_terms AS term
            WHERE term.id = :id
              AND NOT EXISTS (SELECT 1 FROM glossary_term_domains WHERE term_id = term.id)
              AND NOT EXISTS (SELECT 1 FROM data_product_glossary_terms WHERE glossary_term_id = term.id)
              AND NOT EXISTS (SELECT 1 FROM glossary_term_relations WHERE source_term_id = term.id OR target_term_id = term.id)
              AND NOT EXISTS (SELECT 1 FROM glossary_term_proposals WHERE target_term_id = term.id)
        """), {"id": legacy_id})


def downgrade() -> None:
    op.drop_index("ix_site_glossary_label", table_name="site_glossary_localizations")
    op.drop_table("site_glossary_localizations")
    op.drop_table("site_glossary_terms")
