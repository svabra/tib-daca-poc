# BIT DaCa

**DaCa** is the central **Data Catalog** of the BIT data platform. This proof of concept contains
the catalog, an administrative control-plane prototype, and a synthetic ESTV data product
protected over both REST and direct PostgreSQL access.
The original PoC catalog description is corrected in a new metadata revision, retaining its
previous wording only as version history.

## Projects

| Project | Purpose | Local URL |
|---|---|---|
| Catalog UI | Metadata, lineage, provenance, endpoints, policy authoring | http://localhost:8080 |
| Catalog API | Central catalog and PAP/PIP | http://localhost:8080/catalog-api/docs |
| Control-plane UI | Administrative status and historical PoC configuration | http://localhost:8081 |
| Control-plane API | Control-plane REST and SSE | http://localhost:8002/docs |
| Sample data product | Protected synthetic ESTV aggregates | http://localhost:8080/sample-api/docs |
| OPA PDP | Bundle status and local policy decisions | http://localhost:8181 |
| PostgreSQL 18.4 | Catalog, Control Plane, Sample-Daten und direkter Produktzugriff | localhost:55432 |
| pgAdmin | Nur lokale Verwaltung der drei PostgreSQL-Datenbanken | http://localhost:5051 |

The only supported protocols are HTTP and PostgreSQL wire protocol. Catalog metadata and
governance are managed centrally. The older trust/sync configuration prototype does not
transfer catalog resources.

## Stack

- Angular 22, Angular PWA/service worker, signals and RxJS
- Python 3.14, FastAPI, SQLAlchemy, Psycopg and Alembic
- PostgreSQL 18.4 for all local persistence contexts and OPA 1.18.2 for policy decisions
- npm and uv workspaces, pytest and browser-based visual verification

Python is intentional: future metadata extraction, data profiling, normalization, lineage
analysis, and wrangling can reuse the Python data ecosystem without replacing the service layer.

Both PWAs consume `packages/design-system`, a focused Angular port of the reference application's
federal authority strip, Confederation/BIT header, Swiss-red/blue tokens, sharp surfaces,
typography, focus behavior, and responsive breakpoints. The Confederation logo and favicon are
byte-identical copies of the supplied reference assets; its monolithic stylesheet is not imported.
The shared version card credits `V, armasuisse, ESTV und BIT` above the update status.

The catalog header's information icon opens `/documentation`, which contains the existing User
Journeys, static catalog guidance and a PostgreSQL-backed DaCa application glossary.
The DaCa glossary is stored separately from governed business terminology. It contains curated
system terms, including Data Owner and Data Steward with tasks, authority and accountability;
Catalog users can read these entries but cannot edit or enrich them.
Glossary words use a light-gray wavy underline in both DaCa and DAAIF; the explanation and detail link remain available by pointer, keyboard and touch.
The thirteen DaCa journeys at `/documentation/journeys` have their own topic tags and can be filtered by free text (title, summary, outcome, roles and tags) together with a selected tag. The filter shows a result count and an empty state; existing journey deep links remain stable.

Settings include `/settings/responsibilities` with category, person and domain perspectives on persisted
responsibility relationships. Glossary-backed role help loads on first interaction and links to
the full entry. The popup stays open while the pointer moves down to its link. The data and
authorization boundaries are described in
[`docs/catalog-documentation-and-responsibilities.md`](docs/catalog-documentation-and-responsibilities.md).
Physical tables can be linked directly to domains before a logical model mapping exists.
The settings submenu also exposes `/settings/role-changes`: a PostgreSQL-backed, append-only
protocol of role assignments, changes and removals. The User Journey **Zugriff und Verantwortung
im Überblick behalten** shows how to use all three perspectives and the protocol. The role
change scenario is specified in [`docs/use-cases/role-changes.md`](docs/use-cases/role-changes.md).

## Start locally

1. Start Docker Desktop and select its Linux engine.
2. Copy `.env.example` to `.env` if you want to change development credentials. All checked-in
   defaults and both `X-DaCa-*` headers are local-demo mechanisms, never production identity.
3. Build and start everything:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

4. Open the UI and pgAdmin URLs above. Stop without deleting database state with
   `docker compose down`; add `-v` only when intentionally discarding the local PostgreSQL and
   pgAdmin volumes.

PostgreSQL 18.4 stores the separate `daca_catalog`, `daca_control_plane` and `daca_sample`
databases on the named `daca-postgres` volume. pgAdmin is a local-only convenience and uses the
development credentials from `.env.example`; no pgAdmin or PostgreSQL workload is deployed by
the production manifests.

The PoC supports PostgreSQL 18.4 only. Catalog tests require a dedicated database whose name ends
in `_test`; destructive test preparation refuses every other database name.

Each API container runs its own Alembic migration before startup. To rerun migrations explicitly:

```powershell
docker compose run --rm catalog-api uv run --no-sync alembic upgrade head
docker compose run --rm control-plane-api uv run --no-sync alembic upgrade head
docker compose run --rm sample-data-product uv run --no-sync alembic upgrade head
```

## Edit catalog metadata

The seeded product UUID is `11111111-1111-4111-8111-111111111111`. Read its current ETag, then
send that revision as `If-Match`:

```powershell
curl.exe -i http://localhost:8001/api/v1/data-products/11111111-1111-4111-8111-111111111111
curl.exe -X PATCH `
  -H 'Content-Type: application/json' `
  -H 'If-Match: "1"' `
  -H 'X-DaCa-User: daca-demo-editor' `
  -d '{"description":"Updated synthetic aggregate metadata"}' `
  http://localhost:8001/api/v1/data-products/11111111-1111-4111-8111-111111111111
```

A missing precondition returns `428`; a stale ETag returns `412`. Errors use
`application/problem+json` and include a request ID.

## Exercise the DAAIF → DaCa Golden Path

Open `http://localhost:8080/poc-simulation/product-submitted`. The PoC Simulation area exposes three already-created
DAAIF REST fixtures for each PostgreSQL-backed demo identity. Submitting a fixture calls the open
metadata-only endpoint `POST /api/v1/metadata-publications`; it creates an owner-scoped product,
a quality task, and an access-governance task without granting product-data access.

The endpoint is disabled by default outside the local Compose profile and is enabled there with
`DACA_OPEN_METADATA_PUBLICATION=true`. It accepts only HTTP(S) REST descriptions without URL
credentials, query strings, fragments, or secret fields. `sourceSystem + sourceProductId` is
idempotent; a changed replay returns `409`.

DAAIF can integrate against the versioned focused contract
[`docs/openapi/daca-metadata-publication.openapi.yaml`](docs/openapi/daca-metadata-publication.openapi.yaml).
With the local stack running, the complete interactive specification is available in
[Swagger UI](http://localhost:8080/catalog-api/docs) and as
[OpenAPI JSON](http://localhost:8080/catalog-api/openapi.json).
Keep the focused contract in sync with the running FastAPI application using:

```powershell
npm run docs:openapi
npm run docs:openapi:check
```

The checked contract is also served by the Catalog UI at
`http://localhost:8080/openapi/daca-metadata-publication.openapi.yaml` so a DAAIF developer can
download the exact integration subset without cloning the repository.

The five-step quality wizard keeps DCAT-AP-CH catalog mappings separate from the local
`DaCa Canonical Tax Ontology · PoC`. Platinum is calculated server-side only when all six stored
proofs are present: published access governance, confirmed discoverability, technical metadata,
business metadata, confirmed KOBY Graphify context, and confirmed mappings for the product class
and every key field. The semantic profile is available as DCAT-oriented JSON-LD at
`GET /api/v1/data-products/{id}/semantic-profile`; no SPARQL endpoint is exposed.

The catalog also maintains governed subject domains and versioned multilingual terminology. Products
can belong to several domains and can reference only accepted terms governed by at least one of
those domains. Domain-register requests, unanimous multi-domain term review, requester
notifications, deterministic PoC suggestions, and the JSON-LD knowledge graph are described in
[`docs/domains-and-glossary.md`](docs/domains-and-glossary.md). Free-form product keywords remain
separate and unchanged. The deterministic suggestion provider uses a minimum score of `70` by
default; set `DACA_SEMANTIC_SUGGESTION_THRESHOLD` to a value from `0` through `100` to tune it.
The terminology seed retains 38 bilingual reference concepts and adds three controlled business
objects for Immobilienmanagement VBS. Users can
start a term proposal centrally, from a domain or search result, or directly from product metadata;
accepted terms use the same governed proposal route for edits. Metadata Studio can derive up to
three editable candidates locally from the current title and keywords, but never applies one
automatically. Abbreviations remain searchable alternative labels of their concepts and are
exported as `skos:altLabel` in JSON-LD.
Journeys 08 and 09 can be prepared or reset from `/poc-simulation/domain-glossary` when demo auth
is enabled.

The catalog list shows this canonical score as a compact Bronze, Silver, Gold, or Platinum medal.
The read-only `Daten & Nutzung` product tab turns the same stored schema and semantic mappings into
a searchable data dictionary and safe REST/PostgreSQL quickstarts. It never renders credentials or
secret references and does not execute product-data requests from the catalog UI.

On pointer-based desktop devices, revision, quality medal and catalog creation date stay visually
reserved but appear only when a product row is hovered, focused or has its context menu open. They
remain permanently visible on touch devices and in forced-colors mode. The product menu links to the
versioned `SLA & Nutzungsbedingungen` page, where the Data Owner and a separate stored control person
use four-eyes approval: the owner maintains time-valid PoC service targets and the control person
reviews the exact revision. Publishing an SLA never changes
access grants, OPA/PostgreSQL policies, I14Y evidence or BAR evidence.

Access decisions are deliberately two-phase: approval creates a timed PBAC/Rego draft and sets
the request to `approved_policy_pending`; only successful publication to OPA and PostgreSQL sets
it to `granted_original` or `granted_modified`. The DAAIF reference fixture can then be exercised
at `GET http://localhost:8080/sample-api/api/v1/daaif/estv.direct-tax-assessments.v1` with exactly one local
demo identity header (`X-DaCa-User` or `X-DaCa-Machine`).

Expiring grants expose their exact end date and a linked renewal action. A renewal preserves the
existing subject, protocols, data variant and weekly window; the Data Owner reviews the old/new
evidence and the stored control person approves the immutable policy revision. The previous grant
continues unchanged until OPA and PostgreSQL confirm the replacement revision. Journey 07 uses an
isolated, owner-controlled fixture to demonstrate this path and resets only its own artifacts.

The full browser-driven customer journey across a transient DAAIF and DaCa stack lives in
[`journeys/`](journeys/README.md). It records screenshots, video, Playwright trace, JUnit output,
container logs and a SHA-qualified result summary, then removes every journey container and
volume. Run it locally with `npm run journey:data-analyst`; the official GitHub workflow is a
manual `workflow_dispatch` on `main` only.

## DAAIF physical objects and DaCa logical models

DAAIF remains the technical workbench for acquired sources and exposes only metadata that is safe
to browse. DaCa remains the system of record for logical models, field revisions, physical
snapshots, mappings, drift and their governance. The shared Data Analyst journey therefore passes
only a version-pinned reference: DAAIF physical object ID/path, DaCa logical-model URN, model and
mapping revision, status, and a UI deep link. No cross-database foreign key, source credential,
table row, object content or view definition crosses the boundary. A `draft`, `broken` or
`superseded` mapping must not establish analytical business context.

The existing DaCa Journey 02 links to DAAIF's closed-by-default source explorer; DAAIF's
**Education & Documentation → User Journeys** links back to the DaCa model and mapping workspace.

## Work with logical models and I14Y Concepts

`Datenmodelle` is independent of `Meine Datenprodukte`. `Neues logisches Modell` asks whether to
start with an empty logical form or from an existing data source; the adjacent action is therefore
named **Sichtbare Datenquellen**. The DAAIF-aligned first level presents active connection cards.
The page now uses **Sichtbare Datenquellen** with a direct expert-search link that carries the
current filter text as `q`; the expert search applies it to visible physical sources as well as
data products. The synthetic SAP VIBDBU real-estate source is readable across
modeling scopes; import and changes remain limited to its owning scope. The catalog header
offers a local sign-in view backed by a revocable, HttpOnly demo session, profile avatar and
sign-out, language selection and a light/dark switch. Header actions and the language selector
have no surrounding boxes; the opened language list has readable option colors in both themes,
and keyboard focus uses an underline instead of a frame. In dark mode the federal logo keeps its
transparent background and red shield while its lettering appears white. A language change updates the visible interface immediately, then
asks whether to keep it in this browser or the demo user's server profile; cancelling restores
the previous language. Theme and language storage each require that explicit choice. This local preview
shows the active person in the header instead of repeating an Arbeitskontext panel in workspaces.
The translation dictionary covers the shared shell, sign-in, source register, expert search,
welcome page, product overview, model overview, task overview and main domain view in DE/FR/IT/EN.
Specialized editors and some workflow details still contain German text. The local preview retains
`X-DaCa-User` for PoC/CLI flows under `DACA_DEMO_AUTH=true`; it is not production IAM.
One card represents one technical system instance: active registrations with the same catalog path
are consolidated, while distinct PostgreSQL, S3, or future Oracle instances remain separate.
The register can be narrowed by free text across instance name, catalog path and owner, or by
source type and owner. Its federal administration level selector shows Bund, Kantone, Gemeinde,
Bundesnahe Betriebe and Kantonalbanken; only Bund is currently available and selected. A tooltip
explains this PoC scope. The VIBDBU PostgreSQL demo source is seeded active and can be imported
again whenever a fresh structural snapshot is required.
Opening a source reveals its database/schema/table tree, complete field metadata and a table
context menu. `Logisches Modell ableiten` creates the technical draft and its pinned exact 1:1
mappings atomically and opens the mapping workspace directly. When a table is already referenced,
`Referenziertes logisches Modell öffnen` is enabled and opens that model's mapping workspace with
the precise snapshot and table selected. Product publication and DAAIF investigation remain visibly
disabled.
Tables with an existing logical-model mapping show a dedicated model icon before the compact `…`
action control. Its rear square is gray and its front square blue. The icon links directly to the
logical model; a second tooltip line explains the click action. If several models are linked, the
most recently updated one opens. The tooltip confirms the link independently of mapping status
and closes immediately when the pointer leaves the icon.
The model overview displays each change timestamp with both date and local time.
The physical snapshot card in the mapping graph identifies the scope's Data Owner, displays its
data-source-type icon, and shows the full canonical catalog path alongside its pinned revision.
Mapping edges are measured from the rendered connector centres, so they remain attached when the
snapshot card grows with additional metadata.
`Datenquellen` is a first-level navigation item between `Meine Datenprodukte` and
`Domäne und Terminology`; the explorer uses the same server, PostgreSQL, database, schema, table
and view icons as the DAAIF source tree.

The direct physical-first action uses an unambiguous, already governed domain in the source scope;
it never infers a domain from technical names. Its fields record an explicit provisional no-match
for I14Y and remain editable before review. A model can subsequently link any number of versioned physical representations from
the mapping workspace. Exact name-and-type pairs are reviewable suggestions, while conflicts,
ambiguities, fuzzy matches, M:N mappings, and transformations remain manual. A physical model is
a mapping-capable table/view or Parquet structure imported from a data source. The deterministic fixture source contains
`logistics.vehicle_inventory` and `hr_core.public.org_unit`; a real connector reads only
`information_schema` and `pg_catalog` when its server-side secret is configured. No database
credentials or data rows are accepted by the browser or modelling APIs.

The conventional editor and the mapping workspace share one Angular field-characteristics
component. Logical-first presents the fields as a compact selectable table with add/remove actions;
the alternative `Relation` view contrasts each logical field with its physical binding. Selecting
a row opens every field characteristic in the persistent editor on the right. The mapping workspace
uses the same editor beside its graph or mapping table, so editing type, length, cardinality,
classification, descriptions and I14Y links no longer interrupts mapping work. Physical-first
prefills every technically justified value from the pinned snapshot while business semantics remain
explicit user decisions. The model-level section remains `Model Merkmale` on `Modellebene`. Context help has no separate information icon:
hovering or focusing the field title opens the tooltip above it and repeats the covered title; it
closes as soon as the pointer leaves that title. Opening another field help first closes the
previous tooltip, so contextual explanations never accumulate over the mapping workspace.

The logical-model detail page keeps its title above three tabs: `Status & Klassifikation`
contains the saved metadata summary, publication readiness, version history and exports;
`Model Merkmale` contains the DCAT-AP-CH and organization form; `Logische Entitäten und Felder`
contains the field table and editor. The same form instance retains unsaved changes when tabs
change. New models open on model characteristics; existing models open on status.

The mapping graph now uses compact cards and a 570 px canvas beside the persistent field editor.
Selecting a graph field places the text cursor in the editor's first input, `Entität`, once the field is shown.
Connections can be removed while older mapping revisions stay in history; logical fields can also
be removed from the editor. On a graph field, right click or Shift+F10 opens actions for editing
field characteristics, adding a connection, removing an individual physical link, or removing the
logical field. These mutations require a Data Owner or Data Steward assignment in the model's
organization scope; the API enforces the same restriction. Saved removals create versioned
successors, while removing a local draft link stays local. A model that has ever been linked to a physical representation may be
saved with an unbound logical field, but DaCa rates that field as an **Inkonsistenzfehler**. A
PostgreSQL issue record creates a personal Data Owner task. The owner must accept the error with a
reason or assign investigation to an eligible Data Steward. Adding a physical mapping or removing
the field resolves the issue and completes open tasks. A model created purely logically, without
any physical binding, remains valid. Journey 13 and the dated, tagged static documentation article
show this workflow with interface images.

The sample PostgreSQL database contains quoted table `VIBDBU`: all 47 fields from
`tests/VIBDBU.csv`, column comments, and exactly 1'000 deterministic, semantically plausible Swiss
building records. Its released migration creates those rows in every environment. The catalog seed
also persists the matching credential-free structural snapshot, so `SAP VIBDBU Gebäudebestand` is
immediately browseable after a deployment: open it as Mirjam Keller, select
`daca_sample.public.VIBDBU`, open the table context menu and derive the logical model directly into
the mapping workspace. Only structure and comments are copied into the catalog snapshot; rows
remain in the sample database.

The S3 adapter lists configured objects and reads only embedded Parquet schemas. It can point at
the same S3-compatible store as DAAIF without making DAAIF a runtime dependency. Configure
`DACA_PHYSICAL_S3_ENDPOINT_URL`, `DACA_PHYSICAL_S3_BUCKET`, `DACA_PHYSICAL_S3_PREFIX`,
`DACA_PHYSICAL_S3_ACCESS_KEY_ID`, and `DACA_PHYSICAL_S3_SECRET_ACCESS_KEY` on the Catalog API.
For the local MinIO fixture, write the deterministic Parquet object with
`uv run --project services/catalog-api daca-s3-fixture-seed`. Searches under **Bestehende Datenquellen**
run solely against the already imported catalog metadata in PostgreSQL.

The federal modeling scope is imported from a checked, hashed Staatskalender snapshot. The
validated hierarchy contains the Federal Chancellery and seven departments, including
`VBS → Bundesamt für Rüstung armasuisse (20005536) → armasuisse Immobilien (20053180)`.
At runtime the UI reads this hierarchy exclusively from PostgreSQL. Run the offline validation or
explicit import with:

```powershell
uv run --project services/catalog-api daca-federal-org-import --check
uv run --project services/catalog-api daca-federal-org-import --apply
```

TERMDAT search uses its official public API in two phases: summary search followed by targeted,
parallel language-detail requests for the returned entry IDs. Website-only, in-progress entries
are not represented as public API results. DeepL Free is optional and server-side only. Set
`DACA_DEEPL_API_KEY` to enable translation. Only `unclassified` text may leave DaCa, existing
translations are never overwritten, and accepted machine/TERMDAT suggestions store version-bound
hash and source provenance. TERMDAT reuse licensing is not stated unambiguously enough for a
production decision; production use requires confirmation from the Federal Chancellery.

Journey 10 uses Mirjam Keller (Data Steward, armasuisse Immobilien), Daniel Wenger (primary owner
of the `Immobilienmanagement VBS` domain) and Eliane Rossi (delegated deputy). Submission creates
an immutable review snapshot and owner task; acceptance publishes immediately, while rejection
requires a comment and creates a `changes_requested` successor for the submitting steward.
The guide calls this journey **Logisches Datenmodell erfassen**: Mirjam enters exactly one logical
model in `/models/new`, adds entities and fields manually, and publishes it through domain review
without a physical source or mapping. Journey 11, **Logisches Modell von physischer Repräsentation
ableiten**, immediately follows it in the guide. Christian Man (or Christian Spider) opens the
seeded VIBDBU source, checks its 47 structure fields, derives a technical draft from the table
menu, reviews the pinned direct mappings, and completes the domain semantics. Repeating the same
table/snapshot derivation returns the same model. Journey links that specify a demo person now
perform a full local-session sign-in before the target page loads.
The demo-user selector also includes Giuseppe Starwars (Data Owner) and Thomas Wikinger (Data
Steward) in the parent organization armasuisse.

### Logical-model form, identifiers, and save errors

Every field label has a compact semantic-help icon. The icon appears only while the field or its
description has pointer or keyboard focus; its tooltip opens from the icon and follows the primary
browser language (`de`, `fr`, `it`, otherwise German). The DaCa-domain link opens the domain
register in a new tab. Department is mandatory; office, division, application name, and creator
type are optional. `Geheim` stays visible but disabled for new top-level classifications, so older
`secret` records remain readable.

An identifier is exactly one whitespace-free string and is reserved case-insensitively across the
catalog in PostgreSQL. The optional organisation-derived mode exposes a fixed organisation prefix
and an editable suffix; turning it off restores the manual value. A live availability check gives
early feedback, while the database reservation remains the atomic authority. A changed identifier
releases the previous value; active and retired roots retain their current reservation. Physical
derivations use their immutable source snapshot in the generated identifier so repeatable
derivations do not collide.

Saving shows actionable German feedback directly under **Als Entwurf speichern**. Invalid controls
are transparent red and every linked error entry focuses its control. A real ETag conflict alone
asks for a reload. Database-integrity errors contain a safe RFC-7807 code, suggested action,
field paths, request ID, SQLSTATE category/constraint, timestamp, and **Copy Error Message**;
they never expose SQL, values, or stack traces. I14Y links, primary Concept, and CodeList are
initially empty, optional, and each has its own **Zurücksetzen** action.

I14Y Concepts are a read-only cached reference source. A full refresh is never triggered on UI
startup; run it explicitly as a scoped modelling persona:

```powershell
curl.exe -X POST `
  -H "X-DaCa-User: cinthya.thor" `
  http://localhost:8001/api/v1/i14y/concepts/sync
curl.exe -H "X-DaCa-User: cinthya.thor" `
  http://localhost:8001/api/v1/i14y/sync-status
```

The sync verifies the current official OpenAPI document, uses its `PROD` server, pages Concepts
with bounded concurrency, and retains the previous complete cache on failure. Automated tests use
the checked, sanitized real-response fixtures and do not call the live service. DCAT-AP-CH and
SHACL exports are available from each logical-model version in Turtle and JSON-LD.

The architecture, roles, three demo journeys, namespace bindings, fixture provenance (including
retrieval timestamps plus original and sanitized-file hashes), targeted Concept/CodeList sync
commands, and mapping/drift semantics are documented in
[`docs/logical-models-i14y-mapping.md`](docs/logical-models-i14y-mapping.md). Because DAAIF is a
separate repository, add Christian Spider there through the validated external helper:

```powershell
uv run python scripts/seed_daaif_christian_spider.py --repo <daaif-repository> --check
uv run python scripts/seed_daaif_christian_spider.py --repo <daaif-repository> --apply
```

With the Catalog API and UI running locally, the three modeling journeys can be repeated in a
real Microsoft Edge instance. The harness exercises logical-first, physical-first, and
existing-to-existing workflows, including role switching, keyboard-only drift resolution,
reload persistence, the 390×844 matrix layout, and optional evidence captures:

```powershell
npm run test:ui-regression -- `
  --base-url http://127.0.0.1:8080 `
  --screenshot-dir output/ui-regression
```

`npm install` configures the versioned `.githooks/pre-commit` hook; run `npm run setup:git-hooks`
to configure it again explicitly. The hook runs `npm run test:ui-regression` before every commit.
The GitHub **UI regression** pull-request check runs the same command against Compose. It uploads
screenshots only on failure and retains them for three days.

### Personal profile and cross-organization modeling

The signed-in name in the header opens `/profile`. The page shows the person's portrait (or
initials), primary organization, email, active server-backed modeling assignments and other
application roles. It maps each modeling role to the actions available in its organization scope.
The profile is absent from the main navigation; the header name is its only entry. Sign-out is
available on the profile page only. A visitor without a local session sees the demo-person picker
before any DaCa page is rendered.
Christian Spider and Christian Man retain their Verteidigung roles and also have Data Steward
assignments in `VBS / armasuisse Immobilien`. They can create and derive VIBDBU logical drafts and
edit their mappings. Their additional role also permits structural metadata management there;
publishing still requires the named owner or delegated deputy of the specific model.

## Exercise the control plane

Historical PoC catalog registrations, directed grants, sync intent, deployment observations, health history,
and audit events are available under `http://localhost:8002/api/v1`. Mutations require the local
`X-DaCa-Actor: demo-control-admin` header. A sync configuration can be enabled only when an
approved matching directed grant exists; the configuration does not transfer resources.

## Test the protected REST product

Allowed:

```powershell
curl.exe -H "X-DaCa-User: kanton-st-gallen" http://localhost:8080/sample-api/api/v1/estv/tax-statistics
```

Denied (`403`):

```powershell
curl.exe -H "X-DaCa-User: kanton-bern" http://localhost:8080/sample-api/api/v1/estv/tax-statistics
```

Missing identity returns `401`; an unavailable or undefined OPA decision returns `503` without
reading the data table.

## Test direct PostgreSQL enforcement

The seed credentials are development-only and can be changed through `.env` before the first
volume initialization.

```powershell
$env:PGPASSWORD="daca_sg_dev"
psql -h localhost -p 55432 -U "kanton-st-gallen" -d daca_sample -c "select * from tax_statistics;"
```

The denied user receives no rows:

```powershell
$env:PGPASSWORD="daca_bern_dev"
psql -h localhost -p 55432 -U "kanton-bern" -d daca_sample -c "select * from tax_statistics;"
```

Forced RLS finds no matching PostgreSQL entitlement. Neither consumer is a table owner,
superuser, or `BYPASSRLS` role.

## Development checks

```powershell
uv sync --all-packages
npm ci
npm run build
npm test
npm run lint
```

## Release version management

The root [`VERSION`](VERSION) file is the sole DaCa release-version source. The version command
keeps the first-party Node and Python package metadata and lockfiles, service runtime constants,
the shared UI version constant, focused OpenAPI documents, and OpenShift image pins synchronized.
Do not edit those derived release surfaces individually.

Validate the repository before CI/CD builds or publishing images:

```powershell
npm run version:check
```

Prepare a release with a strict `X.Y.Z` version. The command first refuses an inconsistent
repository, then updates all managed surfaces and validates the result:

```powershell
npm run version:bump -- 0.2.0
```

The lower-right version box in both web applications uses the DAAIF card design and opens a
short, plain-language summary of the newest release. The link in that popup opens
`/settings/features`, where users can search the tagged release history by feature or topic.
When a new Angular PWA build is ready, Catalog and Control Plane automatically open the DAAIF-style
update dialog once per build. It shows the current and target versions, warns that unsaved page
content will be lost, offers the target release notes and links to the feature list. Users can
apply the update with a full reload or leave their current work open and update later from the
version card.
The settings icon beside the theme control opens `/settings` and its DAAIF-style submenu with
personal language settings, appearance, and the feature list. Tenant language settings are absent
because DaCa has no tenancy. Both the settings and day/night icons show translated hover/focus
tooltips. Language and appearance choices on these pages use the same browser-or-profile
confirmation as the header controls. The archive contains the published versions verified in
the `VERSION` history from 0.1.1 onward; numbers that were never released are omitted. Simulated
behavior is identified on the page. The displayed version is bound to the shared release constant and
covered by `version:check`.

After the complete GitHub test suite and the PostgreSQL 17/18 compatibility jobs pass, CI builds
all five first-party Linux images and publishes each component to its own Docker Hub repository:

```text
svabra/tib-daca-catalog-ui
svabra/tib-daca-catalog-api
svabra/tib-daca-control-plane-ui
svabra/tib-daca-control-plane-api
svabra/tib-daca-sample-data-product
```

Each repository receives `sha-<commit>` on every successful non-PR run and the exact release
version, for example `0.1.1`, only when `VERSION` changes on `main` or a matching `v<version>` Git
tag is built. No mutable `latest` tag is published. The repository secret `DOCKERHUB_TOKEN` must
contain one Docker Hub personal access token with read/write permission. The optional repository
variable `DOCKERHUB_USERNAME` defaults to `svabra`; account passwords and email addresses are
never stored in the workflow.

The persistent data model for the catalog, control plane, and protected sample product is in
[`docs/data-model/`](docs/data-model/README.md). DAAIF is treated as an external source; the
documentation covers only the publication and workflow evidence stored by DaCa. After changing
SQLAlchemy models, Alembic migrations, persisted JSON structures, PostgreSQL roles, functions, or
RLS policies, regenerate and verify the model documentation:

```powershell
npm run docs:data-model
npm run docs:data-model:check
```

The second command is part of the root `npm test` pipeline and fails when generated tables,
columns, relationships, constraints, migration heads, or protected PostgreSQL objects drift.

These root commands build/test both Angular workspaces and all Python services; `npm test` also
runs both reviewed Rego suites with the pinned OPA image. `npm audit --omit=dev` reports no
production dependency vulnerabilities at the time of this implementation.

Architecture and PBAC details are in `docs/architecture.md` and `docs/security/pbac.md`. The
combined component, PBAC, WSO2, PostgreSQL projection, and request-activity diagrams are in
`docs/architecture-pbac-diagrams.md`. The root `AGENTS.md` is the AI capability harness and records
the central-catalog boundary and security invariants.

## OpenShift presentation deployment

The RHOS presentation profile uses the existing PostgreSQL service and credentials in
`daai-brs-d`. It isolates Catalog and policy-projection data in the `daca_catalog` and
`daca_sample` schemas of `evo1_oltp`; DaCa deploys no PostgreSQL, pgAdmin, PVC or database
service. The dedicated-database and role model remains the default outside this explicit PoC
profile. Apply the four application-only workloads as described in [`k8s/README.md`](k8s/README.md).
DAAIF publishes metadata internally to
`http://daca-catalog-api:8001/api/v1/metadata-publications`.
