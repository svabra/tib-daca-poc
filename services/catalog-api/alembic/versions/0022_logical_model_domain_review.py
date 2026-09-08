"""Add model review workflow, business-object pins and assistance provenance.

Revision ID: 0022_model_domain_review
Revises: 0021_terminology_assist
Create Date: 2026-09-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022_model_domain_review"
down_revision: str | None = "0021_terminology_assist"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_logical_model_version_status", "logical_model_versions", type_="check")
    op.create_check_constraint(
        "ck_logical_model_version_status", "logical_model_versions",
        "status IN ('draft', 'review_pending', 'changes_requested', 'published', 'superseded', 'retired')",
    )
    with op.batch_alter_table("logical_entity_versions") as batch:
        batch.add_column(sa.Column("business_object_version_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_logical_entity_business_object", "terminology_term_versions", ["business_object_version_id"], ["id"], ondelete="RESTRICT")
    with op.batch_alter_table("logical_field_versions") as batch:
        batch.add_column(sa.Column("business_object_version_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_logical_field_business_object", "terminology_term_versions", ["business_object_version_id"], ["id"], ondelete="RESTRICT")
    op.create_table(
        "logical_model_assistance_provenance",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("logical_model_version_id", sa.Uuid(), nullable=False),
        sa.Column("field_path", sa.String(255), nullable=False),
        sa.Column("language", sa.String(8), nullable=True),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("source_text_hash", sa.String(64), nullable=False),
        sa.Column("source_identifier", sa.String(255), nullable=True),
        sa.Column("source_uri", sa.String(1000), nullable=True),
        sa.Column("source_modified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("origin", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["logical_model_version_id"], ["logical_model_versions.id"], ondelete="CASCADE"),
        sa.CheckConstraint("provider IN ('deepl', 'termdat')", name="ck_model_assistance_provider"),
        sa.CheckConstraint("origin IN ('machine', 'edited', 'accepted')", name="ck_model_assistance_origin"),
        sa.CheckConstraint("length(source_text_hash) = 64 AND length(payload_hash) = 64", name="ck_model_assistance_hashes"),
    )
    op.create_table(
        "logical_model_reviews",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("logical_model_id", sa.Uuid(), nullable=False),
        sa.Column("submitted_version_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.Column("submitter_user_id", sa.String(200), nullable=False),
        sa.Column("reviewer_user_id", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("review_snapshot", sa.JSON(), nullable=False),
        sa.Column("decision_comment", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_version_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["logical_model_id"], ["logical_models.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submitted_version_id"], ["logical_model_versions.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["submitter_user_id"], ["demo_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["demo_users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["result_version_id"], ["logical_model_versions.id"], ondelete="SET NULL"),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'rejected')", name="ck_logical_model_review_status"),
    )
    op.create_index("ix_logical_model_review_reviewer", "logical_model_reviews", ["reviewer_user_id", "status"])
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.add_column(sa.Column("logical_model_review_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_workflow_task_logical_review", "logical_model_reviews", ["logical_model_review_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_workflow_task_logical_review", "workflow_tasks", ["logical_model_review_id"])


def downgrade() -> None:
    op.drop_index("ix_workflow_task_logical_review", table_name="workflow_tasks")
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.drop_constraint("fk_workflow_task_logical_review", type_="foreignkey")
        batch.drop_column("logical_model_review_id")
    op.drop_table("logical_model_reviews")
    op.drop_table("logical_model_assistance_provenance")
    with op.batch_alter_table("logical_field_versions") as batch:
        batch.drop_constraint("fk_logical_field_business_object", type_="foreignkey")
        batch.drop_column("business_object_version_id")
    with op.batch_alter_table("logical_entity_versions") as batch:
        batch.drop_constraint("fk_logical_entity_business_object", type_="foreignkey")
        batch.drop_column("business_object_version_id")
    op.drop_constraint("ck_logical_model_version_status", "logical_model_versions", type_="check")
    op.create_check_constraint("ck_logical_model_version_status", "logical_model_versions", "status IN ('draft', 'review_pending', 'published', 'superseded', 'retired')")
