# Catalog data model

The standalone catalog owns product metadata, workflows, access governance and semantic evidence.

**Storage:** PostgreSQL (`daca_catalog`), version 18.4 locally and version 17 in production.

The RHOS presentation profile stores this model in the `daca_catalog` schema of the shared
`evo1_oltp` database. Dedicated deployments continue to use the separate `daca_catalog`
database and its `public` schema.

## DAAIF boundary

DAAIF is an external source system and its internal data model is outside this repository. DaCa persists only the submitted publication envelope, normalized metadata, product fields and the resulting workflow evidence documented below. No DAAIF credentials or source records are stored.

## Product responsibility semantics

- `owner_user_id` is the primary product responsibility and the authorization anchor for owner-only actions.
- `deputy_owner_user_id` is the visible, product-specific deputy. The relation grants no owner or reviewer permissions by itself.
- `control_person_user_id` is the independent four-eyes reviewer and remains separate from deputy ownership.
- `supervisor_user_id` belongs to the demo identity directory and is only a supervisor/default-assignment hint; it is not a product deputy relation.

<!-- BEGIN GENERATED: data-model. DO NOT EDIT. -->

- SQLAlchemy source: [`services/catalog-api/src/daca_catalog/models.py`](../../services/catalog-api/src/daca_catalog/models.py)
- Alembic head: `0024_model_identifier`
- Schema fingerprint: `ffaec3230f3d3a7c`
- Migration fingerprint: `8de8bcb9e62e94b9`
- Tables: `87`

## Domain status vocabulary

- Product lifecycle is `draft`, `active`, `deprecated` or `retired`; classification is `public`, `internal`, `confidential` or `restricted`.
- Domain and glossary-term lifecycle is `active` or `retired`; retirement is a tombstone and does not remove historical product assignments. Domain requests are `submitted`, `approved`, `rejected` or `stale`.
- Glossary proposals are `submitted`, `in_review`, `accepted`, `rejected` or `stale`; per-domain reviews are `pending`, `approved` or `rejected`, and every primary Domain Owner must approve the same proposal revision.
- Access requests progress through `submitted`, `identity_review`, `legal_review`, `conditions_review`, `approved_policy_pending`, a granted state, `rejected` or `withdrawn`. Granted states distinguish `granted_original` and `granted_modified`.
- Workflow task types include `metadata_quality`, `access_governance`, `publication_approval`, `service_level_approval`, `governance_correction`, `access_request_review`, `source_access_review`, domain/glossary review and decision notifications, simulation alerts and `group_membership_changed`; tasks are actions or information and use `open`, `in_progress` and `completed` states.
- Source access requests are `submitted`, `approved` or `rejected`. A grant is derived only from approval and is interpreted at runtime as `scheduled`, `active` or `expired`; an absent `valid_until` means unbounded validity.
- Governance submissions progress through `pending_approval`, `approved_deploying`, `approved`, `rejected` or `deployment_failed`. Discoverability and metadata publication become active only after both PostgreSQL and OPA confirm the reviewed revision.
- Service-level revisions progress through `draft`, `pending_approval`, `published`, `rejected` or `withdrawn`. At most one draft or pending review exists per product, and a later publication records the effective end of the superseded revision.
- Identity sources are `federal`, `cantonal`, `municipal` and `federal_related`. Federal organizations are ordered by department and office and displayed as, for example, `EFD - BIT`. System groups are globally visible; custom groups are owner-isolated. Group membership revisions increase monotonically; existing policy snapshots never expand automatically.
- I14Y outbox entries use channel `i14y` and status `scheduled` or `simulated_delivered`; the PoC performs no external network request.
- Metadata publication modes are `governance_review` and `automatic`; stored states are `pending_review`, `published_incomplete` and `published`.
- Semantic mappings are `suggested`, `confirmed` or `unresolved`; mapping types are `product_class` and `field_property`. Ontology terms are `class`, `property` or `concept` and external alignments use `exactMatch` or `closeMatch`.
- Quality is derived from six persisted criteria: score 6 is `platinum`, 5 is `gold`, 4 is `silver`, and 0–3 is `bronze`. Fixture maturity uses `bronze`, `silver` and `gold` only.

## Persisted structured values

- `data_products.keywords` is a string array; `contact`, `quality` and physical `metadata` hold DCAT-friendly extension objects.
- `domain_change_requests.requested_payload` preserves the submitted domain draft while `review_payload` holds its revision-controlled working copy. Domains themselves remain relational and are not inferred from organizations.
- `glossary_term_localizations.alternative_labels` is a language-scoped list. Glossary proposal payloads preserve submitted and reviewed multilingual labels, definitions, domain IDs and SKOS relations; audit rows contain only identifiers and decision metadata.
- `endpoints.connection` describes only HTTP/REST or PostgreSQL connectivity and never contains credentials.
- `policy_revisions.definition` is the constrained PBAC document. Each grant targets one person, machine or group, carries its validity period, optional IANA-zone weekly availability and independent KOBY/MCP and I14Y flags; group grants contain a server-generated membership snapshot. Generated Rego is stored separately and is not editable.
- `governance_submissions.review_snapshot` preserves the exact product, grants, group memberships, office hours and policy revision reviewed by the assigned approver. `archive_evidence` records the BAR 20-year PoC choice without creating an archive job or network call.
- `metadata_delivery_outbox.payload` is a DCAT-oriented metadata snapshot for the local I14Y simulation. It contains no product data and no external delivery URL.
- `metadata_publications.normalized_payload` and `poc_product_fixtures.payload` retain normalized PoC metadata, never secrets.
- `product_context_graphs.graph` stores deterministic nodes and edges; flexible provenance/audit `details` contain metadata only.
- `service_level_revisions.definition` stores typed best-effort usage, freshness, support-window, maintenance and review-date commitments. Draft and rejection text remains private; published definitions are immutable and supersession is recorded explicitly.
- `source_catalog_entries` stores only searchable metadata, locations, synthetic object names and discoverability group IDs; it never stores hosts, credentials or connection strings. `source_access_requests.group_snapshot` and `source_access_grants.group_snapshot` freeze the trusted member IDs and group revision at submission time.
- `dcat_dataset_versions.creator`, `contact_points` and `publisher` preserve validated typed DCAT metadata; multilingual titles and descriptions remain relational. DaCa domains in `data_domain_id` are never copied into DCAT/I14Y `themes`.
- `i14y_concepts.raw_payload` and `i14y_code_list_entries.raw_payload` retain tolerant source evidence from the public read-only API. A full concept refresh is staged and committed atomically; failed runs do not partially replace the last good cache.
- Physical source `config_ref` selects server-side configuration and never contains a DSN or credentials. Snapshots and their hierarchy contain technical metadata only, never table rows.
- Asset mapping M:N rows retain explicit order and role. Validation results and drift references are metadata evidence; a broken state is appended as a successor version instead of mutating a validated revision.

## Entity relationships

```mermaid
erDiagram
    access_requests {
        uuid id PK
        string request_number UK
        uuid data_product_id FK
        string requester_id
        string requester_name
        string requester_organization
        string contact_email
        string consumer_type
        string machine_id
        text purpose
        text legal_basis
        string requested_protocol
        string requested_variant
        date valid_from
        date valid_until
        text notes
        string status
        string fulfillment_subject_type
        string fulfillment_subject_id
        integer fulfillment_group_revision
        uuid decision_policy_revision_id FK
        string granted_variant
        string request_kind
        uuid renewal_of_request_id FK
        json renewal_context
        datetime created_at
        datetime updated_at
    }
    administrative_organization_labels {
        string organization_id PK,FK
        string language PK
        string label
        string short_label
    }
    administrative_organizations {
        string id PK
        string parent_id FK
        string source_id UK
        string source_uri
        string department_code
        string office_code
        string display_name
        string organization_type
        integer department_order
        integer office_order
        boolean active
        date valid_from
        date valid_to
        datetime retired_at
        string content_hash
        uuid import_run_id FK
        datetime created_at
    }
    asset_mapping_logical_fields {
        uuid asset_mapping_version_id PK,FK
        uuid logical_field_version_id PK,FK
        integer position
        string role
    }
    asset_mapping_physical_columns {
        uuid asset_mapping_version_id PK,FK
        uuid physical_column_id PK,FK
        integer position
        string role
    }
    asset_mapping_versions {
        uuid id PK
        uuid asset_mapping_id FK
        integer revision
        integer lock_version
        uuid predecessor_version_id FK
        uuid logical_model_version_id FK
        uuid physical_snapshot_id FK
        string mapping_type
        string classification
        string status
        text transformation_rule
        text comment
        string responsible_user_id FK
        date valid_from
        date valid_to
        json validation_result
        datetime last_drift_check_at
        string content_hash
        string created_by_user_id FK
        datetime created_at
        datetime updated_at
    }
    asset_mappings {
        uuid id PK
        string urn UK
        string origin_catalog_id
        uuid logical_model_id FK
        uuid physical_source_id FK
        integer revision
        string content_hash
        string lifecycle
        string created_by_user_id FK
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    audit_events {
        uuid id PK
        string resource_type
        string resource_id
        string action
        string actor
        integer revision
        json details
        datetime occurred_at
    }
    canonical_ontology_terms {
        uuid id PK
        uuid ontology_version_id FK
        string uri UK
        string kind
        string label
        text definition
    }
    canonical_ontology_versions {
        uuid id PK
        string uri UK
        string version
        string title
        boolean active
        datetime created_at
    }
    data_model_role_assignments {
        uuid id PK
        string user_id FK
        string department_code
        string organization_id FK
        string role
        string delegated_owner_user_id FK
        boolean active
        datetime created_at
    }
    data_product_domains {
        uuid data_product_id PK,FK
        uuid domain_id PK,FK
        integer position
        string assigned_by_user_id FK
        datetime assigned_at
    }
    data_product_fields {
        uuid id PK
        uuid data_product_id FK
        string name
        string data_type
        boolean nullable
        boolean key_field
        text business_description
        datetime created_at
        datetime updated_at
    }
    data_product_glossary_terms {
        uuid data_product_id PK,FK
        uuid glossary_term_id PK,FK
        string assigned_by_user_id FK
        datetime assigned_at
    }
    data_products {
        uuid id PK
        string urn UK
        string origin_catalog
        integer revision
        integer active_policy_revision
        string owner_user_id FK
        string deputy_owner_user_id FK
        string control_person_user_id FK
        boolean discoverable
        string title
        text description
        string owner
        string domain
        string lifecycle
        string classification
        json keywords
        json contact
        string license
        json quality
        string update_frequency
        json metadata
        datetime created_at
        datetime updated_at
    }
    dcat_catalog_versions {
        uuid id PK
        uuid catalog_id FK
        integer revision
        string status
        json title
        json description
        json publisher
        string homepage
        json languages
        string content_hash
        datetime created_at
        datetime published_at
    }
    dcat_catalogs {
        uuid id PK
        string urn UK
        string origin_catalog_id
        integer revision
        string content_hash
        string lifecycle
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    dcat_data_service_versions {
        uuid id PK
        uuid data_service_id FK
        uuid dataset_version_id FK
        integer revision
        string status
        json title
        string endpoint_url
        string endpoint_description
        json serves_dataset_urns
        string content_hash
        datetime created_at
        datetime published_at
    }
    dcat_data_services {
        uuid id PK
        string urn UK
        string origin_catalog_id
        uuid dataset_id FK
        integer revision
        string content_hash
        string lifecycle
        datetime created_at
        datetime retired_at
    }
    dcat_dataset_version_localizations {
        uuid dataset_version_id PK,FK
        string language PK
        string title
        text description
    }
    dcat_dataset_versions {
        uuid id PK
        uuid dataset_id FK
        integer revision
        string status
        json identifiers
        string data_owner_user_id FK
        string deputy_owner_user_id FK
        json creator
        uuid data_domain_id FK
        string department_code
        string organization_id FK
        string data_classification
        date date_created
        json contact_points
        json publisher
        string access_rights
        json themes
        json keywords
        date issued
        datetime modified
        string content_hash
        datetime created_at
        datetime published_at
    }
    dcat_datasets {
        uuid id PK
        string urn UK
        string origin_catalog_id
        uuid catalog_id FK
        integer revision
        string content_hash
        string lifecycle
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    dcat_distribution_versions {
        uuid id PK
        uuid distribution_id FK
        uuid dataset_version_id FK
        integer revision
        string status
        json title
        string access_url
        string download_url
        string media_type
        string format
        string license_uri
        string content_hash
        datetime created_at
        datetime published_at
    }
    dcat_distributions {
        uuid id PK
        string urn UK
        string origin_catalog_id
        uuid dataset_id FK
        integer revision
        string content_hash
        string lifecycle
        datetime created_at
        datetime retired_at
    }
    demo_users {
        string id PK
        string display_name
        string organization
        string email
        string phone
        string avatar_url
        json roles
        string supervisor_user_id FK
        boolean selectable
        boolean active
        datetime created_at
    }
    domain_change_requests {
        uuid id PK
        string request_number UK
        string operation
        uuid target_domain_id FK
        integer base_revision
        string requester_user_id FK
        string status
        json requested_payload
        json review_payload
        integer revision
        string reviewer_user_id FK
        text decision_comment
        datetime decided_at
        datetime created_at
        datetime updated_at
    }
    domain_localizations {
        uuid domain_id PK,FK
        string language PK
        string preferred_label
        text definition
        string normalized_label
    }
    domains {
        uuid id PK
        string urn UK
        string origin_catalog_id
        integer revision
        string content_hash
        string lifecycle
        string owner_user_id FK
        string deputy_owner_user_id FK
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    endpoints {
        uuid id PK
        uuid data_product_id FK
        string name
        text description
        string protocol
        json connection
        string secret_ref
        datetime created_at
    }
    federal_organization_import_runs {
        uuid id PK
        string source_url
        datetime source_retrieved_at
        string snapshot_hash
        integer node_count
        string status
        text error_detail
        datetime created_at
    }
    federal_person_memberships {
        uuid id PK
        string user_id FK
        string organization_id FK
        boolean is_primary
        date valid_from
        date valid_to
        datetime created_at
    }
    glossary_term_domains {
        uuid term_id PK,FK
        uuid domain_id PK,FK
    }
    glossary_term_localizations {
        uuid term_id PK,FK
        string language PK
        string preferred_label
        json alternative_labels
        text definition
        string normalized_label
    }
    glossary_term_proposal_reviews {
        uuid proposal_id PK,FK
        uuid domain_id PK,FK
        integer proposal_revision
        string owner_user_id FK
        string status
        text decision_comment
        datetime decided_at
        datetime updated_at
    }
    glossary_term_proposals {
        uuid id PK
        string request_number UK
        string operation
        uuid target_term_id FK
        string requester_user_id FK
        uuid source_product_id FK
        integer source_product_revision
        boolean auto_attach
        string status
        json requested_payload
        json review_payload
        integer revision
        text decision_comment
        datetime decided_at
        datetime created_at
        datetime updated_at
    }
    glossary_term_relations {
        uuid id PK
        uuid source_term_id FK
        uuid target_term_id FK
        string target_uri
        string relation
        datetime created_at
    }
    glossary_terms {
        uuid id PK
        string urn UK
        string origin_catalog_id
        integer revision
        string content_hash
        string lifecycle
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    governance_submissions {
        uuid id PK
        uuid data_product_id FK
        uuid policy_revision_id FK,UK
        string owner_user_id FK
        string approver_user_id FK
        string status
        integer revision
        json review_snapshot
        json archive_evidence
        string decision
        text decision_comment
        datetime submitted_at
        datetime decided_at
        datetime updated_at
    }
    i14y_code_list_entries {
        uuid id PK
        uuid concept_id FK
        string code
        string parent_code
        json name
        json description
        json annotations
        integer position
        date valid_from
        date valid_to
        string payload_hash
        json raw_payload
        datetime fetched_at
    }
    i14y_concepts {
        uuid id PK
        json identifiers
        string legacy_identifier
        json name
        json description
        string concept_type
        json publisher
        string publisher_identifier
        string version
        string publication_level
        string publication_level_proposal
        string registration_status
        string registration_status_proposal
        json themes
        date valid_from
        date valid_to
        json conforms_to
        json constraints
        json code_list
        json source_system
        datetime system_created_at
        datetime system_modified_at
        string register_uri
        string source_url
        string payload_hash
        boolean detail_loaded
        json raw_payload
        datetime fetched_at
    }
    i14y_sync_runs {
        uuid id PK
        string status
        string source_url
        string triggered_by_user_id FK
        integer concepts_seen
        integer concepts_upserted
        integer concepts_unchanged
        text error
        json details
        datetime started_at
        datetime completed_at
    }
    identity_directory_entries {
        string id PK
        string display_name
        string organization
        string organization_id FK
        string email
        string source
        string source_system
        boolean active
        datetime created_at
        datetime updated_at
    }
    identity_group_memberships {
        string group_id PK,FK
        string identity_id PK,FK
        date valid_from
        date valid_until
        datetime created_at
    }
    identity_groups {
        string id PK
        string label
        text description
        string source
        string organization_id FK
        string owner_user_id FK
        boolean system_managed
        integer membership_revision
        boolean active
        datetime created_at
        datetime updated_at
    }
    lineage_edges {
        uuid id PK
        string source_urn
        string target_urn
        string relation_type
        text transformation
        string state
        datetime created_at
    }
    logical_concept_links {
        uuid id PK
        uuid logical_model_version_id FK
        uuid logical_field_version_id FK
        uuid concept_id FK
        string concept_version
        datetime concept_source_modified_at
        string source_uri
        boolean primary_for_i14y
        string linked_by_user_id FK
        datetime linked_at
    }
    logical_entities {
        uuid id PK
        uuid logical_model_id FK
        string urn UK
        string origin_catalog_id
        integer revision
        string content_hash
        string lifecycle
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    logical_entity_versions {
        uuid id PK
        uuid logical_model_version_id FK
        uuid logical_entity_id FK
        string origin_catalog_id
        integer revision
        string content_hash
        string name
        string business_object
        uuid business_object_version_id FK
        text comment
        integer position
    }
    logical_field_versions {
        uuid id PK
        uuid logical_entity_version_id FK
        uuid logical_field_id FK
        string origin_catalog_id
        integer revision
        string content_hash
        string business_object
        uuid business_object_version_id FK
        string name
        string data_type
        integer length
        integer precision
        text short_description
        text comment
        string source_system
        string classification
        integer decimal_places
        uuid value_list_concept_id FK
        boolean concept_match_explicitly_none
        boolean nullable
        integer min_count
        integer max_count
        integer position
    }
    logical_fields {
        uuid id PK
        uuid logical_entity_id FK
        string urn UK
        string origin_catalog_id
        integer revision
        string content_hash
        string lifecycle
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    logical_model_assistance_provenance {
        uuid id PK
        uuid logical_model_version_id FK
        string field_path
        string language
        string provider
        string source_text_hash
        string source_identifier
        string source_uri
        datetime source_modified_at
        datetime retrieved_at
        string payload_hash
        string origin
    }
    logical_model_identifier_reservations {
        uuid logical_model_id PK,FK
        string identifier
        string normalized_identifier UK
        datetime updated_at
    }
    logical_model_reviews {
        uuid id PK
        uuid logical_model_id FK
        uuid submitted_version_id FK,UK
        uuid domain_id FK
        string submitter_user_id FK
        string reviewer_user_id FK
        string status
        json review_snapshot
        text decision_comment
        datetime decided_at
        uuid result_version_id FK
        datetime created_at
    }
    logical_model_versions {
        uuid id PK
        uuid logical_model_id FK
        uuid dataset_version_id FK
        uuid predecessor_version_id FK
        integer revision
        integer lock_version
        string status
        string identifier_mode
        text comment
        string content_hash
        string created_by_user_id FK
        string updated_by_user_id FK
        datetime created_at
        datetime updated_at
        datetime submitted_at
        datetime published_at
    }
    logical_models {
        uuid id PK
        string urn UK
        string origin_catalog_id
        integer revision
        integer published_revision
        string content_hash
        string lifecycle
        string created_by_user_id FK
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    metadata_delivery_outbox {
        uuid id PK
        uuid data_product_id FK
        integer product_revision
        integer policy_revision
        string channel
        date valid_from
        date valid_until
        string status
        json payload
        datetime created_at
        datetime delivered_at
    }
    metadata_publications {
        uuid id PK
        string source_system
        string source_product_id
        uuid data_product_id FK
        string publication_mode
        boolean discoverable_explicit
        string payload_hash
        json normalized_payload
        string state
        datetime received_at
    }
    ontology_term_alignments {
        uuid id PK
        uuid term_id FK
        string target_uri
        string relation
    }
    physical_columns {
        uuid id PK
        uuid physical_table_id FK
        string stable_key
        string urn
        string name
        string raw_data_type
        string normalized_data_type
        integer character_length
        integer numeric_precision
        integer numeric_scale
        boolean nullable
        integer ordinal_position
        text comment
    }
    physical_databases {
        uuid id PK
        uuid snapshot_id FK
        string stable_key
        string urn
        string name
        integer position
    }
    physical_drift_changes {
        uuid id PK
        uuid drift_report_id FK
        string change_type
        string asset_key
        json before
        json after
        float confidence
        json impacted_logical_field_ids
        json impacted_mapping_ids
        string review_status
        datetime created_at
    }
    physical_drift_reports {
        uuid id PK
        uuid source_id FK
        uuid previous_snapshot_id FK
        uuid current_snapshot_id FK,UK
        json summary
        datetime created_at
    }
    physical_schema_snapshots {
        uuid id PK
        string urn UK
        string origin_catalog_id
        uuid source_id FK
        integer sequence
        uuid predecessor_snapshot_id FK
        string fingerprint
        string imported_by_user_id FK
        datetime imported_at
    }
    physical_schemas {
        uuid id PK
        uuid physical_database_id FK
        string stable_key
        string urn
        string name
        integer position
    }
    physical_sources {
        uuid id PK
        string urn UK
        string origin_catalog_id
        string name
        text description
        string adapter_type
        string config_ref
        string department_code
        string organization_id FK
        integer revision
        string content_hash
        string lifecycle
        string created_by_user_id FK
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    physical_tables {
        uuid id PK
        uuid physical_schema_id FK
        string stable_key
        string urn
        string name
        string kind
        text comment
        integer position
        string storage_location
        string media_type
        integer object_count
        bigint size_bytes
        string schema_confidence
        json partition_keys
    }
    poc_product_fixtures {
        string id PK
        string owner_user_id FK
        string source_product_id UK
        string title
        string maturity_level
        json payload
        datetime created_at
    }
    poc_simulation_events {
        uuid id PK
        string event_type
        string operation
        uuid product_id
        string product_urn
        string fixture_id
        string actor_user_id
        uuid trigger_event_id FK
        string confirmation_name
        json before_state
        json after_state
        datetime created_at
    }
    policy_deployments {
        uuid id PK
        uuid policy_revision_id FK
        string target
        integer desired_revision
        integer observed_revision
        string state
        text error
        datetime updated_at
    }
    policy_revisions {
        uuid id PK
        uuid data_product_id FK
        integer revision
        string status
        json definition
        text generated_rego
        string created_by
        datetime created_at
        datetime published_at
    }
    product_context_graphs {
        uuid data_product_id PK,FK
        json graph
        string status
        string confirmed_by
        datetime updated_at
    }
    product_quality_assessments {
        uuid data_product_id PK,FK
        boolean access_management_defined
        boolean discoverability_confirmed
        boolean technical_metadata_complete
        boolean business_metadata_complete
        boolean graph_confirmed
        boolean ontology_embedded
        boolean dcat_reviewed
        integer score
        string medal
        datetime updated_at
    }
    product_semantic_mappings {
        uuid id PK
        uuid data_product_id FK
        uuid data_product_field_id FK
        uuid ontology_term_id FK
        string mapping_type
        string status
        string confirmed_by
        datetime updated_at
    }
    provenance_events {
        uuid id PK
        uuid data_product_id FK
        string product_urn
        integer sequence
        string event_type
        string actor
        json details
        datetime occurred_at
    }
    seed_markers {
        string name PK
        datetime applied_at
    }
    service_level_revisions {
        uuid id PK
        uuid data_product_id FK
        integer revision
        integer lock_version
        string status
        date valid_from
        date valid_until
        json definition
        string created_by_owner_user_id FK
        string updated_by_owner_user_id FK
        string control_person_user_id FK
        json control_person_snapshot
        datetime submitted_at
        integer product_revision_at_submission
        datetime decided_at
        string decision
        string decided_by_user_id FK
        datetime published_at
        text rejection_reason
        uuid supersedes_revision_id FK
        uuid superseded_by_revision_id FK
        date superseded_from
        datetime created_at
        datetime updated_at
    }
    source_access_grants {
        uuid id PK
        uuid source_access_request_id FK,UK
        string source_id FK
        string subject_type
        string subject_id
        string subject_label
        integer group_revision
        json group_snapshot
        date valid_from
        date valid_until
        string granted_by FK
        datetime created_at
    }
    source_access_requests {
        uuid id PK
        string request_number UK
        string client_request_id
        string source_id FK
        string requester_id FK
        string requester_name
        string requester_organization
        string owner_user_id FK
        string request_title
        string subject_type
        string subject_id
        string subject_label
        integer group_revision
        json group_snapshot
        text purpose
        text legal_basis
        date valid_from
        date valid_until
        boolean conditions_accepted
        string status
        string decision_by
        text decision_comment
        datetime decided_at
        datetime created_at
        datetime updated_at
    }
    source_catalog_entries {
        string id PK
        string source_type
        string database_name
        string display_name
        text description
        string organization
        string owner_user_id FK
        json sites
        json search_objects
        json discoverability_group_ids
        json mock_profile
        boolean active
        datetime created_at
        datetime updated_at
    }
    terminology_external_references {
        uuid id PK
        uuid term_version_id FK
        string source_type
        string source_identifier
        string source_uri
        string source_version
        datetime source_modified_at
        datetime retrieved_at
        string payload_hash
        string source_label
        json text_snapshot
    }
    terminology_term_relations {
        uuid id PK
        uuid source_version_id FK
        uuid target_version_id FK
        string relation
    }
    terminology_term_responsibilities {
        uuid term_version_id PK,FK
        string role PK
        string user_id FK
    }
    terminology_term_version_domains {
        uuid term_version_id PK,FK
        uuid domain_id PK,FK
    }
    terminology_term_version_labels {
        uuid term_version_id PK,FK
        string language PK
        string preferred_label
        json alternative_labels
        text definition
        string translation_origin
        string source_text_hash
    }
    terminology_term_versions {
        uuid id PK
        uuid term_id FK
        uuid predecessor_version_id FK
        integer revision
        integer lock_version
        string status
        string concept_kind
        string content_hash
        string created_by_user_id FK
        datetime created_at
    }
    terminology_terms {
        uuid id PK
        string urn UK
        string origin_catalog_id
        integer revision
        uuid latest_version_id FK
        string content_hash
        string lifecycle
        string creator_user_id FK
        datetime created_at
        datetime updated_at
        datetime retired_at
    }
    workflow_tasks {
        uuid id PK
        string task_type
        string task_kind
        string status
        string assignee_user_id FK
        uuid data_product_id FK
        uuid access_request_id FK
        uuid simulation_event_id FK
        uuid governance_submission_id FK
        uuid service_level_revision_id FK
        uuid source_access_request_id FK
        uuid domain_change_request_id FK
        uuid glossary_term_proposal_id FK
        uuid logical_model_review_id FK
        string title
        text detail
        datetime created_at
        datetime updated_at
        datetime completed_at
        datetime acknowledged_at
    }
    data_products ||--o{ access_requests : "data_product_id"
    policy_revisions o|--o{ access_requests : "decision_policy_revision_id"
    access_requests o|--o{ access_requests : "renewal_of_request_id"
    administrative_organizations ||--o| administrative_organization_labels : "organization_id"
    administrative_organizations o|--o{ administrative_organizations : "parent_id"
    federal_organization_import_runs o|--o{ administrative_organizations : "import_run_id"
    asset_mapping_versions ||--o| asset_mapping_logical_fields : "asset_mapping_version_id"
    logical_field_versions ||--o| asset_mapping_logical_fields : "logical_field_version_id"
    asset_mapping_versions ||--o| asset_mapping_physical_columns : "asset_mapping_version_id"
    physical_columns ||--o| asset_mapping_physical_columns : "physical_column_id"
    asset_mappings ||--o{ asset_mapping_versions : "asset_mapping_id"
    asset_mapping_versions o|--o{ asset_mapping_versions : "predecessor_version_id"
    logical_model_versions ||--o{ asset_mapping_versions : "logical_model_version_id"
    physical_schema_snapshots ||--o{ asset_mapping_versions : "physical_snapshot_id"
    demo_users ||--o{ asset_mapping_versions : "responsible_user_id"
    demo_users ||--o{ asset_mapping_versions : "created_by_user_id"
    logical_models ||--o{ asset_mappings : "logical_model_id"
    physical_sources ||--o{ asset_mappings : "physical_source_id"
    demo_users ||--o{ asset_mappings : "created_by_user_id"
    canonical_ontology_versions ||--o{ canonical_ontology_terms : "ontology_version_id"
    demo_users ||--o{ data_model_role_assignments : "user_id"
    administrative_organizations ||--o{ data_model_role_assignments : "organization_id"
    demo_users o|--o{ data_model_role_assignments : "delegated_owner_user_id"
    data_products ||--o| data_product_domains : "data_product_id"
    domains ||--o| data_product_domains : "domain_id"
    demo_users ||--o{ data_product_domains : "assigned_by_user_id"
    data_products ||--o{ data_product_fields : "data_product_id"
    data_products ||--o| data_product_glossary_terms : "data_product_id"
    glossary_terms ||--o| data_product_glossary_terms : "glossary_term_id"
    demo_users ||--o{ data_product_glossary_terms : "assigned_by_user_id"
    demo_users o|--o{ data_products : "owner_user_id"
    demo_users o|--o{ data_products : "deputy_owner_user_id"
    demo_users o|--o{ data_products : "control_person_user_id"
    dcat_catalogs ||--o{ dcat_catalog_versions : "catalog_id"
    dcat_data_services ||--o{ dcat_data_service_versions : "data_service_id"
    dcat_dataset_versions ||--o{ dcat_data_service_versions : "dataset_version_id"
    dcat_datasets ||--o{ dcat_data_services : "dataset_id"
    dcat_dataset_versions ||--o| dcat_dataset_version_localizations : "dataset_version_id"
    dcat_datasets ||--o{ dcat_dataset_versions : "dataset_id"
    demo_users ||--o{ dcat_dataset_versions : "data_owner_user_id"
    demo_users o|--o{ dcat_dataset_versions : "deputy_owner_user_id"
    domains ||--o{ dcat_dataset_versions : "data_domain_id"
    administrative_organizations ||--o{ dcat_dataset_versions : "organization_id"
    dcat_catalogs ||--o{ dcat_datasets : "catalog_id"
    dcat_distributions ||--o{ dcat_distribution_versions : "distribution_id"
    dcat_dataset_versions ||--o{ dcat_distribution_versions : "dataset_version_id"
    dcat_datasets ||--o{ dcat_distributions : "dataset_id"
    demo_users o|--o{ demo_users : "supervisor_user_id"
    domains o|--o{ domain_change_requests : "target_domain_id"
    demo_users ||--o{ domain_change_requests : "requester_user_id"
    demo_users o|--o{ domain_change_requests : "reviewer_user_id"
    domains ||--o| domain_localizations : "domain_id"
    demo_users ||--o{ domains : "owner_user_id"
    demo_users ||--o{ domains : "deputy_owner_user_id"
    data_products ||--o{ endpoints : "data_product_id"
    demo_users ||--o{ federal_person_memberships : "user_id"
    administrative_organizations ||--o{ federal_person_memberships : "organization_id"
    glossary_terms ||--o| glossary_term_domains : "term_id"
    domains ||--o| glossary_term_domains : "domain_id"
    glossary_terms ||--o| glossary_term_localizations : "term_id"
    glossary_term_proposals ||--o| glossary_term_proposal_reviews : "proposal_id"
    domains ||--o| glossary_term_proposal_reviews : "domain_id"
    demo_users ||--o{ glossary_term_proposal_reviews : "owner_user_id"
    glossary_terms o|--o{ glossary_term_proposals : "target_term_id"
    demo_users ||--o{ glossary_term_proposals : "requester_user_id"
    data_products o|--o{ glossary_term_proposals : "source_product_id"
    glossary_terms ||--o{ glossary_term_relations : "source_term_id"
    glossary_terms o|--o{ glossary_term_relations : "target_term_id"
    data_products ||--o{ governance_submissions : "data_product_id"
    policy_revisions ||--o{ governance_submissions : "policy_revision_id"
    demo_users ||--o{ governance_submissions : "owner_user_id"
    demo_users ||--o{ governance_submissions : "approver_user_id"
    i14y_concepts ||--o{ i14y_code_list_entries : "concept_id"
    demo_users o|--o{ i14y_sync_runs : "triggered_by_user_id"
    administrative_organizations o|--o{ identity_directory_entries : "organization_id"
    identity_groups ||--o| identity_group_memberships : "group_id"
    identity_directory_entries ||--o| identity_group_memberships : "identity_id"
    administrative_organizations o|--o{ identity_groups : "organization_id"
    demo_users o|--o{ identity_groups : "owner_user_id"
    logical_model_versions o|--o{ logical_concept_links : "logical_model_version_id"
    logical_field_versions o|--o{ logical_concept_links : "logical_field_version_id"
    i14y_concepts ||--o{ logical_concept_links : "concept_id"
    demo_users ||--o{ logical_concept_links : "linked_by_user_id"
    logical_models ||--o{ logical_entities : "logical_model_id"
    logical_model_versions ||--o{ logical_entity_versions : "logical_model_version_id"
    logical_entities ||--o{ logical_entity_versions : "logical_entity_id"
    terminology_term_versions o|--o{ logical_entity_versions : "business_object_version_id"
    logical_entity_versions ||--o{ logical_field_versions : "logical_entity_version_id"
    logical_fields ||--o{ logical_field_versions : "logical_field_id"
    terminology_term_versions o|--o{ logical_field_versions : "business_object_version_id"
    i14y_concepts o|--o{ logical_field_versions : "value_list_concept_id"
    logical_entities ||--o{ logical_fields : "logical_entity_id"
    logical_model_versions ||--o{ logical_model_assistance_provenance : "logical_model_version_id"
    logical_models ||--o| logical_model_identifier_reservations : "logical_model_id"
    logical_models ||--o{ logical_model_reviews : "logical_model_id"
    logical_model_versions ||--o| logical_model_reviews : "submitted_version_id"
    domains ||--o{ logical_model_reviews : "domain_id"
    demo_users ||--o{ logical_model_reviews : "submitter_user_id"
    demo_users ||--o{ logical_model_reviews : "reviewer_user_id"
    logical_model_versions o|--o{ logical_model_reviews : "result_version_id"
    logical_models ||--o{ logical_model_versions : "logical_model_id"
    dcat_dataset_versions ||--o{ logical_model_versions : "dataset_version_id"
    logical_model_versions o|--o{ logical_model_versions : "predecessor_version_id"
    demo_users ||--o{ logical_model_versions : "created_by_user_id"
    demo_users ||--o{ logical_model_versions : "updated_by_user_id"
    demo_users ||--o{ logical_models : "created_by_user_id"
    data_products ||--o{ metadata_delivery_outbox : "data_product_id"
    data_products ||--o{ metadata_publications : "data_product_id"
    canonical_ontology_terms ||--o{ ontology_term_alignments : "term_id"
    physical_tables ||--o{ physical_columns : "physical_table_id"
    physical_schema_snapshots ||--o{ physical_databases : "snapshot_id"
    physical_drift_reports ||--o{ physical_drift_changes : "drift_report_id"
    physical_sources ||--o{ physical_drift_reports : "source_id"
    physical_schema_snapshots ||--o{ physical_drift_reports : "previous_snapshot_id"
    physical_schema_snapshots ||--o{ physical_drift_reports : "current_snapshot_id"
    physical_sources ||--o{ physical_schema_snapshots : "source_id"
    physical_schema_snapshots o|--o{ physical_schema_snapshots : "predecessor_snapshot_id"
    demo_users ||--o{ physical_schema_snapshots : "imported_by_user_id"
    physical_databases ||--o{ physical_schemas : "physical_database_id"
    administrative_organizations ||--o{ physical_sources : "organization_id"
    demo_users ||--o{ physical_sources : "created_by_user_id"
    physical_schemas ||--o{ physical_tables : "physical_schema_id"
    demo_users ||--o{ poc_product_fixtures : "owner_user_id"
    poc_simulation_events o|--o{ poc_simulation_events : "trigger_event_id"
    policy_revisions ||--o{ policy_deployments : "policy_revision_id"
    data_products ||--o{ policy_revisions : "data_product_id"
    data_products ||--o| product_context_graphs : "data_product_id"
    data_products ||--o| product_quality_assessments : "data_product_id"
    data_products ||--o{ product_semantic_mappings : "data_product_id"
    data_product_fields o|--o{ product_semantic_mappings : "data_product_field_id"
    canonical_ontology_terms ||--o{ product_semantic_mappings : "ontology_term_id"
    data_products o|--o{ provenance_events : "data_product_id"
    data_products ||--o{ service_level_revisions : "data_product_id"
    demo_users ||--o{ service_level_revisions : "created_by_owner_user_id"
    demo_users ||--o{ service_level_revisions : "updated_by_owner_user_id"
    demo_users o|--o{ service_level_revisions : "control_person_user_id"
    demo_users o|--o{ service_level_revisions : "decided_by_user_id"
    service_level_revisions o|--o{ service_level_revisions : "supersedes_revision_id"
    service_level_revisions o|--o{ service_level_revisions : "superseded_by_revision_id"
    source_access_requests ||--o| source_access_grants : "source_access_request_id"
    source_catalog_entries ||--o{ source_access_grants : "source_id"
    demo_users ||--o{ source_access_grants : "granted_by"
    source_catalog_entries ||--o{ source_access_requests : "source_id"
    demo_users ||--o{ source_access_requests : "requester_id"
    demo_users ||--o{ source_access_requests : "owner_user_id"
    demo_users ||--o{ source_catalog_entries : "owner_user_id"
    terminology_term_versions ||--o{ terminology_external_references : "term_version_id"
    terminology_term_versions ||--o{ terminology_term_relations : "source_version_id"
    terminology_term_versions ||--o{ terminology_term_relations : "target_version_id"
    terminology_term_versions ||--o| terminology_term_responsibilities : "term_version_id"
    demo_users ||--o{ terminology_term_responsibilities : "user_id"
    terminology_term_versions ||--o| terminology_term_version_domains : "term_version_id"
    domains ||--o| terminology_term_version_domains : "domain_id"
    terminology_term_versions ||--o| terminology_term_version_labels : "term_version_id"
    terminology_terms ||--o{ terminology_term_versions : "term_id"
    terminology_term_versions o|--o{ terminology_term_versions : "predecessor_version_id"
    demo_users ||--o{ terminology_term_versions : "created_by_user_id"
    terminology_term_versions o|--o{ terminology_terms : "latest_version_id"
    demo_users ||--o{ terminology_terms : "creator_user_id"
    demo_users ||--o{ workflow_tasks : "assignee_user_id"
    data_products o|--o{ workflow_tasks : "data_product_id"
    access_requests o|--o{ workflow_tasks : "access_request_id"
    poc_simulation_events o|--o{ workflow_tasks : "simulation_event_id"
    governance_submissions o|--o{ workflow_tasks : "governance_submission_id"
    service_level_revisions o|--o{ workflow_tasks : "service_level_revision_id"
    source_access_requests o|--o{ workflow_tasks : "source_access_request_id"
    domain_change_requests o|--o{ workflow_tasks : "domain_change_request_id"
    glossary_term_proposals o|--o{ workflow_tasks : "glossary_term_proposal_id"
    logical_model_reviews o|--o{ workflow_tasks : "logical_model_review_id"
```

Relationships in this diagram are physical foreign keys inside this database only.

## Table reference

### `access_requests`

Requests by people or machines for time-bounded access, including renewals linked to immutable source-grant evidence.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `request_number` | `VARCHAR(32)` | no | UK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `requester_id` | `VARCHAR(200)` | no | — | — |
| `requester_name` | `VARCHAR(255)` | no | — | — |
| `requester_organization` | `VARCHAR(255)` | no | — | — |
| `contact_email` | `VARCHAR(320)` | no | — | — |
| `consumer_type` | `VARCHAR(32)` | no | — | — |
| `machine_id` | `VARCHAR(255)` | yes | — | — |
| `purpose` | `TEXT` | no | — | — |
| `legal_basis` | `TEXT` | no | — | — |
| `requested_protocol` | `VARCHAR(32)` | no | — | — |
| `requested_variant` | `VARCHAR(32)` | no | — | — |
| `valid_from` | `DATE` | no | — | — |
| `valid_until` | `DATE` | no | — | — |
| `notes` | `TEXT` | yes | — | — |
| `status` | `VARCHAR(32)` | no | — | `submitted` |
| `fulfillment_subject_type` | `VARCHAR(32)` | yes | — | — |
| `fulfillment_subject_id` | `VARCHAR(255)` | yes | — | — |
| `fulfillment_group_revision` | `INTEGER` | yes | — | — |
| `decision_policy_revision_id` | `CHAR(32)` | yes | FK | — |
| `granted_variant` | `VARCHAR(32)` | yes | — | — |
| `request_kind` | `VARCHAR(32)` | no | — | `initial` |
| `renewal_of_request_id` | `CHAR(32)` | yes | FK | — |
| `renewal_context` | `JSON` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `request_number`
- Check `ck_access_request_consumer_type`: `consumer_type IN ('person', 'machine')`
- Check `ck_access_request_dates`: `valid_until >= valid_from`
- Check `ck_access_request_fulfillment_subject_type`: `fulfillment_subject_type IS NULL OR fulfillment_subject_type IN ('person', 'machine', 'group')`
- Check `ck_access_request_granted_variant`: `granted_variant IS NULL OR granted_variant IN ('original', 'modified')`
- Check `ck_access_request_kind`: `request_kind IN ('initial', 'renewal')`
- Check `ck_access_request_protocol`: `requested_protocol IN ('http', 'postgresql', 'both')`
- Check `ck_access_request_renewal_context`: `(request_kind = 'initial' AND renewal_of_request_id IS NULL AND renewal_context IS NULL) OR (request_kind = 'renewal' AND renewal_of_request_id IS NOT NULL AND renewal_context IS NOT NULL)`
- Check `ck_access_request_status`: `status IN ('submitted', 'identity_review', 'legal_review', 'conditions_review', 'approved_policy_pending', 'granted_modified', 'granted_original', 'rejected', 'withdrawn')`
- Check `ck_access_request_variant`: `requested_variant IN ('original', 'modified', 'either')`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Foreign key `decision_policy_revision_id` → `policy_revisions.id`; on delete `SET NULL`
- Foreign key `renewal_of_request_id` → `access_requests.id`; on delete `CASCADE`
- Index `ix_access_request_decision_policy` on `decision_policy_revision_id`
- Index `ix_access_request_product` on `data_product_id`
- Index `ix_access_request_renewal_of` on `renewal_of_request_id`
- Index `ix_access_request_requester` on `requester_id`
- Index `uq_access_request_open_renewal` on `renewal_of_request_id` unique

### `administrative_organization_labels`

Language-specific official labels for one imported federal organization node.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `organization_id` | `VARCHAR(100)` | no | PK, FK | — |
| `language` | `VARCHAR(8)` | no | PK | — |
| `label` | `VARCHAR(500)` | no | — | — |
| `short_label` | `VARCHAR(120)` | yes | — | — |

Constraints and indexes:

- Foreign key `organization_id` → `administrative_organizations.id`; on delete `CASCADE`

### `administrative_organizations`

Ordered federal organization hierarchy covering the Federal Council, Chancellery, departments, offices and affiliated units.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `VARCHAR(100)` | no | PK | — |
| `parent_id` | `VARCHAR(100)` | yes | FK | — |
| `source_id` | `VARCHAR(100)` | yes | UK | — |
| `source_uri` | `VARCHAR(1000)` | yes | — | — |
| `department_code` | `VARCHAR(20)` | no | — | — |
| `office_code` | `VARCHAR(40)` | yes | — | — |
| `display_name` | `VARCHAR(255)` | no | — | — |
| `organization_type` | `VARCHAR(32)` | no | — | — |
| `department_order` | `INTEGER` | no | — | — |
| `office_order` | `INTEGER` | no | — | `0` |
| `active` | `BOOLEAN` | no | — | `True` |
| `valid_from` | `DATE` | yes | — | — |
| `valid_to` | `DATE` | yes | — | — |
| `retired_at` | `DATETIME` | yes | — | — |
| `content_hash` | `VARCHAR(64)` | yes | — | — |
| `import_run_id` | `CHAR(32)` | yes | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `source_id`
- Check `ck_administrative_organization_type`: `organization_type IN ('federal_council', 'chancellery', 'department', 'office', 'affiliated')`
- Unique `uq_administrative_organization_codes`: `department_code, office_code`
- Foreign key `parent_id` → `administrative_organizations.id`; on delete `RESTRICT`
- Foreign key `import_run_id` → `federal_organization_import_runs.id`; on delete `SET NULL`
- Index `ix_administrative_org_parent` on `parent_id, active`
- Index `ix_administrative_organization_sort` on `department_order, office_order`

### `asset_mapping_logical_fields`

Ordered many-to-many references from one immutable mapping version to logical field versions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `asset_mapping_version_id` | `CHAR(32)` | no | PK, FK | — |
| `logical_field_version_id` | `CHAR(32)` | no | PK, FK | — |
| `position` | `INTEGER` | no | — | `0` |
| `role` | `VARCHAR(50)` | no | — | `source` |

Constraints and indexes:

- Unique `uq_asset_mapping_logical_position`: `asset_mapping_version_id, position`
- Foreign key `asset_mapping_version_id` → `asset_mapping_versions.id`; on delete `CASCADE`
- Foreign key `logical_field_version_id` → `logical_field_versions.id`; on delete `RESTRICT`

### `asset_mapping_physical_columns`

Ordered many-to-many references from one immutable mapping version to physical snapshot columns.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `asset_mapping_version_id` | `CHAR(32)` | no | PK, FK | — |
| `physical_column_id` | `CHAR(32)` | no | PK, FK | — |
| `position` | `INTEGER` | no | — | `0` |
| `role` | `VARCHAR(50)` | no | — | `source` |

Constraints and indexes:

- Unique `uq_asset_mapping_physical_position`: `asset_mapping_version_id, position`
- Foreign key `asset_mapping_version_id` → `asset_mapping_versions.id`; on delete `CASCADE`
- Foreign key `physical_column_id` → `physical_columns.id`; on delete `RESTRICT`

### `asset_mapping_versions`

Immutable revisions of DaCa logical-to-physical mappings, including classification, validation and drift evidence.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `asset_mapping_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `lock_version` | `INTEGER` | no | — | `1` |
| `predecessor_version_id` | `CHAR(32)` | yes | FK | — |
| `logical_model_version_id` | `CHAR(32)` | no | FK | — |
| `physical_snapshot_id` | `CHAR(32)` | no | FK | — |
| `mapping_type` | `VARCHAR(32)` | no | — | — |
| `classification` | `VARCHAR(32)` | no | — | `unclassified` |
| `status` | `VARCHAR(32)` | no | — | `draft` |
| `transformation_rule` | `TEXT` | yes | — | — |
| `comment` | `TEXT` | yes | — | — |
| `responsible_user_id` | `VARCHAR(200)` | no | FK | — |
| `valid_from` | `DATE` | no | — | — |
| `valid_to` | `DATE` | yes | — | — |
| `validation_result` | `JSON` | no | — | `dict` |
| `last_drift_check_at` | `DATETIME` | yes | — | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `created_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_asset_mapping_classification`: `classification IN ('unclassified', 'internal', 'confidential', 'secret')`
- Check `ck_asset_mapping_lock_version`: `lock_version >= 1`
- Check `ck_asset_mapping_status`: `status IN ('draft', 'review_pending', 'validated', 'broken', 'superseded')`
- Check `ck_asset_mapping_type`: `mapping_type IN ('Direct', 'Renamed', 'Derived', 'Lookup', 'Transformed')`
- Check `ck_asset_mapping_version_hash`: `length(content_hash) = 64`
- Check `ck_asset_mapping_version_revision`: `revision >= 1`
- Unique `uq_asset_mapping_version`: `asset_mapping_id, revision`
- Foreign key `asset_mapping_id` → `asset_mappings.id`; on delete `CASCADE`
- Foreign key `predecessor_version_id` → `asset_mapping_versions.id`; on delete `SET NULL`
- Foreign key `logical_model_version_id` → `logical_model_versions.id`; on delete `RESTRICT`
- Foreign key `physical_snapshot_id` → `physical_schema_snapshots.id`; on delete `RESTRICT`
- Foreign key `responsible_user_id` → `demo_users.id`
- Foreign key `created_by_user_id` → `demo_users.id`
- Index `ix_asset_mapping_version_status` on `status, responsible_user_id`

### `asset_mappings`

Federation-ready aggregate roots for mappings between a logical model and a physical source.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(700)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `logical_model_id` | `CHAR(32)` | no | FK | — |
| `physical_source_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_asset_mapping_hash`: `length(content_hash) = 64`
- Check `ck_asset_mapping_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_asset_mapping_revision`: `revision >= 1`
- Foreign key `logical_model_id` → `logical_models.id`; on delete `RESTRICT`
- Foreign key `physical_source_id` → `physical_sources.id`; on delete `RESTRICT`
- Foreign key `created_by_user_id` → `demo_users.id`
- Index `ix_asset_mapping_logical_physical` on `logical_model_id, physical_source_id`

### `audit_events`

Append-only catalog audit trail keyed by stable resource type and identifier.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `resource_type` | `VARCHAR(100)` | no | — | — |
| `resource_id` | `VARCHAR(255)` | no | — | — |
| `action` | `VARCHAR(100)` | no | — | — |
| `actor` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | yes | — | — |
| `details` | `JSON` | no | — | `dict` |
| `occurred_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Index `ix_audit_resource` on `resource_type, resource_id`

### `canonical_ontology_terms`

Classes and properties belonging to one canonical ontology version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `ontology_version_id` | `CHAR(32)` | no | FK | — |
| `uri` | `VARCHAR(500)` | no | UK | — |
| `kind` | `VARCHAR(32)` | no | — | — |
| `label` | `VARCHAR(255)` | no | — | — |
| `definition` | `TEXT` | no | — | — |

Constraints and indexes:

- Unique `unnamed`: `uri`
- Foreign key `ontology_version_id` → `canonical_ontology_versions.id`
- Index `ix_ontology_term_version` on `ontology_version_id`

### `canonical_ontology_versions`

Versioned canonical DaCa ontologies; one version can be active.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `uri` | `VARCHAR(500)` | no | UK | — |
| `version` | `VARCHAR(50)` | no | — | — |
| `title` | `VARCHAR(255)` | no | — | — |
| `active` | `BOOLEAN` | no | — | `False` |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `uri`

### `data_model_role_assignments`

Organization-scoped Data Owner, delegated deputy and Data Steward assignments used only by the modeling module.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `user_id` | `VARCHAR(200)` | no | FK | — |
| `department_code` | `VARCHAR(20)` | no | — | — |
| `organization_id` | `VARCHAR(100)` | no | FK | — |
| `role` | `VARCHAR(32)` | no | — | — |
| `delegated_owner_user_id` | `VARCHAR(200)` | yes | FK | — |
| `active` | `BOOLEAN` | no | — | `True` |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_data_model_delegation_not_self`: `delegated_owner_user_id IS NULL OR delegated_owner_user_id <> user_id`
- Check `ck_data_model_deputy_owner_required`: `role <> 'deputy_data_owner' OR delegated_owner_user_id IS NOT NULL`
- Check `ck_data_model_role`: `role IN ('data_owner', 'deputy_data_owner', 'data_steward')`
- Unique `uq_data_model_role_scope`: `user_id, organization_id, role`
- Foreign key `user_id` → `demo_users.id`
- Foreign key `organization_id` → `administrative_organizations.id`; on delete `RESTRICT`
- Foreign key `delegated_owner_user_id` → `demo_users.id`; on delete `SET NULL`
- Index `ix_data_model_role_scope` on `department_code, organization_id, role`

### `data_product_domains`

Ordered many-to-many assignments from products to governed subject domains.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `data_product_id` | `CHAR(32)` | no | PK, FK | — |
| `domain_id` | `CHAR(32)` | no | PK, FK | — |
| `position` | `INTEGER` | no | — | `0` |
| `assigned_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `assigned_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_data_product_domain_position`: `position >= 0`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Foreign key `domain_id` → `domains.id`; on delete `RESTRICT`
- Foreign key `assigned_by_user_id` → `demo_users.id`
- Index `ix_data_product_domain_domain` on `domain_id`

### `data_product_fields`

Technical schema fields and their business descriptions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `data_type` | `VARCHAR(100)` | no | — | — |
| `nullable` | `BOOLEAN` | no | — | `False` |
| `key_field` | `BOOLEAN` | no | — | `False` |
| `business_description` | `TEXT` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `uq_data_product_field_name`: `data_product_id, name`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Index `ix_data_product_field_product` on `data_product_id`

### `data_product_glossary_terms`

Accepted business-glossary concepts attached to data products.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `data_product_id` | `CHAR(32)` | no | PK, FK | — |
| `glossary_term_id` | `CHAR(32)` | no | PK, FK | — |
| `assigned_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `assigned_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Foreign key `glossary_term_id` → `glossary_terms.id`; on delete `RESTRICT`
- Foreign key `assigned_by_user_id` → `demo_users.id`
- Index `ix_data_product_glossary_term_term` on `glossary_term_id`

### `data_products`

Catalog aggregate root for metadata, ownership, lifecycle and discoverability.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(255)` | no | UK | — |
| `origin_catalog` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `active_policy_revision` | `INTEGER` | yes | — | — |
| `owner_user_id` | `VARCHAR(200)` | yes | FK | — |
| `deputy_owner_user_id` | `VARCHAR(200)` | yes | FK | — |
| `control_person_user_id` | `VARCHAR(200)` | yes | FK | — |
| `discoverable` | `BOOLEAN` | no | — | `True` |
| `title` | `VARCHAR(255)` | no | — | — |
| `description` | `TEXT` | no | — | — |
| `owner` | `VARCHAR(255)` | no | — | — |
| `domain` | `VARCHAR(255)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | — |
| `classification` | `VARCHAR(32)` | no | — | — |
| `keywords` | `JSON` | no | — | `list` |
| `contact` | `JSON` | no | — | `dict` |
| `license` | `VARCHAR(255)` | yes | — | — |
| `quality` | `JSON` | no | — | `dict` |
| `update_frequency` | `VARCHAR(100)` | yes | — | — |
| `metadata` | `JSON` | no | — | `dict` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_product_classification`: `classification IN ('public', 'internal', 'confidential', 'restricted')`
- Check `ck_product_deputy_not_owner`: `deputy_owner_user_id IS NULL OR owner_user_id IS NULL OR deputy_owner_user_id <> owner_user_id`
- Check `ck_product_lifecycle`: `lifecycle IN ('draft', 'active', 'deprecated', 'retired')`
- Foreign key `owner_user_id` → `demo_users.id`
- Foreign key `deputy_owner_user_id` → `demo_users.id`; on delete `SET NULL`
- Foreign key `control_person_user_id` → `demo_users.id`; on delete `SET NULL`

### `dcat_catalog_versions`

Immutable multilingual DCAT catalog metadata revisions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `catalog_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `title` | `JSON` | no | — | `dict` |
| `description` | `JSON` | no | — | `dict` |
| `publisher` | `JSON` | no | — | `dict` |
| `homepage` | `VARCHAR(1000)` | yes | — | — |
| `languages` | `JSON` | no | — | `list` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `published_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_dcat_catalog_status`: `status IN ('draft', 'published', 'superseded')`
- Check `ck_dcat_catalog_version_hash`: `length(content_hash) = 64`
- Check `ck_dcat_catalog_version_revision`: `revision >= 1`
- Unique `uq_dcat_catalog_version`: `catalog_id, revision`
- Foreign key `catalog_id` → `dcat_catalogs.id`; on delete `CASCADE`

### `dcat_catalogs`

Federation-ready DCAT catalog roots with stable URNs and retirement tombstones.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(500)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_dcat_catalog_hash`: `length(content_hash) = 64`
- Check `ck_dcat_catalog_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_dcat_catalog_revision`: `revision >= 1`

### `dcat_data_service_versions`

Immutable DCAT Data Service revisions pinned to an exact dataset version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_service_id` | `CHAR(32)` | no | FK | — |
| `dataset_version_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `title` | `JSON` | no | — | `dict` |
| `endpoint_url` | `VARCHAR(1000)` | no | — | — |
| `endpoint_description` | `VARCHAR(1000)` | yes | — | — |
| `serves_dataset_urns` | `JSON` | no | — | `list` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `published_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_dcat_service_status`: `status IN ('draft', 'published', 'superseded')`
- Check `ck_dcat_service_version_hash`: `length(content_hash) = 64`
- Check `ck_dcat_service_version_revision`: `revision >= 1`
- Unique `uq_dcat_service_version`: `data_service_id, revision`
- Foreign key `data_service_id` → `dcat_data_services.id`; on delete `CASCADE`
- Foreign key `dataset_version_id` → `dcat_dataset_versions.id`; on delete `RESTRICT`

### `dcat_data_services`

Federation-ready DCAT Data Service roots owned by one dataset.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(700)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `dataset_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_dcat_service_hash`: `length(content_hash) = 64`
- Check `ck_dcat_service_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_dcat_service_revision`: `revision >= 1`
- Foreign key `dataset_id` → `dcat_datasets.id`; on delete `RESTRICT`
- Index `ix_dcat_service_dataset` on `dataset_id, lifecycle`

### `dcat_dataset_version_localizations`

Language-specific titles and descriptions owned authoritatively by one DCAT dataset version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `dataset_version_id` | `CHAR(32)` | no | PK, FK | — |
| `language` | `VARCHAR(8)` | no | PK | — |
| `title` | `VARCHAR(500)` | no | — | — |
| `description` | `TEXT` | no | — | — |

Constraints and indexes:

- Check `ck_dcat_dataset_language`: `language IN ('de', 'fr', 'it', 'en', 'rm')`
- Foreign key `dataset_version_id` → `dcat_dataset_versions.id`; on delete `CASCADE`

### `dcat_dataset_versions`

Immutable DCAT dataset revisions containing typed responsibility, organization, classification, contact and publisher metadata.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `dataset_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `identifiers` | `JSON` | no | — | `list` |
| `data_owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `deputy_owner_user_id` | `VARCHAR(200)` | yes | FK | — |
| `creator` | `JSON` | no | — | — |
| `data_domain_id` | `CHAR(32)` | no | FK | — |
| `department_code` | `VARCHAR(20)` | no | — | — |
| `organization_id` | `VARCHAR(100)` | no | FK | — |
| `data_classification` | `VARCHAR(32)` | no | — | — |
| `date_created` | `DATE` | no | — | — |
| `contact_points` | `JSON` | no | — | `list` |
| `publisher` | `JSON` | no | — | `dict` |
| `access_rights` | `VARCHAR(1000)` | no | — | — |
| `themes` | `JSON` | no | — | `list` |
| `keywords` | `JSON` | no | — | `dict` |
| `issued` | `DATE` | yes | — | — |
| `modified` | `DATETIME` | yes | — | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `published_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_dcat_dataset_classification`: `data_classification IN ('unclassified', 'internal', 'confidential', 'secret')`
- Check `ck_dcat_dataset_deputy_not_owner`: `deputy_owner_user_id IS NULL OR deputy_owner_user_id <> data_owner_user_id`
- Check `ck_dcat_dataset_status`: `status IN ('draft', 'published', 'superseded')`
- Check `ck_dcat_dataset_version_hash`: `length(content_hash) = 64`
- Check `ck_dcat_dataset_version_revision`: `revision >= 1`
- Unique `uq_dcat_dataset_version`: `dataset_id, revision`
- Foreign key `dataset_id` → `dcat_datasets.id`; on delete `CASCADE`
- Foreign key `data_owner_user_id` → `demo_users.id`
- Foreign key `deputy_owner_user_id` → `demo_users.id`; on delete `SET NULL`
- Foreign key `data_domain_id` → `domains.id`; on delete `RESTRICT`
- Foreign key `organization_id` → `administrative_organizations.id`; on delete `RESTRICT`

### `dcat_datasets`

Federation-ready DCAT dataset roots independent of products, distributions and physical assets.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(500)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `catalog_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_dcat_dataset_hash`: `length(content_hash) = 64`
- Check `ck_dcat_dataset_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_dcat_dataset_revision`: `revision >= 1`
- Foreign key `catalog_id` → `dcat_catalogs.id`; on delete `RESTRICT`
- Index `ix_dcat_dataset_catalog` on `catalog_id, lifecycle`

### `dcat_distribution_versions`

Immutable DCAT Distribution revisions containing access locations, media type, format and licence.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `distribution_id` | `CHAR(32)` | no | FK | — |
| `dataset_version_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `title` | `JSON` | no | — | `dict` |
| `access_url` | `VARCHAR(1000)` | yes | — | — |
| `download_url` | `VARCHAR(1000)` | yes | — | — |
| `media_type` | `VARCHAR(255)` | yes | — | — |
| `format` | `VARCHAR(255)` | yes | — | — |
| `license_uri` | `VARCHAR(1000)` | yes | — | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `published_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_dcat_distribution_status`: `status IN ('draft', 'published', 'superseded')`
- Check `ck_dcat_distribution_version_hash`: `length(content_hash) = 64`
- Check `ck_dcat_distribution_version_revision`: `revision >= 1`
- Unique `uq_dcat_distribution_version`: `distribution_id, revision`
- Foreign key `distribution_id` → `dcat_distributions.id`; on delete `CASCADE`
- Foreign key `dataset_version_id` → `dcat_dataset_versions.id`; on delete `RESTRICT`

### `dcat_distributions`

Federation-ready DCAT Distribution roots owned by one dataset.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(700)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `dataset_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_dcat_distribution_hash`: `length(content_hash) = 64`
- Check `ck_dcat_distribution_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_dcat_distribution_revision`: `revision >= 1`
- Foreign key `dataset_id` → `dcat_datasets.id`; on delete `RESTRICT`
- Index `ix_dcat_distribution_dataset` on `dataset_id, lifecycle`

### `demo_users`

PoC identities available to the demo identity switcher.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `VARCHAR(200)` | no | PK | — |
| `display_name` | `VARCHAR(255)` | no | — | — |
| `organization` | `VARCHAR(255)` | no | — | — |
| `email` | `VARCHAR(320)` | no | — | — |
| `phone` | `VARCHAR(100)` | yes | — | — |
| `avatar_url` | `VARCHAR(500)` | yes | — | — |
| `roles` | `JSON` | no | — | `list` |
| `supervisor_user_id` | `VARCHAR(200)` | yes | FK | — |
| `selectable` | `BOOLEAN` | no | — | `True` |
| `active` | `BOOLEAN` | no | — | `True` |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Foreign key `supervisor_user_id` → `demo_users.id`; on delete `SET NULL`

### `domain_change_requests`

Versioned requests to create, update or retire a governed domain.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `request_number` | `VARCHAR(32)` | no | UK | — |
| `operation` | `VARCHAR(32)` | no | — | — |
| `target_domain_id` | `CHAR(32)` | yes | FK | — |
| `base_revision` | `INTEGER` | yes | — | — |
| `requester_user_id` | `VARCHAR(200)` | no | FK | — |
| `status` | `VARCHAR(32)` | no | — | `submitted` |
| `requested_payload` | `JSON` | no | — | `dict` |
| `review_payload` | `JSON` | no | — | `dict` |
| `revision` | `INTEGER` | no | — | `1` |
| `reviewer_user_id` | `VARCHAR(200)` | yes | FK | — |
| `decision_comment` | `TEXT` | yes | — | — |
| `decided_at` | `DATETIME` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `request_number`
- Check `ck_domain_request_operation`: `operation IN ('create', 'update', 'retire')`
- Check `ck_domain_request_revision`: `revision >= 1`
- Check `ck_domain_request_status`: `status IN ('submitted', 'approved', 'rejected', 'stale')`
- Check `ck_domain_request_target`: `(operation = 'create' AND base_revision IS NULL) OR (operation IN ('update', 'retire') AND target_domain_id IS NOT NULL AND base_revision IS NOT NULL)`
- Foreign key `target_domain_id` → `domains.id`; on delete `RESTRICT`
- Foreign key `requester_user_id` → `demo_users.id`
- Foreign key `reviewer_user_id` → `demo_users.id`
- Index `ix_domain_request_requester` on `requester_user_id, status`
- Index `ix_domain_request_target` on `target_domain_id, status`

### `domain_localizations`

BCP-47-labelled preferred names and definitions for subject domains.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `domain_id` | `CHAR(32)` | no | PK, FK | — |
| `language` | `VARCHAR(35)` | no | PK | — |
| `preferred_label` | `VARCHAR(255)` | no | — | — |
| `definition` | `TEXT` | no | — | — |
| `normalized_label` | `VARCHAR(255)` | no | — | — |

Constraints and indexes:

- Foreign key `domain_id` → `domains.id`; on delete `CASCADE`
- Index `ix_domain_localization_label` on `language, normalized_label`

### `domains`

Versioned, federation-ready subject domains with a primary Data Owner and deputy.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(255)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `deputy_owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_domain_content_hash`: `length(content_hash) = 64`
- Check `ck_domain_deputy_not_owner`: `owner_user_id <> deputy_owner_user_id`
- Check `ck_domain_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_domain_revision`: `revision >= 1`
- Foreign key `owner_user_id` → `demo_users.id`
- Foreign key `deputy_owner_user_id` → `demo_users.id`
- Index `ix_domain_lifecycle` on `lifecycle`
- Index `ix_domain_owner` on `owner_user_id`

### `endpoints`

Credential-free HTTP/REST or PostgreSQL endpoint descriptions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `description` | `TEXT` | yes | — | — |
| `protocol` | `VARCHAR(32)` | no | — | — |
| `connection` | `JSON` | no | — | — |
| `secret_ref` | `VARCHAR(255)` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_endpoint_protocol`: `protocol IN ('http-rest', 'postgresql')`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Index `ix_endpoints_data_product` on `data_product_id`

### `federal_organization_import_runs`

Auditable, content-hashed offline Staatskalender import attempts and outcomes.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `source_url` | `VARCHAR(1000)` | no | — | — |
| `source_retrieved_at` | `DATETIME` | no | — | — |
| `snapshot_hash` | `VARCHAR(64)` | no | — | — |
| `node_count` | `INTEGER` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `error_detail` | `TEXT` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- No additional constraints or explicit indexes.

### `federal_person_memberships`

Time-bounded primary organizational memberships for federal modeling and terminology personas.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `user_id` | `VARCHAR(200)` | no | FK | — |
| `organization_id` | `VARCHAR(100)` | no | FK | — |
| `is_primary` | `BOOLEAN` | no | — | `True` |
| `valid_from` | `DATE` | no | — | — |
| `valid_to` | `DATE` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `uq_federal_person_membership_period`: `user_id, organization_id, valid_from`
- Foreign key `user_id` → `demo_users.id`; on delete `CASCADE`
- Foreign key `organization_id` → `administrative_organizations.id`; on delete `RESTRICT`
- Index `ix_federal_person_membership_org` on `organization_id, valid_to`
- Index `uq_federal_person_primary_active` on `user_id` unique

### `glossary_term_domains`

Joint governance assignments connecting one glossary concept to one or more domains.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `term_id` | `CHAR(32)` | no | PK, FK | — |
| `domain_id` | `CHAR(32)` | no | PK, FK | — |

Constraints and indexes:

- Foreign key `term_id` → `glossary_terms.id`; on delete `CASCADE`
- Foreign key `domain_id` → `domains.id`; on delete `RESTRICT`
- Index `ix_glossary_term_domain_domain` on `domain_id`

### `glossary_term_localizations`

BCP-47 preferred labels, alternative labels and definitions for glossary concepts.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `term_id` | `CHAR(32)` | no | PK, FK | — |
| `language` | `VARCHAR(35)` | no | PK | — |
| `preferred_label` | `VARCHAR(255)` | no | — | — |
| `alternative_labels` | `JSON` | no | — | `list` |
| `definition` | `TEXT` | no | — | — |
| `normalized_label` | `VARCHAR(255)` | no | — | — |

Constraints and indexes:

- Foreign key `term_id` → `glossary_terms.id`; on delete `CASCADE`
- Index `ix_glossary_localization_label` on `language, normalized_label`

### `glossary_term_proposal_reviews`

One revision-bound primary-owner decision per domain affected by a glossary proposal.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `proposal_id` | `CHAR(32)` | no | PK, FK | — |
| `domain_id` | `CHAR(32)` | no | PK, FK | — |
| `proposal_revision` | `INTEGER` | no | — | — |
| `owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `status` | `VARCHAR(32)` | no | — | `pending` |
| `decision_comment` | `TEXT` | yes | — | — |
| `decided_at` | `DATETIME` | yes | — | — |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_glossary_review_revision`: `proposal_revision >= 1`
- Check `ck_glossary_review_status`: `status IN ('pending', 'approved', 'rejected')`
- Foreign key `proposal_id` → `glossary_term_proposals.id`; on delete `CASCADE`
- Foreign key `domain_id` → `domains.id`; on delete `RESTRICT`
- Foreign key `owner_user_id` → `demo_users.id`
- Index `ix_glossary_review_owner` on `owner_user_id, status`

### `glossary_term_proposals`

Versioned, editable proposals to create, update or retire business-glossary concepts.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `request_number` | `VARCHAR(32)` | no | UK | — |
| `operation` | `VARCHAR(32)` | no | — | `create` |
| `target_term_id` | `CHAR(32)` | yes | FK | — |
| `requester_user_id` | `VARCHAR(200)` | no | FK | — |
| `source_product_id` | `CHAR(32)` | yes | FK | — |
| `source_product_revision` | `INTEGER` | yes | — | — |
| `auto_attach` | `BOOLEAN` | no | — | `False` |
| `status` | `VARCHAR(32)` | no | — | `submitted` |
| `requested_payload` | `JSON` | no | — | `dict` |
| `review_payload` | `JSON` | no | — | `dict` |
| `revision` | `INTEGER` | no | — | `1` |
| `decision_comment` | `TEXT` | yes | — | — |
| `decided_at` | `DATETIME` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `request_number`
- Check `ck_glossary_proposal_auto_attach_source`: `auto_attach = false OR source_product_id IS NOT NULL`
- Check `ck_glossary_proposal_operation`: `operation IN ('create', 'update', 'retire', 'add_translation', 'link')`
- Check `ck_glossary_proposal_revision`: `revision >= 1`
- Check `ck_glossary_proposal_status`: `status IN ('submitted', 'in_review', 'accepted', 'rejected', 'stale')`
- Check `ck_glossary_proposal_target`: `(operation = 'create' AND ((status = 'accepted' AND target_term_id IS NOT NULL) OR (status <> 'accepted' AND target_term_id IS NULL))) OR (operation <> 'create' AND target_term_id IS NOT NULL)`
- Foreign key `target_term_id` → `glossary_terms.id`; on delete `RESTRICT`
- Foreign key `requester_user_id` → `demo_users.id`
- Foreign key `source_product_id` → `data_products.id`; on delete `SET NULL`
- Index `ix_glossary_proposal_requester` on `requester_user_id, status`
- Index `ix_glossary_proposal_source` on `source_product_id, status`

### `glossary_term_relations`

Directed SKOS exact, close, broader, narrower or related links between local or external concepts.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `source_term_id` | `CHAR(32)` | no | FK | — |
| `target_term_id` | `CHAR(32)` | yes | FK | — |
| `target_uri` | `VARCHAR(1000)` | yes | — | — |
| `relation` | `VARCHAR(32)` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_glossary_relation_not_self`: `target_term_id IS NULL OR source_term_id <> target_term_id`
- Check `ck_glossary_relation_target`: `(target_term_id IS NOT NULL AND target_uri IS NULL) OR (target_term_id IS NULL AND target_uri IS NOT NULL)`
- Check `ck_glossary_relation_type`: `relation IN ('exactMatch', 'closeMatch', 'broader', 'narrower', 'related')`
- Unique `uq_glossary_relation_term`: `source_term_id, target_term_id, relation`
- Unique `uq_glossary_relation_uri`: `source_term_id, target_uri, relation`
- Foreign key `source_term_id` → `glossary_terms.id`; on delete `CASCADE`
- Foreign key `target_term_id` → `glossary_terms.id`; on delete `RESTRICT`
- Index `ix_glossary_relation_source` on `source_term_id`
- Index `ix_glossary_relation_target` on `target_term_id`

### `glossary_terms`

Accepted, versioned and federation-ready multilingual business-glossary concepts.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(255)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_glossary_term_content_hash`: `length(content_hash) = 64`
- Check `ck_glossary_term_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_glossary_term_revision`: `revision >= 1`
- Index `ix_glossary_term_lifecycle` on `lifecycle`

### `governance_submissions`

Four-eyes publication evidence linking one immutable review snapshot to its exact policy revision, owner, approver and deployment state.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `policy_revision_id` | `CHAR(32)` | no | FK, UK | — |
| `owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `approver_user_id` | `VARCHAR(200)` | no | FK | — |
| `status` | `VARCHAR(32)` | no | — | `pending_approval` |
| `revision` | `INTEGER` | no | — | `1` |
| `review_snapshot` | `JSON` | no | — | — |
| `archive_evidence` | `JSON` | no | — | — |
| `decision` | `VARCHAR(16)` | yes | — | — |
| `decision_comment` | `TEXT` | yes | — | — |
| `submitted_at` | `DATETIME` | no | — | `utc_now` |
| `decided_at` | `DATETIME` | yes | — | — |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_governance_submission_decision`: `decision IS NULL OR decision IN ('approve', 'reject')`
- Check `ck_governance_submission_status`: `status IN ('pending_approval', 'approved_deploying', 'approved', 'rejected', 'deployment_failed')`
- Unique `uq_governance_submission_policy`: `policy_revision_id`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Foreign key `policy_revision_id` → `policy_revisions.id`; on delete `RESTRICT`
- Foreign key `owner_user_id` → `demo_users.id`
- Foreign key `approver_user_id` → `demo_users.id`
- Index `ix_governance_submission_approver` on `approver_user_id, status`
- Index `ix_governance_submission_product` on `data_product_id, submitted_at`

### `i14y_code_list_entries`

On-demand local cache of entries belonging to an I14Y CodeList concept.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `concept_id` | `CHAR(32)` | no | FK | — |
| `code` | `VARCHAR(500)` | no | — | — |
| `parent_code` | `VARCHAR(500)` | yes | — | — |
| `name` | `JSON` | no | — | `dict` |
| `description` | `JSON` | no | — | `dict` |
| `annotations` | `JSON` | no | — | `list` |
| `position` | `INTEGER` | no | — | `0` |
| `valid_from` | `DATE` | yes | — | — |
| `valid_to` | `DATE` | yes | — | — |
| `payload_hash` | `VARCHAR(64)` | no | — | — |
| `raw_payload` | `JSON` | no | — | `dict` |
| `fetched_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_i14y_entry_payload_hash`: `length(payload_hash) = 64`
- Unique `uq_i14y_code_list_entry_code`: `concept_id, code`
- Foreign key `concept_id` → `i14y_concepts.id`; on delete `CASCADE`
- Index `ix_i14y_entry_concept_order` on `concept_id, position`

### `i14y_concepts`

Read-only local cache of normalized public I14Y concepts with official register and API provenance.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `identifiers` | `JSON` | no | — | `list` |
| `legacy_identifier` | `VARCHAR(500)` | yes | — | — |
| `name` | `JSON` | no | — | `dict` |
| `description` | `JSON` | no | — | `dict` |
| `concept_type` | `VARCHAR(32)` | no | — | — |
| `publisher` | `JSON` | no | — | `dict` |
| `publisher_identifier` | `VARCHAR(255)` | yes | — | — |
| `version` | `VARCHAR(100)` | yes | — | — |
| `publication_level` | `VARCHAR(32)` | yes | — | — |
| `publication_level_proposal` | `VARCHAR(32)` | yes | — | — |
| `registration_status` | `VARCHAR(32)` | yes | — | — |
| `registration_status_proposal` | `VARCHAR(32)` | yes | — | — |
| `themes` | `JSON` | no | — | `list` |
| `valid_from` | `DATE` | yes | — | — |
| `valid_to` | `DATE` | yes | — | — |
| `conforms_to` | `JSON` | no | — | `list` |
| `constraints` | `JSON` | no | — | `dict` |
| `code_list` | `JSON` | no | — | `dict` |
| `source_system` | `JSON` | no | — | `dict` |
| `system_created_at` | `DATETIME` | yes | — | — |
| `system_modified_at` | `DATETIME` | yes | — | — |
| `register_uri` | `VARCHAR(1000)` | yes | — | — |
| `source_url` | `VARCHAR(1000)` | no | — | — |
| `payload_hash` | `VARCHAR(64)` | no | — | — |
| `detail_loaded` | `BOOLEAN` | no | — | `False` |
| `raw_payload` | `JSON` | no | — | `dict` |
| `fetched_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_i14y_concept_payload_hash`: `length(payload_hash) = 64`
- Check `ck_i14y_concept_type`: `concept_type IN ('CodeList', 'Date', 'Numeric', 'String')`
- Check `ck_i14y_publication_level`: `publication_level IS NULL OR publication_level IN ('Internal', 'Public')`
- Check `ck_i14y_registration_status`: `registration_status IS NULL OR registration_status IN ('Incomplete', 'Candidate', 'Recorded', 'Qualified', 'Standard', 'PreferredStandard', 'Superseded', 'Retired')`
- Index `ix_i14y_concept_fetched` on `fetched_at`
- Index `ix_i14y_concept_publisher` on `publisher_identifier`
- Index `ix_i14y_concept_type_status` on `concept_type, registration_status`

### `i14y_sync_runs`

Auditable full-cache I14Y synchronization attempts and their atomic outcome.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `source_url` | `VARCHAR(1000)` | no | — | — |
| `triggered_by_user_id` | `VARCHAR(200)` | yes | FK | — |
| `concepts_seen` | `INTEGER` | no | — | `0` |
| `concepts_upserted` | `INTEGER` | no | — | `0` |
| `concepts_unchanged` | `INTEGER` | no | — | `0` |
| `error` | `TEXT` | yes | — | — |
| `details` | `JSON` | no | — | `dict` |
| `started_at` | `DATETIME` | no | — | `utc_now` |
| `completed_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_i14y_sync_status`: `status IN ('running', 'succeeded', 'partial', 'failed')`
- Foreign key `triggered_by_user_id` → `demo_users.id`; on delete `SET NULL`
- Index `ix_i14y_sync_started` on `started_at`

### `identity_directory_entries`

Synthetic trusted people searchable across federal, cantonal, municipal and federally affiliated sources.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `VARCHAR(200)` | no | PK | — |
| `display_name` | `VARCHAR(255)` | no | — | — |
| `organization` | `VARCHAR(255)` | no | — | — |
| `organization_id` | `VARCHAR(100)` | yes | FK | — |
| `email` | `VARCHAR(320)` | no | — | — |
| `source` | `VARCHAR(32)` | no | — | — |
| `source_system` | `VARCHAR(100)` | no | — | — |
| `active` | `BOOLEAN` | no | — | `True` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_identity_directory_source`: `source IN ('federal', 'cantonal', 'municipal', 'federal_related')`
- Foreign key `organization_id` → `administrative_organizations.id`; on delete `SET NULL`
- Index `ix_identity_directory_organization` on `organization`
- Index `ix_identity_directory_source_name` on `source, display_name`

### `identity_group_memberships`

Time-bounded links from trusted groups to personal directory identities.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `group_id` | `VARCHAR(200)` | no | PK, FK | — |
| `identity_id` | `VARCHAR(200)` | no | PK, FK | — |
| `valid_from` | `DATE` | yes | — | — |
| `valid_until` | `DATE` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_identity_group_membership_dates`: `valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from`
- Foreign key `group_id` → `identity_groups.id`; on delete `CASCADE`
- Foreign key `identity_id` → `identity_directory_entries.id`; on delete `CASCADE`
- Index `ix_identity_group_membership_identity` on `identity_id`

### `identity_groups`

Versioned system or owner-managed identity groups that can be captured as immutable policy snapshots.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `VARCHAR(200)` | no | PK | — |
| `label` | `VARCHAR(255)` | no | — | — |
| `description` | `TEXT` | no | — | — |
| `source` | `VARCHAR(32)` | no | — | — |
| `organization_id` | `VARCHAR(100)` | yes | FK | — |
| `owner_user_id` | `VARCHAR(200)` | yes | FK | — |
| `system_managed` | `BOOLEAN` | no | — | `False` |
| `membership_revision` | `INTEGER` | no | — | `1` |
| `active` | `BOOLEAN` | no | — | `True` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_identity_group_source`: `source IN ('federal', 'cantonal', 'municipal', 'federal_related')`
- Foreign key `organization_id` → `administrative_organizations.id`; on delete `SET NULL`
- Foreign key `owner_user_id` → `demo_users.id`; on delete `CASCADE`
- Index `ix_identity_group_source_label` on `source, label`

### `lineage_edges`

URN-based lineage relations that may refer to products outside this catalog.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `source_urn` | `VARCHAR(255)` | no | — | — |
| `target_urn` | `VARCHAR(255)` | no | — | — |
| `relation_type` | `VARCHAR(100)` | no | — | — |
| `transformation` | `TEXT` | yes | — | — |
| `state` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_lineage_state`: `state IN ('active', 'inferred', 'deprecated')`
- Index `ix_lineage_source` on `source_urn`
- Index `ix_lineage_target` on `target_urn`

### `logical_concept_links`

Version-pinned I14Y concept references on logical models or fields; at most one field link is primary for I14Y-compatible SHACL.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_model_version_id` | `CHAR(32)` | yes | FK | — |
| `logical_field_version_id` | `CHAR(32)` | yes | FK | — |
| `concept_id` | `CHAR(32)` | no | FK | — |
| `concept_version` | `VARCHAR(100)` | yes | — | — |
| `concept_source_modified_at` | `DATETIME` | yes | — | — |
| `source_uri` | `VARCHAR(1000)` | no | — | — |
| `primary_for_i14y` | `BOOLEAN` | no | — | `False` |
| `linked_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `linked_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_logical_concept_link_target`: `(logical_model_version_id IS NOT NULL AND logical_field_version_id IS NULL) OR (logical_model_version_id IS NULL AND logical_field_version_id IS NOT NULL)`
- Foreign key `logical_model_version_id` → `logical_model_versions.id`; on delete `CASCADE`
- Foreign key `logical_field_version_id` → `logical_field_versions.id`; on delete `CASCADE`
- Foreign key `concept_id` → `i14y_concepts.id`; on delete `RESTRICT`
- Foreign key `linked_by_user_id` → `demo_users.id`
- Index `ix_logical_concept_concept` on `concept_id`
- Index `ix_logical_concept_field` on `logical_field_version_id`
- Index `ix_logical_concept_model` on `logical_model_version_id`
- Index `uq_logical_concept_field_link` on `logical_field_version_id, concept_id` unique
- Index `uq_logical_concept_model_link` on `logical_model_version_id, concept_id` unique
- Index `uq_logical_concept_primary_field` on `logical_field_version_id` unique

### `logical_entities`

Federation-ready nested entity roots with stable URNs, origin ownership, monotone revisions, content hashes and soft retirement.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_model_id` | `CHAR(32)` | no | FK | — |
| `urn` | `VARCHAR(700)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_logical_entity_content_hash`: `length(content_hash) = 64`
- Check `ck_logical_entity_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_logical_entity_revision`: `revision >= 1`
- Foreign key `logical_model_id` → `logical_models.id`; on delete `CASCADE`
- Index `ix_logical_entity_model` on `logical_model_id, lifecycle`

### `logical_entity_versions`

Immutable, origin-tagged and content-hashed entity revisions with names, business objects and ordering in one model version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_model_version_id` | `CHAR(32)` | no | FK | — |
| `logical_entity_id` | `CHAR(32)` | no | FK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `business_object` | `VARCHAR(255)` | yes | — | — |
| `business_object_version_id` | `CHAR(32)` | yes | FK | — |
| `comment` | `TEXT` | yes | — | — |
| `position` | `INTEGER` | no | — | `0` |

Constraints and indexes:

- Check `ck_logical_entity_position`: `position >= 0`
- Check `ck_logical_entity_version_content_hash`: `length(content_hash) = 64`
- Check `ck_logical_entity_version_revision`: `revision >= 1`
- Unique `uq_logical_entity_version`: `logical_model_version_id, logical_entity_id`
- Unique `uq_logical_entity_version_name`: `logical_model_version_id, name`
- Unique `uq_logical_entity_version_revision`: `logical_entity_id, revision`
- Foreign key `logical_model_version_id` → `logical_model_versions.id`; on delete `CASCADE`
- Foreign key `logical_entity_id` → `logical_entities.id`; on delete `RESTRICT`
- Foreign key `business_object_version_id` → `terminology_term_versions.id`; on delete `RESTRICT`
- Index `ix_logical_entity_version_model` on `logical_model_version_id, position`

### `logical_field_versions`

Immutable, origin-tagged and content-hashed SHACL field revisions, including constraints, cardinalities and explicit no-concept decisions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_entity_version_id` | `CHAR(32)` | no | FK | — |
| `logical_field_id` | `CHAR(32)` | no | FK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `business_object` | `VARCHAR(255)` | yes | — | — |
| `business_object_version_id` | `CHAR(32)` | yes | FK | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `data_type` | `VARCHAR(255)` | no | — | — |
| `length` | `INTEGER` | yes | — | — |
| `precision` | `INTEGER` | yes | — | — |
| `short_description` | `TEXT` | yes | — | — |
| `comment` | `TEXT` | yes | — | — |
| `source_system` | `VARCHAR(255)` | yes | — | — |
| `classification` | `VARCHAR(32)` | no | — | — |
| `decimal_places` | `INTEGER` | yes | — | — |
| `value_list_concept_id` | `CHAR(32)` | yes | FK | — |
| `concept_match_explicitly_none` | `BOOLEAN` | no | — | `False` |
| `nullable` | `BOOLEAN` | no | — | `True` |
| `min_count` | `INTEGER` | no | — | `0` |
| `max_count` | `INTEGER` | yes | — | `1` |
| `position` | `INTEGER` | no | — | `0` |

Constraints and indexes:

- Check `ck_logical_field_classification`: `classification IN ('unclassified', 'internal', 'confidential', 'secret')`
- Check `ck_logical_field_decimal_places`: `decimal_places IS NULL OR decimal_places >= 0`
- Check `ck_logical_field_length`: `length IS NULL OR length >= 0`
- Check `ck_logical_field_max_count`: `max_count IS NULL OR max_count >= min_count`
- Check `ck_logical_field_min_count`: `min_count >= 0`
- Check `ck_logical_field_position`: `position >= 0`
- Check `ck_logical_field_precision`: `precision IS NULL OR precision >= 0`
- Check `ck_logical_field_version_content_hash`: `length(content_hash) = 64`
- Check `ck_logical_field_version_revision`: `revision >= 1`
- Unique `uq_logical_field_version`: `logical_entity_version_id, logical_field_id`
- Unique `uq_logical_field_version_name`: `logical_entity_version_id, name`
- Unique `uq_logical_field_version_revision`: `logical_field_id, revision`
- Foreign key `logical_entity_version_id` → `logical_entity_versions.id`; on delete `CASCADE`
- Foreign key `logical_field_id` → `logical_fields.id`; on delete `RESTRICT`
- Foreign key `business_object_version_id` → `terminology_term_versions.id`; on delete `RESTRICT`
- Foreign key `value_list_concept_id` → `i14y_concepts.id`; on delete `SET NULL`
- Index `ix_logical_field_version_entity` on `logical_entity_version_id, position`

### `logical_fields`

Federation-ready nested field roots with stable URNs, origin ownership, monotone revisions, content hashes and soft retirement.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_entity_id` | `CHAR(32)` | no | FK | — |
| `urn` | `VARCHAR(900)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_logical_field_content_hash`: `length(content_hash) = 64`
- Check `ck_logical_field_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_logical_field_revision`: `revision >= 1`
- Foreign key `logical_entity_id` → `logical_entities.id`; on delete `CASCADE`
- Index `ix_logical_field_entity` on `logical_entity_id, lifecycle`

### `logical_model_assistance_provenance`

Version-bound DeepL and TERMDAT provenance for accepted or edited multilingual model values.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_model_version_id` | `CHAR(32)` | no | FK | — |
| `field_path` | `VARCHAR(255)` | no | — | — |
| `language` | `VARCHAR(8)` | yes | — | — |
| `provider` | `VARCHAR(32)` | no | — | — |
| `source_text_hash` | `VARCHAR(64)` | no | — | — |
| `source_identifier` | `VARCHAR(255)` | yes | — | — |
| `source_uri` | `VARCHAR(1000)` | yes | — | — |
| `source_modified_at` | `DATETIME` | yes | — | — |
| `retrieved_at` | `DATETIME` | no | — | — |
| `payload_hash` | `VARCHAR(64)` | no | — | — |
| `origin` | `VARCHAR(32)` | no | — | — |

Constraints and indexes:

- Foreign key `logical_model_version_id` → `logical_model_versions.id`; on delete `CASCADE`

### `logical_model_identifier_reservations`

Case-folded catalog-wide logical-model identifier reservations, atomically owned by one logical-model root.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `logical_model_id` | `CHAR(32)` | no | PK, FK | — |
| `identifier` | `VARCHAR(500)` | no | — | — |
| `normalized_identifier` | `VARCHAR(500)` | no | UK | — |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_logical_model_identifier_normalized`: `length(normalized_identifier) >= 1`
- Unique `uq_logical_model_identifier_normalized`: `normalized_identifier`
- Foreign key `logical_model_id` → `logical_models.id`; on delete `CASCADE`

### `logical_model_reviews`

Immutable domain-owner review snapshots, decisions and successor-version references for submitted logical models.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_model_id` | `CHAR(32)` | no | FK | — |
| `submitted_version_id` | `CHAR(32)` | no | FK, UK | — |
| `domain_id` | `CHAR(32)` | no | FK | — |
| `submitter_user_id` | `VARCHAR(200)` | no | FK | — |
| `reviewer_user_id` | `VARCHAR(200)` | no | FK | — |
| `status` | `VARCHAR(32)` | no | — | `pending` |
| `review_snapshot` | `JSON` | no | — | `dict` |
| `decision_comment` | `TEXT` | yes | — | — |
| `decided_at` | `DATETIME` | yes | — | — |
| `result_version_id` | `CHAR(32)` | yes | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `submitted_version_id`
- Foreign key `logical_model_id` → `logical_models.id`; on delete `CASCADE`
- Foreign key `submitted_version_id` → `logical_model_versions.id`; on delete `RESTRICT`
- Foreign key `domain_id` → `domains.id`; on delete `RESTRICT`
- Foreign key `submitter_user_id` → `demo_users.id`; on delete `RESTRICT`
- Foreign key `reviewer_user_id` → `demo_users.id`; on delete `RESTRICT`
- Foreign key `result_version_id` → `logical_model_versions.id`; on delete `SET NULL`
- Index `ix_logical_model_review_reviewer` on `reviewer_user_id, status`

### `logical_model_versions`

Immutable structural and workflow revisions pinned to one authoritative DCAT dataset version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `logical_model_id` | `CHAR(32)` | no | FK | — |
| `dataset_version_id` | `CHAR(32)` | no | FK | — |
| `predecessor_version_id` | `CHAR(32)` | yes | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `lock_version` | `INTEGER` | no | — | `1` |
| `status` | `VARCHAR(32)` | no | — | `draft` |
| `identifier_mode` | `VARCHAR(32)` | no | — | `manual` |
| `comment` | `TEXT` | yes | — | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `created_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `updated_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `submitted_at` | `DATETIME` | yes | — | — |
| `published_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_logical_model_lock_version`: `lock_version >= 1`
- Check `ck_logical_model_version_revision`: `revision >= 1`
- Check `ck_logical_model_version_status`: `status IN ('draft', 'review_pending', 'changes_requested', 'published', 'superseded', 'retired')`
- Check `ck_logical_version_content_hash`: `length(content_hash) = 64`
- Unique `uq_logical_model_version`: `logical_model_id, revision`
- Foreign key `logical_model_id` → `logical_models.id`; on delete `CASCADE`
- Foreign key `dataset_version_id` → `dcat_dataset_versions.id`; on delete `RESTRICT`
- Foreign key `predecessor_version_id` → `logical_model_versions.id`; on delete `SET NULL`
- Foreign key `created_by_user_id` → `demo_users.id`
- Foreign key `updated_by_user_id` → `demo_users.id`
- Index `ix_logical_version_status` on `status, logical_model_id`

### `logical_models`

Federation-ready logical model roots that can exist without products, distributions or physical assets.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(500)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `published_revision` | `INTEGER` | yes | — | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_logical_model_content_hash`: `length(content_hash) = 64`
- Check `ck_logical_model_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_logical_model_revision`: `revision >= 1`
- Foreign key `created_by_user_id` → `demo_users.id`
- Index `ix_logical_model_lifecycle` on `lifecycle`

### `metadata_delivery_outbox`

Deduplicated local PoC evidence for simulated I14Y metadata deliveries.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `product_revision` | `INTEGER` | no | — | — |
| `policy_revision` | `INTEGER` | no | — | — |
| `channel` | `VARCHAR(32)` | no | — | `i14y` |
| `valid_from` | `DATE` | no | — | — |
| `valid_until` | `DATE` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `payload` | `JSON` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `delivered_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_metadata_delivery_channel`: `channel IN ('i14y')`
- Check `ck_metadata_delivery_dates`: `valid_until >= valid_from`
- Check `ck_metadata_delivery_status`: `status IN ('scheduled', 'simulated_delivered')`
- Unique `uq_metadata_delivery_product_revision_channel`: `data_product_id, product_revision, channel`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Index `ix_metadata_delivery_status` on `status, created_at`

### `metadata_publications`

Idempotent metadata submissions received from external source systems such as DAAIF.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `source_system` | `VARCHAR(100)` | no | — | — |
| `source_product_id` | `VARCHAR(255)` | no | — | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `publication_mode` | `VARCHAR(32)` | no | — | — |
| `discoverable_explicit` | `BOOLEAN` | no | — | `False` |
| `payload_hash` | `VARCHAR(64)` | no | — | — |
| `normalized_payload` | `JSON` | no | — | — |
| `state` | `VARCHAR(32)` | no | — | — |
| `received_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `uq_metadata_publication_source`: `source_system, source_product_id`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Index `ix_metadata_publication_product` on `data_product_id`

### `ontology_term_alignments`

Optional links from local canonical terms to verified external concepts.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `term_id` | `CHAR(32)` | no | FK | — |
| `target_uri` | `VARCHAR(1000)` | no | — | — |
| `relation` | `VARCHAR(32)` | no | — | — |

Constraints and indexes:

- Unique `uq_ontology_term_alignment`: `term_id, target_uri`
- Foreign key `term_id` → `canonical_ontology_terms.id`; on delete `CASCADE`

### `physical_columns`

Snapshot-bound PostgreSQL column metadata with stable source-relative key and DaCa URN.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `physical_table_id` | `CHAR(32)` | no | FK | — |
| `stable_key` | `VARCHAR(1800)` | no | — | — |
| `urn` | `VARCHAR(2000)` | no | — | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `raw_data_type` | `VARCHAR(255)` | no | — | — |
| `normalized_data_type` | `VARCHAR(100)` | no | — | — |
| `character_length` | `INTEGER` | yes | — | — |
| `numeric_precision` | `INTEGER` | yes | — | — |
| `numeric_scale` | `INTEGER` | yes | — | — |
| `nullable` | `BOOLEAN` | no | — | — |
| `ordinal_position` | `INTEGER` | no | — | — |
| `comment` | `TEXT` | yes | — | — |

Constraints and indexes:

- Check `ck_physical_column_position`: `ordinal_position >= 1`
- Unique `uq_physical_column_name`: `physical_table_id, name`
- Unique `uq_physical_column_position`: `physical_table_id, ordinal_position`
- Foreign key `physical_table_id` → `physical_tables.id`; on delete `CASCADE`
- Index `ix_physical_column_table` on `physical_table_id, ordinal_position`

### `physical_databases`

Snapshot-bound database nodes in the physical metadata hierarchy.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `snapshot_id` | `CHAR(32)` | no | FK | — |
| `stable_key` | `VARCHAR(1000)` | no | — | — |
| `urn` | `VARCHAR(1200)` | no | — | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `position` | `INTEGER` | no | — | `0` |

Constraints and indexes:

- Unique `uq_physical_database_name`: `snapshot_id, name`
- Foreign key `snapshot_id` → `physical_schema_snapshots.id`; on delete `CASCADE`
- Index `ix_physical_database_snapshot` on `snapshot_id, position`

### `physical_drift_changes`

Typed, impact-enriched differences between two physical snapshots, including human-reviewed rename candidates.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `drift_report_id` | `CHAR(32)` | no | FK | — |
| `change_type` | `VARCHAR(32)` | no | — | — |
| `asset_key` | `VARCHAR(1800)` | no | — | — |
| `before` | `JSON` | yes | — | — |
| `after` | `JSON` | yes | — | — |
| `confidence` | `FLOAT` | yes | — | — |
| `impacted_logical_field_ids` | `JSON` | no | — | `list` |
| `impacted_mapping_ids` | `JSON` | no | — | `list` |
| `review_status` | `VARCHAR(32)` | no | — | `not_applicable` |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_physical_drift_change_type`: `change_type IN ('table_added', 'table_removed', 'column_added', 'column_removed', 'type_changed', 'length_changed', 'precision_changed', 'scale_changed', 'nullability_changed', 'rename_candidate')`
- Check `ck_physical_drift_confidence`: `confidence IS NULL OR (confidence >= 0 AND confidence <= 1)`
- Check `ck_physical_drift_review_status`: `review_status IN ('pending', 'accepted', 'rejected', 'not_applicable')`
- Foreign key `drift_report_id` → `physical_drift_reports.id`; on delete `CASCADE`
- Index `ix_physical_drift_change_report` on `drift_report_id, change_type`

### `physical_drift_reports`

Automatic summary and provenance for comparison of consecutive immutable physical snapshots.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `source_id` | `CHAR(32)` | no | FK | — |
| `previous_snapshot_id` | `CHAR(32)` | no | FK | — |
| `current_snapshot_id` | `CHAR(32)` | no | FK, UK | — |
| `summary` | `JSON` | no | — | `dict` |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `uq_physical_drift_current_snapshot`: `current_snapshot_id`
- Foreign key `source_id` → `physical_sources.id`; on delete `RESTRICT`
- Foreign key `previous_snapshot_id` → `physical_schema_snapshots.id`; on delete `RESTRICT`
- Foreign key `current_snapshot_id` → `physical_schema_snapshots.id`; on delete `RESTRICT`
- Index `ix_physical_drift_source` on `source_id, created_at`

### `physical_schema_snapshots`

Immutable, fingerprinted and federation-identifiable observations of a physical source schema.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(700)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `source_id` | `CHAR(32)` | no | FK | — |
| `sequence` | `INTEGER` | no | — | — |
| `predecessor_snapshot_id` | `CHAR(32)` | yes | FK | — |
| `fingerprint` | `VARCHAR(64)` | no | — | — |
| `imported_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `imported_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_physical_snapshot_fingerprint`: `length(fingerprint) = 64`
- Check `ck_physical_snapshot_sequence`: `sequence >= 1`
- Unique `uq_physical_snapshot_sequence`: `source_id, sequence`
- Foreign key `source_id` → `physical_sources.id`; on delete `RESTRICT`
- Foreign key `predecessor_snapshot_id` → `physical_schema_snapshots.id`; on delete `SET NULL`
- Foreign key `imported_by_user_id` → `demo_users.id`
- Index `ix_physical_snapshot_source` on `source_id, sequence`

### `physical_schemas`

Snapshot-bound schema nodes in the physical metadata hierarchy.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `physical_database_id` | `CHAR(32)` | no | FK | — |
| `stable_key` | `VARCHAR(1200)` | no | — | — |
| `urn` | `VARCHAR(1400)` | no | — | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `position` | `INTEGER` | no | — | `0` |

Constraints and indexes:

- Unique `uq_physical_schema_name`: `physical_database_id, name`
- Foreign key `physical_database_id` → `physical_databases.id`; on delete `CASCADE`
- Index `ix_physical_schema_database` on `physical_database_id, position`

### `physical_sources`

Credential-free physical metadata source definitions with adapter and secret-free configuration reference.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(500)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `description` | `TEXT` | yes | — | — |
| `adapter_type` | `VARCHAR(32)` | no | — | — |
| `config_ref` | `VARCHAR(255)` | yes | — | — |
| `department_code` | `VARCHAR(20)` | no | — | — |
| `organization_id` | `VARCHAR(100)` | no | FK | — |
| `revision` | `INTEGER` | no | — | `1` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `created_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Check `ck_physical_adapter`: `adapter_type IN ('postgresql', 's3', 'fixture')`
- Check `ck_physical_source_hash`: `length(content_hash) = 64`
- Check `ck_physical_source_lifecycle`: `lifecycle IN ('active', 'retired')`
- Check `ck_physical_source_revision`: `revision >= 1`
- Foreign key `organization_id` → `administrative_organizations.id`; on delete `RESTRICT`
- Foreign key `created_by_user_id` → `demo_users.id`
- Index `ix_physical_source_scope` on `department_code, organization_id`

### `physical_tables`

Snapshot-bound table, view or materialized-view nodes in the physical metadata hierarchy.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `physical_schema_id` | `CHAR(32)` | no | FK | — |
| `stable_key` | `VARCHAR(1500)` | no | — | — |
| `urn` | `VARCHAR(1700)` | no | — | — |
| `name` | `VARCHAR(255)` | no | — | — |
| `kind` | `VARCHAR(32)` | no | — | `table` |
| `comment` | `TEXT` | yes | — | — |
| `position` | `INTEGER` | no | — | `0` |
| `storage_location` | `VARCHAR(2000)` | yes | — | — |
| `media_type` | `VARCHAR(255)` | yes | — | — |
| `object_count` | `INTEGER` | yes | — | — |
| `size_bytes` | `BIGINT` | yes | — | — |
| `schema_confidence` | `VARCHAR(32)` | yes | — | — |
| `partition_keys` | `JSON` | yes | — | — |

Constraints and indexes:

- Check `ck_physical_table_kind`: `kind IN ('table', 'view', 'materialized_view', 'parquet')`
- Check `ck_physical_table_object_count`: `object_count IS NULL OR object_count >= 1`
- Check `ck_physical_table_schema_confidence`: `schema_confidence IS NULL OR schema_confidence IN ('declared', 'embedded', 'inferred')`
- Check `ck_physical_table_size`: `size_bytes IS NULL OR size_bytes >= 0`
- Unique `uq_physical_table_name`: `physical_schema_id, name`
- Foreign key `physical_schema_id` → `physical_schemas.id`; on delete `CASCADE`
- Index `ix_physical_table_schema` on `physical_schema_id, position`

### `poc_product_fixtures`

Deterministic external-product fixtures used by the PoC submission flow.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `VARCHAR(200)` | no | PK | — |
| `owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `source_product_id` | `VARCHAR(255)` | no | UK | — |
| `title` | `VARCHAR(255)` | no | — | — |
| `maturity_level` | `VARCHAR(32)` | no | — | — |
| `payload` | `JSON` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `source_product_id`
- Foreign key `owner_user_id` → `demo_users.id`

### `poc_simulation_events`

Append-only evidence for synthetic PoC event triggers, resets and fixture deletion.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `event_type` | `VARCHAR(64)` | no | — | — |
| `operation` | `VARCHAR(32)` | no | — | — |
| `product_id` | `CHAR(32)` | no | — | — |
| `product_urn` | `VARCHAR(255)` | no | — | — |
| `fixture_id` | `VARCHAR(200)` | yes | — | — |
| `actor_user_id` | `VARCHAR(200)` | no | — | — |
| `trigger_event_id` | `CHAR(32)` | yes | FK | — |
| `confirmation_name` | `VARCHAR(255)` | yes | — | — |
| `before_state` | `JSON` | no | — | `dict` |
| `after_state` | `JSON` | no | — | `dict` |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_poc_simulation_event_type`: `event_type IN ('product_submitted', 'quality_below_threshold', 'not_discoverable', 'isbo_restricted')`
- Check `ck_poc_simulation_operation`: `operation IN ('trigger', 'reset', 'product_reset')`
- Unique `uq_poc_simulation_reset`: `trigger_event_id, operation`
- Foreign key `trigger_event_id` → `poc_simulation_events.id`; on delete `RESTRICT`
- Index `ix_poc_simulation_actor` on `actor_user_id, created_at`
- Index `ix_poc_simulation_product` on `product_id, created_at`

### `policy_deployments`

Observed deployment state of one policy revision in OPA or PostgreSQL.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `policy_revision_id` | `CHAR(32)` | no | FK | — |
| `target` | `VARCHAR(32)` | no | — | — |
| `desired_revision` | `INTEGER` | no | — | — |
| `observed_revision` | `INTEGER` | yes | — | — |
| `state` | `VARCHAR(32)` | no | — | `pending` |
| `error` | `TEXT` | yes | — | — |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_deployment_state`: `state IN ('pending', 'deployed', 'failed')`
- Check `ck_deployment_target`: `target IN ('opa', 'postgresql')`
- Unique `uq_policy_deployment_target`: `policy_revision_id, target`
- Foreign key `policy_revision_id` → `policy_revisions.id`; on delete `CASCADE`

### `policy_revisions`

Versioned PBAC definitions and generated Rego for a data product.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | — |
| `definition` | `JSON` | no | — | — |
| `generated_rego` | `TEXT` | no | — | — |
| `created_by` | `VARCHAR(255)` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `published_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_policy_status`: `status IN ('draft', 'published', 'revoked')`
- Unique `uq_policy_product_revision`: `data_product_id, revision`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Index `ix_policy_product` on `data_product_id`

### `product_context_graphs`

KOBY Graphify PoC graph and its confirmation state.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `data_product_id` | `CHAR(32)` | no | PK, FK | — |
| `graph` | `JSON` | no | — | `dict` |
| `status` | `VARCHAR(32)` | no | — | `suggested` |
| `confirmed_by` | `VARCHAR(200)` | yes | — | — |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`

### `product_quality_assessments`

Server-computed evidence and medal for the six quality conditions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `data_product_id` | `CHAR(32)` | no | PK, FK | — |
| `access_management_defined` | `BOOLEAN` | no | — | `False` |
| `discoverability_confirmed` | `BOOLEAN` | no | — | `False` |
| `technical_metadata_complete` | `BOOLEAN` | no | — | `False` |
| `business_metadata_complete` | `BOOLEAN` | no | — | `False` |
| `graph_confirmed` | `BOOLEAN` | no | — | `False` |
| `ontology_embedded` | `BOOLEAN` | no | — | `False` |
| `dcat_reviewed` | `BOOLEAN` | no | — | `False` |
| `score` | `INTEGER` | no | — | `0` |
| `medal` | `VARCHAR(32)` | no | — | `bronze` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`

### `product_semantic_mappings`

Confirmed or proposed product/field mappings to canonical ontology terms.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `data_product_field_id` | `CHAR(32)` | yes | FK | — |
| `ontology_term_id` | `CHAR(32)` | no | FK | — |
| `mapping_type` | `VARCHAR(32)` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | `suggested` |
| `confirmed_by` | `VARCHAR(200)` | yes | — | — |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Foreign key `data_product_field_id` → `data_product_fields.id`; on delete `CASCADE`
- Foreign key `ontology_term_id` → `canonical_ontology_terms.id`
- Index `ix_semantic_mapping_product` on `data_product_id`

### `provenance_events`

Ordered, append-only history for a data product.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | yes | FK | — |
| `product_urn` | `VARCHAR(255)` | no | — | — |
| `sequence` | `INTEGER` | no | — | — |
| `event_type` | `VARCHAR(100)` | no | — | — |
| `actor` | `VARCHAR(255)` | no | — | — |
| `details` | `JSON` | no | — | `dict` |
| `occurred_at` | `DATETIME` | no | — | — |

Constraints and indexes:

- Unique `uq_provenance_product_sequence`: `data_product_id, sequence`
- Foreign key `data_product_id` → `data_products.id`; on delete `SET NULL`
- Index `ix_provenance_product` on `data_product_id`

### `seed_markers`

Idempotency markers for deterministic PoC seed operations.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `name` | `VARCHAR(100)` | no | PK | — |
| `applied_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- No additional constraints or explicit indexes.

### `service_level_revisions`

Versioned, four-eyes-reviewed best-effort service-level definitions for a data product.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `data_product_id` | `CHAR(32)` | no | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `lock_version` | `INTEGER` | no | — | `1` |
| `status` | `VARCHAR(32)` | no | — | `draft` |
| `valid_from` | `DATE` | no | — | — |
| `valid_until` | `DATE` | yes | — | — |
| `definition` | `JSON` | no | — | — |
| `created_by_owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `updated_by_owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `control_person_user_id` | `VARCHAR(200)` | yes | FK | — |
| `control_person_snapshot` | `JSON` | no | — | `dict` |
| `submitted_at` | `DATETIME` | yes | — | — |
| `product_revision_at_submission` | `INTEGER` | yes | — | — |
| `decided_at` | `DATETIME` | yes | — | — |
| `decision` | `VARCHAR(16)` | yes | — | — |
| `decided_by_user_id` | `VARCHAR(200)` | yes | FK | — |
| `published_at` | `DATETIME` | yes | — | — |
| `rejection_reason` | `TEXT` | yes | — | — |
| `supersedes_revision_id` | `CHAR(32)` | yes | FK | — |
| `superseded_by_revision_id` | `CHAR(32)` | yes | FK | — |
| `superseded_from` | `DATE` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_service_level_decision`: `decision IS NULL OR decision IN ('approve', 'reject')`
- Check `ck_service_level_four_eyes`: `control_person_user_id IS NULL OR control_person_user_id <> created_by_owner_user_id`
- Check `ck_service_level_status`: `status IN ('draft', 'pending_approval', 'published', 'rejected', 'withdrawn')`
- Check `ck_service_level_validity`: `valid_until IS NULL OR valid_until >= valid_from`
- Unique `uq_service_level_product_revision`: `data_product_id, revision`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Foreign key `created_by_owner_user_id` → `demo_users.id`
- Foreign key `updated_by_owner_user_id` → `demo_users.id`
- Foreign key `control_person_user_id` → `demo_users.id`; on delete `SET NULL`
- Foreign key `decided_by_user_id` → `demo_users.id`
- Foreign key `supersedes_revision_id` → `service_level_revisions.id`; on delete `SET NULL`
- Foreign key `superseded_by_revision_id` → `service_level_revisions.id`; on delete `SET NULL`
- Index `ix_service_level_controller` on `control_person_user_id, status`
- Index `ix_service_level_product` on `data_product_id, revision`
- Index `uq_service_level_single_open_workflow` on `data_product_id` unique

### `source_access_grants`

Immutable person or group-snapshot grants for metadata-only source catalog entries.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `source_access_request_id` | `CHAR(32)` | no | FK, UK | — |
| `source_id` | `VARCHAR(200)` | no | FK | — |
| `subject_type` | `VARCHAR(32)` | no | — | — |
| `subject_id` | `VARCHAR(200)` | no | — | — |
| `subject_label` | `VARCHAR(255)` | no | — | — |
| `group_revision` | `INTEGER` | yes | — | — |
| `group_snapshot` | `JSON` | yes | — | — |
| `valid_from` | `DATE` | no | — | — |
| `valid_until` | `DATE` | yes | — | — |
| `granted_by` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `source_access_request_id`
- Check `ck_source_grant_dates`: `valid_until IS NULL OR valid_until >= valid_from`
- Check `ck_source_grant_subject`: `subject_type IN ('person', 'group')`
- Foreign key `source_access_request_id` → `source_access_requests.id`; on delete `CASCADE`
- Foreign key `source_id` → `source_catalog_entries.id`; on delete `CASCADE`
- Foreign key `granted_by` → `demo_users.id`
- Index `ix_source_grant_source` on `source_id`
- Index `ix_source_grant_subject` on `subject_type, subject_id`

### `source_access_requests`

Auditable direct-owner requests for access to discoverable data sources.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `request_number` | `VARCHAR(32)` | no | UK | — |
| `client_request_id` | `VARCHAR(128)` | no | — | — |
| `source_id` | `VARCHAR(200)` | no | FK | — |
| `requester_id` | `VARCHAR(200)` | no | FK | — |
| `requester_name` | `VARCHAR(255)` | no | — | — |
| `requester_organization` | `VARCHAR(255)` | no | — | — |
| `owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `request_title` | `VARCHAR(255)` | no | — | — |
| `subject_type` | `VARCHAR(32)` | no | — | — |
| `subject_id` | `VARCHAR(200)` | no | — | — |
| `subject_label` | `VARCHAR(255)` | no | — | — |
| `group_revision` | `INTEGER` | yes | — | — |
| `group_snapshot` | `JSON` | yes | — | — |
| `purpose` | `TEXT` | no | — | — |
| `legal_basis` | `TEXT` | no | — | — |
| `valid_from` | `DATE` | no | — | — |
| `valid_until` | `DATE` | yes | — | — |
| `conditions_accepted` | `BOOLEAN` | no | — | — |
| `status` | `VARCHAR(32)` | no | — | `submitted` |
| `decision_by` | `VARCHAR(200)` | yes | — | — |
| `decision_comment` | `TEXT` | yes | — | — |
| `decided_at` | `DATETIME` | yes | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `unnamed`: `request_number`
- Check `ck_source_request_dates`: `valid_until IS NULL OR valid_until >= valid_from`
- Check `ck_source_request_status`: `status IN ('submitted', 'approved', 'rejected')`
- Check `ck_source_request_subject`: `subject_type IN ('person', 'group')`
- Unique `uq_source_request_client`: `requester_id, client_request_id`
- Foreign key `source_id` → `source_catalog_entries.id`; on delete `CASCADE`
- Foreign key `requester_id` → `demo_users.id`
- Foreign key `owner_user_id` → `demo_users.id`
- Index `ix_source_request_owner` on `owner_user_id, status`
- Index `ix_source_request_requester` on `requester_id, created_at`
- Index `ix_source_request_source` on `source_id`
- Index `uq_source_request_open_subject` on `source_id, subject_type, subject_id` unique

### `source_catalog_entries`

Credential-free metadata for discoverable PoC data sources and their synthetic object inventory.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `VARCHAR(200)` | no | PK | — |
| `source_type` | `VARCHAR(32)` | no | — | — |
| `database_name` | `VARCHAR(128)` | no | — | — |
| `display_name` | `VARCHAR(255)` | no | — | — |
| `description` | `TEXT` | no | — | — |
| `organization` | `VARCHAR(255)` | no | — | — |
| `owner_user_id` | `VARCHAR(200)` | no | FK | — |
| `sites` | `JSON` | no | — | `list` |
| `search_objects` | `JSON` | no | — | `list` |
| `discoverability_group_ids` | `JSON` | no | — | `list` |
| `mock_profile` | `JSON` | no | — | `dict` |
| `active` | `BOOLEAN` | no | — | `True` |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Check `ck_source_catalog_type`: `source_type IN ('oracle')`
- Foreign key `owner_user_id` → `demo_users.id`
- Index `ix_source_catalog_owner` on `owner_user_id`
- Index `ix_source_catalog_type_name` on `source_type, database_name`

### `terminology_external_references`

Typed and hashed TERMDAT, I14Y or other source evidence pinned to a terminology version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `term_version_id` | `CHAR(32)` | no | FK | — |
| `source_type` | `VARCHAR(32)` | no | — | — |
| `source_identifier` | `VARCHAR(255)` | yes | — | — |
| `source_uri` | `VARCHAR(1000)` | no | — | — |
| `source_version` | `VARCHAR(100)` | yes | — | — |
| `source_modified_at` | `DATETIME` | yes | — | — |
| `retrieved_at` | `DATETIME` | no | — | — |
| `payload_hash` | `VARCHAR(64)` | no | — | — |
| `source_label` | `VARCHAR(500)` | yes | — | — |
| `text_snapshot` | `JSON` | no | — | `dict` |

Constraints and indexes:

- Foreign key `term_version_id` → `terminology_term_versions.id`; on delete `CASCADE`

### `terminology_term_relations`

Canonical directed SKOS relations between immutable terminology term versions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `source_version_id` | `CHAR(32)` | no | FK | — |
| `target_version_id` | `CHAR(32)` | no | FK | — |
| `relation` | `VARCHAR(32)` | no | — | — |

Constraints and indexes:

- Unique `uq_terminology_relation`: `source_version_id, target_version_id, relation`
- Foreign key `source_version_id` → `terminology_term_versions.id`; on delete `CASCADE`
- Foreign key `target_version_id` → `terminology_term_versions.id`; on delete `RESTRICT`

### `terminology_term_responsibilities`

Explicit Data Owner and Data Steward assignments pinned to a terminology version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `term_version_id` | `CHAR(32)` | no | PK, FK | — |
| `role` | `VARCHAR(32)` | no | PK | — |
| `user_id` | `VARCHAR(200)` | no | FK | — |

Constraints and indexes:

- Foreign key `term_version_id` → `terminology_term_versions.id`; on delete `CASCADE`
- Foreign key `user_id` → `demo_users.id`; on delete `RESTRICT`

### `terminology_term_version_domains`

Domain assignments pinned to a terminology term version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `term_version_id` | `CHAR(32)` | no | PK, FK | — |
| `domain_id` | `CHAR(32)` | no | PK, FK | — |

Constraints and indexes:

- Foreign key `term_version_id` → `terminology_term_versions.id`; on delete `CASCADE`
- Foreign key `domain_id` → `domains.id`; on delete `RESTRICT`

### `terminology_term_version_labels`

Multilingual preferred and alternative labels plus definitions for one terminology version.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `term_version_id` | `CHAR(32)` | no | PK, FK | — |
| `language` | `VARCHAR(8)` | no | PK | — |
| `preferred_label` | `VARCHAR(500)` | no | — | — |
| `alternative_labels` | `JSON` | no | — | `list` |
| `definition` | `TEXT` | no | — | — |
| `translation_origin` | `VARCHAR(32)` | no | — | `manual` |
| `source_text_hash` | `VARCHAR(64)` | yes | — | — |

Constraints and indexes:

- Foreign key `term_version_id` → `terminology_term_versions.id`; on delete `CASCADE`

### `terminology_term_versions`

Immutable governed terminology and business-object concept revisions.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `term_id` | `CHAR(32)` | no | FK | — |
| `predecessor_version_id` | `CHAR(32)` | yes | FK | — |
| `revision` | `INTEGER` | no | — | — |
| `lock_version` | `INTEGER` | no | — | `1` |
| `status` | `VARCHAR(32)` | no | — | `draft` |
| `concept_kind` | `VARCHAR(32)` | no | — | `term` |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `created_by_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |

Constraints and indexes:

- Unique `uq_terminology_term_version`: `term_id, revision`
- Foreign key `term_id` → `terminology_terms.id`; on delete `CASCADE`
- Foreign key `predecessor_version_id` → `terminology_term_versions.id`; on delete `SET NULL`
- Foreign key `created_by_user_id` → `demo_users.id`
- Index `ix_terminology_kind_status` on `concept_kind, status`

### `terminology_terms`

Federation-ready terminology aggregate roots with stable URNs, hashes and retirement state.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `urn` | `VARCHAR(500)` | no | UK | — |
| `origin_catalog_id` | `VARCHAR(255)` | no | — | — |
| `revision` | `INTEGER` | no | — | `1` |
| `latest_version_id` | `CHAR(32)` | yes | FK | — |
| `content_hash` | `VARCHAR(64)` | no | — | — |
| `lifecycle` | `VARCHAR(32)` | no | — | `active` |
| `creator_user_id` | `VARCHAR(200)` | no | FK | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `retired_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Unique `unnamed`: `urn`
- Foreign key `latest_version_id` → `terminology_term_versions.id`; on delete `SET NULL`
- Foreign key `creator_user_id` → `demo_users.id`

### `workflow_tasks`

Owner and approver work items for quality, access governance, SLA review and request processing.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `CHAR(32)` | no | PK | — |
| `task_type` | `VARCHAR(64)` | no | — | — |
| `task_kind` | `VARCHAR(32)` | no | — | `action` |
| `status` | `VARCHAR(32)` | no | — | `open` |
| `assignee_user_id` | `VARCHAR(200)` | no | FK | — |
| `data_product_id` | `CHAR(32)` | yes | FK | — |
| `access_request_id` | `CHAR(32)` | yes | FK | — |
| `simulation_event_id` | `CHAR(32)` | yes | FK | — |
| `governance_submission_id` | `CHAR(32)` | yes | FK | — |
| `service_level_revision_id` | `CHAR(32)` | yes | FK | — |
| `source_access_request_id` | `CHAR(32)` | yes | FK | — |
| `domain_change_request_id` | `CHAR(32)` | yes | FK | — |
| `glossary_term_proposal_id` | `CHAR(32)` | yes | FK | — |
| `logical_model_review_id` | `CHAR(32)` | yes | FK | — |
| `title` | `VARCHAR(255)` | no | — | — |
| `detail` | `TEXT` | no | — | — |
| `created_at` | `DATETIME` | no | — | `utc_now` |
| `updated_at` | `DATETIME` | no | — | `utc_now` |
| `completed_at` | `DATETIME` | yes | — | — |
| `acknowledged_at` | `DATETIME` | yes | — | — |

Constraints and indexes:

- Check `ck_workflow_task_kind`: `task_kind IN ('action', 'information')`
- Foreign key `assignee_user_id` → `demo_users.id`
- Foreign key `data_product_id` → `data_products.id`; on delete `CASCADE`
- Foreign key `access_request_id` → `access_requests.id`; on delete `CASCADE`
- Foreign key `simulation_event_id` → `poc_simulation_events.id`; on delete `SET NULL`
- Foreign key `governance_submission_id` → `governance_submissions.id`; on delete `CASCADE`
- Foreign key `service_level_revision_id` → `service_level_revisions.id`; on delete `CASCADE`
- Foreign key `source_access_request_id` → `source_access_requests.id`; on delete `CASCADE`
- Foreign key `domain_change_request_id` → `domain_change_requests.id`; on delete `SET NULL`
- Foreign key `glossary_term_proposal_id` → `glossary_term_proposals.id`; on delete `SET NULL`
- Foreign key `logical_model_review_id` → `logical_model_reviews.id`; on delete `SET NULL`
- Index `ix_workflow_task_assignee` on `assignee_user_id, status`
- Index `ix_workflow_task_domain_request` on `domain_change_request_id`
- Index `ix_workflow_task_glossary_proposal` on `glossary_term_proposal_id`
- Index `ix_workflow_task_logical_review` on `logical_model_review_id`
- Index `ix_workflow_task_product` on `data_product_id`
- Index `ix_workflow_task_source_access_request` on `source_access_request_id`

<!-- END GENERATED: data-model. -->
