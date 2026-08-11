from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    metadata: dict[str, Any] = Field(validation_alias="extra_metadata", serialization_alias="metadata")
    created_at: datetime
    updated_at: datetime


class DataProductSummary(ApiModel):
    id: uuid.UUID
    urn: str
    origin_catalog: str
    revision: int
    title: str
    description: str
    owner: str
    domain: str
    lifecycle: str
    classification: str
    keywords: list[str]
    update_frequency: str | None
    metadata: dict[str, Any] = Field(validation_alias="extra_metadata", serialization_alias="metadata")
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
        null_fields = sorted(name for name in self.model_fields_set.intersection(non_nullable) if getattr(self, name) is None)
        if null_fields:
            raise ValueError(f"fields cannot be null: {', '.join(null_fields)}")
        return self


AccessRequestStatus = Literal[
    "submitted",
    "identity_review",
    "legal_review",
    "conditions_review",
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
        if not separator or not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
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


EndpointCreate = Annotated[HttpEndpointCreate | PostgreSQLEndpointCreate, Field(discriminator="protocol")]


class EndpointIdentity(ApiModel):
    id: uuid.UUID
    data_product_id: uuid.UUID
    created_at: datetime


class HttpEndpointResponse(EndpointIdentity, HttpEndpointCreate):
    pass


class PostgreSQLEndpointResponse(EndpointIdentity, PostgreSQLEndpointCreate):
    pass


EndpointResponse = Annotated[HttpEndpointResponse | PostgreSQLEndpointResponse, Field(discriminator="protocol")]


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
    data_product_id: uuid.UUID
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


class SubjectSelectors(ApiModel):
    user_ids: list[str] = Field(min_length=1)


class ResourceSelectors(ApiModel):
    product_urns: list[str] = Field(min_length=1)
    owners: list[str] = Field(min_length=1)


class PolicyDefinition(ApiModel):
    effect: Literal["allow", "deny"]
    subjects: SubjectSelectors
    resources: ResourceSelectors
    actions: list[Literal["data.read"]] = Field(min_length=1)
    protocols: list[Literal["http", "postgresql"]] = Field(min_length=1)


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


class Problem(ApiModel):
    type: str
    title: str
    status: int
    detail: str
    instance: str
    request_id: str | None = None
    errors: list[dict[str, Any]] | None = None
