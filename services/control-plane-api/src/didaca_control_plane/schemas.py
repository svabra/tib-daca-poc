from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

ResourceType = Literal["metadata", "lineage", "provenance", "policy"]
CatalogLifecycle = Literal["active", "suspended", "retired"]
HealthStatus = Literal["unknown", "healthy", "degraded", "unreachable"]
ObservedHealthStatus = Literal["healthy", "degraded", "unreachable"]
TrustState = Literal["pending", "approved", "revoked", "expired"]
SyncDirection = Literal["push", "pull"]
DeploymentStatus = Literal["pending", "in-sync", "drifted", "failed"]


def _aware(value: datetime | None) -> datetime | None:
    if value is not None and value.tzinfo is None:
        raise ValueError("timestamp must include a UTC offset")
    return value.astimezone(UTC) if value is not None else None


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        extra="forbid",
    )

    @model_validator(mode="after")
    def normalize_database_timestamps(self):
        # SQLite drops timezone metadata in isolated tests; PostgreSQL retains it.
        # Normalizing here keeps the external contract UTC in either case.
        for name in type(self).model_fields:
            value = getattr(self, name, None)
            if isinstance(value, datetime):
                normalized = (
                    value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
                )
                object.__setattr__(self, name, normalized)
        return self


class Problem(ApiModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str
    instance: str
    request_id: str
    errors: list[dict[str, object]] | None = None


class CatalogCreate(ApiModel):
    urn: Annotated[
        str, Field(pattern=r"^urn:didaca:[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]+$", max_length=255)
    ]
    name: Annotated[str, Field(min_length=1, max_length=200)]
    organization: Annotated[str, Field(min_length=1, max_length=200)]
    environment: Annotated[str, Field(min_length=1, max_length=40)]
    endpoint: Annotated[str, Field(max_length=500)]
    api_version: Annotated[str, Field(min_length=1, max_length=40)] = "v1"
    capabilities: list[Annotated[str, Field(min_length=1, max_length=80)]] = Field(
        default_factory=list, max_length=30
    )
    lifecycle: CatalogLifecycle = "active"

    @field_validator("endpoint")
    @classmethod
    def endpoint_is_http(cls, value: str) -> str:
        parsed = urlparse(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
            raise ValueError("endpoint must be an absolute HTTP or HTTPS URL")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("endpoint must not contain credentials")
        if parsed.fragment:
            raise ValueError("endpoint must not contain a fragment")
        return value.rstrip("/")

    @field_validator("capabilities")
    @classmethod
    def unique_capabilities(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)):
            raise ValueError("capabilities must be unique")
        return value


class CatalogPatch(ApiModel):
    name: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    organization: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    environment: Annotated[str | None, Field(min_length=1, max_length=40)] = None
    endpoint: Annotated[str | None, Field(max_length=500)] = None
    api_version: Annotated[str | None, Field(min_length=1, max_length=40)] = None
    capabilities: list[Annotated[str, Field(min_length=1, max_length=80)]] | None = Field(
        default=None, max_length=30
    )
    lifecycle: CatalogLifecycle | None = None

    @field_validator("endpoint")
    @classmethod
    def endpoint_is_http(cls, value: str | None) -> str | None:
        return CatalogCreate.endpoint_is_http(value) if value is not None else None

    @field_validator("capabilities")
    @classmethod
    def unique_capabilities(cls, value: list[str] | None) -> list[str] | None:
        return CatalogCreate.unique_capabilities(value) if value is not None else None


class CatalogRead(ApiModel):
    id: str
    urn: str
    name: str
    organization: str
    environment: str
    endpoint: str
    api_version: str
    capabilities: list[str]
    lifecycle: CatalogLifecycle
    desired_revision: int
    observed_revision: int
    health_status: HealthStatus
    last_checked_at: datetime | None
    created_at: datetime
    updated_at: datetime


class HealthObservationCreate(ApiModel):
    catalog_id: str
    status: ObservedHealthStatus
    status_code: Annotated[int | None, Field(ge=100, le=599)] = None
    latency_ms: Annotated[float | None, Field(ge=0)] = None
    message: Annotated[str | None, Field(max_length=500)] = None
    checked_at: datetime | None = None

    _checked_at_aware = field_validator("checked_at")(_aware)


class HealthObservationRead(ApiModel):
    id: str
    catalog_id: str
    status: ObservedHealthStatus
    status_code: int | None
    latency_ms: float | None
    message: str | None
    checked_at: datetime


class TrustGrantCreate(ApiModel):
    provider_id: str
    consumer_id: str
    state: TrustState = "pending"
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    allowed_resource_types: list[ResourceType] = Field(min_length=1)
    product_filters: list[str] = Field(default_factory=list)
    owner_filters: list[str] = Field(default_factory=list)
    domain_filters: list[str] = Field(default_factory=list)

    _valid_from_aware = field_validator("valid_from")(_aware)
    _valid_until_aware = field_validator("valid_until")(_aware)

    @model_validator(mode="after")
    def valid_window_and_direction(self) -> TrustGrantCreate:
        if self.provider_id == self.consumer_id:
            raise ValueError("providerId and consumerId must differ")
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("validUntil must be after validFrom")
        _ensure_unique(self.allowed_resource_types, "allowedResourceTypes")
        _ensure_unique(self.product_filters, "productFilters")
        _ensure_unique(self.owner_filters, "ownerFilters")
        _ensure_unique(self.domain_filters, "domainFilters")
        return self


class TrustGrantPatch(ApiModel):
    state: TrustState | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    allowed_resource_types: list[ResourceType] | None = Field(default=None, min_length=1)
    product_filters: list[str] | None = None
    owner_filters: list[str] | None = None
    domain_filters: list[str] | None = None

    _valid_from_aware = field_validator("valid_from")(_aware)
    _valid_until_aware = field_validator("valid_until")(_aware)

    @model_validator(mode="after")
    def unique_values(self) -> TrustGrantPatch:
        for name, values in (
            ("allowedResourceTypes", self.allowed_resource_types),
            ("productFilters", self.product_filters),
            ("ownerFilters", self.owner_filters),
            ("domainFilters", self.domain_filters),
        ):
            if values is not None:
                _ensure_unique(values, name)
        return self


class TrustGrantRead(ApiModel):
    id: str
    provider_id: str
    consumer_id: str
    state: TrustState
    valid_from: datetime | None
    valid_until: datetime | None
    allowed_resource_types: list[ResourceType]
    product_filters: list[str]
    owner_filters: list[str]
    domain_filters: list[str]
    revision: int
    created_at: datetime
    updated_at: datetime


class SyncConfigurationCreate(ApiModel):
    name: Annotated[str, Field(min_length=1, max_length=200)]
    source_id: str
    target_id: str
    trust_grant_id: str | None = None
    direction: SyncDirection
    resource_scopes: list[ResourceType] = Field(min_length=1)
    product_filters: list[str] = Field(default_factory=list)
    owner_filters: list[str] = Field(default_factory=list)
    domain_filters: list[str] = Field(default_factory=list)
    schedule: Annotated[str, Field(min_length=1, max_length=100)] = "manual"
    enabled: bool = False
    conflict_policy: Literal["origin-wins"] = "origin-wins"

    @model_validator(mode="after")
    def valid_route(self) -> SyncConfigurationCreate:
        if self.source_id == self.target_id:
            raise ValueError("sourceId and targetId must differ")
        _ensure_unique(self.resource_scopes, "resourceScopes")
        _ensure_unique(self.product_filters, "productFilters")
        _ensure_unique(self.owner_filters, "ownerFilters")
        _ensure_unique(self.domain_filters, "domainFilters")
        return self


class SyncConfigurationPatch(ApiModel):
    name: Annotated[str | None, Field(min_length=1, max_length=200)] = None
    trust_grant_id: str | None = None
    direction: SyncDirection | None = None
    resource_scopes: list[ResourceType] | None = Field(default=None, min_length=1)
    product_filters: list[str] | None = None
    owner_filters: list[str] | None = None
    domain_filters: list[str] | None = None
    schedule: Annotated[str | None, Field(min_length=1, max_length=100)] = None
    enabled: bool | None = None

    @model_validator(mode="after")
    def unique_values(self) -> SyncConfigurationPatch:
        for name, values in (
            ("resourceScopes", self.resource_scopes),
            ("productFilters", self.product_filters),
            ("ownerFilters", self.owner_filters),
            ("domainFilters", self.domain_filters),
        ):
            if values is not None:
                _ensure_unique(values, name)
        return self


class SyncConfigurationRead(ApiModel):
    id: str
    name: str
    source_id: str
    target_id: str
    trust_grant_id: str | None
    direction: SyncDirection
    resource_scopes: list[ResourceType]
    product_filters: list[str]
    owner_filters: list[str]
    domain_filters: list[str]
    schedule: str
    enabled: bool
    conflict_policy: Literal["origin-wins"]
    revision: int
    created_at: datetime
    updated_at: datetime
    sync_implemented: Literal[False] = False


class DeploymentObservationCreate(ApiModel):
    catalog_id: str
    component: Annotated[str, Field(min_length=1, max_length=100)]
    desired_revision: Annotated[int, Field(ge=0)]
    observed_revision: Annotated[int, Field(ge=0)]
    status: DeploymentStatus
    message: Annotated[str | None, Field(max_length=500)] = None
    observed_at: datetime | None = None

    _observed_at_aware = field_validator("observed_at")(_aware)


class DeploymentObservationRead(ApiModel):
    id: str
    catalog_id: str
    component: str
    desired_revision: int
    observed_revision: int
    status: DeploymentStatus
    message: str | None
    observed_at: datetime


class AuditEventRead(ApiModel):
    id: str
    aggregate_type: str
    aggregate_id: str
    action: str
    actor: str
    request_id: str
    details: dict[str, object]
    occurred_at: datetime


class CursorPage[T](ApiModel):
    items: list[T]
    next_cursor: str | None


def _ensure_unique(values: list[object], name: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"{name} must contain unique values")
