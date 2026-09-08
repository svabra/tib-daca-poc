"""Add immutable physical metadata snapshots and drift evidence.

Revision ID: 0018_physical_assets
Revises: 0017_logical_models
Create Date: 2026-09-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0018_physical_assets'
down_revision: str | None = '0017_logical_models'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'physical_sources',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(500), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('adapter_type', sa.String(32), nullable=False),
        sa.Column('config_ref', sa.String(255), nullable=True),
        sa.Column('department_code', sa.String(20), nullable=False),
        sa.Column('organization_id', sa.String(100), nullable=False),
        sa.Column('revision', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('content_hash', sa.String(64), nullable=False),
        sa.Column('lifecycle', sa.String(32), nullable=False, server_default='active'),
        sa.Column('created_by_user_id', sa.String(200), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('retired_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("adapter_type IN ('postgresql', 'fixture')", name='ck_physical_adapter'),
        sa.CheckConstraint('length(content_hash) = 64', name='ck_physical_source_hash'),
        sa.CheckConstraint("lifecycle IN ('active', 'retired')", name='ck_physical_source_lifecycle'),
        sa.CheckConstraint('revision >= 1', name='ck_physical_source_revision'),
        sa.ForeignKeyConstraint(['organization_id'], ['administrative_organizations.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by_user_id'], ['demo_users.id']),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_physical_source_scope', 'physical_sources', ['department_code', 'organization_id'])

    op.create_table(
        'physical_schema_snapshots',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('urn', sa.String(700), nullable=False),
        sa.Column('origin_catalog_id', sa.String(255), nullable=False),
        sa.Column('source_id', sa.Uuid(), nullable=False),
        sa.Column('sequence', sa.Integer(), nullable=False),
        sa.Column('predecessor_snapshot_id', sa.Uuid(), nullable=True),
        sa.Column('fingerprint', sa.String(64), nullable=False),
        sa.Column('imported_by_user_id', sa.String(200), nullable=False),
        sa.Column('imported_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('length(fingerprint) = 64', name='ck_physical_snapshot_fingerprint'),
        sa.CheckConstraint('sequence >= 1', name='ck_physical_snapshot_sequence'),
        sa.ForeignKeyConstraint(['predecessor_snapshot_id'], ['physical_schema_snapshots.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['imported_by_user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['source_id'], ['physical_sources.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('source_id', 'sequence', name='uq_physical_snapshot_sequence'),
        sa.UniqueConstraint('urn'),
    )
    op.create_index('ix_physical_snapshot_source', 'physical_schema_snapshots', ['source_id', 'sequence'])

    op.create_table(
        'physical_databases',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('snapshot_id', sa.Uuid(), nullable=False),
        sa.Column('stable_key', sa.String(1000), nullable=False),
        sa.Column('urn', sa.String(1200), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['snapshot_id'], ['physical_schema_snapshots.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('snapshot_id', 'name', name='uq_physical_database_name'),
    )
    op.create_index('ix_physical_database_snapshot', 'physical_databases', ['snapshot_id', 'position'])

    op.create_table(
        'physical_schemas',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('physical_database_id', sa.Uuid(), nullable=False),
        sa.Column('stable_key', sa.String(1200), nullable=False),
        sa.Column('urn', sa.String(1400), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['physical_database_id'], ['physical_databases.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('physical_database_id', 'name', name='uq_physical_schema_name'),
    )
    op.create_index('ix_physical_schema_database', 'physical_schemas', ['physical_database_id', 'position'])

    op.create_table(
        'physical_tables',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('physical_schema_id', sa.Uuid(), nullable=False),
        sa.Column('stable_key', sa.String(1500), nullable=False),
        sa.Column('urn', sa.String(1700), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('kind', sa.String(32), nullable=False, server_default='table'),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.CheckConstraint("kind IN ('table', 'view', 'materialized_view')", name='ck_physical_table_kind'),
        sa.ForeignKeyConstraint(['physical_schema_id'], ['physical_schemas.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('physical_schema_id', 'name', name='uq_physical_table_name'),
    )
    op.create_index('ix_physical_table_schema', 'physical_tables', ['physical_schema_id', 'position'])

    op.create_table(
        'physical_columns',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('physical_table_id', sa.Uuid(), nullable=False),
        sa.Column('stable_key', sa.String(1800), nullable=False),
        sa.Column('urn', sa.String(2000), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('raw_data_type', sa.String(255), nullable=False),
        sa.Column('normalized_data_type', sa.String(100), nullable=False),
        sa.Column('character_length', sa.Integer(), nullable=True),
        sa.Column('numeric_precision', sa.Integer(), nullable=True),
        sa.Column('numeric_scale', sa.Integer(), nullable=True),
        sa.Column('nullable', sa.Boolean(), nullable=False),
        sa.Column('ordinal_position', sa.Integer(), nullable=False),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.CheckConstraint('ordinal_position >= 1', name='ck_physical_column_position'),
        sa.ForeignKeyConstraint(['physical_table_id'], ['physical_tables.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('physical_table_id', 'name', name='uq_physical_column_name'),
        sa.UniqueConstraint('physical_table_id', 'ordinal_position', name='uq_physical_column_position'),
    )
    op.create_index('ix_physical_column_table', 'physical_columns', ['physical_table_id', 'ordinal_position'])

    op.create_table(
        'physical_drift_reports',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('source_id', sa.Uuid(), nullable=False),
        sa.Column('previous_snapshot_id', sa.Uuid(), nullable=False),
        sa.Column('current_snapshot_id', sa.Uuid(), nullable=False),
        sa.Column('summary', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['previous_snapshot_id'], ['physical_schema_snapshots.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['current_snapshot_id'], ['physical_schema_snapshots.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['source_id'], ['physical_sources.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('current_snapshot_id', name='uq_physical_drift_current_snapshot'),
    )
    op.create_index('ix_physical_drift_source', 'physical_drift_reports', ['source_id', 'created_at'])

    op.create_table(
        'physical_drift_changes',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('drift_report_id', sa.Uuid(), nullable=False),
        sa.Column('change_type', sa.String(32), nullable=False),
        sa.Column('asset_key', sa.String(1800), nullable=False),
        sa.Column('before', sa.JSON(), nullable=True),
        sa.Column('after', sa.JSON(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('impacted_logical_field_ids', sa.JSON(), nullable=False),
        sa.Column('impacted_mapping_ids', sa.JSON(), nullable=False),
        sa.Column('review_status', sa.String(32), nullable=False, server_default='not_applicable'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("change_type IN ('table_added', 'table_removed', 'column_added', 'column_removed', 'type_changed', 'length_changed', 'precision_changed', 'scale_changed', 'nullability_changed', 'rename_candidate')", name='ck_physical_drift_change_type'),
        sa.CheckConstraint('confidence IS NULL OR (confidence >= 0 AND confidence <= 1)', name='ck_physical_drift_confidence'),
        sa.CheckConstraint("review_status IN ('pending', 'accepted', 'rejected', 'not_applicable')", name='ck_physical_drift_review_status'),
        sa.ForeignKeyConstraint(['drift_report_id'], ['physical_drift_reports.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_physical_drift_change_report', 'physical_drift_changes', ['drift_report_id', 'change_type'])


def downgrade() -> None:
    op.drop_table('physical_drift_changes')
    op.drop_table('physical_drift_reports')
    op.drop_table('physical_columns')
    op.drop_table('physical_tables')
    op.drop_table('physical_schemas')
    op.drop_table('physical_databases')
    op.drop_table('physical_schema_snapshots')
    op.drop_table('physical_sources')
