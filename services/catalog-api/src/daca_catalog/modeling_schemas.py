from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import Field, field_validator, model_validator

from .schemas import ApiModel, reject_unsafe_service_level_text

Language = Literal["de", "fr", "it", "en", "rm"]
Classification = Literal["unclassified", "internal", "confidential", "secret"]
LogicalStatus = Literal[
    "draft", "review_pending", "changes_requested", "published", "superseded", "retired"
]
MappingType = Literal["Direct", "Renamed", "Derived", "Lookup", "Transformed"]
MappingStatus = Literal["draft", "review_pending", "validated", "broken", "superseded"]


class ApplicationCreator(ApiModel):
    type: Literal["Application"]
    application_name: str = Field(min_length=1, max_length=255)


class InternalOrganisationCreator(ApiModel):
    type: Literal["InternalOrganisation"]
    organization_id: str = Field(min_length=1, max_length=100)
    english_name: str = Field(min_length=1, max_length=255)


class InternalPersonCreator(ApiModel):
    type: Literal["InternalPerson"]
    user_id: str = Field(min_length=1, max_length=200)


class ExternalCreator(ApiModel):
    type: Literal["ExternalOrganisationOrPerson"]
    organization_name: str = Field(min_length=1, max_length=255)
    person_name: str | None = Field(default=None, max_length=255)


CreatorReference = Annotated[
    ApplicationCreator | InternalOrganisationCreator | InternalPersonCreator | ExternalCreator,
    Field(discriminator="type"),
]


class LogicalModelAssistanceProvenanceWrite(ApiModel):
    field_path: str = Field(min_length=1, max_length=255)
    language: Language | None = None
    provider: Literal["deepl", "termdat"]
    source_text_hash: str = Field(min_length=64, max_length=64)
    source_identifier: str | None = Field(default=None, max_length=255)
    source_uri: str | None = Field(default=None, max_length=1000)
    source_modified_at: datetime | None = None
    retrieved_at: datetime
    payload_hash: str = Field(min_length=64, max_length=64)
    origin: Literal["machine_translated", "accepted_suggestion", "edited", "source_import"]


class DcatContactPoint(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    email: str | None = Field(default=None, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    uri: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def has_reachable_address(self) -> DcatContactPoint:
        if not self.email and not self.uri:
            raise ValueError("A DCAT contact point needs an email or URI")
        if self.uri and not self.uri.startswith(("http://", "https://", "urn:", "mailto:")):
            raise ValueError("Contact point URI must use http, https, urn or mailto")
        return self


class DcatPublisher(ApiModel):
    name: str = Field(min_length=1, max_length=255)
    identifier: str | None = Field(default=None, max_length=255)
    uri: str | None = Field(default=None, max_length=1000)


class DataModelRoleResponse(ApiModel):
    id: uuid.UUID
    user_id: str
    display_name: str
    department_code: str
    organization_id: str
    organization_name: str
    role: Literal["data_owner", "deputy_data_owner", "data_steward"]
    delegated_owner_user_id: str | None = None
    primary_organization_id: str | None = None
    sort_rank: int = 2
    organization_breadcrumb: list[dict[str, str]] = Field(default_factory=list)


class LogicalLocalization(ApiModel):
    language: Language
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=8000)

    @field_validator("title", "description")
    @classmethod
    def safe_text(cls, value: str) -> str:
        return reject_unsafe_service_level_text(value)


class LogicalFieldWrite(ApiModel):
    id: uuid.UUID | None = None
    business_object: str | None = Field(default=None, max_length=255)
    business_object_version_id: uuid.UUID | None = None
    name: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_.-]{0,254}$")
    data_type: str = Field(min_length=1, max_length=255)
    length: int | None = Field(default=None, ge=0)
    precision: int | None = Field(default=None, ge=0)
    short_description: str | None = Field(default=None, max_length=4000)
    comment: str | None = Field(default=None, max_length=4000)
    source_system: str | None = Field(default=None, max_length=255)
    classification: Classification = "unclassified"
    decimal_places: int | None = Field(default=None, ge=0)
    value_list_concept_id: uuid.UUID | None = None
    nullable: bool = True
    min_count: int = Field(default=0, ge=0)
    max_count: int | None = Field(default=1, ge=0)
    position: int = Field(default=0, ge=0)
    concept_ids: list[uuid.UUID] = Field(default_factory=list)
    primary_concept_id: uuid.UUID | None = None
    concept_match_explicitly_none: bool = False

    @model_validator(mode="after")
    def counts_are_consistent(self) -> LogicalFieldWrite:
        if len(self.concept_ids) != len(set(self.concept_ids)):
            raise ValueError("conceptIds must contain unique values")
        if self.concept_match_explicitly_none and (
            self.concept_ids
            or self.primary_concept_id is not None
            or self.value_list_concept_id is not None
        ):
            raise ValueError(
                "conceptMatchExplicitlyNone cannot be combined with concept links"
            )
        if self.max_count is not None and self.max_count < self.min_count:
            raise ValueError("maxCount must be greater than or equal to minCount")
        if not self.nullable and self.min_count == 0:
            self.min_count = 1
        if self.value_list_concept_id and self.value_list_concept_id not in self.concept_ids:
            self.concept_ids.append(self.value_list_concept_id)
        if self.primary_concept_id and self.primary_concept_id not in self.concept_ids:
            self.concept_ids.append(self.primary_concept_id)
        return self


class LogicalEntityWrite(ApiModel):
    id: uuid.UUID | None = None
    name: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_.-]{0,254}$")
    business_object: str | None = Field(default=None, max_length=255)
    business_object_version_id: uuid.UUID | None = None
    comment: str | None = Field(default=None, max_length=4000)
    position: int = Field(default=0, ge=0)
    fields: list[LogicalFieldWrite] = Field(min_length=1)

    @field_validator("fields")
    @classmethod
    def unique_fields(cls, value: list[LogicalFieldWrite]) -> list[LogicalFieldWrite]:
        names = [field.name.casefold() for field in value]
        if len(names) != len(set(names)):
            raise ValueError("Field names must be unique within an entity")
        identifiers = [field.id for field in value if field.id is not None]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Field IDs must be unique within an entity")
        return value


class DcatDistributionWrite(ApiModel):
    id: uuid.UUID | None = None
    title: dict[Language, str] = Field(default_factory=dict)
    access_url: str | None = Field(default=None, max_length=1000)
    download_url: str | None = Field(default=None, max_length=1000)
    media_type: str | None = Field(default=None, max_length=255)
    format: str | None = Field(default=None, max_length=255)
    license_uri: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def has_location(self) -> DcatDistributionWrite:
        if not self.access_url and not self.download_url:
            raise ValueError("A distribution needs an accessUrl or downloadUrl")
        return self


class DcatDataServiceWrite(ApiModel):
    id: uuid.UUID | None = None
    title: dict[Language, str] = Field(default_factory=dict)
    endpoint_url: str = Field(min_length=1, max_length=1000)
    endpoint_description: str | None = Field(default=None, max_length=1000)


class DcatDistributionResponse(DcatDistributionWrite):
    id: uuid.UUID
    urn: str
    origin_catalog_id: str
    dataset_id: uuid.UUID
    revision: int
    content_hash: str
    lifecycle: Literal["active", "retired"]
    version_id: uuid.UUID
    status: Literal["draft", "published", "superseded"]
    created_at: datetime
    published_at: datetime | None
    retired_at: datetime | None


class DcatDataServiceResponse(DcatDataServiceWrite):
    id: uuid.UUID
    urn: str
    origin_catalog_id: str
    dataset_id: uuid.UUID
    revision: int
    content_hash: str
    lifecycle: Literal["active", "retired"]
    version_id: uuid.UUID
    status: Literal["draft", "published", "superseded"]
    created_at: datetime
    published_at: datetime | None
    retired_at: datetime | None


class LogicalModelWrite(ApiModel):
    identifiers: list[str] = Field(min_length=1)
    localizations: list[LogicalLocalization] = Field(min_length=1)
    data_owner_user_id: str = Field(min_length=1, max_length=200)
    deputy_owner_user_id: str | None = Field(default=None, max_length=200)
    creator: CreatorReference | None = None
    identifier_mode: Literal["manual", "organization_derived"] = "manual"
    data_domain_id: uuid.UUID
    organization_unit_id: str | None = Field(default=None, min_length=1, max_length=100)
    department_code: str | None = Field(default=None, min_length=1, max_length=20)
    organization_id: str | None = Field(default=None, min_length=1, max_length=100)
    data_classification: Classification
    date_created: date
    contact_points: list[DcatContactPoint] = Field(min_length=1)
    publisher: DcatPublisher
    access_rights: str = Field(min_length=1, max_length=1000)
    themes: list[str] = Field(default_factory=list)
    media_format_hint: str | None = Field(default=None, max_length=255)
    comment: str | None = Field(default=None, max_length=4000)
    concept_ids: list[uuid.UUID] = Field(default_factory=list)
    entities: list[LogicalEntityWrite] = Field(min_length=1)
    distributions: list[DcatDistributionWrite] = Field(default_factory=list)
    data_services: list[DcatDataServiceWrite] = Field(default_factory=list)
    assistance_provenance: list[LogicalModelAssistanceProvenanceWrite] = Field(default_factory=list)

    @field_validator("identifiers")
    @classmethod
    def unique_identifiers(cls, value: list[str]) -> list[str]:
        if len(value) != 1:
            raise ValueError("Exactly one identifier is required")
        identifier = value[0].strip()
        if not identifier or any(character.isspace() for character in identifier):
            raise ValueError("The identifier must be a non-empty string without whitespace")
        return [identifier]

    @field_validator("concept_ids")
    @classmethod
    def unique_concepts(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("conceptIds must contain unique values")
        return value

    @field_validator("localizations")
    @classmethod
    def unique_localizations(cls, value: list[LogicalLocalization]) -> list[LogicalLocalization]:
        languages = [item.language for item in value]
        if "de" not in languages:
            raise ValueError("A German localization is required")
        if len(languages) != len(set(languages)):
            raise ValueError("Each language may occur only once")
        return value

    @field_validator("entities")
    @classmethod
    def unique_entities(cls, value: list[LogicalEntityWrite]) -> list[LogicalEntityWrite]:
        names = [item.name.casefold() for item in value]
        if len(names) != len(set(names)):
            raise ValueError("Entity names must be unique within a model version")
        identifiers = [item.id for item in value if item.id is not None]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("Entity IDs must be unique within a model version")
        return value

    @model_validator(mode="after")
    def owner_and_deputy_differ(self) -> LogicalModelWrite:
        if self.organization_unit_id:
            self.organization_id = self.organization_unit_id
        elif self.organization_id:
            self.organization_unit_id = self.organization_id
        else:
            raise ValueError("organizationUnitId is required")
        if self.deputy_owner_user_id == self.data_owner_user_id:
            raise ValueError("The deputy data owner must differ from the data owner")
        return self


class LogicalFieldResponse(LogicalFieldWrite):
    id: uuid.UUID
    urn: str
    origin_catalog_id: str
    revision: int = Field(ge=1)
    content_hash: str = Field(min_length=64, max_length=64)
    lifecycle: Literal["active", "retired"]
    retired_at: datetime | None
    field_version_id: uuid.UUID


class LogicalEntityResponse(ApiModel):
    id: uuid.UUID
    urn: str
    origin_catalog_id: str
    revision: int = Field(ge=1)
    content_hash: str = Field(min_length=64, max_length=64)
    lifecycle: Literal["active", "retired"]
    retired_at: datetime | None
    entity_version_id: uuid.UUID
    name: str
    business_object: str | None
    business_object_version_id: uuid.UUID | None
    comment: str | None
    position: int
    fields: list[LogicalFieldResponse]


class LogicalModelSummary(ApiModel):
    id: uuid.UUID
    urn: str
    revision: int
    published_revision: int | None
    lifecycle: Literal["active", "retired"]
    version_id: uuid.UUID
    dataset_version_id: uuid.UUID
    predecessor_version_id: uuid.UUID | None
    lock_version: int
    status: LogicalStatus
    title: str
    description: str
    data_owner_user_id: str
    deputy_owner_user_id: str | None
    department_code: str
    organization_id: str
    organization_unit_id: str
    data_domain_id: uuid.UUID
    data_classification: Classification
    has_physical_mapping: bool
    mapping_inconsistency_count: int = Field(default=0, ge=0)
    identifiers: list[str]
    identifier_mode: Literal["manual", "organization_derived"] = "manual"
    date_created: date
    field_count: int = Field(ge=0)
    created_at: datetime
    updated_at: datetime


class LogicalModelResponse(LogicalModelSummary):
    review_id: uuid.UUID | None = None
    identifiers: list[str]
    localizations: list[LogicalLocalization]
    creator: CreatorReference | None = None
    date_created: date
    contact_points: list[DcatContactPoint]
    publisher: DcatPublisher
    access_rights: str
    themes: list[str]
    media_format_hint: str | None
    comment: str | None
    concept_ids: list[uuid.UUID]
    entities: list[LogicalEntityResponse]
    distributions: list[DcatDistributionResponse]
    data_services: list[DcatDataServiceResponse]
    assistance_provenance: list[LogicalModelAssistanceProvenanceWrite]
    created_by_user_id: str
    updated_by_user_id: str
    created_at: datetime
    submitted_at: datetime | None
    published_at: datetime | None


class LogicalModelCollection(ApiModel):
    items: list[LogicalModelSummary]
    total: int


class LogicalModelVersionCollection(ApiModel):
    items: list[LogicalModelResponse]
    total: int


class PhysicalSourceResponse(ApiModel):
    id: uuid.UUID
    urn: str
    name: str
    description: str | None
    adapter_type: Literal["fixture", "postgresql", "s3"]
    department_code: str
    organization_id: str
    revision: int
    lifecycle: Literal["active", "retired"]
    latest_snapshot_id: uuid.UUID | None
    latest_snapshot_sequence: int | None
    catalog_path: str
    system_name: str
    database_name: str | None
    owner_name: str
    updated_at: datetime


class PhysicalSourceCollection(ApiModel):
    items: list[PhysicalSourceResponse]
    total: int


class PhysicalImportRequest(ApiModel):
    fixture_variant: Literal["baseline", "drift"] | None = None


class PhysicalColumnResponse(ApiModel):
    id: uuid.UUID
    stable_key: str
    urn: str
    name: str
    raw_data_type: str
    normalized_data_type: str
    character_length: int | None
    numeric_precision: int | None
    numeric_scale: int | None
    nullable: bool
    ordinal_position: int
    comment: str | None


class PhysicalTableResponse(ApiModel):
    id: uuid.UUID
    stable_key: str
    urn: str
    name: str
    kind: Literal["table", "view", "materialized_view", "parquet"]
    comment: str | None
    position: int
    storage_location: str | None = None
    media_type: str | None = None
    object_count: int | None = None
    size_bytes: int | None = None
    schema_confidence: Literal["declared", "embedded", "inferred"] | None = None
    partition_keys: list[str] = Field(default_factory=list)
    columns: list[PhysicalColumnResponse]


class PhysicalSchemaResponse(ApiModel):
    id: uuid.UUID
    stable_key: str
    urn: str
    name: str
    position: int
    tables: list[PhysicalTableResponse]


class PhysicalDatabaseResponse(ApiModel):
    id: uuid.UUID
    stable_key: str
    urn: str
    name: str
    position: int
    schemas: list[PhysicalSchemaResponse]


class PhysicalSnapshotSummary(ApiModel):
    id: uuid.UUID
    urn: str
    origin_catalog_id: str
    source_id: uuid.UUID
    source_name: str
    data_owner_name: str | None = None
    catalog_path: str
    source_adapter_type: Literal["fixture", "postgresql", "s3"]
    sequence: int
    predecessor_snapshot_id: uuid.UUID | None
    fingerprint: str
    imported_by_user_id: str
    imported_at: datetime


class PhysicalSnapshotResponse(ApiModel):
    snapshot: PhysicalSnapshotSummary
    databases: list[PhysicalDatabaseResponse]


class PhysicalSnapshotCollection(ApiModel):
    items: list[PhysicalSnapshotSummary]
    total: int


class PhysicalModelSummary(ApiModel):
    id: uuid.UUID
    snapshot_id: uuid.UUID
    source_id: uuid.UUID
    source_name: str
    source_type: Literal["fixture", "postgresql", "s3"]
    model_type: Literal["table", "view", "materialized_view", "parquet"]
    qualified_name: str
    database_name: str
    schema_name: str
    field_count: int
    storage_location: str | None = None
    media_type: str | None = None
    schema_confidence: Literal["declared", "embedded", "inferred"] | None = None
    size_bytes: int | None = None
    snapshot_sequence: int
    imported_at: datetime


class PhysicalModelCollection(ApiModel):
    items: list[PhysicalModelSummary]
    total: int


class DriftChangeResponse(ApiModel):
    id: uuid.UUID
    change_type: Literal[
        "table_added",
        "table_removed",
        "column_added",
        "column_removed",
        "type_changed",
        "length_changed",
        "precision_changed",
        "scale_changed",
        "nullability_changed",
        "rename_candidate",
    ]
    asset_key: str
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    confidence: float | None
    impacted_logical_field_ids: list[uuid.UUID]
    impacted_mapping_ids: list[uuid.UUID]
    review_status: Literal["pending", "accepted", "rejected", "not_applicable"]


class DriftReportResponse(ApiModel):
    id: uuid.UUID | None
    source_id: uuid.UUID
    previous_snapshot_id: uuid.UUID | None
    current_snapshot_id: uuid.UUID
    summary: dict[str, int]
    changes: list[DriftChangeResponse]
    created_at: datetime | None


class DerivationField(ApiModel):
    physical_column_id: uuid.UUID
    name: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_.-]{0,254}$")
    data_type: str = Field(min_length=1, max_length=255)
    length: int | None = Field(default=None, ge=0)
    precision: int | None = Field(default=None, ge=0)
    scale: int | None = Field(default=None, ge=0)
    nullable: bool = True
    min_count: int = Field(default=0, ge=0)
    max_count: int | None = Field(default=1, ge=0)
    classification: Classification = "internal"
    selected: bool = True
    concept_ids: list[uuid.UUID] = Field(default_factory=list)
    primary_concept_id: uuid.UUID | None = None
    concept_match_explicitly_none: bool = False

    @model_validator(mode="after")
    def counts_are_consistent(self) -> DerivationField:
        if len(self.concept_ids) != len(set(self.concept_ids)):
            raise ValueError("conceptIds must contain unique values")
        if self.concept_match_explicitly_none and (
            self.concept_ids or self.primary_concept_id is not None
        ):
            raise ValueError(
                "conceptMatchExplicitlyNone cannot be combined with concept links"
            )
        if self.primary_concept_id is not None and self.primary_concept_id not in self.concept_ids:
            raise ValueError("primaryConceptId must identify one of conceptIds")
        if len(self.concept_ids) > 1 and self.primary_concept_id is None:
            raise ValueError("primaryConceptId is required when a field has multiple concepts")
        if self.max_count is not None and self.max_count < self.min_count:
            raise ValueError("maxCount must be greater than or equal to minCount")
        if not self.nullable and self.min_count == 0:
            self.min_count = 1
        return self


class DeriveLogicalModelRequest(ApiModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=8000)
    data_domain_id: uuid.UUID
    data_owner_user_id: str
    deputy_owner_user_id: str | None = None
    fields: list[DerivationField] | None = None

    @field_validator("fields")
    @classmethod
    def unique_columns(cls, value: list[DerivationField] | None) -> list[DerivationField] | None:
        if value is None:
            return value
        identifiers = [item.physical_column_id for item in value]
        if len(identifiers) != len(set(identifiers)):
            raise ValueError("physicalColumnId values must be unique")
        if not any(item.selected for item in value):
            raise ValueError("At least one derivation field must be selected")
        return value


class DerivedFieldBinding(ApiModel):
    physical_column_id: uuid.UUID
    entity_name: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_.-]{0,254}$")
    logical_field_name: str = Field(pattern=r"^[A-Za-z_][A-Za-z0-9_.-]{0,254}$")


class DerivedLogicalModelRequest(ApiModel):
    logical_model: LogicalModelWrite
    field_mappings: list[DerivedFieldBinding] = Field(min_length=1)

    @field_validator("field_mappings")
    @classmethod
    def unique_bindings(
        cls, value: list[DerivedFieldBinding]
    ) -> list[DerivedFieldBinding]:
        physical_ids = [item.physical_column_id for item in value]
        logical_refs = [
            (item.entity_name.casefold(), item.logical_field_name.casefold())
            for item in value
        ]
        if len(physical_ids) != len(set(physical_ids)):
            raise ValueError("physicalColumnId values must be unique")
        if len(logical_refs) != len(set(logical_refs)):
            raise ValueError("Logical field bindings must be unique")
        return value


class DerivationPreviewResponse(ApiModel):
    table_id: uuid.UUID
    snapshot_id: uuid.UUID
    title: str
    description: str
    data_domain_id: uuid.UUID
    data_owner_user_id: str
    deputy_owner_user_id: str | None
    fields: list[DerivationField]


class AssetMappingWrite(ApiModel):
    logical_model_version_id: uuid.UUID
    physical_snapshot_id: uuid.UUID
    mapping_type: MappingType
    classification: Classification = "unclassified"
    transformation_rule: str | None = Field(default=None, max_length=8000)
    comment: str | None = Field(default=None, max_length=4000)
    responsible_user_id: str
    valid_from: date
    valid_to: date | None = None
    logical_field_version_ids: list[uuid.UUID] = Field(min_length=1)
    physical_column_ids: list[uuid.UUID] = Field(min_length=1)

    @field_validator("logical_field_version_ids", "physical_column_ids")
    @classmethod
    def unique_refs(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(value) != len(set(value)):
            raise ValueError("Mapping references must be unique")
        return value


class MappingIssue(ApiModel):
    severity: Literal["error", "warning"]
    code: str
    message: str
    logical_field_version_id: uuid.UUID | None = None
    physical_column_id: uuid.UUID | None = None


class MappingDriftEvidence(ApiModel):
    report_id: uuid.UUID
    previous_snapshot_id: uuid.UUID
    current_snapshot_id: uuid.UUID


class MappingValidation(ApiModel):
    valid: bool
    issues: list[MappingIssue]
    drift: MappingDriftEvidence | None = None


class AssetMappingResponse(ApiModel):
    id: uuid.UUID
    urn: str
    revision: int
    lifecycle: Literal["active", "retired"]
    version_id: uuid.UUID
    lock_version: int
    predecessor_version_id: uuid.UUID | None
    logical_model_id: uuid.UUID
    physical_source_id: uuid.UUID
    logical_model_version_id: uuid.UUID
    physical_snapshot_id: uuid.UUID
    mapping_type: MappingType
    classification: Classification
    status: MappingStatus
    transformation_rule: str | None
    comment: str | None
    responsible_user_id: str
    valid_from: date
    valid_to: date | None
    logical_field_version_ids: list[uuid.UUID]
    physical_column_ids: list[uuid.UUID]
    validation_result: MappingValidation
    last_drift_check_at: datetime | None
    created_by_user_id: str
    created_at: datetime
    updated_at: datetime


class AssetMappingCollection(ApiModel):
    items: list[AssetMappingResponse]
    total: int


class I14yConceptResponse(ApiModel):
    id: uuid.UUID
    identifiers: list[str]
    name: dict[str, str]
    description: dict[str, str]
    concept_type: Literal["CodeList", "Date", "Numeric", "String"]
    publisher: dict[str, Any]
    version: str | None
    publication_level: str | None
    publication_level_proposal: str | None
    registration_status: str | None
    registration_status_proposal: str | None
    themes: list[dict[str, Any]]
    valid_from: date | None
    valid_to: date | None
    conforms_to: list[str]
    constraints: dict[str, Any]
    code_list: dict[str, Any]
    system_created_at: datetime | None
    system_modified_at: datetime | None
    register_uri: str | None
    source_url: str
    detail_loaded: bool
    fetched_at: datetime


class I14yConceptCollection(ApiModel):
    items: list[I14yConceptResponse]
    total: int


class I14yCodeListEntryResponse(ApiModel):
    id: uuid.UUID
    concept_id: uuid.UUID
    code: str
    parent_code: str | None
    name: dict[str, str]
    description: dict[str, str]
    annotations: list[dict[str, Any]]
    position: int
    valid_from: date | None
    valid_to: date | None
    fetched_at: datetime


class I14ySyncRunResponse(ApiModel):
    id: uuid.UUID
    status: Literal["running", "succeeded", "partial", "failed"]
    source_url: str
    concepts_seen: int
    concepts_upserted: int
    concepts_unchanged: int
    error: str | None
    started_at: datetime
    completed_at: datetime | None


class I14ySyncStatusResponse(ApiModel):
    source_url: str
    status: Literal["never", "running", "succeeded", "partial", "failed"]
    last_successful_at: datetime | None
    concept_count: int
    last_run: I14ySyncRunResponse | None
