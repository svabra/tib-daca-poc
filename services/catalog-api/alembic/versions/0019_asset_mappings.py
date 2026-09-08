"""Add immutable logical-to-physical mapping versions.

Revision ID: 0019_asset_mappings
Revises: 0018_physical_assets
Create Date: 2026-09-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0019_asset_mappings'
down_revision: str | None = '0018_physical_assets'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'asset_mappings',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(700), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('logical_model_id', sa.Uuid(), nullable=False),
        sa.Column('physical_source_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_by_user_id', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_asset_mapping_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_asset_mapping_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_asset_mapping_revision'),
        sa.ForeignKeyConstraint(['physical_source_id'], ['physical_sources.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['logical_model_id'], ['logical_models.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_asset_mapping_logical_physical', 'asset_mappings', ['logical_model_id', 'physical_source_id'])

    op.create_table(
        'asset_mapping_versions',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('asset_mapping_id', sa.Uuid(), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False),
        sa.Column('lock_version', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('predecessor_version_id', sa.Uuid(), nullable=True),
        sa.Column('logical_model_version_id', sa.Uuid(), nullable=False),
        sa.Column('physical_snapshot_id', sa.Uuid(), nullable=False),
        sa.Column('mapping_type', sa.String(32), nullable=False),
        sa.Column('classification', sa.String(32), nullable=False, server_default='unclassified'),
        sa.Column('status', sa.String(32), nullable=False, server_default='draft'),
        sa.Column('transformation_rule', sa.Text(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('responsible_user_id', sa.String(200), nullable=False),
        sa.Column('valid_from', sa.Date(), nullable=False),
        sa.Column('valid_to', sa.Date(), nullable=True),
        sa.Column('validation_result', sa.JSON(), nullable=False),
        sa.Column('last_drift_check_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('created_by_user_id', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('lock_version >= 1', name='ck_asset_mapping_lock_version'),
        sa.CheckConstraint("status IN ('draft', 'review_pending', 'validated', 'broken', 'superseded')", name='ck_asset_mapping_status'),
        sa.CheckConstraint("mapping_type IN ('Direct', 'Renamed', 'Derived', 'Lookup', 'Transformed')", name='ck_asset_mapping_type'),
        sa.CheckConstraint("classification IN ('unclassified', 'internal', 'confidential', 'secret')", name='ck_asset_mapping_classification'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_asset_mapping_version_hash'),
        sa.CheckConstraint('revision >= 1', name='ck_asset_mapping_version_revision'),
        sa.ForeignKeyConstraint(['asset_mapping_id'], ['asset_mappings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['physical_snapshot_id'], ['physical_schema_snapshots.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['predecessor_version_id'], ['asset_mapping_versions.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['responsible_user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['logical_model_version_id'], ['logical_model_versions.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('asset_mapping_id', 'revision', name='uq_asset_mapping_version'),
    )
    op.create_index('ix_asset_mapping_version_status', 'asset_mapping_versions', ['status', 'responsible_user_id'])

    op.create_table(
        'asset_mapping_logical_fields',
        sa.Column('asset_mapping_version_id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('logical_field_version_id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('role', sa.String(50), nullable=False, server_default='source'),
        sa.ForeignKeyConstraint(['logical_field_version_id'], ['logical_field_versions.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['asset_mapping_version_id'], ['asset_mapping_versions.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('asset_mapping_version_id', 'position', name='uq_asset_mapping_logical_position'),
    )

    op.create_table(
        'asset_mapping_physical_columns',
        sa.Column('asset_mapping_version_id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('physical_column_id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('role', sa.String(50), nullable=False, server_default='source'),
        sa.ForeignKeyConstraint(['physical_column_id'], ['physical_columns.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['asset_mapping_version_id'], ['asset_mapping_versions.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('asset_mapping_version_id', 'position', name='uq_asset_mapping_physical_position'),
    )


def downgrade() -> None:
    op.drop_table('asset_mapping_physical_columns')
    op.drop_table('asset_mapping_logical_fields')
    op.drop_table('asset_mapping_versions')
    op.drop_table('asset_mappings')
