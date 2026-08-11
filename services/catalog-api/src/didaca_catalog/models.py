from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class DataProduct(Base):
    __tablename__ = "data_products"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('draft', 'active', 'deprecated', 'retired')", name="ck_product_lifecycle"),
        CheckConstraint("classification IN ('public', 'internal', 'confidential', 'restricted')", name="ck_product_classification"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    origin_catalog: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active_policy_revision: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    owner: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(255), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False)
    classification: Mapped[str] = mapped_column(String(32), nullable=False)
    keywords: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    contact: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    license: Mapped[str | None] = mapped_column(String(255))
    quality: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    update_frequency: Mapped[str | None] = mapped_column(String(100))
    extra_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    endpoints: Mapped[list[Endpoint]] = relationship(back_populates="data_product", cascade="all, delete-orphan")
    provenance_events: Mapped[list[ProvenanceEvent]] = relationship(back_populates="data_product", cascade="all, delete-orphan")
    policy_revisions: Mapped[list[PolicyRevision]] = relationship(back_populates="data_product", cascade="all, delete-orphan")
    access_requests: Mapped[list[AccessRequest]] = relationship(back_populates="data_product", cascade="all, delete-orphan")


class Endpoint(Base):
    __tablename__ = "endpoints"
    __table_args__ = (
        CheckConstraint("protocol IN ('http-rest', 'postgresql')", name="ck_endpoint_protocol"),
        Index("ix_endpoints_data_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    connection: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    secret_ref: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    data_product: Mapped[DataProduct] = relationship(back_populates="endpoints")


class LineageEdge(Base):
    __tablename__ = "lineage_edges"
    __table_args__ = (
        CheckConstraint("state IN ('active', 'inferred', 'deprecated')", name="ck_lineage_state"),
        Index("ix_lineage_source", "source_urn"),
        Index("ix_lineage_target", "target_urn"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    source_urn: Mapped[str] = mapped_column(String(255), nullable=False)
    target_urn: Mapped[str] = mapped_column(String(255), nullable=False)
    relation_type: Mapped[str] = mapped_column(String(100), nullable=False)
    transformation: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class ProvenanceEvent(Base):
    __tablename__ = "provenance_events"
    __table_args__ = (
        UniqueConstraint("data_product_id", "sequence", name="uq_provenance_product_sequence"),
        Index("ix_provenance_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    data_product: Mapped[DataProduct] = relationship(back_populates="provenance_events")


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (Index("ix_audit_resource", "resource_type", "resource_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    actor: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class AccessRequest(Base):
    __tablename__ = "access_requests"
    __table_args__ = (
        CheckConstraint("consumer_type IN ('person', 'machine')", name="ck_access_request_consumer_type"),
        CheckConstraint(
            "requested_protocol IN ('http', 'postgresql', 'both')",
            name="ck_access_request_protocol",
        ),
        CheckConstraint(
            "requested_variant IN ('original', 'modified', 'either')",
            name="ck_access_request_variant",
        ),
        CheckConstraint(
            "status IN ('submitted', 'identity_review', 'legal_review', 'conditions_review', "
            "'granted_modified', 'granted_original', 'rejected', 'withdrawn')",
            name="ck_access_request_status",
        ),
        CheckConstraint("valid_until >= valid_from", name="ck_access_request_dates"),
        Index("ix_access_request_product", "data_product_id"),
        Index("ix_access_request_requester", "requester_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    request_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    requester_id: Mapped[str] = mapped_column(String(200), nullable=False)
    requester_name: Mapped[str] = mapped_column(String(255), nullable=False)
    requester_organization: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(320), nullable=False)
    consumer_type: Mapped[str] = mapped_column(String(32), nullable=False)
    machine_id: Mapped[str | None] = mapped_column(String(255))
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    legal_basis: Mapped[str] = mapped_column(Text, nullable=False)
    requested_protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    requested_variant: Mapped[str] = mapped_column(String(32), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    data_product: Mapped[DataProduct] = relationship(back_populates="access_requests")


class PolicyRevision(Base):
    __tablename__ = "policy_revisions"
    __table_args__ = (
        UniqueConstraint("data_product_id", "revision", name="uq_policy_product_revision"),
        CheckConstraint("status IN ('draft', 'published', 'revoked')", name="ck_policy_status"),
        Index("ix_policy_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    generated_rego: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    data_product: Mapped[DataProduct] = relationship(back_populates="policy_revisions")
    deployments: Mapped[list[PolicyDeployment]] = relationship(back_populates="policy_revision", cascade="all, delete-orphan")


class PolicyDeployment(Base):
    __tablename__ = "policy_deployments"
    __table_args__ = (
        UniqueConstraint("policy_revision_id", "target", name="uq_policy_deployment_target"),
        CheckConstraint("target IN ('opa', 'postgresql')", name="ck_deployment_target"),
        CheckConstraint("state IN ('pending', 'deployed', 'failed')", name="ck_deployment_state"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    policy_revision_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("policy_revisions.id", ondelete="CASCADE"), nullable=False)
    target: Mapped[str] = mapped_column(String(32), nullable=False)
    desired_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    observed_revision: Mapped[int | None] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    policy_revision: Mapped[PolicyRevision] = relationship(back_populates="deployments")


class SeedMarker(Base):
    __tablename__ = "seed_markers"

    name: Mapped[str] = mapped_column(String(100), primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
