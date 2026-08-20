from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
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
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class DataProduct(Base):
    __tablename__ = "data_products"
    __table_args__ = (
        CheckConstraint(
            "lifecycle IN ('draft', 'active', 'deprecated', 'retired')", name="ck_product_lifecycle"
        ),
        CheckConstraint(
            "classification IN ('public', 'internal', 'confidential', 'restricted')",
            name="ck_product_classification",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    origin_catalog: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active_policy_revision: Mapped[int | None] = mapped_column(Integer)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("demo_users.id"))
    control_person_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="SET NULL")
    )
    discoverable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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
    extra_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, nullable=False, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    endpoints: Mapped[list[Endpoint]] = relationship(
        back_populates="data_product", cascade="all, delete-orphan"
    )
    provenance_events: Mapped[list[ProvenanceEvent]] = relationship(
        back_populates="data_product",
        passive_deletes=True,
    )
    policy_revisions: Mapped[list[PolicyRevision]] = relationship(
        back_populates="data_product", cascade="all, delete-orphan"
    )
    access_requests: Mapped[list[AccessRequest]] = relationship(
        back_populates="data_product", cascade="all, delete-orphan"
    )
    service_level_revisions: Mapped[list[ServiceLevelRevision]] = relationship(
        back_populates="data_product",
        cascade="all, delete-orphan",
        foreign_keys="ServiceLevelRevision.data_product_id",
    )


class Endpoint(Base):
    __tablename__ = "endpoints"
    __table_args__ = (
        CheckConstraint("protocol IN ('http-rest', 'postgresql')", name="ck_endpoint_protocol"),
        Index("ix_endpoints_data_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False)
    connection: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    secret_ref: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

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
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class ProvenanceEvent(Base):
    __tablename__ = "provenance_events"
    __table_args__ = (
        UniqueConstraint("data_product_id", "sequence", name="uq_provenance_product_sequence"),
        Index("ix_provenance_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("data_products.id", ondelete="SET NULL"), nullable=True
    )
    product_urn: Mapped[str] = mapped_column(String(255), nullable=False)
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
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class AccessRequest(Base):
    __tablename__ = "access_requests"
    __table_args__ = (
        CheckConstraint(
            "consumer_type IN ('person', 'machine')", name="ck_access_request_consumer_type"
        ),
        CheckConstraint(
            "requested_protocol IN ('http', 'postgresql', 'both')",
            name="ck_access_request_protocol",
        ),
        CheckConstraint(
            "requested_variant IN ('original', 'modified', 'either')",
            name="ck_access_request_variant",
        ),
        CheckConstraint(
            "status IN ('submitted', 'identity_review', 'legal_review', 'conditions_review', 'approved_policy_pending', "
            "'granted_modified', 'granted_original', 'rejected', 'withdrawn')",
            name="ck_access_request_status",
        ),
        CheckConstraint("valid_until >= valid_from", name="ck_access_request_dates"),
        CheckConstraint(
            "fulfillment_subject_type IS NULL OR fulfillment_subject_type IN ('person', 'machine', 'group')",
            name="ck_access_request_fulfillment_subject_type",
        ),
        CheckConstraint(
            "granted_variant IS NULL OR granted_variant IN ('original', 'modified')",
            name="ck_access_request_granted_variant",
        ),
        CheckConstraint(
            "request_kind IN ('initial', 'renewal')",
            name="ck_access_request_kind",
        ),
        CheckConstraint(
            "(request_kind = 'initial' AND renewal_of_request_id IS NULL AND renewal_context IS NULL) "
            "OR (request_kind = 'renewal' AND renewal_of_request_id IS NOT NULL "
            "AND renewal_context IS NOT NULL)",
            name="ck_access_request_renewal_context",
        ),
        Index("ix_access_request_product", "data_product_id"),
        Index("ix_access_request_requester", "requester_id"),
        Index("ix_access_request_decision_policy", "decision_policy_revision_id"),
        Index("ix_access_request_renewal_of", "renewal_of_request_id"),
        Index(
            "uq_access_request_open_renewal",
            "renewal_of_request_id",
            unique=True,
            postgresql_where=text(
                "request_kind = 'renewal' AND status IN "
                "('submitted', 'identity_review', 'legal_review', 'conditions_review', "
                "'approved_policy_pending')"
            ),
            sqlite_where=text(
                "request_kind = 'renewal' AND status IN "
                "('submitted', 'identity_review', 'legal_review', 'conditions_review', "
                "'approved_policy_pending')"
            ),
        ),
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
    fulfillment_subject_type: Mapped[str | None] = mapped_column(String(32))
    fulfillment_subject_id: Mapped[str | None] = mapped_column(String(255))
    fulfillment_group_revision: Mapped[int | None] = mapped_column(Integer)
    decision_policy_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("policy_revisions.id", ondelete="SET NULL")
    )
    granted_variant: Mapped[str | None] = mapped_column(String(32))
    request_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="initial")
    renewal_of_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("access_requests.id", ondelete="CASCADE")
    )
    renewal_context: Mapped[dict[str, Any] | None] = mapped_column(JSON(none_as_null=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
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
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    generated_rego: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    data_product: Mapped[DataProduct] = relationship(back_populates="policy_revisions")
    deployments: Mapped[list[PolicyDeployment]] = relationship(
        back_populates="policy_revision", cascade="all, delete-orphan"
    )


class PolicyDeployment(Base):
    __tablename__ = "policy_deployments"
    __table_args__ = (
        UniqueConstraint("policy_revision_id", "target", name="uq_policy_deployment_target"),
        CheckConstraint("target IN ('opa', 'postgresql')", name="ck_deployment_target"),
        CheckConstraint("state IN ('pending', 'deployed', 'failed')", name="ck_deployment_state"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    policy_revision_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policy_revisions.id", ondelete="CASCADE"), nullable=False
    )
    target: Mapped[str] = mapped_column(String(32), nullable=False)
    desired_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    observed_revision: Mapped[int | None] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    error: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    policy_revision: Mapped[PolicyRevision] = relationship(back_populates="deployments")


class SeedMarker(Base):
    __tablename__ = "seed_markers"

    name: Mapped[str] = mapped_column(String(100), primary_key=True)
    applied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class DemoUser(Base):
    __tablename__ = "demo_users"

    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(100))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    roles: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    supervisor_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="SET NULL")
    )
    selectable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class AdministrativeOrganization(Base):
    __tablename__ = "administrative_organizations"
    __table_args__ = (
        CheckConstraint(
            "organization_type IN ('federal_council', 'chancellery', 'department', 'office', 'affiliated')",
            name="ck_administrative_organization_type",
        ),
        UniqueConstraint(
            "department_code", "office_code", name="uq_administrative_organization_codes"
        ),
        Index("ix_administrative_organization_sort", "department_order", "office_order"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    department_code: Mapped[str] = mapped_column(String(20), nullable=False)
    office_code: Mapped[str | None] = mapped_column(String(40))
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_type: Mapped[str] = mapped_column(String(32), nullable=False)
    department_order: Mapped[int] = mapped_column(Integer, nullable=False)
    office_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class IdentityDirectoryEntry(Base):
    __tablename__ = "identity_directory_entries"
    __table_args__ = (
        CheckConstraint(
            "source IN ('federal', 'cantonal', 'municipal', 'federal_related')",
            name="ck_identity_directory_source",
        ),
        Index("ix_identity_directory_source_name", "source", "display_name"),
        Index("ix_identity_directory_organization", "organization"),
    )

    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="SET NULL")
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    source_system: Mapped[str] = mapped_column(String(100), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class IdentityGroup(Base):
    __tablename__ = "identity_groups"
    __table_args__ = (
        CheckConstraint(
            "source IN ('federal', 'cantonal', 'municipal', 'federal_related')",
            name="ck_identity_group_source",
        ),
        Index("ix_identity_group_source_label", "source", "label"),
    )

    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="SET NULL")
    )
    owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="CASCADE")
    )
    system_managed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    membership_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class IdentityGroupMembership(Base):
    __tablename__ = "identity_group_memberships"
    __table_args__ = (
        CheckConstraint(
            "valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from",
            name="ck_identity_group_membership_dates",
        ),
        Index("ix_identity_group_membership_identity", "identity_id"),
    )

    group_id: Mapped[str] = mapped_column(
        ForeignKey("identity_groups.id", ondelete="CASCADE"), primary_key=True
    )
    identity_id: Mapped[str] = mapped_column(
        ForeignKey("identity_directory_entries.id", ondelete="CASCADE"), primary_key=True
    )
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_until: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PocProductFixture(Base):
    __tablename__ = "poc_product_fixtures"

    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    source_product_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    maturity_level: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class MetadataPublication(Base):
    __tablename__ = "metadata_publications"
    __table_args__ = (
        UniqueConstraint(
            "source_system", "source_product_id", name="uq_metadata_publication_source"
        ),
        Index("ix_metadata_publication_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    source_system: Mapped[str] = mapped_column(String(100), nullable=False)
    source_product_id: Mapped[str] = mapped_column(String(255), nullable=False)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    publication_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    discoverable_explicit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    normalized_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    state: Mapped[str] = mapped_column(String(32), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class GovernanceSubmission(Base):
    """Immutable review evidence plus the mutable decision/deployment state."""

    __tablename__ = "governance_submissions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending_approval', 'approved_deploying', 'approved', "
            "'rejected', 'deployment_failed')",
            name="ck_governance_submission_status",
        ),
        CheckConstraint(
            "decision IS NULL OR decision IN ('approve', 'reject')",
            name="ck_governance_submission_decision",
        ),
        UniqueConstraint("policy_revision_id", name="uq_governance_submission_policy"),
        Index("ix_governance_submission_product", "data_product_id", "submitted_at"),
        Index("ix_governance_submission_approver", "approver_user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    policy_revision_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("policy_revisions.id", ondelete="RESTRICT"), nullable=False
    )
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    approver_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending_approval")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    review_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    archive_evidence: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    decision: Mapped[str | None] = mapped_column(String(16))
    decision_comment: Mapped[str | None] = mapped_column(Text)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ServiceLevelRevision(Base):
    """Versioned product SLA whose published business payload is immutable."""

    __tablename__ = "service_level_revisions"
    __table_args__ = (
        UniqueConstraint("data_product_id", "revision", name="uq_service_level_product_revision"),
        CheckConstraint(
            "status IN ('draft', 'pending_approval', 'published', 'rejected', 'withdrawn')",
            name="ck_service_level_status",
        ),
        CheckConstraint(
            "valid_until IS NULL OR valid_until >= valid_from",
            name="ck_service_level_validity",
        ),
        CheckConstraint(
            "control_person_user_id IS NULL OR control_person_user_id <> created_by_owner_user_id",
            name="ck_service_level_four_eyes",
        ),
        CheckConstraint(
            "decision IS NULL OR decision IN ('approve', 'reject')",
            name="ck_service_level_decision",
        ),
        Index("ix_service_level_product", "data_product_id", "revision"),
        Index(
            "uq_service_level_single_open_workflow",
            "data_product_id",
            unique=True,
            postgresql_where=text("status IN ('draft', 'pending_approval')"),
            sqlite_where=text("status IN ('draft', 'pending_approval')"),
        ),
        Index(
            "ix_service_level_controller",
            "control_person_user_id",
            "status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    definition: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_by_owner_user_id: Mapped[str] = mapped_column(
        ForeignKey("demo_users.id"), nullable=False
    )
    updated_by_owner_user_id: Mapped[str] = mapped_column(
        ForeignKey("demo_users.id"), nullable=False
    )
    control_person_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="SET NULL")
    )
    control_person_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    product_revision_at_submission: Mapped[int | None] = mapped_column(Integer)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision: Mapped[str | None] = mapped_column(String(16))
    decided_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("demo_users.id"))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    supersedes_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_level_revisions.id", ondelete="SET NULL")
    )
    superseded_by_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_level_revisions.id", ondelete="SET NULL")
    )
    superseded_from: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    data_product: Mapped[DataProduct] = relationship(
        back_populates="service_level_revisions",
        foreign_keys=[data_product_id],
    )


class MetadataDeliveryOutbox(Base):
    __tablename__ = "metadata_delivery_outbox"
    __table_args__ = (
        CheckConstraint("channel IN ('i14y')", name="ck_metadata_delivery_channel"),
        CheckConstraint(
            "status IN ('scheduled', 'simulated_delivered')",
            name="ck_metadata_delivery_status",
        ),
        CheckConstraint("valid_until >= valid_from", name="ck_metadata_delivery_dates"),
        UniqueConstraint(
            "data_product_id",
            "product_revision",
            "channel",
            name="uq_metadata_delivery_product_revision_channel",
        ),
        Index("ix_metadata_delivery_status", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    product_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    policy_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    channel: Mapped[str] = mapped_column(String(32), nullable=False, default="i14y")
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DataProductField(Base):
    __tablename__ = "data_product_fields"
    __table_args__ = (
        UniqueConstraint("data_product_id", "name", name="uq_data_product_field_name"),
        Index("ix_data_product_field_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    data_type: Mapped[str] = mapped_column(String(100), nullable=False)
    nullable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    key_field: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    business_description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ProductQualityAssessment(Base):
    __tablename__ = "product_quality_assessments"

    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), primary_key=True
    )
    access_management_defined: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    discoverability_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    technical_metadata_complete: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    business_metadata_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    graph_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ontology_embedded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    dcat_reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    medal: Mapped[str] = mapped_column(String(32), nullable=False, default="bronze")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class ProductContextGraph(Base):
    __tablename__ = "product_context_graphs"

    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), primary_key=True
    )
    graph: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="suggested")
    confirmed_by: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class CanonicalOntologyVersion(Base):
    __tablename__ = "canonical_ontology_versions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    uri: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class CanonicalOntologyTerm(Base):
    __tablename__ = "canonical_ontology_terms"
    __table_args__ = (Index("ix_ontology_term_version", "ontology_version_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    ontology_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_ontology_versions.id"), nullable=False
    )
    uri: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)


class OntologyTermAlignment(Base):
    __tablename__ = "ontology_term_alignments"
    __table_args__ = (UniqueConstraint("term_id", "target_uri", name="uq_ontology_term_alignment"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_ontology_terms.id", ondelete="CASCADE"), nullable=False
    )
    target_uri: Mapped[str] = mapped_column(String(1000), nullable=False)
    relation: Mapped[str] = mapped_column(String(32), nullable=False)


class ProductSemanticMapping(Base):
    __tablename__ = "product_semantic_mappings"
    __table_args__ = (Index("ix_semantic_mapping_product", "data_product_id"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    data_product_field_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("data_product_fields.id", ondelete="CASCADE")
    )
    ontology_term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("canonical_ontology_terms.id"), nullable=False
    )
    mapping_type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="suggested")
    confirmed_by: Mapped[str | None] = mapped_column(String(200))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class WorkflowTask(Base):
    __tablename__ = "workflow_tasks"
    __table_args__ = (
        Index("ix_workflow_task_assignee", "assignee_user_id", "status"),
        Index("ix_workflow_task_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    assignee_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False
    )
    access_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("access_requests.id", ondelete="CASCADE")
    )
    simulation_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("poc_simulation_events.id", ondelete="SET NULL")
    )
    governance_submission_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("governance_submissions.id", ondelete="CASCADE")
    )
    service_level_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("service_level_revisions.id", ondelete="CASCADE")
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    detail: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PocSimulationEvent(Base):
    """Append-only evidence for synthetic PoC actions and their resets."""

    __tablename__ = "poc_simulation_events"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('product_submitted', 'quality_below_threshold', "
            "'not_discoverable', 'isbo_restricted')",
            name="ck_poc_simulation_event_type",
        ),
        CheckConstraint(
            "operation IN ('trigger', 'reset', 'product_reset')",
            name="ck_poc_simulation_operation",
        ),
        UniqueConstraint("trigger_event_id", "operation", name="uq_poc_simulation_reset"),
        Index("ix_poc_simulation_product", "product_id", "created_at"),
        Index("ix_poc_simulation_actor", "actor_user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    product_urn: Mapped[str] = mapped_column(String(255), nullable=False)
    fixture_id: Mapped[str | None] = mapped_column(String(200))
    actor_user_id: Mapped[str] = mapped_column(String(200), nullable=False)
    trigger_event_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("poc_simulation_events.id", ondelete="RESTRICT")
    )
    confirmation_name: Mapped[str | None] = mapped_column(String(255))
    before_state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    after_state: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
