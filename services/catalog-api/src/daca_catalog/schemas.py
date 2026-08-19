from __future__ import annotations

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator

_HTML_PATTERN = re.compile(r"<\s*(?:!--|/?\s*[A-Za-z])[^>]*>")
_CREDENTIAL_PATTERN = re.compile(
    r"(?:"
    r"\b(?:password|passwd|pwd|secret|token|api[\s_-]*key|access[\s_-]*key|"
    r"private[\s_-]*key|authorization)\s*[:=]\s*\S+"
    r"|\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"
    r"|-----BEGIN\s+[A-Z ]*PRIVATE KEY-----"
    r"|\bAKIA[0-9A-Z]{16}\b"
    r"|\b[a-z][a-z0-9+.-]*://[^\s/:@]+:[^\s/@]+@"
    r")",
    re.IGNORECASE,
)


def reject_unsafe_service_level_text(value: str) -> str:
    """Reject markup and credential-like values before they reach JSON or audit state."""
    normalized = value.strip()
    if _HTML_PATTERN.search(normalized):
        raise ValueError("HTML is not accepted in service-level text")
    if _CREDENTIAL_PATTERN.search(normalized):
        raise ValueError("Credentials and secrets are not accepted in service-level text")
    return normalized


def to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(word.capitalize() for word in rest)


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )


class Contact(ApiModel):
    name: str
    email: str


class DataProductResponse(ApiModel):
    id: uuid.UUID
    urn: str
    origin_catalog: str
    revision: int
    active_policy_revision: int | None
    owner_user_id: str | None = None
    discoverable: bool = True
    title: str
    description: str
    owner: str
    domain: str
    lifecycle: Literal["draft", "active", "deprecated", "retired"]
    classification: Literal["public", "internal", "confidential", "restricted"]
    keywords: list[str]
    contact: dict[str, Any]
    license: str | None
    quality: dict[str, Any]
    update_frequency: str | None
    metadata: dict[str, Any] = Field(
        validation_alias="extra_metadata", serialization_alias="metadata"
    )
    created_at: datetime
    updated_at: datetime


class DataProductQualitySummary(ApiModel):
    score: int = Field(ge=0, le=6)
    medal: Literal["bronze", "silver", "gold", "platinum"]


class DataProductSummary(ApiModel):
    id: uuid.UUID
    urn: str
    origin_catalog: str
    revision: int
    owner_user_id: str | None = None
    discoverable: bool = True
    title: str
    description: str
    owner: str
    domain: str
    lifecycle: str
    classification: str
    keywords: list[str]
    update_frequency: str | None
    metadata: dict[str, Any] = Field(
        validation_alias="extra_metadata", serialization_alias="metadata"
    )
    quality: DataProductQualitySummary
    created_at: datetime
    updated_at: datetime


class DataProductPage(ApiModel):
    items: list[DataProductSummary]
    next_cursor: str | None = None


class DataProductPatch(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, min_length=1)
    owner: str | None = Field(default=None, min_length=1, max_length=255)
    domain: str | None = Field(default=None, min_length=1, max_length=255)
    lifecycle: Literal["draft", "active", "deprecated", "retired"] | None = None
    classification: Literal["public", "internal", "confidential", "restricted"] | None = None
    keywords: list[str] | None = None
    contact: dict[str, Any] | None = None
    license: str | None = Field(default=None, max_length=255)
    quality: dict[str, Any] | None = None
    update_frequency: str | None = Field(default=None, max_length=100)
    metadata: dict[str, Any] | None = None

    @model_validator(mode="after")
    def require_change(self) -> DataProductPatch:
        if not self.model_fields_set:
            raise ValueError("at least one metadata field is required")
        non_nullable = {
            "title",
            "description",
            "owner",
            "domain",
            "lifecycle",
            "classification",
            "keywords",
            "contact",
            "quality",
            "metadata",
        }
        null_fields = sorted(
            name
            for name in self.model_fields_set.intersection(non_nullable)
            if getattr(self, name) is None
        )
        if null_fields:
            raise ValueError(f"fields cannot be null: {', '.join(null_fields)}")
        return self


AccessRequestStatus = Literal[
    "submitted",
    "identity_review",
    "legal_review",
    "conditions_review",
    "approved_policy_pending",
    "granted_modified",
    "granted_original",
    "rejected",
    "withdrawn",
]


class AccessRequestCreate(ApiModel):
    consumer_type: Literal["person", "machine"]
    machine_id: str | None = Field(default=None, max_length=255)
    purpose: str = Field(min_length=20, max_length=3000)
    legal_basis: str = Field(min_length=5, max_length=1000)
    requested_protocol: Literal["http", "postgresql", "both"]
    requested_variant: Literal["original", "modified", "either"]
    valid_from: date
    valid_until: date
    contact_email: str = Field(min_length=5, max_length=320)
    notes: str | None = Field(default=None, max_length=2000)
    conditions_accepted: Literal[True]

    @field_validator("contact_email")
    @classmethod
    def valid_contact_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        local, separator, domain = normalized.partition("@")
        if (
            not separator
            or not local
            or "." not in domain
            or domain.startswith(".")
            or domain.endswith(".")
        ):
            raise ValueError("contactEmail must be a valid email address")
        return normalized

    @model_validator(mode="after")
    def valid_consumer_and_period(self) -> AccessRequestCreate:
        if self.valid_until < self.valid_from:
            raise ValueError("validUntil must be on or after validFrom")
        if self.consumer_type == "machine":
            if self.machine_id is None or not self.machine_id.strip():
                raise ValueError("machineId is required for a machine consumer")
            self.machine_id = self.machine_id.strip()
        elif self.machine_id is not None:
            raise ValueError("machineId is only allowed for a machine consumer")
        self.purpose = self.purpose.strip()
        self.legal_basis = self.legal_basis.strip()
        if len(self.purpose) < 20:
            raise ValueError("purpose must contain at least 20 non-whitespace characters")
        if len(self.legal_basis) < 5:
            raise ValueError("legalBasis must contain at least 5 non-whitespace characters")
        self.notes = self.notes.strip() if self.notes and self.notes.strip() else None
        return self


class AccessRequestResponse(ApiModel):
    id: uuid.UUID
    request_number: str
    data_product_id: uuid.UUID
    requester_id: str
    requester_name: str
    requester_organization: str
    contact_email: str
    consumer_type: Literal["person", "machine"]
    machine_id: str | None
    purpose: str
    legal_basis: str
    requested_protocol: Literal["http", "postgresql", "both"]
    requested_variant: Literal["original", "modified", "either"]
    valid_from: date
    valid_until: date
    notes: str | None
    status: AccessRequestStatus
    fulfillment_subject_type: Literal["person", "machine", "group"] | None = None
    fulfillment_subject_id: str | None = None
    fulfillment_group_revision: int | None = None
    decision_policy_revision_id: uuid.UUID | None = None
    granted_variant: Literal["original", "modified"] | None = None
    created_at: datetime
    updated_at: datetime


class AccessConsumerGrant(ApiModel):
    request_number: str
    protocol: Literal["http", "postgresql", "both"]
    variant: Literal["original", "modified"]
    valid_from: date
    valid_until: date


class OwnedAccessConsumerResponse(ApiModel):
    data_product_id: uuid.UUID
    consumer_type: Literal["person", "machine"]
    identity_id: str
    display_name: str
    organization: str
    grants: list[AccessConsumerGrant]


class HttpConnection(ApiModel):
    base_url: str = Field(min_length=1, max_length=1000)
    path: str = Field(min_length=1, max_length=1000)
    method: Literal["GET", "POST"] = "GET"
    media_type: str = Field(
        default="application/json",
        max_length=255,
        pattern=r"^[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+(?:\s*;\s*[A-Za-z0-9!#$&^_.+-]+=[A-Za-z0-9!#$&^_.+-]+)*$",
    )

    @field_validator("base_url")
    @classmethod
    def safe_base_url(cls, value: str) -> str:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
            raise ValueError("baseUrl must be an absolute HTTP or HTTPS URL")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("baseUrl must not contain credentials")
        if parsed.query or parsed.fragment:
            raise ValueError("baseUrl must not contain query parameters or a fragment")
        return value.rstrip("/")

    @field_validator("path")
    @classmethod
    def safe_path(cls, value: str) -> str:
        parsed = urlsplit(value)
        if not value.startswith("/") or parsed.scheme or parsed.netloc:
            raise ValueError("path must be an absolute URL path")
        if parsed.query or parsed.fragment:
            raise ValueError("path must not contain query parameters or a fragment")
        return value


class PostgreSQLConnection(ApiModel):
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str
    schema_name: str = Field(serialization_alias="schema", validation_alias="schema")
    relation: str
    ssl_mode: Literal["disable", "prefer", "require", "verify-ca", "verify-full"] = "prefer"

    @field_validator("host")
    @classmethod
    def host_contains_no_connection_material(cls, value: str) -> str:
        if any(character in value for character in ("@", "/", "?", "#")) or value != value.strip():
            raise ValueError("host must contain only a hostname or IP address, never credentials")
        return value


class EndpointBase(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    secret_ref: str | None = Field(default=None, max_length=255)


class HttpEndpointCreate(EndpointBase):
    protocol: Literal["http-rest"]
    connection: HttpConnection


class PostgreSQLEndpointCreate(EndpointBase):
    protocol: Literal["postgresql"]
    connection: PostgreSQLConnection


EndpointCreate = Annotated[
    HttpEndpointCreate | PostgreSQLEndpointCreate, Field(discriminator="protocol")
]


class EndpointIdentity(ApiModel):
    id: uuid.UUID
    data_product_id: uuid.UUID
    created_at: datetime


class HttpEndpointResponse(EndpointIdentity, HttpEndpointCreate):
    pass


class PostgreSQLEndpointResponse(EndpointIdentity, PostgreSQLEndpointCreate):
    pass


EndpointResponse = Annotated[
    HttpEndpointResponse | PostgreSQLEndpointResponse, Field(discriminator="protocol")
]


class EndpointReadBase(ApiModel):
    name: str
    description: str | None


class HttpEndpointReadResponse(EndpointIdentity, EndpointReadBase):
    protocol: Literal["http-rest"]
    connection: HttpConnection


class PostgreSQLEndpointReadResponse(EndpointIdentity, EndpointReadBase):
    protocol: Literal["postgresql"]
    connection: PostgreSQLConnection


EndpointReadResponse = Annotated[
    HttpEndpointReadResponse | PostgreSQLEndpointReadResponse,
    Field(discriminator="protocol"),
]


class LineageEdgeResponse(ApiModel):
    id: uuid.UUID
    source_urn: str
    target_urn: str
    relation_type: str
    transformation: str | None
    state: str
    created_at: datetime


class LineageResponse(ApiModel):
    product_urn: str
    edges: list[LineageEdgeResponse]


class ProvenanceEventResponse(ApiModel):
    id: uuid.UUID
    data_product_id: uuid.UUID | None
    product_urn: str
    sequence: int
    event_type: str
    actor: str
    details: dict[str, Any]
    occurred_at: datetime


class AuditEventResponse(ApiModel):
    id: uuid.UUID
    resource_type: str
    resource_id: str
    action: str
    actor: str
    revision: int | None
    details: dict[str, Any]
    occurred_at: datetime


ProductActivityCategory = Literal[
    "metadata",
    "quality",
    "access",
    "governance",
    "deployment",
    "poc_system",
]
ProductActivityStatus = Literal["info", "pending", "success", "warning", "failure"]


class ProductActivityActor(ApiModel):
    display_name: str
    kind: Literal["person", "system", "role"]


class ProductActivityFact(ApiModel):
    label: str
    value: str


class ProductActivityItem(ApiModel):
    key: str
    event_type: str
    category: ProductActivityCategory
    status: ProductActivityStatus
    title: str
    description: str
    occurred_at: datetime
    actor: ProductActivityActor
    product_revision: int | None = None
    policy_revision: int | None = None
    facts: list[ProductActivityFact] = Field(default_factory=list)
    technical_evidence: list[ProductActivityFact] = Field(default_factory=list)


class ProductActivityResponse(ApiModel):
    detail_level: Literal["summary", "privileged"]
    items: list[ProductActivityItem]


class SubjectSelectors(ApiModel):
    user_ids: list[str] = Field(default_factory=list)
    machine_ids: list[str] = Field(default_factory=list)
    group_ids: list[str] = Field(default_factory=list)


class PolicySubject(ApiModel):
    type: Literal["person", "machine", "group"]
    id: str = Field(min_length=1, max_length=255)


class MetadataChannels(ApiModel):
    koby_mcp: bool = False
    i14y: bool = False


class GroupSnapshot(ApiModel):
    group_id: str = Field(min_length=1, max_length=200)
    membership_revision: int = Field(ge=1)
    member_ids: list[str] = Field(min_length=1)


class WeeklyAvailability(ApiModel):
    weekdays: list[
        Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    ] = Field(min_length=1, max_length=7)
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    time_zone: str = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def valid_window(self) -> WeeklyAvailability:
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("weekdays must not contain duplicates")
        if self.end_time <= self.start_time:
            raise ValueError(
                "endTime must be later than startTime; overnight windows are not supported"
            )
        try:
            ZoneInfo(self.time_zone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timeZone must be a valid IANA time zone") from exc
        return self


ServiceLevelStatus = Literal[
    "draft", "pending_approval", "published", "rejected", "withdrawn"
]
ServiceLevelText = Annotated[str, Field(min_length=1, max_length=500)]
FIXED_BEST_EFFORT_LIMITATION = "Keine Uptime-, RTO-/RPO- oder Lösungszeitgarantie."


class ServiceLevelSupportWindow(ApiModel):
    weekdays: list[
        Literal[
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ]
    ] = Field(min_length=1, max_length=7)
    start: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    timezone: Literal["Europe/Zurich"] = "Europe/Zurich"

    @model_validator(mode="after")
    def valid_support_window(self) -> ServiceLevelSupportWindow:
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("weekdays must not contain duplicates")
        if self.end <= self.start:
            raise ValueError("end must be later than start")
        return self


class ServiceLevelDefinition(ApiModel):
    template_version: Literal[1] = 1
    purpose_and_suitable_use: str = Field(min_length=20, max_length=2000)
    availability_commitment: Literal["best_effort"] = "best_effort"
    freshness_tolerance_business_days: int = Field(ge=0, le=365)
    support_window: ServiceLevelSupportWindow
    initial_response_target_support_hours: int = Field(ge=1, le=120)
    planned_maintenance_notice_hours: int = Field(ge=0, le=720)
    usage_conditions: list[ServiceLevelText] = Field(min_length=1, max_length=8)
    known_limitations: list[ServiceLevelText] = Field(min_length=1, max_length=8)
    next_review_on: date

    @field_validator("purpose_and_suitable_use")
    @classmethod
    def normalized_purpose(cls, value: str) -> str:
        normalized = reject_unsafe_service_level_text(value)
        if len(normalized) < 20:
            raise ValueError("purposeAndSuitableUse must contain at least 20 characters")
        return normalized

    @field_validator("usage_conditions", "known_limitations")
    @classmethod
    def normalized_unique_texts(
        cls, value: list[str], info: ValidationInfo
    ) -> list[str]:
        normalized = [reject_unsafe_service_level_text(item) for item in value]
        if any(not item for item in normalized):
            raise ValueError("entries must not be empty")
        if len({item.casefold() for item in normalized}) != len(normalized):
            raise ValueError("entries must be unique")
        if (
            info.field_name == "known_limitations"
            and FIXED_BEST_EFFORT_LIMITATION.casefold()
            not in {item.casefold() for item in normalized}
        ):
            if len(normalized) >= 8:
                raise ValueError(
                    "knownLimitations must leave room for the fixed best-effort limitation"
                )
            normalized.append(FIXED_BEST_EFFORT_LIMITATION)
        return normalized


class ServiceLevelRevisionWrite(ApiModel):
    valid_from: date
    valid_until: date | None = None
    definition: ServiceLevelDefinition

    @model_validator(mode="after")
    def valid_dates(self) -> ServiceLevelRevisionWrite:
        today = datetime.now(ZoneInfo("Europe/Zurich")).date()
        if self.valid_from < today:
            raise ValueError("validFrom must not be before today in Europe/Zurich")
        if self.valid_until is not None and self.valid_until < self.valid_from:
            raise ValueError("validUntil must be on or after validFrom")
        if self.definition.next_review_on < self.valid_from:
            raise ValueError("nextReviewOn must be within the SLA validity period")
        if (
            self.valid_until is not None
            and self.definition.next_review_on > self.valid_until
        ):
            raise ValueError("nextReviewOn must be within the SLA validity period")
        return self


class ServiceLevelPersonResponse(ApiModel):
    display_name: str
    organization: str
    role: Literal["data_owner", "control_person"]


class ServiceLevelChangeResponse(ApiModel):
    field: str
    previous_value: Any | None = None
    current_value: Any | None = None


class ServiceLevelRevisionResponse(ApiModel):
    revision_id: uuid.UUID
    data_product_id: uuid.UUID
    revision: int
    lock_version: int
    status: ServiceLevelStatus
    source: Literal["published", "owner_draft"]
    valid_from: date
    valid_until: date | None
    effective_valid_until: date | None
    definition: ServiceLevelDefinition
    owner: ServiceLevelPersonResponse
    control_person: ServiceLevelPersonResponse | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    decided_at: datetime | None
    published_at: datetime | None
    decision: Literal["approve", "reject"] | None = None
    rejection_reason: str | None = None
    supersedes_revision: int | None = None
    superseded_by_revision: int | None = None
    superseded_from: date | None = None
    changes: list[ServiceLevelChangeResponse] = Field(default_factory=list)


class ServiceLevelBaselineResponse(ApiModel):
    revision_id: None = None
    revision: Literal[0] = 0
    lock_version: Literal[0] = 0
    status: Literal["baseline"] = "baseline"
    source: Literal["platform_default"] = "platform_default"
    valid_from: date
    valid_until: None = None
    effective_valid_until: None = None
    definition: ServiceLevelDefinition
    published_at: None = None


class ServiceLevelLegalReference(ApiModel):
    code: Literal["ISG", "ISV", "DSG", "DSV", "EMBAG", "BGÖ", "VBGÖ", "BGA", "VBGA"]
    title: str
    reference: str
    url: str
    applicability: str


class ServiceLevelSummaryResponse(ApiModel):
    data_product_id: uuid.UUID
    as_of: date
    source: Literal["platform_default", "published"]
    state: Literal["baseline", "active", "scheduled", "expired"]
    current: ServiceLevelBaselineResponse | ServiceLevelRevisionResponse
    next_scheduled: ServiceLevelRevisionResponse | None
    can_edit: bool
    can_review: bool
    owner: ServiceLevelPersonResponse
    control_person: ServiceLevelPersonResponse | None
    legal_references: list[ServiceLevelLegalReference]


class ServiceLevelRevisionListResponse(ApiModel):
    items: list[ServiceLevelRevisionResponse]
    detail_level: Literal["public", "privileged"]
    latest_revision: int
    etag: str


class ServiceLevelDecisionCreate(ApiModel):
    decision: Literal["approve", "reject"]
    reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def reason_matches_decision(self) -> ServiceLevelDecisionCreate:
        self.reason = (
            reject_unsafe_service_level_text(self.reason)
            if self.reason and self.reason.strip()
            else None
        )
        if self.decision == "reject" and self.reason is None:
            raise ValueError("reason is required when rejecting an SLA revision")
        if self.decision == "approve" and self.reason is not None:
            raise ValueError("reason is only accepted when rejecting an SLA revision")
        return self


class ControlPersonUpdate(ApiModel):
    control_person_user_id: str = Field(min_length=1, max_length=200)


class ControlPersonUpdateResponse(ApiModel):
    data_product_id: uuid.UUID
    product_revision: int
    control_person: ServiceLevelPersonResponse


class EffectiveAccessGrantResponse(ApiModel):
    protocols: list[Literal["http", "postgresql"]] = Field(min_length=1)
    valid_from: date
    valid_until: date
    weekly_availability: WeeklyAvailability | None = None


class ProductEffectiveAccessResponse(ApiModel):
    granted: bool
    grants: list[EffectiveAccessGrantResponse] = Field(default_factory=list)


class PolicyGrant(ApiModel):
    subject: PolicySubject
    actions: list[Literal["data.read"]] = Field(default_factory=lambda: ["data.read"], min_length=1)
    protocols: list[Literal["http", "postgresql"]] = Field(min_length=1)
    valid_from: date
    valid_until: date
    data_variant: Literal["original", "modified"] = "original"
    metadata_channels: MetadataChannels = Field(default_factory=MetadataChannels)
    group_snapshot: GroupSnapshot | None = None
    weekly_availability: WeeklyAvailability | None = None

    @model_validator(mode="after")
    def valid_period(self) -> PolicyGrant:
        if self.valid_until < self.valid_from:
            raise ValueError("validUntil must be on or after validFrom")
        return self


class AccessRequestFulfillment(ApiModel):
    access_request_id: uuid.UUID
    fulfillment_subject: PolicySubject


class ResourceSelectors(ApiModel):
    product_urns: list[str] = Field(min_length=1)
    owners: list[str] = Field(min_length=1)


class PolicyDefinition(ApiModel):
    default_effect: Literal["deny"] = "deny"
    effect: Literal["allow", "deny"] = "allow"
    subjects: SubjectSelectors = Field(default_factory=SubjectSelectors)
    resources: ResourceSelectors
    actions: list[Literal["data.read"]] = Field(default_factory=lambda: ["data.read"])
    protocols: list[Literal["http", "postgresql"]] = Field(default_factory=lambda: ["http"])
    grants: list[PolicyGrant] = Field(default_factory=list)


class PolicyCreate(ApiModel):
    definition: PolicyDefinition


class PolicyDeploymentResponse(ApiModel):
    id: uuid.UUID
    target: Literal["opa", "postgresql"]
    desired_revision: int
    observed_revision: int | None
    state: Literal["pending", "deployed", "failed"]
    error: str | None
    updated_at: datetime


class PolicyRevisionResponse(ApiModel):
    id: uuid.UUID
    data_product_id: uuid.UUID
    revision: int
    status: Literal["draft", "published", "revoked"]
    definition: PolicyDefinition
    generated_rego: str
    created_by: str
    created_at: datetime
    published_at: datetime | None
    deployments: list[PolicyDeploymentResponse] = Field(default_factory=list)


class PolicyRevisionPage(ApiModel):
    items: list[PolicyRevisionResponse]


class DeploymentAcknowledgement(ApiModel):
    policy_revision_id: uuid.UUID
    target: Literal["opa", "postgresql"]
    observed_revision: int
    state: Literal["deployed", "failed"]
    error: str | None = None


class HealthResponse(ApiModel):
    status: Literal["ok", "ready"]
    service: str
    version: str


class DemoUserResponse(ApiModel):
    id: str
    display_name: str
    organization: str
    email: str
    phone: str | None
    avatar_url: str | None
    roles: list[str]
    supervisor_user_id: str | None = None


IdentityDirectorySource = Literal["federal", "cantonal", "municipal", "federal_related"]


class IdentityDirectoryEntryResponse(ApiModel):
    id: str
    display_name: str
    organization: str
    organization_id: str | None
    email: str
    source: IdentityDirectorySource
    source_system: str


class IdentityGroupSummaryResponse(ApiModel):
    id: str
    label: str
    description: str
    source: IdentityDirectorySource
    organization_id: str | None
    membership_revision: int
    member_count: int
    user_managed: bool


class IdentityGroupDetailResponse(IdentityGroupSummaryResponse):
    members: list[IdentityDirectoryEntryResponse]


class AdministrativeOrganizationResponse(ApiModel):
    id: str
    department_code: str
    office_code: str | None
    display_name: str
    organization_type: Literal[
        "federal_council", "chancellery", "department", "office", "affiliated"
    ]
    label: str


class IdentityGroupCreate(ApiModel):
    label: str = Field(min_length=3, max_length=120)
    description: str = Field(min_length=3, max_length=500)
    member_ids: list[str] = Field(min_length=1, max_length=50)

    @field_validator("member_ids")
    @classmethod
    def unique_members(cls, value: list[str]) -> list[str]:
        normalized = [item.strip() for item in value if item.strip()]
        if not normalized or len(set(normalized)) != len(normalized):
            raise ValueError("memberIds must contain unique non-empty identity IDs")
        return normalized


class AccessSettingUpsert(ApiModel):
    grant: PolicyGrant
    access_request_fulfillments: list[AccessRequestFulfillment] = Field(default_factory=list)


class MetadataDeliveryOutboxResponse(ApiModel):
    id: uuid.UUID
    data_product_id: uuid.UUID
    product_revision: int
    policy_revision: int
    channel: Literal["i14y"]
    valid_from: date
    valid_until: date
    status: Literal["scheduled", "simulated_delivered"]
    payload: dict[str, Any]
    created_at: datetime
    delivered_at: datetime | None


class PublicationEndpoint(ApiModel):
    base_url: str = Field(min_length=1, max_length=1000)
    path: str = Field(min_length=1, max_length=1000)
    method: Literal["GET"] = "GET"

    @field_validator("base_url")
    @classmethod
    def safe_url(cls, value: str) -> str:
        parsed = urlsplit(value.strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("baseUrl must be an absolute HTTP(S) URL")
        if parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("baseUrl must not contain credentials, query parameters, or fragments")
        return value.rstrip("/")

    @field_validator("path")
    @classmethod
    def safe_path(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized.startswith("/") or "?" in normalized or "#" in normalized:
            raise ValueError("path must be an absolute URL path without query or fragment")
        return normalized


class PublicationSchemaField(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    data_type: str = Field(min_length=1, max_length=100)
    nullable: bool = False
    key_field: bool = False
    business_description: str | None = Field(default=None, max_length=2000)
    ontology_term_uri: str | None = Field(default=None, max_length=500)


class PublicationTechnicalMetadata(ApiModel):
    service_name: str = Field(min_length=1, max_length=255)
    endpoint: PublicationEndpoint
    schema_fields: list[PublicationSchemaField] = Field(min_length=1, max_length=100)


class PublicationBusinessMetadata(ApiModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    domain: str | None = Field(default=None, max_length=255)
    classification: Literal["public", "internal", "confidential", "restricted"] | None = None
    keywords: list[str] = Field(default_factory=list, max_length=30)
    contact_email: str | None = Field(default=None, max_length=320)
    update_frequency: str | None = Field(default=None, max_length=100)
    product_class_uri: str | None = Field(default=None, max_length=500)
    graph: dict[str, Any] | None = None
    dcat_reviewed: bool = False


class MetadataPublicationCreate(ApiModel):
    source_system: str = Field(min_length=1, max_length=100)
    source_product_id: str = Field(min_length=3, max_length=255, pattern=r"^[A-Za-z0-9._:-]+$")
    owner_user_id: str = Field(min_length=1, max_length=200)
    publication_mode: Literal["governance_review", "automatic"]
    discoverable: bool = True
    technical_metadata: PublicationTechnicalMetadata
    business_metadata: PublicationBusinessMetadata | None = None

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
        json_schema_extra={
            "examples": [
                {
                    "sourceSystem": "DAAIF",
                    "sourceProductId": "estv.direct-tax-assessments.v1",
                    "ownerUserId": "kassandra.valdata",
                    "publicationMode": "governance_review",
                    "discoverable": True,
                    "technicalMetadata": {
                        "serviceName": "direct-tax-assessments-api",
                        "endpoint": {
                            "baseUrl": "https://daaif-poc.example.admin.ch",
                            "path": "/api/v1/direct-tax-assessments",
                            "method": "GET",
                        },
                        "schemaFields": [
                            {
                                "name": "cantonCode",
                                "dataType": "string",
                                "nullable": False,
                                "keyField": True,
                            }
                        ],
                    },
                },
                {
                    "sourceSystem": "DAAIF",
                    "sourceProductId": "estv.vat-indicators.v1",
                    "ownerUserId": "kassandra.valdata",
                    "publicationMode": "automatic",
                    "discoverable": True,
                    "technicalMetadata": {
                        "serviceName": "vat-indicators-api",
                        "endpoint": {
                            "baseUrl": "https://daaif-poc.example.admin.ch",
                            "path": "/api/v1/vat-indicators",
                            "method": "GET",
                        },
                        "schemaFields": [
                            {
                                "name": "taxYear",
                                "dataType": "integer",
                                "nullable": False,
                                "keyField": True,
                            }
                        ],
                    },
                },
            ]
        },
    )


class MetadataPublicationResponse(ApiModel):
    publication_id: uuid.UUID
    product_id: uuid.UUID
    state: Literal["pending_review", "published_incomplete", "published"]
    created: bool
    missing_fields: list[str]
    task_ids: list[uuid.UUID]


class PocProductFixtureResponse(ApiModel):
    id: str
    owner_user_id: str
    source_product_id: str
    title: str
    maturity_level: Literal["bronze", "silver", "gold"]
    payload: dict[str, Any]
    injected_product_id: uuid.UUID | None = None


class PocGuideConfigResponse(ApiModel):
    daaif_ui_url: str | None
    environment: str


class WorkflowTaskResponse(ApiModel):
    id: uuid.UUID
    task_type: Literal[
        "metadata_quality",
        "access_governance",
        "access_request_review",
        "simulation_quality_alert",
        "simulation_discoverability_alert",
        "simulation_isbo_restriction",
        "group_membership_changed",
        "publication_approval",
        "governance_correction",
        "service_level_approval",
    ]
    status: Literal["open", "in_progress", "completed"]
    assignee_user_id: str
    data_product_id: uuid.UUID
    access_request_id: uuid.UUID | None
    simulation_event_id: uuid.UUID | None = None
    governance_submission_id: uuid.UUID | None = None
    service_level_revision_id: uuid.UUID | None = None
    title: str
    detail: str
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


SimulationEventType = Literal[
    "product_submitted",
    "quality_below_threshold",
    "not_discoverable",
    "isbo_restricted",
]


class PocSimulationEventResponse(ApiModel):
    id: uuid.UUID
    event_type: SimulationEventType
    operation: Literal["trigger", "reset", "product_reset"]
    product_id: uuid.UUID
    product_urn: str
    fixture_id: str | None
    actor_user_id: str
    trigger_event_id: uuid.UUID | None
    confirmation_name: str | None
    before_state: dict[str, Any]
    after_state: dict[str, Any]
    created_at: datetime
    active: bool = False


class PocSimulationTriggerResponse(ApiModel):
    event: PocSimulationEventResponse
    product: DataProductResponse
    task: WorkflowTaskResponse | None = None


class PocProductResetRequest(ApiModel):
    confirmation_name: str = Field(min_length=1, max_length=255)


class PocSimulationResetResponse(ApiModel):
    reset_event: PocSimulationEventResponse
    deleted_product_id: uuid.UUID | None = None


class ProductFieldReview(ApiModel):
    id: uuid.UUID
    key_field: bool
    business_description: str | None = Field(default=None, max_length=2000)
    ontology_term_uri: str | None = Field(default=None, max_length=500)


class ProductQualityReview(ApiModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=20, max_length=5000)
    domain: str = Field(min_length=1, max_length=255)
    classification: Literal["public", "internal", "confidential", "restricted"]
    contact_email: str = Field(min_length=5, max_length=320)
    update_frequency: str = Field(min_length=1, max_length=100)
    dcat_reviewed: bool
    product_class_uri: str = Field(min_length=1, max_length=500)
    fields: list[ProductFieldReview] = Field(min_length=1)
    graph: dict[str, Any]
    graph_confirmed: bool
    discoverable: bool = True
    discoverability_confirmed: Literal[True] = True


class QualityCriterion(ApiModel):
    id: Literal["access", "discoverability", "technical", "business", "graph", "ontology"]
    label: str
    complete: bool


class ProductQualityResponse(ApiModel):
    data_product_id: uuid.UUID
    score: int
    medal: Literal["bronze", "silver", "gold", "platinum"]
    criteria: list[QualityCriterion]
    dcat_reviewed: bool


class ProductQualityFieldResponse(ApiModel):
    id: uuid.UUID
    name: str
    data_type: str
    nullable: bool
    key_field: bool
    business_description: str | None


class ProductQualityMappingResponse(ApiModel):
    id: uuid.UUID
    field_id: uuid.UUID | None
    mapping_type: Literal["product_class", "field_property"]
    status: Literal["suggested", "confirmed", "unresolved"]
    term_uri: str
    term_label: str


class ProductQualityWorkspaceResponse(ApiModel):
    quality: ProductQualityResponse
    fields: list[ProductQualityFieldResponse]
    graph: dict[str, Any] | None
    graph_status: Literal["missing", "suggested", "confirmed"]
    mappings: list[ProductQualityMappingResponse]


class OntologyVersionResponse(ApiModel):
    id: uuid.UUID
    uri: str
    version: str
    title: str
    active: bool


class OntologyAlignmentResponse(ApiModel):
    target_uri: str
    relation: Literal["exactMatch", "closeMatch"]


class OntologyTermResponse(ApiModel):
    id: uuid.UUID
    ontology_version_id: uuid.UUID
    uri: str
    kind: Literal["class", "property", "concept"]
    label: str
    definition: str
    alignments: list[OntologyAlignmentResponse] = Field(default_factory=list)


class SemanticMappingResponse(ApiModel):
    id: uuid.UUID
    data_product_id: uuid.UUID
    data_product_field_id: uuid.UUID | None
    ontology_term_id: uuid.UUID
    term_uri: str
    term_label: str
    mapping_type: Literal["product_class", "field_property"]
    status: Literal["suggested", "confirmed", "unresolved"]
    confirmed_by: str | None


class SemanticFieldMappingUpdate(ApiModel):
    field_id: uuid.UUID
    term_uri: str = Field(min_length=1, max_length=500)
    status: Literal["suggested", "confirmed", "unresolved"] = "confirmed"


class SemanticMappingsUpdate(ApiModel):
    product_class_uri: str = Field(min_length=1, max_length=500)
    product_class_status: Literal["suggested", "confirmed", "unresolved"] = "confirmed"
    field_mappings: list[SemanticFieldMappingUpdate] = Field(default_factory=list)


class AccessGovernanceCreate(ApiModel):
    discoverable: bool
    discoverability_confirmed: Literal[True]
    grants: list[PolicyGrant] = Field(default_factory=list)


class BarArchiveSetting(ApiModel):
    enabled: bool = True
    retention_years: Literal[20] = 20


class GovernanceSubmissionCreate(ApiModel):
    discoverable: bool = True
    discoverability_confirmed: Literal[True]
    grants: list[PolicyGrant] = Field(min_length=1)
    bar_archive: BarArchiveSetting = Field(default_factory=BarArchiveSetting)
    access_request_fulfillments: list[AccessRequestFulfillment] = Field(default_factory=list)

    @model_validator(mode="after")
    def http_only(self) -> GovernanceSubmissionCreate:
        if any(grant.protocols != ["http"] for grant in self.grants):
            raise ValueError("Governance submissions in V1 support HTTP REST grants only")
        request_ids = [item.access_request_id for item in self.access_request_fulfillments]
        if len(request_ids) != len(set(request_ids)):
            raise ValueError("accessRequestFulfillments must contain unique access request IDs")
        return self


class GovernanceDecisionCreate(ApiModel):
    decision: Literal["approve", "reject"]
    policy_revision: int = Field(ge=1)
    comment: str | None = Field(default=None, max_length=2000)


class GovernanceSubmissionResponse(ApiModel):
    id: uuid.UUID
    data_product_id: uuid.UUID
    policy_revision_id: uuid.UUID
    policy_revision: int
    owner_user_id: str
    approver_user_id: str
    status: Literal[
        "pending_approval",
        "approved_deploying",
        "approved",
        "rejected",
        "deployment_failed",
    ]
    revision: int
    review_snapshot: dict[str, Any]
    archive_evidence: dict[str, Any]
    decision: Literal["approve", "reject"] | None
    decision_comment: str | None
    submitted_at: datetime
    decided_at: datetime | None
    updated_at: datetime


class AccessRequestDecision(ApiModel):
    decision: Literal["approve", "reject"]
    granted_variant: Literal["original", "modified"] | None = None
    comment: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def approval_requires_variant(self) -> AccessRequestDecision:
        if self.decision == "approve" and self.granted_variant is None:
            raise ValueError("grantedVariant is required when approving")
        if self.decision == "reject" and self.granted_variant is not None:
            raise ValueError("grantedVariant is not allowed when rejecting")
        return self


class Problem(ApiModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str
    request_id: str | None = None
    errors: list[dict[str, Any]] | None = None
