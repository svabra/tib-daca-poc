from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_uuid() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class CatalogInstance(Base):
    __tablename__ = "catalog_instances"
    __table_args__ = (
        CheckConstraint(
            "lifecycle IN ('active', 'suspended', 'retired')",
            name="ck_catalog_lifecycle",
        ),
        CheckConstraint(
            "health_status IN ('unknown', 'healthy', 'degraded', 'unreachable')",
            name="ck_catalog_health_status",
        ),
        Index("ix_catalog_instances_created", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    urn: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    organization: Mapped[str] = mapped_column(String(200), nullable=False)
    environment: Mapped[str] = mapped_column(String(40), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(500), nullable=False)
    api_version: Mapped[str] = mapped_column(String(40), nullable=False, default="v1")
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    lifecycle: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    desired_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    observed_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    health_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    health_observations: Mapped[list[HealthObservation]] = relationship(
        back_populates="catalog", cascade="all, delete-orphan"
    )


class HealthObservation(Base):
    __tablename__ = "health_observations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('healthy', 'degraded', 'unreachable')",
            name="ck_health_observation_status",
        ),
        Index("ix_health_catalog_checked", "catalog_id", "checked_at"),
        Index("ix_health_observations_created", "checked_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    catalog_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_instances.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    status_code: Mapped[int | None] = mapped_column(Integer)
    latency_ms: Mapped[float | None] = mapped_column(Float)
    message: Mapped[str | None] = mapped_column(String(500))
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    catalog: Mapped[CatalogInstance] = relationship(back_populates="health_observations")


class TrustGrant(Base):
    __tablename__ = "trust_grants"
    __table_args__ = (
        CheckConstraint("provider_id <> consumer_id", name="ck_trust_distinct_catalogs"),
        CheckConstraint(
            "state IN ('pending', 'approved', 'revoked', 'expired')",
            name="ck_trust_state",
        ),
        UniqueConstraint("provider_id", "consumer_id", name="uq_trust_direction"),
        Index("ix_trust_grants_created", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    provider_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_instances.id", ondelete="RESTRICT"), nullable=False
    )
    consumer_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_instances.id", ondelete="RESTRICT"), nullable=False
    )
    state: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    allowed_resource_types: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    product_filters: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    owner_filters: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    domain_filters: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    provider: Mapped[CatalogInstance] = relationship(foreign_keys=[provider_id])
    consumer: Mapped[CatalogInstance] = relationship(foreign_keys=[consumer_id])


class SyncConfiguration(Base):
    __tablename__ = "sync_configurations"
    __table_args__ = (
        CheckConstraint("source_id <> target_id", name="ck_sync_distinct_catalogs"),
        CheckConstraint("direction IN ('push', 'pull')", name="ck_sync_direction"),
        CheckConstraint("conflict_policy = 'origin-wins'", name="ck_sync_conflict_policy"),
        UniqueConstraint("source_id", "target_id", "name", name="uq_sync_named_route"),
        Index("ix_sync_configurations_created", "created_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_instances.id", ondelete="RESTRICT"), nullable=False
    )
    target_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_instances.id", ondelete="RESTRICT"), nullable=False
    )
    trust_grant_id: Mapped[str | None] = mapped_column(
        ForeignKey("trust_grants.id", ondelete="RESTRICT")
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    resource_scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    product_filters: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    owner_filters: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    domain_filters: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    schedule: Mapped[str] = mapped_column(String(100), nullable=False, default="manual")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    conflict_policy: Mapped[str] = mapped_column(String(20), nullable=False, default="origin-wins")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    source: Mapped[CatalogInstance] = relationship(foreign_keys=[source_id])
    target: Mapped[CatalogInstance] = relationship(foreign_keys=[target_id])
    trust_grant: Mapped[TrustGrant | None] = relationship()


class DeploymentObservation(Base):
    __tablename__ = "deployment_observations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'in-sync', 'drifted', 'failed')",
            name="ck_deployment_status",
        ),
        Index("ix_deployment_catalog_observed", "catalog_id", "observed_at"),
        Index("ix_deployment_observations_created", "observed_at", "id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    catalog_id: Mapped[str] = mapped_column(
        ForeignKey("catalog_instances.id", ondelete="CASCADE"), nullable=False
    )
    component: Mapped[str] = mapped_column(String(100), nullable=False)
    desired_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    observed_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str | None] = mapped_column(String(500))
    observed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    catalog: Mapped[CatalogInstance] = relationship()


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_occurred", "occurred_at", "id"),
        Index("ix_audit_aggregate", "aggregate_type", "aggregate_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    aggregate_type: Mapped[str] = mapped_column(String(60), nullable=False)
    aggregate_id: Mapped[str] = mapped_column(String(36), nullable=False)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    actor: Mapped[str] = mapped_column(String(200), nullable=False)
    request_id: Mapped[str] = mapped_column(String(100), nullable=False)
    details: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
