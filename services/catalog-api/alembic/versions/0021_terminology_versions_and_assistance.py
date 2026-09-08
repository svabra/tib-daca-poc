"""Add immutable terminology concepts, responsibilities and external provenance.

Revision ID: 0021_terminology_assist
Revises: 0020_federal_orgs
Create Date: 2026-09-08
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_terminology_assist"
down_revision: str | None = "0020_federal_orgs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "terminology_terms",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("urn", sa.String(500), nullable=False, unique=True),
        sa.Column("origin_catalog_id", sa.String(255), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("latest_version_id", sa.Uuid(), nullable=True),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("lifecycle", sa.String(32), nullable=False, server_default="active"),
        sa.Column("creator_user_id", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["creator_user_id"], ["demo_users.id"]),
        sa.CheckConstraint("revision >= 1", name="ck_terminology_term_revision"),
        sa.CheckConstraint("length(content_hash) = 64", name="ck_terminology_term_hash"),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_terminology_term_lifecycle"),
    )
    op.create_table(
        "terminology_term_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("predecessor_version_id", sa.Uuid(), nullable=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("lock_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(32), nullable=False, server_default="draft"),
        sa.Column("concept_kind", sa.String(32), nullable=False, server_default="term"),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_by_user_id", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["term_id"], ["terminology_terms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["predecessor_version_id"], ["terminology_term_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["demo_users.id"]),
        sa.UniqueConstraint("term_id", "revision", name="uq_terminology_term_version"),
        sa.CheckConstraint("revision >= 1 AND lock_version >= 1", name="ck_terminology_version_numbers"),
        sa.CheckConstraint("status IN ('draft', 'review_pending', 'published', 'changes_requested', 'retired')", name="ck_terminology_version_status"),
        sa.CheckConstraint("concept_kind IN ('term', 'business_object')", name="ck_terminology_concept_kind"),
        sa.CheckConstraint("length(content_hash) = 64", name="ck_terminology_version_hash"),
    )
    op.create_foreign_key("fk_terminology_latest_version", "terminology_terms", "terminology_term_versions", ["latest_version_id"], ["id"], ondelete="SET NULL")
    op.create_index("ix_terminology_kind_status", "terminology_term_versions", ["concept_kind", "status"])
    op.create_table(
        "terminology_term_version_labels",
        sa.Column("term_version_id", sa.Uuid(), nullable=False),
        sa.Column("language", sa.String(8), nullable=False),
        sa.Column("preferred_label", sa.String(500), nullable=False),
        sa.Column("alternative_labels", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("translation_origin", sa.String(32), nullable=False, server_default="manual"),
        sa.Column("source_text_hash", sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(["term_version_id"], ["terminology_term_versions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("term_version_id", "language"),
        sa.CheckConstraint("language IN ('de', 'fr', 'it', 'en', 'rm')", name="ck_terminology_label_language"),
        sa.CheckConstraint("translation_origin IN ('manual', 'machine', 'edited', 'termdat')", name="ck_terminology_translation_origin"),
    )
    op.create_table(
        "terminology_term_version_domains",
        sa.Column("term_version_id", sa.Uuid(), nullable=False),
        sa.Column("domain_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["term_version_id"], ["terminology_term_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("term_version_id", "domain_id"),
    )
    op.create_table(
        "terminology_term_responsibilities",
        sa.Column("term_version_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(200), nullable=False),
        sa.ForeignKeyConstraint(["term_version_id"], ["terminology_term_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["demo_users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("term_version_id", "role"),
        sa.CheckConstraint("role IN ('data_owner', 'data_steward')", name="ck_terminology_responsibility_role"),
    )
    op.create_table(
        "terminology_term_relations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_version_id", sa.Uuid(), nullable=False),
        sa.Column("target_version_id", sa.Uuid(), nullable=False),
        sa.Column("relation", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["source_version_id"], ["terminology_term_versions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_version_id"], ["terminology_term_versions.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("source_version_id", "target_version_id", "relation", name="uq_terminology_relation"),
        sa.CheckConstraint("source_version_id <> target_version_id", name="ck_terminology_relation_not_self"),
        sa.CheckConstraint("relation IN ('broader', 'related', 'exactMatch', 'closeMatch')", name="ck_terminology_relation_type"),
    )
    op.create_table(
        "terminology_external_references",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("term_version_id", sa.Uuid(), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_identifier", sa.String(255), nullable=True),
        sa.Column("source_uri", sa.String(1000), nullable=False),
        sa.Column("source_version", sa.String(100), nullable=True),
        sa.Column("source_modified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("source_label", sa.String(500), nullable=True),
        sa.Column("text_snapshot", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["term_version_id"], ["terminology_term_versions.id"], ondelete="CASCADE"),
        sa.CheckConstraint("source_type IN ('termdat', 'i14y', 'other')", name="ck_terminology_external_source_type"),
        sa.CheckConstraint("length(payload_hash) = 64", name="ck_terminology_external_hash"),
    )


def downgrade() -> None:
    for table in ("terminology_external_references", "terminology_term_relations", "terminology_term_responsibilities", "terminology_term_version_domains", "terminology_term_version_labels"):
        op.drop_table(table)
    op.drop_constraint("fk_terminology_latest_version", "terminology_terms", type_="foreignkey")
    op.drop_table("terminology_term_versions")
    op.drop_table("terminology_terms")
