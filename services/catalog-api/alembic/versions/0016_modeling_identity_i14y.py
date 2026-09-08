"""Add scoped modeling roles and the local I14Y concept cache.

Revision ID: 0016_modeling_identity_i14y
Revises: 0015_domains_glossary
Create Date: 2026-09-07
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '0016_modeling_identity_i14y'
down_revision: str | None = '0015_domains_glossary'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'data_model_role_assignments',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('user_id', sa.String(200), nullable=False),
        sa.Column('department_code', sa.String(20), nullable=False),
        sa.Column('organization_id', sa.String(100), nullable=False),
        sa.Column('role', sa.String(32), nullable=False),
        sa.Column('delegated_owner_user_id', sa.String(200), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('delegated_owner_user_id IS NULL OR delegated_owner_user_id <> user_id', name='ck_data_model_delegation_not_self'),
        sa.CheckConstraint("role <> 'deputy_data_owner' OR delegated_owner_user_id IS NOT NULL", name='ck_data_model_deputy_owner_required'),
        sa.CheckConstraint("role IN ('data_owner', 'deputy_data_owner', 'data_steward')", name='ck_data_model_role'),
        sa.ForeignKeyConstraint(['delegated_owner_user_id'], ['demo_users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['demo_users.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['administrative_organizations.id'], ondelete='RESTRICT'),
        sa.UniqueConstraint('user_id', 'organization_id', 'role', name='uq_data_model_role_scope'),
    )
    op.create_index('ix_data_model_role_scope', 'data_model_role_assignments', ['department_code', 'organization_id', 'role'])

    op.create_table(
        'i14y_concepts',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('identifiers', sa.JSON(), nullable=False),
        sa.Column('legacy_identifier', sa.String(500), nullable=True),
        sa.Column('name', sa.JSON(), nullable=False),
        sa.Column('description', sa.JSON(), nullable=False),
        sa.Column('concept_type', sa.String(32), nullable=False),
        sa.Column('publisher', sa.JSON(), nullable=False),
        sa.Column('publisher_identifier', sa.String(255), nullable=True),
        sa.Column('version', sa.String(100), nullable=True),
        sa.Column('publication_level', sa.String(32), nullable=True),
        sa.Column('publication_level_proposal', sa.String(32), nullable=True),
        sa.Column('registration_status', sa.String(32), nullable=True),
        sa.Column('registration_status_proposal', sa.String(32), nullable=True),
        sa.Column('themes', sa.JSON(), nullable=False),
        sa.Column('valid_from', sa.Date(), nullable=True),
        sa.Column('valid_to', sa.Date(), nullable=True),
        sa.Column('conforms_to', sa.JSON(), nullable=False),
        sa.Column('constraints', sa.JSON(), nullable=False),
        sa.Column('code_list', sa.JSON(), nullable=False),
        sa.Column('source_system', sa.JSON(), nullable=False),
        sa.Column('system_created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('system_modified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('register_uri', sa.String(1000), nullable=True),
        sa.Column('source_url', sa.String(1000), nullable=False),
        sa.Column('payload_hash', sa.String(64), nullable=False),
        sa.Column('detail_loaded', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('raw_payload', sa.JSON(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('length(payload_hash) = 64', name='ck_i14y_concept_payload_hash'),
        sa.CheckConstraint("concept_type IN ('CodeList', 'Date', 'Numeric', 'String')", name='ck_i14y_concept_type'),
        sa.CheckConstraint("publication_level IS NULL OR publication_level IN ('Internal', 'Public')", name='ck_i14y_publication_level'),
        sa.CheckConstraint("registration_status IS NULL OR registration_status IN ('Incomplete', 'Candidate', 'Recorded', 'Qualified', 'Standard', 'PreferredStandard', 'Superseded', 'Retired')", name='ck_i14y_registration_status'),
    )
    op.create_index('ix_i14y_concept_fetched', 'i14y_concepts', ['fetched_at'])
    op.create_index('ix_i14y_concept_publisher', 'i14y_concepts', ['publisher_identifier'])
    op.create_index('ix_i14y_concept_type_status', 'i14y_concepts', ['concept_type', 'registration_status'])

    op.create_table(
        'i14y_code_list_entries',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('concept_id', sa.Uuid(), nullable=False),
        sa.Column('code', sa.String(500), nullable=False),
        sa.Column('parent_code', sa.String(500), nullable=True),
        sa.Column('name', sa.JSON(), nullable=False),
        sa.Column('description', sa.JSON(), nullable=False),
        sa.Column('annotations', sa.JSON(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('valid_from', sa.Date(), nullable=True),
        sa.Column('valid_to', sa.Date(), nullable=True),
        sa.Column('payload_hash', sa.String(64), nullable=False),
        sa.Column('raw_payload', sa.JSON(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint('length(payload_hash) = 64', name='ck_i14y_entry_payload_hash'),
        sa.ForeignKeyConstraint(['concept_id'], ['i14y_concepts.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('concept_id', 'code', name='uq_i14y_code_list_entry_code'),
    )
    op.create_index('ix_i14y_entry_concept_order', 'i14y_code_list_entries', ['concept_id', 'position'])

    op.create_table(
        'i14y_sync_runs',
        sa.Column('id', sa.Uuid(), nullable=False, primary_key=True),
        sa.Column('status', sa.String(32), nullable=False),
        sa.Column('source_url', sa.String(1000), nullable=False),
        sa.Column('triggered_by_user_id', sa.String(200), nullable=True),
        sa.Column('concepts_seen', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('concepts_upserted', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('concepts_unchanged', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('details', sa.JSON(), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('running', 'succeeded', 'partial', 'failed')", name='ck_i14y_sync_status'),
        sa.ForeignKeyConstraint(['triggered_by_user_id'], ['demo_users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_i14y_sync_started', 'i14y_sync_runs', ['started_at'])


def downgrade() -> None:
    op.drop_table('i14y_sync_runs')
    op.drop_table('i14y_code_list_entries')
    op.drop_table('i14y_concepts')
    op.drop_table('data_model_role_assignments')
