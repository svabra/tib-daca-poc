# BIT DaCa

**DaCa** means **Distributed Data Catalog**. This proof of concept contains a standalone catalog,
a catalog control plane, and a synthetic ESTV data product protected over both REST and direct
PostgreSQL access.

## Projects

| Project | Purpose | Local URL |
|---|---|---|
| Catalog UI | Metadata, lineage, provenance, endpoints, policy authoring | http://localhost:8080 |
| Catalog API | Standalone catalog and PAP/PIP | http://localhost:8080/catalog-api/docs |
| Control-plane UI | Instances, directed trust, sync intent, status | http://localhost:8081 |
| Control-plane API | Control-plane REST and SSE | http://localhost:8002/docs |
| Sample data product | Protected synthetic ESTV aggregates | http://localhost:8080/sample-api/docs |
| OPA PDP | Bundle status and local policy decisions | http://localhost:8181 |
| PostgreSQL 18.4 | Catalog, Control Plane, Sample-Daten und direkter Produktzugriff | localhost:55432 |
| pgAdmin | Nur lokale Verwaltung der drei PostgreSQL-Datenbanken | http://localhost:5051 |

The only supported protocols are HTTP and PostgreSQL wire protocol. Federation configuration is
persisted but no catalog-to-catalog synchronization is performed.

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

The migration does not delete an earlier catalog SQLite volume or a repository-local `*.db`
file. If such a volume still exists, first identify and back it up; remove it only after checking
the copied database:

```powershell
docker volume ls --filter name=catalog-sqlite
New-Item -ItemType Directory -Force backup
docker run --rm --mount source=<legacy-volume>,target=/source,readonly `
  --mount type=bind,source=${PWD}\backup,target=/backup `
  alpine sh -c "cp /source/*.db /backup/"
docker volume rm <legacy-volume>
```

The last command permanently removes only the explicitly named legacy volume and is optional.

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

Access decisions are deliberately two-phase: approval creates a timed PBAC/Rego draft and sets
the request to `approved_policy_pending`; only successful publication to OPA and PostgreSQL sets
it to `granted_original` or `granted_modified`. The DAAIF reference fixture can then be exercised
at `GET http://localhost:8080/sample-api/api/v1/daaif/estv.direct-tax-assessments.v1` with exactly one local
demo identity header (`X-DaCa-User` or `X-DaCa-Machine`).

The full browser-driven customer journey across a transient DAAIF and DaCa stack lives in
[`journeys/`](journeys/README.md). It records screenshots, video, Playwright trace, JUnit output,
container logs and a SHA-qualified result summary, then removes every journey container and
volume. Run it locally with `npm run journey:data-analyst`; the official GitHub workflow is a
manual `workflow_dispatch` on `main` only.

## Exercise the control plane

Catalog registrations, directed grants, sync intent, deployment observations, health history,
and audit events are available under `http://localhost:8002/api/v1`. Mutations require the local
`X-DaCa-Actor: demo-control-admin` header. A sync configuration can be enabled only when an
approved matching directed grant exists; no federation traffic is sent.

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

The lower-right version box in both web applications also opens a plain-language feature list.
It shows the capabilities of the current Catalog or Control Plane release in the application's
language and clearly identifies simulated PoC behavior. Its displayed version is bound to the
same shared release constant and is covered by `version:check`.

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
the deliberately unimplemented federation contract.

## OpenShift presentation deployment

The RHOS presentation profile uses the existing PostgreSQL service and credentials in
`daai-brs-d`. It isolates Catalog and policy-projection data in the `daca_catalog` and
`daca_sample` schemas of `evo1_oltp`; DaCa deploys no PostgreSQL, pgAdmin, PVC or database
service. The dedicated-database and role model remains the default outside this explicit PoC
profile. Apply the four application-only workloads as described in [`k8s/README.md`](k8s/README.md).
DAAIF publishes metadata internally to
`http://daca-catalog-api:8001/api/v1/metadata-publications`.
