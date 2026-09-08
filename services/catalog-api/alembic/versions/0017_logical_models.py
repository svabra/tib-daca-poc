"""Add versioned DCAT resources and immutable SHACL-oriented logical models.

Revision ID: 0017_logical_models
Revises: 0016_modeling_identity_i14y
Create Date: 2026-09-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0017_logical_models'
down_revision: str | None = '0016_modeling_identity_i14y'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'dcat_catalogs',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(500), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_catalog_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_dcat_catalog_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_catalog_revision'),
        sa.UniqueConstraint('urn'),
    )

    op.create_table(
        'dcat_catalog_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('catalog_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('title', sa.JSON(), nullable=False),
        sa.Column('description', sa.JSON(), nullable=False),
        sa.Column('publisher', sa.JSON(), nullable=False),
        sa.Column('homepage', sa.String(1000), nullable=True),
        sa.Column('languages', sa.JSON(), nullable=False),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('draft', 'published', 'superseded')", name='ck_dcat_catalog_status'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_catalog_version_hash'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_catalog_version_revision'),
        sa.ForeignKeyConstraint(['catalog_id'], ['dcat_catalogs.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('catalog_id', 'revision', name='uq_dcat_catalog_version'),
    )

    op.create_table(
        'dcat_datasets',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(500), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('catalog_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_dataset_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_dcat_dataset_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_dataset_revision'),
        sa.ForeignKeyConstraint(['catalog_id'], ['dcat_catalogs.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_dcat_dataset_catalog', 'dcat_datasets', ['catalog_id', 'lifecycle'])

    op.create_table(
        'dcat_dataset_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('dataset_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('identifiers', sa.JSON(), nullable=False),
        sa.Column('data_owner_user_id', sa.String(200), nullable=False),
        sa.Column('deputy_owner_user_id', sa.String(200), nullable=True),
        sa.Column('creator', sa.JSON(), nullable=False),
        sa.Column('data_domain_id', sa.Uuid(), nullable=False),
        sa.Column('department_code', sa.String(20), nullable=False),
        sa.Column('organization_id', sa.String(100), nullable=False),
        sa.Column('data_classification', sa.String(32), nullable=False),
        sa.Column('date_created', sa.Date(), nullable=False),
        sa.Column('contact_points', sa.JSON(), nullable=False),
        sa.Column('publisher', sa.JSON(), nullable=False),
        sa.Column('access_rights', sa.String(1000), nullable=False),
        sa.Column('themes', sa.JSON(), nullable=False),
        sa.Column('keywords', sa.JSON(), nullable=False),
        sa.Column('issued', sa.Date(), nullable=True),
        sa.Column('modified', sa.DateTime(timezone=True), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("data_classification IN ('unclassified', 'internal', 'confidential', 'secret')", name='ck_dcat_dataset_classification'),
        sa.CheckConstraint('deputy_owner_user_id IS NULL OR deputy_owner_user_id <> data_owner_user_id', name='ck_dcat_dataset_deputy_not_owner'),
        sa.CheckConstraint("status IN ('draft', 'published', 'superseded')", name='ck_dcat_dataset_status'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_dataset_version_hash'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_dataset_version_revision'),
        sa.ForeignKeyConstraint(['data_domain_id'], ['domains.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['data_owner_user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['administrative_organizations.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['deputy_owner_user_id'], ['demo_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['dataset_id'], ['dcat_datasets.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('dataset_id', 'revision', name='uq_dcat_dataset_version'),
    )

    op.create_table(
        'dcat_dataset_version_localizations',
        sa.Column('dataset_version_id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('language', sa.String(8), nullable=False, primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.CheckConstraint("language IN ('de', 'fr', 'it', 'en', 'rm')", name='ck_dcat_dataset_language'),
        sa.ForeignKeyConstraint(['dataset_version_id'], ['dcat_dataset_versions.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'dcat_distributions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(700), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('dataset_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_distribution_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_dcat_distribution_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_distribution_revision'),
        sa.ForeignKeyConstraint(['dataset_id'], ['dcat_datasets.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_dcat_distribution_dataset', 'dcat_distributions', ['dataset_id', 'lifecycle'])

    op.create_table(
        'dcat_distribution_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('distribution_id', sa.Uuid(), nullable=False),
        sa.Column('dataset_version_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('title', sa.JSON(), nullable=False),
        sa.Column('access_url', sa.String(1000), nullable=True),
        sa.Column('download_url', sa.String(1000), nullable=True),
        sa.Column('media_type', sa.String(255), nullable=True),
        sa.Column('format', sa.String(255), nullable=True),
        sa.Column('license_uri', sa.String(1000), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('draft', 'published', 'superseded')", name='ck_dcat_distribution_status'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_distribution_version_hash'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_distribution_version_revision'),
        sa.ForeignKeyConstraint(['distribution_id'], ['dcat_distributions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dataset_version_id'], ['dcat_dataset_versions.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('distribution_id', 'revision', name='uq_dcat_distribution_version'),
    )

    op.create_table(
        'dcat_data_services',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(700), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('dataset_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_service_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_dcat_service_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_service_revision'),
        sa.ForeignKeyConstraint(['dataset_id'], ['dcat_datasets.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_dcat_service_dataset', 'dcat_data_services', ['dataset_id', 'lifecycle'])

    op.create_table(
        'dcat_data_service_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('data_service_id', sa.Uuid(), nullable=False),
        sa.Column('dataset_version_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('title', sa.JSON(), nullable=False),
        sa.Column('endpoint_url', sa.String(1000), nullable=False),
        sa.Column('endpoint_description', sa.String(1000), nullable=True),
        sa.Column('serves_dataset_urns', sa.JSON(), nullable=False),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('draft', 'published', 'superseded')", name='ck_dcat_service_status'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_dcat_service_version_hash'),
        sa.CheckConstraint('revision >= 1', name='ck_dcat_service_version_revision'),
        sa.ForeignKeyConstraint(['data_service_id'], ['dcat_data_services.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['dataset_version_id'], ['dcat_dataset_versions.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('data_service_id', 'revision', name='uq_dcat_service_version'),
    )

    op.create_table(
        'logical_models',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(500), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('published_revision', sa.Integer(), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_by_user_id', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_logical_model_content_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_logical_model_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_logical_model_revision'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['demo_users.id']),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_logical_model_lifecycle', 'logical_models', ['lifecycle'])

    op.create_table(
        'logical_model_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('logical_model_id', sa.Uuid(), nullable=False),
        sa.Column('dataset_version_id', sa.Uuid(), nullable=False),
        sa.Column('predecessor_version_id', sa.Uuid(), nullable=True),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('lock_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('created_by_user_id', sa.String(200), nullable=False),
        sa.Column('updated_by_user_id', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('lock_version >= 1', name='ck_logical_model_lock_version'),
        sa.CheckConstraint('revision >= 1', name='ck_logical_model_version_revision'),
        sa.CheckConstraint("status IN ('draft', 'review_pending', 'published', 'superseded', 'retired')", name='ck_logical_model_version_status'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_logical_version_content_hash'),
        sa.ForeignKeyConstraint(['logical_model_id'], ['logical_models.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['updated_by_user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['predecessor_version_id'], ['logical_model_versions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['dataset_version_id'], ['dcat_dataset_versions.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['demo_users.id']),
        sa.UniqueConstraint('logical_model_id', 'revision', name='uq_logical_model_version'),
    )
    op.create_index('ix_logical_version_status', 'logical_model_versions', ['status', 'logical_model_id'])

    op.create_table(
        'logical_entities',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('logical_model_id', sa.Uuid(), nullable=False),
        sa.Column('urn', sa.String(700), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_logical_entity_content_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_logical_entity_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_logical_entity_revision'),
        sa.ForeignKeyConstraint(['logical_model_id'], ['logical_models.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_logical_entity_model', 'logical_entities', ['logical_model_id', 'lifecycle'])

    op.create_table(
        'logical_entity_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('logical_model_version_id', sa.Uuid(), nullable=False),
        sa.Column('logical_entity_id', sa.Uuid(), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('business_object', sa.String(255), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_logical_entity_version_content_hash'),
        sa.CheckConstraint('position >= 0', name='ck_logical_entity_position'),
        sa.CheckConstraint('revision >= 1', name='ck_logical_entity_version_revision'),
        sa.ForeignKeyConstraint(['logical_model_version_id'], ['logical_model_versions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['logical_entity_id'], ['logical_entities.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('logical_model_version_id', 'logical_entity_id', name='uq_logical_entity_version'),
        sa.UniqueConstraint('logical_model_version_id', 'name', name='uq_logical_entity_version_name'),
        sa.UniqueConstraint('logical_entity_id', 'revision', name='uq_logical_entity_version_revision'),
    )
    op.create_index('ix_logical_entity_version_model', 'logical_entity_versions', ['logical_model_version_id', 'position'])

    op.create_table(
        'logical_fields',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('logical_entity_id', sa.Uuid(), nullable=False),
        sa.Column('urn', sa.String(900), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_logical_field_content_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_logical_field_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_logical_field_revision'),
        sa.ForeignKeyConstraint(['logical_entity_id'], ['logical_entities.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_logical_field_entity', 'logical_fields', ['logical_entity_id', 'lifecycle'])

    op.create_table(
        'logical_field_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('logical_entity_version_id', sa.Uuid(), nullable=False),
        sa.Column('logical_field_id', sa.Uuid(), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('business_object', sa.String(255), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('data_type', sa.String(255), nullable=False),
        sa.Column('length', sa.Integer(), nullable=True),
        sa.Column('precision', sa.Integer(), nullable=True),
        sa.Column('short_description', sa.Text(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('source_system', sa.String(255), nullable=True),
        sa.Column('classification', sa.String(32), nullable=False),
        sa.Column('decimal_places', sa.Integer(), nullable=True),
        sa.Column('value_list_concept_id', sa.Uuid(), nullable=True),
        sa.Column('concept_match_explicitly_none', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('nullable', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('min_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('max_count', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint("classification IN ('unclassified', 'internal', 'confidential', 'secret')", name='ck_logical_field_classification'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_logical_field_version_content_hash'),
        sa.CheckConstraint('decimal_places IS NULL OR decimal_places >= 0', name='ck_logical_field_decimal_places'),
        sa.CheckConstraint('length IS NULL OR length >= 0', name='ck_logical_field_length'),
        sa.CheckConstraint('max_count IS NULL OR max_count >= min_count', name='ck_logical_field_max_count'),
        sa.CheckConstraint('min_count >= 0', name='ck_logical_field_min_count'),
        sa.CheckConstraint('position >= 0', name='ck_logical_field_position'),
        sa.CheckConstraint('precision IS NULL OR precision >= 0', name='ck_logical_field_precision'),
        sa.CheckConstraint('revision >= 1', name='ck_logical_field_version_revision'),
        sa.ForeignKeyConstraint(['value_list_concept_id'], ['i14y_concepts.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['logical_entity_version_id'], ['logical_entity_versions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['logical_field_id'], ['logical_fields.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('logical_entity_version_id', 'logical_field_id', name='uq_logical_field_version'),
        sa.UniqueConstraint('logical_entity_version_id', 'name', name='uq_logical_field_version_name'),
        sa.UniqueConstraint('logical_field_id', 'revision', name='uq_logical_field_version_revision'),
    )
    op.create_index('ix_logical_field_version_entity', 'logical_field_versions', ['logical_entity_version_id', 'position'])

    op.create_table(
        'logical_concept_links',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('logical_model_version_id', sa.Uuid(), nullable=True),
        sa.Column('logical_field_version_id', sa.Uuid(), nullable=True),
        sa.Column('concept_id', sa.Uuid(), nullable=False),
        sa.Column('concept_version', sa.String(100), nullable=True),
        sa.Column('concept_source_modified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('source_uri', sa.String(1000), nullable=False),
        sa.Column('primary_for_i14y', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('linked_by_user_id', sa.String(200), nullable=False),
        sa.Column('linked_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('(logical_model_version_id IS NOT NULL AND logical_field_version_id IS NULL) OR (logical_model_version_id IS NULL AND logical_field_version_id IS NOT NULL)', name='ck_logical_concept_link_target'),
        sa.ForeignKeyConstraint(['concept_id'], ['i14y_concepts.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['logical_model_version_id'], ['logical_model_versions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['linked_by_user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['logical_field_version_id'], ['logical_field_versions.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_logical_concept_concept', 'logical_concept_links', ['concept_id'])
    op.create_index('ix_logical_concept_field', 'logical_concept_links', ['logical_field_version_id'])
    op.create_index('ix_logical_concept_model', 'logical_concept_links', ['logical_model_version_id'])
    op.create_index('uq_logical_concept_field_link', 'logical_concept_links', ['logical_field_version_id', 'concept_id'], unique=True, postgresql_where=sa.text('logical_field_version_id IS NOT NULL'), sqlite_where=sa.text('logical_field_version_id IS NOT NULL'))
    op.create_index('uq_logical_concept_model_link', 'logical_concept_links', ['logical_model_version_id', 'concept_id'], unique=True, postgresql_where=sa.text('logical_model_version_id IS NOT NULL'), sqlite_where=sa.text('logical_model_version_id IS NOT NULL'))
    op.create_index('uq_logical_concept_primary_field', 'logical_concept_links', ['logical_field_version_id'], unique=True, postgresql_where=sa.text('primary_for_i14y = true AND logical_field_version_id IS NOT NULL'), sqlite_where=sa.text('primary_for_i14y = 1 AND logical_field_version_id IS NOT NULL'))


def downgrade() -> None:
    op.drop_table('logical_concept_links')
    op.drop_table('logical_field_versions')
    op.drop_table('logical_fields')
    op.drop_table('logical_entity_versions')
    op.drop_table('logical_entities')
    op.drop_table('logical_model_versions')
    op.drop_table('logical_models')
    op.drop_table('dcat_data_service_versions')
    op.drop_table('dcat_data_services')
    op.drop_table('dcat_distribution_versions')
    op.drop_table('dcat_distributions')
    op.drop_table('dcat_dataset_version_localizations')
    op.drop_table('dcat_dataset_versions')
    op.drop_table('dcat_datasets')
    op.drop_table('dcat_catalog_versions')
    op.drop_table('dcat_catalogs')
