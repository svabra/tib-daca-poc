"""Add governed domains, glossary terms, and their product assignments.

Revision ID: 0015_domains_glossary
Revises: 0014_deputy_data_owner
Create Date: 2026-08-25
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015_domains_glossary"
down_revision: str | None = "0014_deputy_data_owner"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "domains",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("urn", sa.String(255), nullable=False, unique=True),
        sa.Column("origin_catalog_id", sa.String(255), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("lifecycle", sa.String(32), nullable=False, server_default="active"),
        sa.Column("owner_user_id", sa.String(200), nullable=False),
        sa.Column("deputy_owner_user_id", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retired_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_domain_lifecycle"),
        sa.CheckConstraint("revision >= 1", name="ck_domain_revision"),
        sa.CheckConstraint("length(content_hash) = 64", name="ck_domain_content_hash"),
        sa.CheckConstraint("owner_user_id <> deputy_owner_user_id", name="ck_domain_deputy_not_owner"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["demo_users.id"]),
        sa.ForeignKeyConstraint(["deputy_owner_user_id"], ["demo_users.id"]),
    )
    op.create_index("ix_domain_lifecycle", "domains", ["lifecycle"])
    op.create_index("ix_domain_owner", "domains", ["owner_user_id"])

    op.create_table(
        "domain_localizations",
        sa.Column("domain_id", sa.Uuid(), primary_key=True),
        sa.Column("language", sa.String(35), primary_key=True),
        sa.Column("preferred_label", sa.String(255), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("normalized_label", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_domain_localization_label",
        "domain_localizations",
        ["language", "normalized_label"],
    )

    op.create_table(
        "data_product_domains",
        sa.Column("data_product_id", sa.Uuid(), primary_key=True),
        sa.Column("domain_id", sa.Uuid(), primary_key=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("assigned_by_user_id", sa.String(200), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_data_product_domain_position"),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["demo_users.id"]),
    )
    op.create_index("ix_data_product_domain_domain", "data_product_domains", ["domain_id"])

    op.create_table(
        "domain_change_requests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_number", sa.String(32), nullable=False, unique=True),
        sa.Column("operation", sa.String(32), nullable=False),
        sa.Column("target_domain_id", sa.Uuid()),
        sa.Column("base_revision", sa.Integer()),
        sa.Column("requester_user_id", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="submitted"),
        sa.Column("requested_payload", sa.JSON(), nullable=False),
        sa.Column("review_payload", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("reviewer_user_id", sa.String(200)),
        sa.Column("decision_comment", sa.Text()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("operation IN ('create', 'update', 'retire')", name="ck_domain_request_operation"),
        sa.CheckConstraint(
            "status IN ('submitted', 'approved', 'rejected', 'stale')",
            name="ck_domain_request_status",
        ),
        sa.CheckConstraint(
            "(operation = 'create' AND base_revision IS NULL) "
            "OR (operation IN ('update', 'retire') AND target_domain_id IS NOT NULL "
            "AND base_revision IS NOT NULL)",
            name="ck_domain_request_target",
        ),
        sa.CheckConstraint("revision >= 1", name="ck_domain_request_revision"),
        sa.ForeignKeyConstraint(["target_domain_id"], ["domains.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requester_user_id"], ["demo_users.id"]),
        sa.ForeignKeyConstraint(["reviewer_user_id"], ["demo_users.id"]),
    )
    op.create_index(
        "ix_domain_request_requester", "domain_change_requests", ["requester_user_id", "status"]
    )
    op.create_index(
        "ix_domain_request_target", "domain_change_requests", ["target_domain_id", "status"]
    )

    op.create_table(
        "glossary_terms",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("urn", sa.String(255), nullable=False, unique=True),
        sa.Column("origin_catalog_id", sa.String(255), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("lifecycle", sa.String(32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retired_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_glossary_term_lifecycle"),
        sa.CheckConstraint("revision >= 1", name="ck_glossary_term_revision"),
        sa.CheckConstraint("length(content_hash) = 64", name="ck_glossary_term_content_hash"),
    )
    op.create_index("ix_glossary_term_lifecycle", "glossary_terms", ["lifecycle"])

    op.create_table(
        "glossary_term_localizations",
        sa.Column("term_id", sa.Uuid(), primary_key=True),
        sa.Column("language", sa.String(35), primary_key=True),
        sa.Column("preferred_label", sa.String(255), nullable=False),
        sa.Column("alternative_labels", sa.JSON(), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.Column("normalized_label", sa.String(255), nullable=False),
        sa.ForeignKeyConstraint(["term_id"], ["glossary_terms.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_glossary_localization_label",
        "glossary_term_localizations",
        ["language", "normalized_label"],
    )

    op.create_table(
        "glossary_term_domains",
        sa.Column("term_id", sa.Uuid(), primary_key=True),
        sa.Column("domain_id", sa.Uuid(), primary_key=True),
        sa.ForeignKeyConstraint(["term_id"], ["glossary_terms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_glossary_term_domain_domain", "glossary_term_domains", ["domain_id"])

    op.create_table(
        "glossary_term_relations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_term_id", sa.Uuid(), nullable=False),
        sa.Column("target_term_id", sa.Uuid()),
        sa.Column("target_uri", sa.String(1000)),
        sa.Column("relation", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "relation IN ('exactMatch', 'closeMatch', 'broader', 'narrower', 'related')",
            name="ck_glossary_relation_type",
        ),
        sa.CheckConstraint(
            "(target_term_id IS NOT NULL AND target_uri IS NULL) "
            "OR (target_term_id IS NULL AND target_uri IS NOT NULL)",
            name="ck_glossary_relation_target",
        ),
        sa.CheckConstraint(
            "target_term_id IS NULL OR source_term_id <> target_term_id",
            name="ck_glossary_relation_not_self",
        ),
        sa.ForeignKeyConstraint(["source_term_id"], ["glossary_terms.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_term_id"], ["glossary_terms.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("source_term_id", "target_term_id", "relation", name="uq_glossary_relation_term"),
        sa.UniqueConstraint("source_term_id", "target_uri", "relation", name="uq_glossary_relation_uri"),
    )
    op.create_index("ix_glossary_relation_source", "glossary_term_relations", ["source_term_id"])
    op.create_index("ix_glossary_relation_target", "glossary_term_relations", ["target_term_id"])

    op.create_table(
        "data_product_glossary_terms",
        sa.Column("data_product_id", sa.Uuid(), primary_key=True),
        sa.Column("glossary_term_id", sa.Uuid(), primary_key=True),
        sa.Column("assigned_by_user_id", sa.String(200), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["glossary_term_id"], ["glossary_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["assigned_by_user_id"], ["demo_users.id"]),
    )
    op.create_index(
        "ix_data_product_glossary_term_term", "data_product_glossary_terms", ["glossary_term_id"]
    )

    op.create_table(
        "glossary_term_proposals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request_number", sa.String(32), nullable=False, unique=True),
        sa.Column("operation", sa.String(32), nullable=False, server_default="create"),
        sa.Column("target_term_id", sa.Uuid()),
        sa.Column("requester_user_id", sa.String(200), nullable=False),
        sa.Column("source_product_id", sa.Uuid()),
        sa.Column("source_product_revision", sa.Integer()),
        sa.Column("auto_attach", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(32), nullable=False, server_default="submitted"),
        sa.Column("requested_payload", sa.JSON(), nullable=False),
        sa.Column("review_payload", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("decision_comment", sa.Text()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "operation IN ('create', 'update', 'retire', 'add_translation', 'link')",
            name="ck_glossary_proposal_operation",
        ),
        sa.CheckConstraint(
            "status IN ('submitted', 'in_review', 'accepted', 'rejected', 'stale')",
            name="ck_glossary_proposal_status",
        ),
        sa.CheckConstraint("revision >= 1", name="ck_glossary_proposal_revision"),
        sa.CheckConstraint(
            "(operation = 'create' AND ((status = 'accepted' AND target_term_id IS NOT NULL) "
            "OR (status <> 'accepted' AND target_term_id IS NULL))) "
            "OR (operation <> 'create' AND target_term_id IS NOT NULL)",
            name="ck_glossary_proposal_target",
        ),
        sa.CheckConstraint(
            "auto_attach = false OR source_product_id IS NOT NULL",
            name="ck_glossary_proposal_auto_attach_source",
        ),
        sa.ForeignKeyConstraint(["target_term_id"], ["glossary_terms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["requester_user_id"], ["demo_users.id"]),
        sa.ForeignKeyConstraint(["source_product_id"], ["data_products.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_glossary_proposal_requester", "glossary_term_proposals", ["requester_user_id", "status"]
    )
    op.create_index(
        "ix_glossary_proposal_source", "glossary_term_proposals", ["source_product_id", "status"]
    )

    op.create_table(
        "glossary_term_proposal_reviews",
        sa.Column("proposal_id", sa.Uuid(), primary_key=True),
        sa.Column("domain_id", sa.Uuid(), primary_key=True),
        sa.Column("proposal_revision", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.String(200), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("decision_comment", sa.Text()),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')", name="ck_glossary_review_status"
        ),
        sa.CheckConstraint("proposal_revision >= 1", name="ck_glossary_review_revision"),
        sa.ForeignKeyConstraint(["proposal_id"], ["glossary_term_proposals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["domain_id"], ["domains.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["demo_users.id"]),
    )
    op.create_index(
        "ix_glossary_review_owner", "glossary_term_proposal_reviews", ["owner_user_id", "status"]
    )

    with op.batch_alter_table("workflow_tasks") as batch:
        batch.add_column(
            sa.Column("task_kind", sa.String(32), nullable=False, server_default="action")
        )
        batch.add_column(sa.Column("acknowledged_at", sa.DateTime(timezone=True)))
        batch.add_column(sa.Column("domain_change_request_id", sa.Uuid()))
        batch.add_column(sa.Column("glossary_term_proposal_id", sa.Uuid()))
        batch.create_check_constraint(
            "ck_workflow_task_kind", "task_kind IN ('action', 'information')"
        )
        batch.create_foreign_key(
            "fk_workflow_task_domain_request",
            "domain_change_requests",
            ["domain_change_request_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_foreign_key(
            "fk_workflow_task_glossary_proposal",
            "glossary_term_proposals",
            ["glossary_term_proposal_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index("ix_workflow_task_domain_request", ["domain_change_request_id"])
        batch.create_index("ix_workflow_task_glossary_proposal", ["glossary_term_proposal_id"])


def downgrade() -> None:
    with op.batch_alter_table("workflow_tasks") as batch:
        batch.drop_index("ix_workflow_task_glossary_proposal")
        batch.drop_index("ix_workflow_task_domain_request")
        batch.drop_constraint("fk_workflow_task_glossary_proposal", type_="foreignkey")
        batch.drop_constraint("fk_workflow_task_domain_request", type_="foreignkey")
        batch.drop_constraint("ck_workflow_task_kind", type_="check")
        batch.drop_column("glossary_term_proposal_id")
        batch.drop_column("domain_change_request_id")
        batch.drop_column("acknowledged_at")
        batch.drop_column("task_kind")

    op.drop_table("glossary_term_proposal_reviews")
    op.drop_table("glossary_term_proposals")
    op.drop_table("data_product_glossary_terms")
    op.drop_table("glossary_term_relations")
    op.drop_table("glossary_term_domains")
    op.drop_table("glossary_term_localizations")
    op.drop_table("glossary_terms")
    op.drop_table("domain_change_requests")
    op.drop_table("data_product_domains")
    op.drop_table("domain_localizations")
    op.drop_table("domains")
