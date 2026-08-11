"""Create DiDaCa control-plane schema.

Revision ID: 20260803_0001
Revises:
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260803_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "catalog_instances",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("urn", sa.String(255), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("organization", sa.String(200), nullable=False),
        sa.Column("environment", sa.String(40), nullable=False),
        sa.Column("endpoint", sa.String(500), nullable=False),
        sa.Column("api_version", sa.String(40), nullable=False),
        sa.Column("capabilities", sa.JSON(), nullable=False),
        sa.Column("lifecycle", sa.String(20), nullable=False),
        sa.Column("desired_revision", sa.Integer(), nullable=False),
        sa.Column("observed_revision", sa.Integer(), nullable=False),
        sa.Column("health_status", sa.String(20), nullable=False),
        sa.Column("last_checked_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "lifecycle IN ('active', 'suspended', 'retired')",
            name="ck_catalog_lifecycle",
        ),
        sa.CheckConstraint(
            "health_status IN ('unknown', 'healthy', 'degraded', 'unreachable')",
            name="ck_catalog_health_status",
        ),
        sa.UniqueConstraint("urn", name="uq_catalog_instances_urn"),
    )
    op.create_index(
        "ix_catalog_instances_created",
        "catalog_instances",
        ["created_at", "id"],
    )

    op.create_table(
        "health_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "catalog_id",
            sa.String(36),
            sa.ForeignKey("catalog_instances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("status_code", sa.Integer()),
        sa.Column("latency_ms", sa.Float()),
        sa.Column("message", sa.String(500)),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('healthy', 'degraded', 'unreachable')",
            name="ck_health_observation_status",
        ),
    )
    op.create_index(
        "ix_health_catalog_checked",
        "health_observations",
        ["catalog_id", "checked_at"],
    )
    op.create_index(
        "ix_health_observations_created",
        "health_observations",
        ["checked_at", "id"],
    )

    op.create_table(
        "trust_grants",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "provider_id",
            sa.String(36),
            sa.ForeignKey("catalog_instances.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "consumer_id",
            sa.String(36),
            sa.ForeignKey("catalog_instances.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("state", sa.String(20), nullable=False),
        sa.Column("valid_from", sa.DateTime(timezone=True)),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("allowed_resource_types", sa.JSON(), nullable=False),
        sa.Column("product_filters", sa.JSON(), nullable=False),
        sa.Column("owner_filters", sa.JSON(), nullable=False),
        sa.Column("domain_filters", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("provider_id <> consumer_id", name="ck_trust_distinct_catalogs"),
        sa.CheckConstraint(
            "state IN ('pending', 'approved', 'revoked', 'expired')",
            name="ck_trust_state",
        ),
        sa.UniqueConstraint("provider_id", "consumer_id", name="uq_trust_direction"),
    )
    op.create_index("ix_trust_grants_created", "trust_grants", ["created_at", "id"])

    op.create_table(
        "sync_configurations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "source_id",
            sa.String(36),
            sa.ForeignKey("catalog_instances.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "target_id",
            sa.String(36),
            sa.ForeignKey("catalog_instances.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "trust_grant_id",
            sa.String(36),
            sa.ForeignKey("trust_grants.id", ondelete="RESTRICT"),
        ),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("resource_scopes", sa.JSON(), nullable=False),
        sa.Column("product_filters", sa.JSON(), nullable=False),
        sa.Column("owner_filters", sa.JSON(), nullable=False),
        sa.Column("domain_filters", sa.JSON(), nullable=False),
        sa.Column("schedule", sa.String(100), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("conflict_policy", sa.String(20), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("source_id <> target_id", name="ck_sync_distinct_catalogs"),
        sa.CheckConstraint("direction IN ('push', 'pull')", name="ck_sync_direction"),
        sa.CheckConstraint("conflict_policy = 'origin-wins'", name="ck_sync_conflict_policy"),
        sa.UniqueConstraint("source_id", "target_id", "name", name="uq_sync_named_route"),
    )
    op.create_index(
        "ix_sync_configurations_created",
        "sync_configurations",
        ["created_at", "id"],
    )

    op.create_table(
        "deployment_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "catalog_id",
            sa.String(36),
            sa.ForeignKey("catalog_instances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("component", sa.String(100), nullable=False),
        sa.Column("desired_revision", sa.Integer(), nullable=False),
        sa.Column("observed_revision", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("message", sa.String(500)),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "status IN ('pending', 'in-sync', 'drifted', 'failed')",
            name="ck_deployment_status",
        ),
    )
    op.create_index(
        "ix_deployment_catalog_observed",
        "deployment_observations",
        ["catalog_id", "observed_at"],
    )
    op.create_index(
        "ix_deployment_observations_created",
        "deployment_observations",
        ["observed_at", "id"],
    )

    op.create_table(
        "audit_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("aggregate_type", sa.String(60), nullable=False),
        sa.Column("aggregate_id", sa.String(36), nullable=False),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("actor", sa.String(200), nullable=False),
        sa.Column("request_id", sa.String(100), nullable=False),
        sa.Column("details", sa.JSON(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_audit_events_occurred", "audit_events", ["occurred_at", "id"])
    op.create_index("ix_audit_aggregate", "audit_events", ["aggregate_type", "aggregate_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_aggregate", table_name="audit_events")
    op.drop_index("ix_audit_events_occurred", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index(
        "ix_deployment_observations_created",
        table_name="deployment_observations",
    )
    op.drop_index("ix_deployment_catalog_observed", table_name="deployment_observations")
    op.drop_table("deployment_observations")
    op.drop_index("ix_sync_configurations_created", table_name="sync_configurations")
    op.drop_table("sync_configurations")
    op.drop_index("ix_trust_grants_created", table_name="trust_grants")
    op.drop_table("trust_grants")
    op.drop_index("ix_health_observations_created", table_name="health_observations")
    op.drop_index("ix_health_catalog_checked", table_name="health_observations")
    op.drop_table("health_observations")
    op.drop_index("ix_catalog_instances_created", table_name="catalog_instances")
    op.drop_table("catalog_instances")
