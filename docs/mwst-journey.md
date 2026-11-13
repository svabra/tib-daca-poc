# MWST product-creation journey

The User Journeys guide includes **MWST-Erträge für St. Gallen**. Jan Waser is a Data Analyst
of Kanton St. Gallen; Kassandra Valdata is the source and result Data Owner; Thomas Kriegli
keeps the existing publication/SLA control role. Jan directly submits an electronic request
for a new data product in DaCa. The creation request is a persisted workflow, not an access
grant. Kassandra completes the order once the new product is ready and accessible to Jan.

Jan has no pre-granted data access to either source product, including the Swiss time series.
He can discover their catalog metadata, descriptions and SLA and submit an access request.
The separate finished SG example retains its independent Jan grant. Existing installations
with an older source grant must revoke it using the normal owner/control-person workflow;
never rewrite published policies or remove audit evidence to reset the demonstration.

## Setup and data boundary

Start DaCa using the existing Compose instructions, with `DAAIF_UI_URL=http://127.0.0.1:8011`.
Apply normal Alembic migrations and seeds (the API container does this on startup). In the
sibling DAAIF repository, start the dev server on 8011 and run:

```powershell
./.venv/Scripts/python.exe scripts/setup-mwst-journey.py --daaif-url http://127.0.0.1:8011 --daca-url http://127.0.0.1:8080
```

This registers and approves three fixture products through the normal metadata, SLA and
governance APIs. Eleven national totals and 2,860 company-year rows cover 2016–2026: 260
fictitious firms across all 26 cantons, with 60 SG firms and eight per other canton. National
totals sum exactly the same two-decimal CHF amounts. 2016–2025 are complete; 2026 is
provisional as of **12 November 2026**. Canton denotes company location. These are synthetic
demonstration values, not official figures. DaCa stores descriptions, field semantics,
contacts, provenance, canonical SLA revisions and HTTP endpoints; DAAIF stores payloads.

The ready example `mwst-ertraege-firmen-sg-2026-beispiel` contains 60 SG company rows. The
slug `mwst-ertraege-firmen-sg-2026` stays free for Kassandra's manual creation. The setup is
repeatable and preserves existing products, manual results and append-only audit history.

## Walkthrough

1. Open Documentation → User Journeys → MWST-Erträge für St. Gallen. As Jan, inspect the
   catalog entries for the national time series and company product, including metadata,
   contact and approved SLA. Discoverability does not authorize source-data downloads.
2. As Jan, directly open the electronic request for a new data product with the company
   product selected. Enter the desired product
   name yourself, choose the data-basis period 2026-01-01 through 2026-11-12, describe the SG
   company-row requirement in the purpose and supply the legal mandate. Select Excel,
   Parquet and CSV in the format dropdown and choose the requested update frequency.
3. As Kassandra, open the task/notification and accept it. Its DAAIF link passes both
   `demoUser=kassandra.valdata` and `creationRequest=<UUID>` to DAAIF.
4. In DAAIF, inspect and execute the editable query with
   `WHERE tax_year = 2026 AND canton_code = 'SG'`. Check 60 individual firms and save the
   result as Parquet through the existing result-storage facility.
5. Publish that saved result through the existing dialog. Edit its metadata and SLA in
   DaCa, grant Jan HTTP data.read, submit the publication and have Thomas approve SLA and
   publication. Wait for OPA and PostgreSQL to confirm the same policy revision.
6. Once the new product is published and accessible to Jan, Kassandra selects it in the
   request and completes the order. Jan then receives a result notification linking to
   the request and product. The product's usage section links to DAAIF's download page
   with the current demo identity. All formats deliver the complete same SG 2026 snapshot.

Jan can discover the national company metadata but cannot retrieve that payload. Access
to the separate SG product does not require access to the source company product. DAAIF
uses the same policy enforcement for REST and downloads, denies when evaluation is
unavailable, and validates/retains the SG product scope. No general row-permission system
is introduced. Cross-system demo identities are for the local PoC only.

## Creation request API

All paths are below `/api/v1/product-creation-requests` and use existing authenticated/demo
actor resolution. Only the requester and assigned owner can list/read a request. The API
derives the responsible owner from trusted source product records; caller-provided owner
fields are rejected. Existing product metadata visibility rules apply to source selection.

| Method/path | Behavior |
| --- | --- |
| `POST /` | Create with sourceProductIds, proposedTitle, basisFrom/basisUntil, purpose, legalBasis, formats and updateFrequency. Explicit old canton/year scope remains compatible. Returns 201. |
| `GET /` | List actor's own/assigned requests. |
| `GET /{id}` | Detail, revision, identities, source titles and configured notebook link. |
| `POST /{id}/decision` | Owner accepts or rejects a submitted request; rejection needs a comment. |
| `POST /{id}/fulfillment` | Owner assigns an approved resultProductId to an in-progress request. |

Decision and fulfillment require `If-Match: "<revision>"` (428 missing, 412 stale).
The state machine is `submitted → in_progress → fulfilled` or `submitted → rejected`.
Fulfillment requires the correct result owner, active policy and published metadata,
approved SLA, matching period/request ID (or old canton/year/request ID) in the publication evidence, and effective
requester access. Foreign request access is denied. Task types `product_creation_review`
and `product_creation_result` reuse existing task/notification UI and audit infrastructure.
Migration 0049 adds request storage and a nullable task link; no existing audit is rewritten.

DAAIF provides a read-only request bridge and canonical SLA summary bridge. Full exports are
`/api/public/data-products/{slug}/download/xlsx`, `/parquet`, `/csv` on the DAAIF origin.
DaCa stores only HTTP catalog delivery endpoints, not S3 delivery endpoints or credentials.
See [catalog data model](data-model/catalog.md) for persisted evidence.

## Local acceptance

### Known limitations from the 13 November 2026 replay

The generic MWST access form has no four-eyes publication-submission action. The replay
submitted through the existing governance API as Kassandra and approved as Thomas in the
UI. The quality breadcrumb can point to another product, and some handoff/task labels
still name Joel Ruod; the stored product and owner references were verified as correct.

DaCa's effective-access view uses the Swiss date, while OPA uses UTC for date-bounded
grants without a weekly schedule. At 00:48 Swiss time on 13 November, a grant starting that
day appeared active but downloads returned 403. A new, independently approved policy
revision starting on the fixed journey date of 12 November allowed the remaining download
checks. This is a documented demonstration workaround; the timezone mismatch is unresolved.

Request `NEW-286BFA7DCF17` was fulfilled with the separate
`mwst-ertraege-firmen-sg-2026-wiederholung-20261113` product. Excel, Parquet and CSV matched
all source fields for 60 SG firms and CHF 10,703,041.83; 24 authorization checks passed.

The 12 November 2026 browser run submitted and accepted a request, executed the editable
SG filter in DAAIF, published the saved result, approved SLA and publication as Thomas,
fulfilled the request and opened Jan's result notification. The three browser downloads
were read back: 60 identical SG firms for 2026, period end 2026-11-12 and CHF 10,703,041.83
in total. Live checks also confirmed all 2,860 source rows and matching national sums.
Foreign requests and unauthorized national-company REST/download access were denied.
Mobile checks covered 390 and 320 pixels. The ordinary manual-result slug remains free;
the completed acceptance product uses the explicitly labeled `-prueflauf` slug.

Validation includes 833 frontend tests, the standard `npm run test:ui-regression` browser
gate, and 42 Catalog API tests covering creation requests, DAAIF publication, SLA revisions
and governance submissions. Generated data-model and metadata-publication OpenAPI checks
remain part of the normal repository checks.
