"""Link access renewals to immutable grant evidence.

Revision ID: 0012_access_renewals
Revises: 0011_service_level_revisions
Create Date: 2026-08-20
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0012_access_renewals"
down_revision: str | None = "0011_service_level_revisions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


OPEN_RENEWAL_PREDICATE = (
    "request_kind = 'renewal' AND status IN "
    "('submitted', 'identity_review', 'legal_review', 'conditions_review', "
    "'approved_policy_pending')"
)


def upgrade() -> None:
    with op.batch_alter_table("access_requests") as batch:
        batch.add_column(
            sa.Column(
                "request_kind",
                sa.String(32),
                nullable=False,
                server_default="initial",
            )
        )
        batch.add_column(sa.Column("renewal_of_request_id", sa.Uuid()))
        batch.add_column(sa.Column("renewal_context", sa.JSON(none_as_null=True)))
        batch.create_check_constraint(
            "ck_access_request_kind",
            "request_kind IN ('initial', 'renewal')",
        )
        batch.create_check_constraint(
            "ck_access_request_renewal_context",
            "(request_kind = 'initial' AND renewal_of_request_id IS NULL "
            "AND renewal_context IS NULL) OR "
            "(request_kind = 'renewal' AND renewal_of_request_id IS NOT NULL "
            "AND renewal_context IS NOT NULL)",
        )
        batch.create_foreign_key(
            "fk_access_request_renewal_of",
            "access_requests",
            ["renewal_of_request_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_index("ix_access_request_renewal_of", ["renewal_of_request_id"])

    op.create_index(
        "uq_access_request_open_renewal",
        "access_requests",
        ["renewal_of_request_id"],
        unique=True,
        postgresql_where=sa.text(OPEN_RENEWAL_PREDICATE),
        sqlite_where=sa.text(OPEN_RENEWAL_PREDICATE),
    )


def downgrade() -> None:
    op.drop_index("uq_access_request_open_renewal", table_name="access_requests")
    with op.batch_alter_table("access_requests") as batch:
        batch.drop_index("ix_access_request_renewal_of")
        batch.drop_constraint("fk_access_request_renewal_of", type_="foreignkey")
        batch.drop_constraint("ck_access_request_renewal_context", type_="check")
        batch.drop_constraint("ck_access_request_kind", type_="check")
        batch.drop_column("renewal_context")
        batch.drop_column("renewal_of_request_id")
        batch.drop_column("request_kind")
