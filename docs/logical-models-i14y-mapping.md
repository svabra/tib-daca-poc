# Logical models, I14Y concepts, physical models, and mappings

This document defines the four metadata layers added to the standalone DaCa catalog.  They are
related through explicit, version-pinned references; none of them is a replacement for an
existing data product, DaCa glossary term, or I14Y MappingTable.

## Responsibilities and data flow

```mermaid
flowchart LR
  Person[Owner, deputy, or steward] -->|HTTP| UI[Catalog UI]
  UI -->|REST + If-Match| API[Standalone catalog API]

  subgraph CatalogDB[Catalog PostgreSQL]
    DCAT[DCAT catalog and dataset versions]
    SHACL[Logical model, entity, and field versions]
    PHYS[Physical schema snapshots]
    MAP[Versioned asset mappings and drift]
    CACHE[I14Y concept cache]
  end

  API --> DCAT
  API --> SHACL
  API --> PHYS
  API --> MAP
  API --> CACHE
  SHACL -->|pins dataset version| DCAT
  MAP -->|pins field version| SHACL
  MAP -->|pins snapshot columns| PHYS
  CACHE -->|primary field conformance| SHACL

  API -->|bounded read-only GETs| I14Y[I14Y Public API]
  API -->|unclassified text only| DeepL[DeepL Free API]
  API -->|official search and detail| TERMDAT[TERMDAT Public API]
  API -->|information_schema and pg_catalog only| PG[(Configured PostgreSQL source)]
  API -->|object listing and Parquet footer only| S3[(Configured S3-compatible store)]
  API -. disabled publication port .-> I14YWrite[Future authenticated I14Y publication]
```

The control plane is not on this path.  No catalog federation traffic, I14Y write request, table
content query, or mapping transformation is performed.

```mermaid
erDiagram
  DCAT_DATASET ||--o{ DCAT_DATASET_VERSION : versions
  DCAT_DATASET_VERSION ||--o| LOGICAL_MODEL_VERSION : describes
  LOGICAL_MODEL ||--o{ LOGICAL_MODEL_VERSION : versions
  LOGICAL_MODEL_VERSION ||--o{ LOGICAL_ENTITY_VERSION : contains
  LOGICAL_ENTITY_VERSION ||--o{ LOGICAL_FIELD_VERSION : contains
  I14Y_CONCEPT ||--o{ LOGICAL_CONCEPT_LINK : referenced_by
  LOGICAL_FIELD_VERSION ||--o{ LOGICAL_CONCEPT_LINK : links
  PHYSICAL_SOURCE ||--o{ PHYSICAL_SCHEMA_SNAPSHOT : imports
  PHYSICAL_SCHEMA_SNAPSHOT ||--o{ PHYSICAL_COLUMN : contains
  ASSET_MAPPING ||--o{ ASSET_MAPPING_VERSION : versions
  ASSET_MAPPING_VERSION }o--o{ LOGICAL_FIELD_VERSION : logical_sources
  ASSET_MAPPING_VERSION }o--o{ PHYSICAL_COLUMN : physical_targets
  PHYSICAL_SCHEMA_SNAPSHOT ||--o| PHYSICAL_DRIFT_REPORT : compared_by
```

The generated service-specific ER diagram in `docs/data-model/catalog.md` is authoritative for
table and foreign-key names; this diagram documents the stable architectural relationships.

## Persisted layers

### DCAT catalog layer

The catalog, dataset, distribution, and data-service resources have stable roots and immutable
versions.  A logical model pins one dataset version.  A dataset may exist without a distribution,
and a logical model may exist without a `DataProduct`, physical source, or mapping.

Dataset titles and descriptions use `de`, `fr`, `it`, `en`, and optional `rm`.  The old
`titleGe`/`descriptionGe` spelling is accepted only by the compatibility adapter.  Creators use a
discriminated `Application`, `InternalOrganisation`, `InternalPerson`, or
`ExternalOrganisationOrPerson` reference.  `dateCreated` maps to `dcterms:created`; the first
publication timestamp maps to `dcterms:issued`.  A media type is emitted only from a real
distribution.  DaCa domains and I14Y themes are deliberately separate.

A logical-model identifier is one non-empty, whitespace-free string. PostgreSQL reserves its
case-folded value in `logical_model_identifier_reservations`, atomically and catalog-wide, for the
logical-model root. A root changing its identifier releases its old reservation; current and
retired roots retain their current reservation. The organisation-derived editor mode stores its
mode on the logical-model version, while the final identifier is still the reserved value. Older
duplicate identifiers can remain unchanged for backward compatibility, but no new reservation
may claim an already reserved identifier. Physical derivations include their immutable source
snapshot in the generated identifier, so repeated derivations remain distinct.

Exports target the approved [DCAT-AP-CH 3.0.1 / eCH-0200
3.0.1](https://www.ech.ch/de/ech/ech-0200/3.0.1).  Drafts can be serialized for review, while final
publication requires title, description, identifier, publisher, and contact point.  The stricter
I14Y-readiness check additionally requires a distribution or data service.

### Logical SHACL layer

Logical models, entities, and fields have stable `urn:daca:*` identities and immutable revisions.
Fields retain business object, entity/table, name, datatype, length, description, comment,
source-system label, classification, decimals, value-list reference, `minCount`, `maxCount`, and
order independently of physical assets.

The SHACL export uses `sh:NodeShape`, `sh:PropertyShape`, `sh:path`, `sh:datatype`, `sh:minCount`,
`sh:maxCount`, `sh:name`, and `sh:order`.  DaCa does not mint identifiers in I14Y's controlled
`register.ld.admin.ch/i14y/dataset/` namespace.  Several Concepts may be associated internally,
but only one version-pinned primary link is emitted as `dcterms:conformsTo`, matching I14Y's
documented `0..1` cardinality.

Concept links, their primary Concept, and the I14Y CodeList are all optional and initially empty.
The form provides independent reset actions; resetting Concept links also clears the dependent
primary Concept and CodeList. Validation and database-integrity responses use a safe RFC-7807
problem shape with a user action, field paths, error code, request ID, and normalised support
details. SQL statements, database values, and stack traces are neither returned to the browser
nor included in the copyable support text.

### RDF namespaces

The serializers bind the following namespace IRIs. DaCa-owned catalogs, datasets, shapes, paths,
and mapping resources use stable `urn:daca:*` identifiers; the I14Y register namespace is only
used for externally minted Concept references.

| Prefix / ownership | Namespace IRI |
|---|---|
| DaCa-owned resources | `urn:daca:*` |
| I14Y-controlled references | `https://register.ld.admin.ch/i14y/` |
| `dcat` | `http://www.w3.org/ns/dcat#` |
| `dcatap` | `http://data.europa.eu/r5r/` |
| `dct` / `dcterms` | `http://purl.org/dc/terms/` |
| `rdf` | `http://www.w3.org/1999/02/22-rdf-syntax-ns#` |
| `rdfs` | `http://www.w3.org/2000/01/rdf-schema#` |
| `xsd` | `http://www.w3.org/2001/XMLSchema#` |
| `sh` | `http://www.w3.org/ns/shacl#` |
| `skos` | `http://www.w3.org/2004/02/skos/core#` |
| `foaf` | `http://xmlns.com/foaf/0.1/` |
| `vcard` | `http://www.w3.org/2006/vcard/ns#` |
| `schema` | `http://schema.org/` |
| `adms` | `http://www.w3.org/ns/adms#` |
| `locn` | `http://www.w3.org/ns/locn#` |
| `prov` | `http://www.w3.org/ns/prov#` |
| `spdx` | `http://spdx.org/rdf/terms#` |
| `gsp` | `http://www.opengis.net/ont/geosparql#` |
| `odrl` | `http://www.w3.org/ns/odrl/2/` |

### Physical model layer

A physical model is an imported, mapping-capable structure from a data source. PostgreSQL tables
and views are represented by their columns; Parquet objects in S3 are represented by the fields
embedded in their footer. A source contains versioned snapshots of these technical structures.
Search uses only metadata already persisted in the catalog PostgreSQL database and never queries
the source system at search time.
The production adapter reads only PostgreSQL `information_schema` and `pg_catalog` in a read-only
transaction.  Its DSN is a server-side secret and is never accepted by an API payload.  The
deterministic fixture adapter implements the same port and is the default for the PoC.

Every import creates an immutable snapshot and compares it with its predecessor.  Drift covers
additions, removals, datatype, length, precision, scale, and nullability.  Rename similarity is an
explicit review candidate and is never silently accepted.

### DaCa asset-mapping layer

An asset mapping pins one logical model/field revision and one physical snapshot/column set.  Both
sides are many-to-many so one business field can have several representations and derived targets
can consume several source fields.  Supported mapping types are `Direct`, `Renamed`, `Derived`,
`Lookup`, and `Transformed`; rules are stored and validated but never executed.

Mapping versions move through `draft`, `review_pending`, `validated`, `broken`, and `superseded`.
Schema drift appends a system-authored `broken` successor while preserving the previously
validated evidence.  Resolution is a deliberate user-authored version against the latest
snapshot.

## Roles and demo scenarios

Modelling authorization is scoped to the `VBS / Verteidigung` organization and does not change
legacy data-product permissions.

| Persona | Modelling role | Scenario |
|---|---|---|
| Christian Spider | Data Owner | Owner of the logical-first personnel model |
| Sibilla Micheli | Deputy Data Owner | Visible personnel-model deputy |
| Cinthya Thor | Data Steward | Logical-first editing and existing-to-existing mapping |
| Lawrence Hill | Data Owner | Owner of the vehicle-inventory model |
| Hong An Captain | Deputy Data Owner | Visible vehicle-model deputy |
| Christian Man | Data Steward | PostgreSQL import and derivation |

Data Owners and deputies may view and edit models in scope. The primary Domain Owner alone receives
and decides a logical-model review task in this PoC. Data Stewards may
edit models and fields, import technical metadata, associate I14Y Concepts, create and validate
mappings, and submit for review, but cannot publish.

Federal modeling scope is an imported, validated hierarchy stored in PostgreSQL. The checked
offline snapshot contains exactly the Federal Chancellery plus EDA, EDI, EJPD, VBS, EFD, WBF and
UVEK below the federal root. The reference chain is
`VBS → Bundesamt für Rüstung armasuisse (20005536) → armasuisse Immobilien (20053180)`.
The UI labels intermediate levels “Amt/Verwaltungseinheit” and “Abteilung/Bereich” because the
source taxonomy is not uniform. Persons have one active primary membership; owner searches rank
the same office first, then the same department, then the rest of the Confederation.

The Immobilienmanagement journey adds Mirjam Keller as Data Steward, Daniel Wenger as primary
domain owner and Eliane Rossi as his active deputy. Its controlled business-object terminology
contains `Immobilienobjekt`, `Infrastrukturbedarf` and `Bauprojekt`. The selected domain binds
Daniel and Eliane from the domain register; a draft save creates no task. A separate steward
submission creates an immutable review snapshot and personal task for Daniel, which links directly
to the review workspace. Acceptance creates the published successor and
sets `dct:issued`; rejection requires a comment and returns a `changes_requested` successor to the
submitting steward.

Logical-model reads are catalog-wide. Writes use the existing PostgreSQL-backed organisational
hierarchy: a user's assigned department, office, or division permits the corresponding subtree;
otherwise a model remains readable but is disabled in the editor. The selected DaCa domain is the
authoritative server-side source for the primary owner and visible deputy. Saving a draft never
creates a task; explicit submission creates exactly one immutable review snapshot and one task for
the primary owner. The deputy has no decision right.

## Language and terminology assistance

Title blur requests FR, IT and EN translations from DeepL Free and silently prefetches TERMDAT
after three characters. Description blur requests translations only. RM stays manual unless a
selected TERMDAT result supplies it. Calls are server-side, use a ten-second timeout and are
strictly limited to `unclassified` content. Missing configuration or provider errors leave the
form fully usable.

Empty language fields are filled and marked as machine-generated. Existing values are never
overwritten: an accessible comparison overlay offers individual accept or discard actions.
Responses are keyed by the German source hash, and stale responses are ignored after source edits.
Accepted values persist provider, field/language, source identifier/URI, source and payload hashes,
retrieval time and origin on the immutable logical-model version.

TERMDAT collections and classifications are cached for 24 hours and passed explicitly to the
official search API. Literal title searches cover term, name, abbreviation and phraseology fields,
but not definitions. The server first requests summary hits with one input language and then loads
only those entry IDs in four parallel, language-specific `/Entry` requests. This follows the public
contract, whose `OutLanguageCode` accepts one language per request, while retaining DE, FR, IT, EN
and available RM details in the picker. Leaving the German title field starts this lookup and shows
an accessible hit banner immediately; opening the modal is still an explicit user action. A formal
definition is preferred when copying a description, followed transparently by TERMDAT note and
usage-context fields when the entry has no definition. The picker supports title-only,
description-only and combined title-and-description adoption. Existing content is never changed
through a native browser prompt: an in-modal comparison shows the current and proposed values and
requires confirmation through the explicit `Auswahl übernehmen` action.

Only entries exposed by the TERMDAT Public API can be selected. The TERMDAT website may display
in-progress or legacy-collection entries that the Public API and LINDAS register do not publish;
an empty result is therefore shown separately from provider unavailability. Importing a result
records source provenance only; semantic equality is never inferred. The public API and register
URI are official integration points, but the reuse licence is not sufficiently explicit for
production and needs Federal Chancellery confirmation.

The three deterministic journeys are:

1. **Logical first:** create and reopen `Mitarbeitende` without product, distribution, physical
   asset, or mapping; associate cached Concepts and export DCAT/SHACL.
2. **Physical first:** import `logistics.vehicle_inventory`, derive the editable
   `Fahrzeugbestand` draft, document concept decisions, and save proposed mappings.
3. **Existing to existing:** connect `Organisationseinheiten` to
   `hr_core.public.org_unit` in graphical and keyboard/table modes, then inspect drift after the
   second fixture import.

## I14Y Public API contract and cache

DaCa validates the official
[`Release.json`](https://apiconsole.i14y.admin.ch/public/v1/Release.json) at synchronization time
and chooses the server described as `PROD`.  The verified 2026-08-26 contract is OpenAPI 3.0.4,
API `v1`, deployment `1.15.4-build.45`, SHA-256
`78e1a82d3bbf91704596a7aec6bfa56f076913fa4639f945a5f90fedd94c1b04`.

The read port covers Agents, Catalogs, Concepts, DataServices, Datasets, MappingTables,
PublicServices, and Search.  Concepts are paged from `/concepts`; headers named `x-paging-*` are
authoritative.  Code-list entries are loaded only on demand.  The transport accepts known live
contract deviations such as a missing `responsiblePerson`, extra `replaces`/`isReplacedBy`, and
the absence of deprecated `identifier`, then normalizes to the persisted shape.  A failed refresh
does not erase the last complete cache.

Offline compatibility fixtures use:

- Concept `legalForm`, UUID `89bc55cc-3858-4c13-a5c8-7dc935dff29b`, version `1.2.0`, permalink
  `https://register.ld.admin.ch/i14y/concept/legalForm/version/1.2.0`;
- Dataset `ce087cbd-83a5-409f-a0c7-41175c6d5e0d`, identifier
  `CH_KT_BL_dataset_12480`, with real `Ttl` and `JsonLd` structure exports.

The capture session started at `2026-09-07T18:41:55Z`; the JSON-LD structure export was captured
at `2026-09-07T18:53:36Z`. The fixture manifest records the source URL, exact UTC retrieval time,
upstream byte count and SHA-256 where the original response was retained as evidence, and byte
count plus SHA-256 for every checked-in sanitized fixture. Tests use these recorded fixtures only.

### I14Y operator commands

The UI never performs a complete sync at startup. All network-backed reads are explicit operator
actions by a modelling persona. The local search endpoint remains cache-only; `remote-search`
queries I14Y without mutating the cache.

```powershell
$conceptId = "89bc55cc-3858-4c13-a5c8-7dc935dff29b"

# Full paginated Concept-cache synchronization and local status
curl.exe -X POST -H "X-DaCa-User: cinthya.thor" `
  http://localhost:8001/api/v1/i14y/concepts/sync
curl.exe -H "X-DaCa-User: cinthya.thor" `
  http://localhost:8001/api/v1/i14y/sync-status

# Explicit remote search; this does not update the local cache
curl.exe --get -H "X-DaCa-User: cinthya.thor" `
  --data-urlencode "q=Rechtsform" `
  http://localhost:8001/api/v1/i14y/concepts/remote-search

# Refresh one Concept detail into the local cache
curl.exe -X POST -H "X-DaCa-User: cinthya.thor" `
  "http://localhost:8001/api/v1/i14y/concepts/$conceptId/refresh"

# Synchronize only that CodeList's entries
curl.exe -X POST -H "X-DaCa-User: cinthya.thor" `
  "http://localhost:8001/api/v1/i14y/concepts/$conceptId/code-list-entries/sync"
```

## External DAAIF user step

DAAIF has a separate repository and no user-seeding API.  Check or apply Christian Spider's four
known UI/backend allow-list entries explicitly:

```powershell
uv run python scripts/seed_daaif_christian_spider.py --repo <daaif-repository> --check
uv run python scripts/seed_daaif_christian_spider.py --repo <daaif-repository> --apply
```

`--apply` validates every expected file before writing and creates one `.daca-seed.bak` backup per
changed file.  This external step does not imply or document a DAAIF persistence model.
