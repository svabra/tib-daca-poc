"""Bind access requests to exact policy revisions and fulfillment subjects.

Revision ID: 0010_request_policy_binding
Revises: 0009_journey_terms
Create Date: 2026-08-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_request_policy_binding"
down_revision: str | None = "0009_journey_terms"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("access_requests") as batch:
        batch.add_column(sa.Column("fulfillment_subject_type", sa.String(32)))
        batch.add_column(sa.Column("fulfillment_subject_id", sa.String(255)))
        batch.add_column(sa.Column("fulfillment_group_revision", sa.Integer()))
        batch.add_column(sa.Column("decision_policy_revision_id", sa.Uuid()))
        batch.add_column(sa.Column("granted_variant", sa.String(32)))
        batch.create_check_constraint(
            "ck_access_request_fulfillment_subject_type",
            "fulfillment_subject_type IS NULL OR fulfillment_subject_type IN ('person', 'machine', 'group')",
        )
        batch.create_check_constraint(
            "ck_access_request_granted_variant",
            "granted_variant IS NULL OR granted_variant IN ('original', 'modified')",
        )
        batch.create_foreign_key(
            "fk_access_request_decision_policy",
            "policy_revisions",
            ["decision_policy_revision_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_access_request_decision_policy", ["decision_policy_revision_id"])


def downgrade() -> None:
    with op.batch_alter_table("access_requests") as batch:
        batch.drop_index("ix_access_request_decision_policy")
        batch.drop_constraint("fk_access_request_decision_policy", type_="foreignkey")
        batch.drop_constraint("ck_access_request_granted_variant", type_="check")
        batch.drop_constraint("ck_access_request_fulfillment_subject_type", type_="check")
        batch.drop_column("granted_variant")
        batch.drop_column("decision_policy_revision_id")
        batch.drop_column("fulfillment_group_revision")
        batch.drop_column("fulfillment_subject_id")
        batch.drop_column("fulfillment_subject_type")
