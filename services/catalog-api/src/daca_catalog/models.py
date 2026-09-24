from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
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
        CheckConstraint(
            "deputy_owner_user_id IS NULL OR owner_user_id IS NULL "
            "OR deputy_owner_user_id <> owner_user_id",
            name="ck_product_deputy_not_owner",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    origin_catalog: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    active_policy_revision: Mapped[int | None] = mapped_column(Integer)
    owner_user_id: Mapped[str | None] = mapped_column(ForeignKey("demo_users.id"))
    deputy_owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="SET NULL")
    )
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
    domain_assignments: Mapped[list[DataProductDomain]] = relationship(
        back_populates="data_product", cascade="all, delete-orphan"
    )
    glossary_term_assignments: Mapped[list[DataProductGlossaryTerm]] = relationship(
        back_populates="data_product", cascade="all, delete-orphan"
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
    preferences: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
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
        Index("ix_administrative_org_parent", "parent_id", "active"),
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="RESTRICT")
    )
    source_id: Mapped[str | None] = mapped_column(String(100), unique=True)
    source_uri: Mapped[str | None] = mapped_column(String(1000))
    department_code: Mapped[str] = mapped_column(String(20), nullable=False)
    office_code: Mapped[str | None] = mapped_column(String(40))
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    organization_type: Mapped[str] = mapped_column(String(32), nullable=False)
    department_order: Mapped[int] = mapped_column(Integer, nullable=False)
    office_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_hash: Mapped[str | None] = mapped_column(String(64))
    import_run_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("federal_organization_import_runs.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class FederalOrganizationImportRun(Base):
    __tablename__ = "federal_organization_import_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    snapshot_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    node_count: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    error_detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class AdministrativeOrganizationLabel(Base):
    __tablename__ = "administrative_organization_labels"

    organization_id: Mapped[str] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="CASCADE"), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(8), primary_key=True)
    label: Mapped[str] = mapped_column(String(500), nullable=False)
    short_label: Mapped[str | None] = mapped_column(String(120))


class FederalPersonMembership(Base):
    __tablename__ = "federal_person_memberships"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "organization_id", "valid_from", name="uq_federal_person_membership_period"
        ),
        Index("ix_federal_person_membership_org", "organization_id", "valid_to"),
        Index(
            "uq_federal_person_primary_active",
            "user_id",
            unique=True,
            postgresql_where=text("is_primary = true AND valid_to IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="RESTRICT"), nullable=False
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


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


class SourceCatalogEntry(Base):
    """Discoverable connection metadata; never contains credentials or network endpoints."""

    __tablename__ = "source_catalog_entries"
    __table_args__ = (
        CheckConstraint("source_type IN ('oracle')", name="ck_source_catalog_type"),
        Index("ix_source_catalog_type_name", "source_type", "database_name"),
        Index("ix_source_catalog_owner", "owner_user_id"),
    )

    id: Mapped[str] = mapped_column(String(200), primary_key=True)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    database_name: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    organization: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    sites: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    search_objects: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    discoverability_group_ids: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    mock_profile: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class SourceAccessRequest(Base):
    __tablename__ = "source_access_requests"
    __table_args__ = (
        CheckConstraint("subject_type IN ('person', 'group')", name="ck_source_request_subject"),
        CheckConstraint(
            "status IN ('submitted', 'approved', 'rejected')",
            name="ck_source_request_status",
        ),
        CheckConstraint(
            "valid_until IS NULL OR valid_until >= valid_from",
            name="ck_source_request_dates",
        ),
        UniqueConstraint(
            "requester_id", "client_request_id", name="uq_source_request_client"
        ),
        Index("ix_source_request_requester", "requester_id", "created_at"),
        Index("ix_source_request_owner", "owner_user_id", "status"),
        Index("ix_source_request_source", "source_id"),
        Index(
            "uq_source_request_open_subject",
            "source_id",
            "subject_type",
            "subject_id",
            unique=True,
            sqlite_where=text("status = 'submitted'"),
            postgresql_where=text("status = 'submitted'"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    request_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    client_request_id: Mapped[str] = mapped_column(String(128), nullable=False)
    source_id: Mapped[str] = mapped_column(
        ForeignKey("source_catalog_entries.id", ondelete="CASCADE"), nullable=False
    )
    requester_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    requester_name: Mapped[str] = mapped_column(String(255), nullable=False)
    requester_organization: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    request_title: Mapped[str] = mapped_column(String(255), nullable=False)
    subject_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(200), nullable=False)
    subject_label: Mapped[str] = mapped_column(String(255), nullable=False)
    group_revision: Mapped[int | None] = mapped_column(Integer)
    group_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    purpose: Mapped[str] = mapped_column(Text, nullable=False)
    legal_basis: Mapped[str] = mapped_column(Text, nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    conditions_accepted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    decision_by: Mapped[str | None] = mapped_column(String(200))
    decision_comment: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class SourceAccessGrant(Base):
    __tablename__ = "source_access_grants"
    __table_args__ = (
        CheckConstraint("subject_type IN ('person', 'group')", name="ck_source_grant_subject"),
        CheckConstraint(
            "valid_until IS NULL OR valid_until >= valid_from",
            name="ck_source_grant_dates",
        ),
        Index("ix_source_grant_subject", "subject_type", "subject_id"),
        Index("ix_source_grant_source", "source_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    source_access_request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("source_access_requests.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    source_id: Mapped[str] = mapped_column(
        ForeignKey("source_catalog_entries.id", ondelete="CASCADE"), nullable=False
    )
    subject_type: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(200), nullable=False)
    subject_label: Mapped[str] = mapped_column(String(255), nullable=False)
    group_revision: Mapped[int | None] = mapped_column(Integer)
    group_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    granted_by: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class Domain(Base):
    __tablename__ = "domains"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_domain_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_domain_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_domain_content_hash"),
        CheckConstraint(
            "owner_user_id <> deputy_owner_user_id", name="ck_domain_deputy_not_owner"
        ),
        Index("ix_domain_lifecycle", "lifecycle"),
        Index("ix_domain_owner", "owner_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    deputy_owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    localizations: Mapped[list[DomainLocalization]] = relationship(
        back_populates="domain", cascade="all, delete-orphan"
    )
    product_assignments: Mapped[list[DataProductDomain]] = relationship(
        back_populates="domain", cascade="all, delete-orphan"
    )
    term_assignments: Mapped[list[GlossaryTermDomain]] = relationship(
        back_populates="domain", cascade="all, delete-orphan"
    )


class DomainLocalization(Base):
    __tablename__ = "domain_localizations"
    __table_args__ = (Index("ix_domain_localization_label", "language", "normalized_label"),)

    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="CASCADE"), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(35), primary_key=True)
    preferred_label: Mapped[str] = mapped_column(String(255), nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_label: Mapped[str] = mapped_column(String(255), nullable=False)

    domain: Mapped[Domain] = relationship(back_populates="localizations")


class DataProductDomain(Base):
    __tablename__ = "data_product_domains"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_data_product_domain_position"),
        Index("ix_data_product_domain_domain", "domain_id"),
    )

    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="RESTRICT"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assigned_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("demo_users.id"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    data_product: Mapped[DataProduct] = relationship(back_populates="domain_assignments")
    domain: Mapped[Domain] = relationship(back_populates="product_assignments")


class DomainChangeRequest(Base):
    __tablename__ = "domain_change_requests"
    __table_args__ = (
        CheckConstraint(
            "operation IN ('create', 'update', 'retire')", name="ck_domain_request_operation"
        ),
        CheckConstraint(
            "status IN ('submitted', 'approved', 'rejected', 'stale')",
            name="ck_domain_request_status",
        ),
        CheckConstraint(
            "(operation = 'create' AND base_revision IS NULL) "
            "OR (operation IN ('update', 'retire') AND target_domain_id IS NOT NULL "
            "AND base_revision IS NOT NULL)",
            name="ck_domain_request_target",
        ),
        CheckConstraint("revision >= 1", name="ck_domain_request_revision"),
        Index("ix_domain_request_requester", "requester_user_id", "status"),
        Index("ix_domain_request_target", "target_domain_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    request_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    target_domain_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("domains.id", ondelete="RESTRICT")
    )
    base_revision: Mapped[int | None] = mapped_column(Integer)
    requester_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    requested_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    review_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reviewer_user_id: Mapped[str | None] = mapped_column(ForeignKey("demo_users.id"))
    decision_comment: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class SiteGlossaryTerm(Base):
    """DaCa interface vocabulary, independent of governed business terminology."""

    __tablename__ = "site_glossary_terms"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_site_glossary_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_site_glossary_revision"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    abbreviation: Mapped[str | None] = mapped_column(String(80))
    is_termdat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    localizations: Mapped[list[SiteGlossaryLocalization]] = relationship(
        back_populates="term", cascade="all, delete-orphan"
    )


class SiteGlossaryLocalization(Base):
    __tablename__ = "site_glossary_localizations"
    __table_args__ = (Index("ix_site_glossary_label", "language", "normalized_label"),)

    term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("site_glossary_terms.id", ondelete="CASCADE"), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(35), primary_key=True)
    preferred_label: Mapped[str] = mapped_column(String(255), nullable=False)
    short_description: Mapped[str] = mapped_column(Text, nullable=False)
    detailed_description: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_label: Mapped[str] = mapped_column(String(255), nullable=False)

    term: Mapped[SiteGlossaryTerm] = relationship(back_populates="localizations")


class GlossaryTerm(Base):
    __tablename__ = "glossary_terms"
    __table_args__ = (
        CheckConstraint(
            "lifecycle IN ('active', 'retired')", name="ck_glossary_term_lifecycle"
        ),
        CheckConstraint("revision >= 1", name="ck_glossary_term_revision"),
        CheckConstraint(
            "length(content_hash) = 64", name="ck_glossary_term_content_hash"
        ),
        Index("ix_glossary_term_lifecycle", "lifecycle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    abbreviation: Mapped[str | None] = mapped_column(String(80))
    is_termdat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    localizations: Mapped[list[GlossaryTermLocalization]] = relationship(
        back_populates="term", cascade="all, delete-orphan"
    )
    domain_assignments: Mapped[list[GlossaryTermDomain]] = relationship(
        back_populates="term", cascade="all, delete-orphan"
    )
    product_assignments: Mapped[list[DataProductGlossaryTerm]] = relationship(
        back_populates="term", cascade="all, delete-orphan"
    )
    outgoing_relations: Mapped[list[GlossaryTermRelation]] = relationship(
        back_populates="source_term",
        cascade="all, delete-orphan",
        foreign_keys="GlossaryTermRelation.source_term_id",
    )


class GlossaryTermLocalization(Base):
    __tablename__ = "glossary_term_localizations"
    __table_args__ = (Index("ix_glossary_localization_label", "language", "normalized_label"),)

    term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("glossary_terms.id", ondelete="CASCADE"), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(35), primary_key=True)
    preferred_label: Mapped[str] = mapped_column(String(255), nullable=False)
    alternative_labels: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    short_description: Mapped[str | None] = mapped_column(Text)
    detailed_description: Mapped[str | None] = mapped_column(Text)
    normalized_label: Mapped[str] = mapped_column(String(255), nullable=False)

    term: Mapped[GlossaryTerm] = relationship(back_populates="localizations")


class GlossaryTermDomain(Base):
    __tablename__ = "glossary_term_domains"
    __table_args__ = (Index("ix_glossary_term_domain_domain", "domain_id"),)

    term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("glossary_terms.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="RESTRICT"), primary_key=True
    )

    term: Mapped[GlossaryTerm] = relationship(back_populates="domain_assignments")
    domain: Mapped[Domain] = relationship(back_populates="term_assignments")


class GlossaryTermRelation(Base):
    __tablename__ = "glossary_term_relations"
    __table_args__ = (
        CheckConstraint(
            "relation IN ('exactMatch', 'closeMatch', 'broader', 'narrower', 'related')",
            name="ck_glossary_relation_type",
        ),
        CheckConstraint(
            "(target_term_id IS NOT NULL AND target_uri IS NULL) "
            "OR (target_term_id IS NULL AND target_uri IS NOT NULL)",
            name="ck_glossary_relation_target",
        ),
        CheckConstraint(
            "target_term_id IS NULL OR source_term_id <> target_term_id",
            name="ck_glossary_relation_not_self",
        ),
        UniqueConstraint(
            "source_term_id", "target_term_id", "relation", name="uq_glossary_relation_term"
        ),
        UniqueConstraint(
            "source_term_id", "target_uri", "relation", name="uq_glossary_relation_uri"
        ),
        Index("ix_glossary_relation_source", "source_term_id"),
        Index("ix_glossary_relation_target", "target_term_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    source_term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("glossary_terms.id", ondelete="CASCADE"), nullable=False
    )
    target_term_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("glossary_terms.id", ondelete="RESTRICT")
    )
    target_uri: Mapped[str | None] = mapped_column(String(1000))
    relation: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    source_term: Mapped[GlossaryTerm] = relationship(
        back_populates="outgoing_relations", foreign_keys=[source_term_id]
    )


class DataProductGlossaryTerm(Base):
    __tablename__ = "data_product_glossary_terms"
    __table_args__ = (Index("ix_data_product_glossary_term_term", "glossary_term_id"),)

    data_product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), primary_key=True
    )
    glossary_term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("glossary_terms.id", ondelete="RESTRICT"), primary_key=True
    )
    assigned_by_user_id: Mapped[str] = mapped_column(
        ForeignKey("demo_users.id"), nullable=False
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )

    data_product: Mapped[DataProduct] = relationship(back_populates="glossary_term_assignments")
    term: Mapped[GlossaryTerm] = relationship(back_populates="product_assignments")


class GlossaryTermProposal(Base):
    __tablename__ = "glossary_term_proposals"
    __table_args__ = (
        CheckConstraint(
            "operation IN ('create', 'update', 'retire', 'add_translation', 'link')",
            name="ck_glossary_proposal_operation",
        ),
        CheckConstraint(
            "status IN ('submitted', 'in_review', 'accepted', 'rejected', 'stale')",
            name="ck_glossary_proposal_status",
        ),
        CheckConstraint("revision >= 1", name="ck_glossary_proposal_revision"),
        CheckConstraint(
            "(operation = 'create' AND ((status = 'accepted' AND target_term_id IS NOT NULL) "
            "OR (status <> 'accepted' AND target_term_id IS NULL))) "
            "OR (operation <> 'create' AND target_term_id IS NOT NULL)",
            name="ck_glossary_proposal_target",
        ),
        CheckConstraint(
            "auto_attach = false OR source_product_id IS NOT NULL",
            name="ck_glossary_proposal_auto_attach_source",
        ),
        Index("ix_glossary_proposal_requester", "requester_user_id", "status"),
        Index("ix_glossary_proposal_source", "source_product_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    request_number: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False, default="create")
    target_term_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("glossary_terms.id", ondelete="RESTRICT")
    )
    requester_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    source_product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("data_products.id", ondelete="SET NULL")
    )
    source_product_revision: Mapped[int | None] = mapped_column(Integer)
    auto_attach: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="submitted")
    requested_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    review_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    decision_comment: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    reviews: Mapped[list[GlossaryTermProposalReview]] = relationship(
        back_populates="proposal", cascade="all, delete-orphan"
    )


class GlossaryTermProposalReview(Base):
    __tablename__ = "glossary_term_proposal_reviews"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'approved', 'rejected')",
            name="ck_glossary_review_status",
        ),
        CheckConstraint("proposal_revision >= 1", name="ck_glossary_review_revision"),
        Index("ix_glossary_review_owner", "owner_user_id", "status"),
    )

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("glossary_term_proposals.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="RESTRICT"), primary_key=True
    )
    proposal_revision: Mapped[int] = mapped_column(Integer, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    decision_comment: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )

    proposal: Mapped[GlossaryTermProposal] = relationship(back_populates="reviews")


class WorkflowTask(Base):
    __tablename__ = "workflow_tasks"
    __table_args__ = (
        CheckConstraint("task_kind IN ('action', 'information')", name="ck_workflow_task_kind"),
        Index("ix_workflow_task_assignee", "assignee_user_id", "status"),
        Index("ix_workflow_task_product", "data_product_id"),
        Index("ix_workflow_task_source_access_request", "source_access_request_id"),
        Index("ix_workflow_task_domain_request", "domain_change_request_id"),
        Index("ix_workflow_task_glossary_proposal", "glossary_term_proposal_id"),
        Index("ix_workflow_task_logical_review", "logical_model_review_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    task_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="action")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    assignee_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    data_product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE"), nullable=True
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
    source_access_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("source_access_requests.id", ondelete="CASCADE")
    )
    domain_change_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("domain_change_requests.id", ondelete="SET NULL")
    )
    glossary_term_proposal_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("glossary_term_proposals.id", ondelete="SET NULL")
    )
    logical_model_review_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_model_reviews.id", ondelete="SET NULL")
    )
    logical_model_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_models.id", ondelete="SET NULL")
    )
    logical_mapping_issue_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_mapping_inconsistencies.id", ondelete="SET NULL")
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
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


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


class DemoLoginSession(Base):
    __tablename__ = "demo_login_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# Independent modeling aggregates. These deliberately do not reuse
# DataProductField or ProductSemanticMapping: the four metadata layers have
# separate ownership and version lifecycles.


class TerminologyTerm(Base):
    __tablename__ = "terminology_terms"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    latest_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey(
            "terminology_term_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_terminology_latest_version",
        )
    )
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    creator_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TerminologyTermVersion(Base):
    __tablename__ = "terminology_term_versions"
    __table_args__ = (
        UniqueConstraint("term_id", "revision", name="uq_terminology_term_version"),
        Index("ix_terminology_kind_status", "concept_kind", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    term_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("terminology_terms.id", ondelete="CASCADE"), nullable=False
    )
    predecessor_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="SET NULL")
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    concept_kind: Mapped[str] = mapped_column(String(32), nullable=False, default="term")
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class TerminologyTermVersionLabel(Base):
    __tablename__ = "terminology_term_version_labels"

    term_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="CASCADE"), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(8), primary_key=True)
    preferred_label: Mapped[str] = mapped_column(String(500), nullable=False)
    alternative_labels: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    translation_origin: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    source_text_hash: Mapped[str | None] = mapped_column(String(64))


class TerminologyTermVersionDomain(Base):
    __tablename__ = "terminology_term_version_domains"

    term_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="CASCADE"), primary_key=True
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="RESTRICT"), primary_key=True
    )


class TerminologyTermResponsibility(Base):
    __tablename__ = "terminology_term_responsibilities"

    term_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="CASCADE"), primary_key=True
    )
    role: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id", ondelete="RESTRICT"), nullable=False)


class TerminologyTermRelation(Base):
    __tablename__ = "terminology_term_relations"
    __table_args__ = (
        UniqueConstraint("source_version_id", "target_version_id", "relation", name="uq_terminology_relation"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    source_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="CASCADE"), nullable=False
    )
    target_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="RESTRICT"), nullable=False
    )
    relation: Mapped[str] = mapped_column(String(32), nullable=False)


class TerminologyExternalReference(Base):
    __tablename__ = "terminology_external_references"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    term_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="CASCADE"), nullable=False
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_identifier: Mapped[str | None] = mapped_column(String(255))
    source_uri: Mapped[str] = mapped_column(String(1000), nullable=False)
    source_version: Mapped[str | None] = mapped_column(String(100))
    source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_label: Mapped[str | None] = mapped_column(String(500))
    text_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)


class DataModelRoleAssignment(Base):
    __tablename__ = "data_model_role_assignments"
    __table_args__ = (
        CheckConstraint(
            "role IN ('data_owner', 'deputy_data_owner', 'data_steward')",
            name="ck_data_model_role",
        ),
        CheckConstraint(
            "role <> 'deputy_data_owner' OR delegated_owner_user_id IS NOT NULL",
            name="ck_data_model_deputy_owner_required",
        ),
        CheckConstraint(
            "delegated_owner_user_id IS NULL OR delegated_owner_user_id <> user_id",
            name="ck_data_model_delegation_not_self",
        ),
        UniqueConstraint(
            "user_id", "organization_id", "role", name="uq_data_model_role_scope"
        ),
        Index("ix_data_model_role_scope", "department_code", "organization_id", "role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    department_code: Mapped[str] = mapped_column(String(20), nullable=False)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    delegated_owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="SET NULL")
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class CatalogObjectResponsibility(Base):
    """Additional object-scoped responsibility; it does not grant authorization."""

    __tablename__ = "catalog_object_responsibilities"
    __table_args__ = (
        CheckConstraint(
            "role IN ('data_owner', 'deputy_data_owner', 'data_steward')",
            name="ck_catalog_object_responsibility_role",
        ),
        CheckConstraint(
            "(CASE WHEN domain_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN logical_model_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN physical_source_id IS NULL THEN 0 ELSE 1 END + "
            "CASE WHEN data_product_id IS NULL THEN 0 ELSE 1 END) = 1",
            name="ck_catalog_object_responsibility_target",
        ),
        CheckConstraint(
            "physical_table_key IS NULL OR physical_source_id IS NOT NULL",
            name="ck_catalog_object_responsibility_table_source",
        ),
        Index("ix_catalog_object_responsibility_user", "user_id", "active"),
        Index("ix_catalog_object_responsibility_domain", "domain_id"),
        Index("ix_catalog_object_responsibility_model", "logical_model_id"),
        Index("ix_catalog_object_responsibility_source", "physical_source_id"),
        Index("ix_catalog_object_responsibility_product", "data_product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="RESTRICT")
    )
    domain_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("domains.id", ondelete="CASCADE"))
    logical_model_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_models.id", ondelete="CASCADE")
    )
    physical_source_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("physical_sources.id", ondelete="CASCADE")
    )
    physical_table_key: Mapped[str | None] = mapped_column(String(1500))
    data_product_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("data_products.id", ondelete="CASCADE")
    )
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    provenance: Mapped[str] = mapped_column(String(40), nullable=False, default="explicit")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PhysicalDomainAssignment(Base):
    """Explicit physical-table to domain relationship, independent of a model mapping."""

    __tablename__ = "physical_domain_assignments"
    __table_args__ = (
        UniqueConstraint("physical_source_id", "physical_table_key", "domain_id", name="uq_physical_domain_assignment"),
        Index("ix_physical_domain_assignment_domain", "domain_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    physical_source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_sources.id", ondelete="CASCADE"), nullable=False
    )
    physical_table_key: Mapped[str] = mapped_column(String(1500), nullable=False)
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"), nullable=False)
    provenance: Mapped[str] = mapped_column(String(40), nullable=False, default="explicit")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class RoleChangeEvent(Base):
    """Immutable, database-captured sequence of role and responsibility changes."""

    __tablename__ = "role_change_events"
    __table_args__ = (
        CheckConstraint("action IN ('baseline', 'assigned', 'changed', 'removed')", name="ck_role_change_action"),
        Index("ix_role_change_scope", "scope_type", "scope_id", "sequence"),
        Index("ix_role_change_subject", "subject_user_id", "sequence"),
    )

    sequence: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    actor_user_id: Mapped[str] = mapped_column(String(200), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    scope_type: Mapped[str] = mapped_column(String(40), nullable=False)
    scope_id: Mapped[str] = mapped_column(String(200), nullable=False)
    entity_id: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    subject_user_id: Mapped[str] = mapped_column(String(200), nullable=False)
    before_state: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after_state: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class I14yConcept(Base):
    __tablename__ = "i14y_concepts"
    __table_args__ = (
        CheckConstraint(
            "concept_type IN ('CodeList', 'Date', 'Numeric', 'String')",
            name="ck_i14y_concept_type",
        ),
        CheckConstraint(
            "publication_level IS NULL OR publication_level IN ('Internal', 'Public')",
            name="ck_i14y_publication_level",
        ),
        CheckConstraint(
            "registration_status IS NULL OR registration_status IN "
            "('Incomplete', 'Candidate', 'Recorded', 'Qualified', 'Standard', "
            "'PreferredStandard', 'Superseded', 'Retired')",
            name="ck_i14y_registration_status",
        ),
        CheckConstraint("length(payload_hash) = 64", name="ck_i14y_concept_payload_hash"),
        Index("ix_i14y_concept_type_status", "concept_type", "registration_status"),
        Index("ix_i14y_concept_publisher", "publisher_identifier"),
        Index("ix_i14y_concept_fetched", "fetched_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    identifiers: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    legacy_identifier: Mapped[str | None] = mapped_column(String(500))
    name: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    description: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    concept_type: Mapped[str] = mapped_column(String(32), nullable=False)
    publisher: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    publisher_identifier: Mapped[str | None] = mapped_column(String(255))
    version: Mapped[str | None] = mapped_column(String(100))
    publication_level: Mapped[str | None] = mapped_column(String(32))
    publication_level_proposal: Mapped[str | None] = mapped_column(String(32))
    registration_status: Mapped[str | None] = mapped_column(String(32))
    registration_status_proposal: Mapped[str | None] = mapped_column(String(32))
    themes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    conforms_to: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    constraints: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    code_list: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    source_system: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    system_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    system_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    register_uri: Mapped[str | None] = mapped_column(String(1000))
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    detail_loaded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class I14yCodeListEntry(Base):
    __tablename__ = "i14y_code_list_entries"
    __table_args__ = (
        UniqueConstraint("concept_id", "code", name="uq_i14y_code_list_entry_code"),
        CheckConstraint("length(payload_hash) = 64", name="ck_i14y_entry_payload_hash"),
        Index("ix_i14y_entry_concept_order", "concept_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    concept_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("i14y_concepts.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(500), nullable=False)
    parent_code: Mapped[str | None] = mapped_column(String(500))
    name: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    description: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    annotations: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    valid_from: Mapped[date | None] = mapped_column(Date)
    valid_to: Mapped[date | None] = mapped_column(Date)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class I14ySyncRun(Base):
    __tablename__ = "i14y_sync_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'succeeded', 'partial', 'failed')",
            name="ck_i14y_sync_status",
        ),
        Index("ix_i14y_sync_started", "started_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    source_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    triggered_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="SET NULL")
    )
    concepts_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    concepts_upserted: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    concepts_unchanged: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatCatalog(Base):
    __tablename__ = "dcat_catalogs"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_dcat_catalog_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_dcat_catalog_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_catalog_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatCatalogVersion(Base):
    __tablename__ = "dcat_catalog_versions"
    __table_args__ = (
        UniqueConstraint("catalog_id", "revision", name="uq_dcat_catalog_version"),
        CheckConstraint("revision >= 1", name="ck_dcat_catalog_version_revision"),
        CheckConstraint("status IN ('draft', 'published', 'superseded')", name="ck_dcat_catalog_status"),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_catalog_version_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    catalog_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_catalogs.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    description: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    publisher: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    homepage: Mapped[str | None] = mapped_column(String(1000))
    languages: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatDataset(Base):
    __tablename__ = "dcat_datasets"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_dcat_dataset_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_dcat_dataset_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_dataset_hash"),
        Index("ix_dcat_dataset_catalog", "catalog_id", "lifecycle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    catalog_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_catalogs.id", ondelete="RESTRICT"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatDatasetVersion(Base):
    __tablename__ = "dcat_dataset_versions"
    __table_args__ = (
        UniqueConstraint("dataset_id", "revision", name="uq_dcat_dataset_version"),
        CheckConstraint("revision >= 1", name="ck_dcat_dataset_version_revision"),
        CheckConstraint("status IN ('draft', 'published', 'superseded')", name="ck_dcat_dataset_status"),
        CheckConstraint(
            "data_classification IN ('unclassified', 'internal', 'confidential', 'secret')",
            name="ck_dcat_dataset_classification",
        ),
        CheckConstraint(
            "deputy_owner_user_id IS NULL OR deputy_owner_user_id <> data_owner_user_id",
            name="ck_dcat_dataset_deputy_not_owner",
        ),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_dataset_version_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_datasets.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    identifiers: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    data_owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    deputy_owner_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("demo_users.id", ondelete="SET NULL")
    )
    creator: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    data_domain_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("domains.id", ondelete="RESTRICT"), nullable=False
    )
    department_code: Mapped[str] = mapped_column(String(20), nullable=False)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="RESTRICT"), nullable=False
    )
    data_classification: Mapped[str] = mapped_column(String(32), nullable=False)
    date_created: Mapped[date] = mapped_column(Date, nullable=False)
    contact_points: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    publisher: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    access_rights: Mapped[str] = mapped_column(String(1000), nullable=False)
    themes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    keywords: Mapped[dict[str, list[str]]] = mapped_column(JSON, nullable=False, default=dict)
    issued: Mapped[date | None] = mapped_column(Date)
    modified: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatDatasetVersionLocalization(Base):
    __tablename__ = "dcat_dataset_version_localizations"
    __table_args__ = (
        CheckConstraint("language IN ('de', 'fr', 'it', 'en', 'rm')", name="ck_dcat_dataset_language"),
    )

    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_dataset_versions.id", ondelete="CASCADE"), primary_key=True
    )
    language: Mapped[str] = mapped_column(String(8), primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class DcatDistribution(Base):
    __tablename__ = "dcat_distributions"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_dcat_distribution_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_dcat_distribution_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_distribution_hash"),
        Index("ix_dcat_distribution_dataset", "dataset_id", "lifecycle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(700), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_datasets.id", ondelete="RESTRICT"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatDistributionVersion(Base):
    __tablename__ = "dcat_distribution_versions"
    __table_args__ = (
        UniqueConstraint("distribution_id", "revision", name="uq_dcat_distribution_version"),
        CheckConstraint("revision >= 1", name="ck_dcat_distribution_version_revision"),
        CheckConstraint("status IN ('draft', 'published', 'superseded')", name="ck_dcat_distribution_status"),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_distribution_version_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    distribution_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_distributions.id", ondelete="CASCADE"), nullable=False
    )
    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_dataset_versions.id", ondelete="RESTRICT"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    access_url: Mapped[str | None] = mapped_column(String(1000))
    download_url: Mapped[str | None] = mapped_column(String(1000))
    media_type: Mapped[str | None] = mapped_column(String(255))
    format: Mapped[str | None] = mapped_column(String(255))
    license_uri: Mapped[str | None] = mapped_column(String(1000))
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatDataService(Base):
    __tablename__ = "dcat_data_services"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_dcat_service_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_dcat_service_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_service_hash"),
        Index("ix_dcat_service_dataset", "dataset_id", "lifecycle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(700), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_datasets.id", ondelete="RESTRICT"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DcatDataServiceVersion(Base):
    __tablename__ = "dcat_data_service_versions"
    __table_args__ = (
        UniqueConstraint("data_service_id", "revision", name="uq_dcat_service_version"),
        CheckConstraint("revision >= 1", name="ck_dcat_service_version_revision"),
        CheckConstraint("status IN ('draft', 'published', 'superseded')", name="ck_dcat_service_status"),
        CheckConstraint("length(content_hash) = 64", name="ck_dcat_service_version_hash"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    data_service_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_data_services.id", ondelete="CASCADE"), nullable=False
    )
    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_dataset_versions.id", ondelete="RESTRICT"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    title: Mapped[dict[str, str]] = mapped_column(JSON, nullable=False, default=dict)
    endpoint_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    endpoint_description: Mapped[str | None] = mapped_column(String(1000))
    serves_dataset_urns: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LogicalModel(Base):
    __tablename__ = "logical_models"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_logical_model_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_logical_model_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_logical_model_content_hash"),
        Index("ix_logical_model_lifecycle", "lifecycle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    published_revision: Mapped[int | None] = mapped_column(Integer)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LogicalModelIdentifierReservation(Base):
    """Catalog-wide identifier reservation retained for the life of a model root."""

    __tablename__ = "logical_model_identifier_reservations"
    __table_args__ = (
        CheckConstraint(
            "length(normalized_identifier) >= 1",
            name="ck_logical_model_identifier_normalized",
        ),
        UniqueConstraint(
            "normalized_identifier", name="uq_logical_model_identifier_normalized"
        ),
    )

    logical_model_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_models.id", ondelete="CASCADE"), primary_key=True
    )
    identifier: Mapped[str] = mapped_column(String(500), nullable=False)
    normalized_identifier: Mapped[str] = mapped_column(String(500), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class LogicalModelVersion(Base):
    __tablename__ = "logical_model_versions"
    __table_args__ = (
        UniqueConstraint("logical_model_id", "revision", name="uq_logical_model_version"),
        CheckConstraint("revision >= 1", name="ck_logical_model_version_revision"),
        CheckConstraint("lock_version >= 1", name="ck_logical_model_lock_version"),
        CheckConstraint(
            "status IN ('draft', 'review_pending', 'changes_requested', 'published', 'superseded', 'retired')",
            name="ck_logical_model_version_status",
        ),
        CheckConstraint("length(content_hash) = 64", name="ck_logical_version_content_hash"),
        Index("ix_logical_version_status", "status", "logical_model_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_model_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_models.id", ondelete="CASCADE"), nullable=False
    )
    dataset_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("dcat_dataset_versions.id", ondelete="RESTRICT"), nullable=False
    )
    predecessor_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_model_versions.id", ondelete="SET NULL")
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    identifier_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    comment: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    updated_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LogicalMappingInconsistency(Base):
    """Current decision for a logical field without a physical counterpart."""

    __tablename__ = "logical_mapping_inconsistencies"
    __table_args__ = (
        UniqueConstraint("logical_model_id", "logical_field_id", name="uq_logical_mapping_inconsistency_field"),
        CheckConstraint("status IN ('open', 'accepted', 'assigned', 'resolved')", name="ck_logical_mapping_inconsistency_status"),
        Index("ix_logical_mapping_inconsistency_owner", "owner_user_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_model_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("logical_models.id", ondelete="CASCADE"), nullable=False)
    logical_field_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("logical_fields.id", ondelete="RESTRICT"), nullable=False)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    assigned_steward_user_id: Mapped[str | None] = mapped_column(ForeignKey("demo_users.id"))
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    decision_comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LogicalModelReview(Base):
    __tablename__ = "logical_model_reviews"
    __table_args__ = (Index("ix_logical_model_review_reviewer", "reviewer_user_id", "status"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_model_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_models.id", ondelete="CASCADE"), nullable=False
    )
    submitted_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_model_versions.id", ondelete="RESTRICT"), unique=True, nullable=False
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("domains.id", ondelete="RESTRICT"), nullable=False)
    submitter_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id", ondelete="RESTRICT"), nullable=False)
    reviewer_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id", ondelete="RESTRICT"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    review_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    decision_comment: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_model_versions.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)


class LogicalModelAssistanceProvenance(Base):
    __tablename__ = "logical_model_assistance_provenance"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_model_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_model_versions.id", ondelete="CASCADE"), nullable=False
    )
    field_path: Mapped[str] = mapped_column(String(255), nullable=False)
    language: Mapped[str | None] = mapped_column(String(8))
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    source_text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    source_identifier: Mapped[str | None] = mapped_column(String(255))
    source_uri: Mapped[str | None] = mapped_column(String(1000))
    source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payload_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    origin: Mapped[str] = mapped_column(String(32), nullable=False)


class LogicalEntity(Base):
    __tablename__ = "logical_entities"
    __table_args__ = (
        CheckConstraint(
            "lifecycle IN ('active', 'retired')", name="ck_logical_entity_lifecycle"
        ),
        CheckConstraint("revision >= 1", name="ck_logical_entity_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_logical_entity_content_hash"),
        Index("ix_logical_entity_model", "logical_model_id", "lifecycle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_model_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_models.id", ondelete="CASCADE"), nullable=False
    )
    urn: Mapped[str] = mapped_column(String(700), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LogicalEntityVersion(Base):
    __tablename__ = "logical_entity_versions"
    __table_args__ = (
        UniqueConstraint(
            "logical_model_version_id", "logical_entity_id", name="uq_logical_entity_version"
        ),
        UniqueConstraint(
            "logical_model_version_id", "name", name="uq_logical_entity_version_name"
        ),
        UniqueConstraint(
            "logical_entity_id", "revision", name="uq_logical_entity_version_revision"
        ),
        CheckConstraint("revision >= 1", name="ck_logical_entity_version_revision"),
        CheckConstraint(
            "length(content_hash) = 64", name="ck_logical_entity_version_content_hash"
        ),
        CheckConstraint("position >= 0", name="ck_logical_entity_position"),
        Index("ix_logical_entity_version_model", "logical_model_version_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_model_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_model_versions.id", ondelete="CASCADE"), nullable=False
    )
    logical_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_entities.id", ondelete="RESTRICT"), nullable=False
    )
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    business_object: Mapped[str | None] = mapped_column(String(255))
    business_object_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="RESTRICT")
    )
    comment: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class LogicalField(Base):
    __tablename__ = "logical_fields"
    __table_args__ = (
        CheckConstraint(
            "lifecycle IN ('active', 'retired')", name="ck_logical_field_lifecycle"
        ),
        CheckConstraint("revision >= 1", name="ck_logical_field_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_logical_field_content_hash"),
        Index("ix_logical_field_entity", "logical_entity_id", "lifecycle"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_entity_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_entities.id", ondelete="CASCADE"), nullable=False
    )
    urn: Mapped[str] = mapped_column(String(900), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LogicalFieldVersion(Base):
    __tablename__ = "logical_field_versions"
    __table_args__ = (
        UniqueConstraint(
            "logical_entity_version_id", "logical_field_id", name="uq_logical_field_version"
        ),
        UniqueConstraint(
            "logical_entity_version_id", "name", name="uq_logical_field_version_name"
        ),
        UniqueConstraint(
            "logical_field_id", "revision", name="uq_logical_field_version_revision"
        ),
        CheckConstraint("revision >= 1", name="ck_logical_field_version_revision"),
        CheckConstraint(
            "length(content_hash) = 64", name="ck_logical_field_version_content_hash"
        ),
        CheckConstraint("position >= 0", name="ck_logical_field_position"),
        CheckConstraint("length IS NULL OR length >= 0", name="ck_logical_field_length"),
        CheckConstraint("precision IS NULL OR precision >= 0", name="ck_logical_field_precision"),
        CheckConstraint(
            "decimal_places IS NULL OR decimal_places >= 0", name="ck_logical_field_decimal_places"
        ),
        CheckConstraint("min_count >= 0", name="ck_logical_field_min_count"),
        CheckConstraint(
            "max_count IS NULL OR max_count >= min_count", name="ck_logical_field_max_count"
        ),
        CheckConstraint(
            "classification IN ('unclassified', 'internal', 'confidential', 'secret')",
            name="ck_logical_field_classification",
        ),
        Index("ix_logical_field_version_entity", "logical_entity_version_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_entity_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_entity_versions.id", ondelete="CASCADE"), nullable=False
    )
    logical_field_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_fields.id", ondelete="RESTRICT"), nullable=False
    )
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    business_object: Mapped[str | None] = mapped_column(String(255))
    business_object_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("terminology_term_versions.id", ondelete="RESTRICT")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    data_type: Mapped[str] = mapped_column(String(255), nullable=False)
    length: Mapped[int | None] = mapped_column(Integer)
    precision: Mapped[int | None] = mapped_column(Integer)
    short_description: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    source_system: Mapped[str | None] = mapped_column(String(255))
    classification: Mapped[str] = mapped_column(String(32), nullable=False)
    decimal_places: Mapped[int | None] = mapped_column(Integer)
    value_list_concept_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("i14y_concepts.id", ondelete="SET NULL")
    )
    concept_match_explicitly_none: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    nullable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    min_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_count: Mapped[int | None] = mapped_column(Integer, default=1)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class LogicalConceptLink(Base):
    __tablename__ = "logical_concept_links"
    __table_args__ = (
        CheckConstraint(
            "(logical_model_version_id IS NOT NULL AND logical_field_version_id IS NULL) OR "
            "(logical_model_version_id IS NULL AND logical_field_version_id IS NOT NULL)",
            name="ck_logical_concept_link_target",
        ),
        Index("ix_logical_concept_model", "logical_model_version_id"),
        Index("ix_logical_concept_field", "logical_field_version_id"),
        Index("ix_logical_concept_concept", "concept_id"),
        Index(
            "uq_logical_concept_model_link",
            "logical_model_version_id",
            "concept_id",
            unique=True,
            postgresql_where=text("logical_model_version_id IS NOT NULL"),
            sqlite_where=text("logical_model_version_id IS NOT NULL"),
        ),
        Index(
            "uq_logical_concept_field_link",
            "logical_field_version_id",
            "concept_id",
            unique=True,
            postgresql_where=text("logical_field_version_id IS NOT NULL"),
            sqlite_where=text("logical_field_version_id IS NOT NULL"),
        ),
        Index(
            "uq_logical_concept_primary_field",
            "logical_field_version_id",
            unique=True,
            postgresql_where=text(
                "primary_for_i14y = true AND logical_field_version_id IS NOT NULL"
            ),
            sqlite_where=text(
                "primary_for_i14y = 1 AND logical_field_version_id IS NOT NULL"
            ),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    logical_model_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_model_versions.id", ondelete="CASCADE")
    )
    logical_field_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("logical_field_versions.id", ondelete="CASCADE")
    )
    concept_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("i14y_concepts.id", ondelete="RESTRICT"), nullable=False
    )
    concept_version: Mapped[str | None] = mapped_column(String(100))
    concept_source_modified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_uri: Mapped[str] = mapped_column(String(1000), nullable=False)
    primary_for_i14y: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    linked_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PhysicalSource(Base):
    __tablename__ = "physical_sources"
    __table_args__ = (
        CheckConstraint("adapter_type IN ('postgresql', 's3', 'fixture')", name="ck_physical_adapter"),
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_physical_source_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_physical_source_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_physical_source_hash"),
        Index("ix_physical_source_scope", "department_code", "organization_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    adapter_type: Mapped[str] = mapped_column(String(32), nullable=False)
    config_ref: Mapped[str | None] = mapped_column(String(255))
    department_code: Mapped[str] = mapped_column(String(20), nullable=False)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("administrative_organizations.id", ondelete="RESTRICT"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PhysicalSchemaSnapshot(Base):
    __tablename__ = "physical_schema_snapshots"
    __table_args__ = (
        UniqueConstraint("source_id", "sequence", name="uq_physical_snapshot_sequence"),
        CheckConstraint("sequence >= 1", name="ck_physical_snapshot_sequence"),
        CheckConstraint("length(fingerprint) = 64", name="ck_physical_snapshot_fingerprint"),
        Index("ix_physical_snapshot_source", "source_id", "sequence"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(700), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_sources.id", ondelete="RESTRICT"), nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    predecessor_snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("physical_schema_snapshots.id", ondelete="SET NULL")
    )
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    imported_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PhysicalDatabase(Base):
    __tablename__ = "physical_databases"
    __table_args__ = (
        UniqueConstraint("snapshot_id", "name", name="uq_physical_database_name"),
        Index("ix_physical_database_snapshot", "snapshot_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_schema_snapshots.id", ondelete="CASCADE"), nullable=False
    )
    stable_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    urn: Mapped[str] = mapped_column(String(1200), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PhysicalSchema(Base):
    __tablename__ = "physical_schemas"
    __table_args__ = (
        UniqueConstraint("physical_database_id", "name", name="uq_physical_schema_name"),
        Index("ix_physical_schema_database", "physical_database_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    physical_database_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_databases.id", ondelete="CASCADE"), nullable=False
    )
    stable_key: Mapped[str] = mapped_column(String(1200), nullable=False)
    urn: Mapped[str] = mapped_column(String(1400), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PhysicalTable(Base):
    __tablename__ = "physical_tables"
    __table_args__ = (
        UniqueConstraint("physical_schema_id", "name", name="uq_physical_table_name"),
        CheckConstraint(
            "kind IN ('table', 'view', 'materialized_view', 'parquet')", name="ck_physical_table_kind"
        ),
        CheckConstraint(
            "object_count IS NULL OR object_count >= 1", name="ck_physical_table_object_count"
        ),
        CheckConstraint("size_bytes IS NULL OR size_bytes >= 0", name="ck_physical_table_size"),
        CheckConstraint(
            "schema_confidence IS NULL OR schema_confidence IN ('declared', 'embedded', 'inferred')",
            name="ck_physical_table_schema_confidence",
        ),
        Index("ix_physical_table_schema", "physical_schema_id", "position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    physical_schema_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_schemas.id", ondelete="CASCADE"), nullable=False
    )
    stable_key: Mapped[str] = mapped_column(String(1500), nullable=False)
    urn: Mapped[str] = mapped_column(String(1700), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="table")
    comment: Mapped[str | None] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_location: Mapped[str | None] = mapped_column(String(2000))
    media_type: Mapped[str | None] = mapped_column(String(255))
    object_count: Mapped[int | None] = mapped_column(Integer)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    schema_confidence: Mapped[str | None] = mapped_column(String(32))
    partition_keys: Mapped[list[str] | None] = mapped_column(JSON)


class PhysicalColumn(Base):
    __tablename__ = "physical_columns"
    __table_args__ = (
        UniqueConstraint("physical_table_id", "name", name="uq_physical_column_name"),
        UniqueConstraint(
            "physical_table_id", "ordinal_position", name="uq_physical_column_position"
        ),
        CheckConstraint("ordinal_position >= 1", name="ck_physical_column_position"),
        Index("ix_physical_column_table", "physical_table_id", "ordinal_position"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    physical_table_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_tables.id", ondelete="CASCADE"), nullable=False
    )
    stable_key: Mapped[str] = mapped_column(String(1800), nullable=False)
    urn: Mapped[str] = mapped_column(String(2000), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_data_type: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_data_type: Mapped[str] = mapped_column(String(100), nullable=False)
    character_length: Mapped[int | None] = mapped_column(Integer)
    numeric_precision: Mapped[int | None] = mapped_column(Integer)
    numeric_scale: Mapped[int | None] = mapped_column(Integer)
    nullable: Mapped[bool] = mapped_column(Boolean, nullable=False)
    ordinal_position: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[str | None] = mapped_column(Text)


class PhysicalDriftReport(Base):
    __tablename__ = "physical_drift_reports"
    __table_args__ = (
        UniqueConstraint("current_snapshot_id", name="uq_physical_drift_current_snapshot"),
        Index("ix_physical_drift_source", "source_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_sources.id", ondelete="RESTRICT"), nullable=False
    )
    previous_snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_schema_snapshots.id", ondelete="RESTRICT"), nullable=False
    )
    current_snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_schema_snapshots.id", ondelete="RESTRICT"), nullable=False
    )
    summary: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class PhysicalDriftChange(Base):
    __tablename__ = "physical_drift_changes"
    __table_args__ = (
        CheckConstraint(
            "change_type IN ('table_added', 'table_removed', 'column_added', 'column_removed', "
            "'type_changed', 'length_changed', 'precision_changed', 'scale_changed', "
            "'nullability_changed', 'rename_candidate')",
            name="ck_physical_drift_change_type",
        ),
        CheckConstraint(
            "review_status IN ('pending', 'accepted', 'rejected', 'not_applicable')",
            name="ck_physical_drift_review_status",
        ),
        CheckConstraint(
            "confidence IS NULL OR (confidence >= 0 AND confidence <= 1)",
            name="ck_physical_drift_confidence",
        ),
        Index("ix_physical_drift_change_report", "drift_report_id", "change_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    drift_report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_drift_reports.id", ondelete="CASCADE"), nullable=False
    )
    change_type: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_key: Mapped[str] = mapped_column(String(1800), nullable=False)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    confidence: Mapped[float | None] = mapped_column(Float)
    impacted_logical_field_ids: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    impacted_mapping_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    review_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="not_applicable"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )


class AssetMapping(Base):
    __tablename__ = "asset_mappings"
    __table_args__ = (
        CheckConstraint("lifecycle IN ('active', 'retired')", name="ck_asset_mapping_lifecycle"),
        CheckConstraint("revision >= 1", name="ck_asset_mapping_revision"),
        CheckConstraint("length(content_hash) = 64", name="ck_asset_mapping_hash"),
        Index("ix_asset_mapping_logical_physical", "logical_model_id", "physical_source_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    urn: Mapped[str] = mapped_column(String(700), unique=True, nullable=False)
    origin_catalog_id: Mapped[str] = mapped_column(String(255), nullable=False)
    logical_model_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_models.id", ondelete="RESTRICT"), nullable=False
    )
    physical_source_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_sources.id", ondelete="RESTRICT"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    lifecycle: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AssetMappingVersion(Base):
    __tablename__ = "asset_mapping_versions"
    __table_args__ = (
        UniqueConstraint("asset_mapping_id", "revision", name="uq_asset_mapping_version"),
        CheckConstraint("revision >= 1", name="ck_asset_mapping_version_revision"),
        CheckConstraint("lock_version >= 1", name="ck_asset_mapping_lock_version"),
        CheckConstraint(
            "mapping_type IN ('Direct', 'Renamed', 'Derived', 'Lookup', 'Transformed')",
            name="ck_asset_mapping_type",
        ),
        CheckConstraint(
            "classification IN ('unclassified', 'internal', 'confidential', 'secret')",
            name="ck_asset_mapping_classification",
        ),
        CheckConstraint(
            "status IN ('draft', 'review_pending', 'validated', 'broken', 'superseded')",
            name="ck_asset_mapping_status",
        ),
        CheckConstraint("length(content_hash) = 64", name="ck_asset_mapping_version_hash"),
        Index("ix_asset_mapping_version_status", "status", "responsible_user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    asset_mapping_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("asset_mappings.id", ondelete="CASCADE"), nullable=False
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    lock_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    predecessor_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("asset_mapping_versions.id", ondelete="SET NULL")
    )
    logical_model_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_model_versions.id", ondelete="RESTRICT"), nullable=False
    )
    physical_snapshot_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_schema_snapshots.id", ondelete="RESTRICT"), nullable=False
    )
    mapping_type: Mapped[str] = mapped_column(String(32), nullable=False)
    classification: Mapped[str] = mapped_column(
        String(32), nullable=False, default="unclassified"
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    transformation_rule: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    responsible_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    validation_result: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    last_drift_check_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("demo_users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now
    )


class AssetMappingLogicalField(Base):
    __tablename__ = "asset_mapping_logical_fields"
    __table_args__ = (
        UniqueConstraint(
            "asset_mapping_version_id", "position", name="uq_asset_mapping_logical_position"
        ),
    )

    asset_mapping_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("asset_mapping_versions.id", ondelete="CASCADE"), primary_key=True
    )
    logical_field_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("logical_field_versions.id", ondelete="RESTRICT"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="source")


class AssetMappingPhysicalColumn(Base):
    __tablename__ = "asset_mapping_physical_columns"
    __table_args__ = (
        UniqueConstraint(
            "asset_mapping_version_id", "position", name="uq_asset_mapping_physical_position"
        ),
    )

    asset_mapping_version_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("asset_mapping_versions.id", ondelete="CASCADE"), primary_key=True
    )
    physical_column_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("physical_columns.id", ondelete="RESTRICT"), primary_key=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="source")
