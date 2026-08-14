"""Create the standalone DaCa catalog schema.

Revision ID: 0001_catalog
Revises:
Create Date: 2026-08-03
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001_catalog"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "data_products",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("urn", sa.String(255), nullable=False),
        sa.Column("origin_catalog", sa.String(255), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("active_policy_revision", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("owner", sa.String(255), nullable=False),
        sa.Column("domain", sa.String(255), nullable=False),
        sa.Column("lifecycle", sa.String(32), nullable=False),
        sa.Column("classification", sa.String(32), nullable=False),
        sa.Column("keywords", sa.JSON(), nullable=False),
        sa.Column("contact", sa.JSON(), nullable=False),
        sa.Column("license", sa.String(255), nullable=True),
        sa.Column("quality", sa.JSON(), nullable=False),
        sa.Column("update_frequency", sa.String(100), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("classification IN ('public', 'internal', 'confidential', 'restricted')", name="ck_product_classification"),
        sa.CheckConstraint("lifecycle IN ('draft', 'active', 'deprecated', 'retired')", name="ck_product_lifecycle"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("urn"),
    )
    op.create_table(
        "lineage_edges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_urn", sa.String(255), nullable=False),
        sa.Column("target_urn", sa.String(255), nullable=False),
        sa.Column("relation_type", sa.String(100), nullable=False),
        sa.Column("transformation", sa.Text(), nullable=True),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("state IN ('active', 'inferred', 'deprecated')", name="ck_lineage_state"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lineage_source", "lineage_edges", ["source_urn"])
    op.create_index("ix_lineage_target", "lineage_edges", ["target_urn"])
    op.create_table(
        "audit_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("resource_type", sa.String(100), nullable=False),
        sa.Column("resource_id", sa.String(255), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_resource", "audit_events", ["resource_type", "resource_id"])
    op.create_table(
        "seed_markers",
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("applied_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("name"),
    )
    op.create_table(
        "endpoints",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("protocol", sa.String(32), nullable=False),
        sa.Column("connection", sa.JSON(), nullable=False),
        sa.Column("secret_ref", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("protocol IN ('http-rest', 'postgresql')", name="ck_endpoint_protocol"),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_endpoints_data_product", "endpoints", ["data_product_id"])
    op.create_table(
        "provenance_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("data_product_id", sa.Uuid(), nullable=True),
        sa.Column("product_urn", sa.String(255), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(100), nullable=False),
        sa.Column("actor", sa.String(255), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("data_product_id", "sequence", name="uq_provenance_product_sequence"),
    )
    op.create_index("ix_provenance_product", "provenance_events", ["data_product_id"])
    op.create_table(
        "policy_revisions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("definition", sa.JSON(), nullable=False),
        sa.Column("generated_rego", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('draft', 'published', 'revoked')", name="ck_policy_status"),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("data_product_id", "revision", name="uq_policy_product_revision"),
    )
    op.create_index("ix_policy_product", "policy_revisions", ["data_product_id"])
    op.create_table(
        "policy_deployments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("policy_revision_id", sa.Uuid(), nullable=False),
        sa.Column("target", sa.String(32), nullable=False),
        sa.Column("desired_revision", sa.Integer(), nullable=False),
        sa.Column("observed_revision", sa.Integer(), nullable=True),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("state IN ('pending', 'deployed', 'failed')", name="ck_deployment_state"),
        sa.CheckConstraint("target IN ('opa', 'postgresql')", name="ck_deployment_target"),
        sa.ForeignKeyConstraint(["policy_revision_id"], ["policy_revisions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("policy_revision_id", "target", name="uq_policy_deployment_target"),
    )


def downgrade() -> None:
    op.drop_table("policy_deployments")
    op.drop_index("ix_policy_product", table_name="policy_revisions")
    op.drop_table("policy_revisions")
    op.drop_index("ix_provenance_product", table_name="provenance_events")
    op.drop_table("provenance_events")
    op.drop_index("ix_endpoints_data_product", table_name="endpoints")
    op.drop_table("endpoints")
    op.drop_table("seed_markers")
    op.drop_index("ix_audit_resource", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_lineage_target", table_name="lineage_edges")
    op.drop_index("ix_lineage_source", table_name="lineage_edges")
    op.drop_table("lineage_edges")
    op.drop_table("data_products")
