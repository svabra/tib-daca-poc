"""Persist direct physical-table to domain relationships.

Revision ID: 0029_physical_domains
Revises: 0028_role_change_protocol
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0029_physical_domains"
down_revision: str | None = "0028_role_change_protocol"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "physical_domain_assignments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("physical_source_id", sa.Uuid(), sa.ForeignKey("physical_sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("physical_table_key", sa.String(1500), nullable=False),
        sa.Column("domain_id", sa.Uuid(), sa.ForeignKey("domains.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("provenance", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("physical_source_id", "physical_table_key", "domain_id", name="uq_physical_domain_assignment"),
    )
    op.create_index("ix_physical_domain_assignment_domain", "physical_domain_assignments", ["domain_id"])


def downgrade() -> None:
    op.drop_index("ix_physical_domain_assignment_domain", table_name="physical_domain_assignments")
    op.drop_table("physical_domain_assignments")
