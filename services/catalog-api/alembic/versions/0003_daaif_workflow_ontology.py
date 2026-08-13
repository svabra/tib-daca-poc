"""Add the DAAIF publication, workflow and canonical ontology POC model.

Revision ID: 0003_daaif_workflow
Revises: 0002_access_requests
Create Date: 2026-08-11
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003_daaif_workflow"
down_revision: str | None = "0002_access_requests"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "demo_users",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("display_name", sa.String(255), nullable=False),
        sa.Column("organization", sa.String(255), nullable=False),
        sa.Column("email", sa.String(320), nullable=False),
        sa.Column("phone", sa.String(100)),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("roles", sa.JSON(), nullable=False),
        sa.Column("selectable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    with op.batch_alter_table("data_products") as batch:
        batch.add_column(sa.Column("owner_user_id", sa.String(200)))
        batch.add_column(sa.Column("discoverable", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.create_foreign_key("fk_data_product_owner_user", "demo_users", ["owner_user_id"], ["id"])

    with op.batch_alter_table("access_requests") as batch:
        batch.drop_constraint("ck_access_request_status", type_="check")
        batch.create_check_constraint(
            "ck_access_request_status",
            "status IN ('submitted', 'identity_review', 'legal_review', 'conditions_review', "
            "'approved_policy_pending', 'granted_modified', 'granted_original', 'rejected', 'withdrawn')",
        )

    op.create_table(
        "poc_product_fixtures",
        sa.Column("id", sa.String(200), primary_key=True),
        sa.Column("owner_user_id", sa.String(200), nullable=False),
        sa.Column("source_product_id", sa.String(255), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("maturity_level", sa.String(32), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["demo_users.id"]),
    )
    op.create_table(
        "metadata_publications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("source_system", sa.String(100), nullable=False),
        sa.Column("source_product_id", sa.String(255), nullable=False),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("publication_mode", sa.String(32), nullable=False),
        sa.Column("discoverable_explicit", sa.Boolean(), nullable=False),
        sa.Column("payload_hash", sa.String(64), nullable=False),
        sa.Column("normalized_payload", sa.JSON(), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("source_system", "source_product_id", name="uq_metadata_publication_source"),
    )
    op.create_index("ix_metadata_publication_product", "metadata_publications", ["data_product_id"])
    op.create_table(
        "data_product_fields",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("data_type", sa.String(100), nullable=False),
        sa.Column("nullable", sa.Boolean(), nullable=False),
        sa.Column("key_field", sa.Boolean(), nullable=False),
        sa.Column("business_description", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("data_product_id", "name", name="uq_data_product_field_name"),
    )
    op.create_index("ix_data_product_field_product", "data_product_fields", ["data_product_id"])
    op.create_table(
        "product_quality_assessments",
        sa.Column("data_product_id", sa.Uuid(), primary_key=True),
        sa.Column("access_management_defined", sa.Boolean(), nullable=False),
        sa.Column("discoverability_confirmed", sa.Boolean(), nullable=False),
        sa.Column("technical_metadata_complete", sa.Boolean(), nullable=False),
        sa.Column("business_metadata_complete", sa.Boolean(), nullable=False),
        sa.Column("graph_confirmed", sa.Boolean(), nullable=False),
        sa.Column("ontology_embedded", sa.Boolean(), nullable=False),
        sa.Column("dcat_reviewed", sa.Boolean(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("medal", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "product_context_graphs",
        sa.Column("data_product_id", sa.Uuid(), primary_key=True),
        sa.Column("graph", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("confirmed_by", sa.String(200)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
    )
    op.create_table(
        "canonical_ontology_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("uri", sa.String(500), nullable=False, unique=True),
        sa.Column("version", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "canonical_ontology_terms",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("ontology_version_id", sa.Uuid(), nullable=False),
        sa.Column("uri", sa.String(500), nullable=False, unique=True),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["ontology_version_id"], ["canonical_ontology_versions.id"]),
    )
    op.create_index("ix_ontology_term_version", "canonical_ontology_terms", ["ontology_version_id"])
    op.create_table(
        "ontology_term_alignments",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("term_id", sa.Uuid(), nullable=False),
        sa.Column("target_uri", sa.String(1000), nullable=False),
        sa.Column("relation", sa.String(32), nullable=False),
        sa.ForeignKeyConstraint(["term_id"], ["canonical_ontology_terms.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("term_id", "target_uri", name="uq_ontology_term_alignment"),
    )
    op.create_table(
        "product_semantic_mappings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("data_product_field_id", sa.Uuid()),
        sa.Column("ontology_term_id", sa.Uuid(), nullable=False),
        sa.Column("mapping_type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("confirmed_by", sa.String(200)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["data_product_field_id"], ["data_product_fields.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ontology_term_id"], ["canonical_ontology_terms.id"]),
    )
    op.create_index("ix_semantic_mapping_product", "product_semantic_mappings", ["data_product_id"])
    op.create_table(
        "workflow_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("task_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("assignee_user_id", sa.String(200), nullable=False),
        sa.Column("data_product_id", sa.Uuid(), nullable=False),
        sa.Column("access_request_id", sa.Uuid()),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(["assignee_user_id"], ["demo_users.id"]),
        sa.ForeignKeyConstraint(["data_product_id"], ["data_products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["access_request_id"], ["access_requests.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_workflow_task_assignee", "workflow_tasks", ["assignee_user_id", "status"])
    op.create_index("ix_workflow_task_product", "workflow_tasks", ["data_product_id"])


def downgrade() -> None:
    op.drop_index("ix_workflow_task_product", table_name="workflow_tasks")
    op.drop_index("ix_workflow_task_assignee", table_name="workflow_tasks")
    op.drop_table("workflow_tasks")
    op.drop_index("ix_semantic_mapping_product", table_name="product_semantic_mappings")
    op.drop_table("product_semantic_mappings")
    op.drop_table("ontology_term_alignments")
    op.drop_index("ix_ontology_term_version", table_name="canonical_ontology_terms")
    op.drop_table("canonical_ontology_terms")
    op.drop_table("canonical_ontology_versions")
    op.drop_table("product_context_graphs")
    op.drop_table("product_quality_assessments")
    op.drop_index("ix_data_product_field_product", table_name="data_product_fields")
    op.drop_table("data_product_fields")
    op.drop_index("ix_metadata_publication_product", table_name="metadata_publications")
    op.drop_table("metadata_publications")
    op.drop_table("poc_product_fixtures")
    with op.batch_alter_table("access_requests") as batch:
        batch.drop_constraint("ck_access_request_status", type_="check")
        batch.create_check_constraint(
            "ck_access_request_status",
            "status IN ('submitted', 'identity_review', 'legal_review', 'conditions_review', "
            "'granted_modified', 'granted_original', 'rejected', 'withdrawn')",
        )
    with op.batch_alter_table("data_products") as batch:
        batch.drop_constraint("fk_data_product_owner_user", type_="foreignkey")
        batch.drop_column("discoverable")
        batch.drop_column("owner_user_id")
    op.drop_table("demo_users")
