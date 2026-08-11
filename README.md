# BIT DiDaCa

**DiDaCa** means **Distributed Data Catalog**. This proof of concept contains a standalone catalog,
a catalog control plane, and a synthetic ESTV data product protected over both REST and direct
PostgreSQL access.

## Projects

| Project | Purpose | Local URL |
|---|---|---|
| Catalog UI | Metadata, lineage, provenance, endpoints, policy authoring | http://localhost:8080 |
| Catalog API | Standalone catalog and PAP/PIP | http://localhost:8001/docs |
| Control-plane UI | Instances, directed trust, sync intent, status | http://localhost:8081 |
| Control-plane API | Control-plane REST and SSE | http://localhost:8002/docs |
| Sample data product | Protected synthetic ESTV aggregates | http://localhost:8003/docs |
| OPA PDP | Bundle status and local policy decisions | http://localhost:8181 |
| SQLite | Persistenter lokaler Katalogspeicher | Docker-Volume `didaca-catalog-sqlite` |
| PostgreSQL | Control Plane, Sample-Daten und direkter Produktzugriff | localhost:55432 |

The only supported protocols are HTTP and PostgreSQL wire protocol. Federation configuration is
persisted but no catalog-to-catalog synchronization is performed.

## Stack

- Angular 22, Angular PWA/service worker, signals and RxJS
- Python 3.14, FastAPI, SQLAlchemy, Psycopg and Alembic
- SQLite 3 for the POC catalog, PostgreSQL 18.4 for control/product data, and OPA 1.18.2
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
   defaults and both `X-DiDaCa-*` headers are local-demo mechanisms, never production identity.
3. Build and start everything:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

4. Open the two UI URLs above. Stop without deleting database state with
   `docker compose down`; add `-v` only when intentionally discarding the SQLite and PostgreSQL
   volumes.

The catalog API stores its temporary POC portfolio in `/data/didaca-catalog.db` on the named
`didaca-catalog-sqlite` volume. PostgreSQL 18 stores its separate control-plane and sample-product
state at `/var/lib/postgresql`, matching the official image's version-aware layout.

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
  -H 'X-DiDaCa-User: didaca-demo-editor' `
  -d '{"description":"Updated synthetic aggregate metadata"}' `
  http://localhost:8001/api/v1/data-products/11111111-1111-4111-8111-111111111111
```

A missing precondition returns `428`; a stale ETag returns `412`. Errors use
`application/problem+json` and include a request ID.

## Exercise the control plane

Catalog registrations, directed grants, sync intent, deployment observations, health history,
and audit events are available under `http://localhost:8002/api/v1`. Mutations require the local
`X-DiDaCa-Actor: demo-control-admin` header. A sync configuration can be enabled only when an
approved matching directed grant exists; no federation traffic is sent.

## Test the protected REST product

Allowed:

```powershell
curl.exe -H "X-DiDaCa-User: kanton-st-gallen" http://localhost:8003/api/v1/estv/tax-statistics
```

Denied (`403`):

```powershell
curl.exe -H "X-DiDaCa-User: kanton-bern" http://localhost:8003/api/v1/estv/tax-statistics
```

Missing identity returns `401`; an unavailable or undefined OPA decision returns `503` without
reading the data table.

## Test direct PostgreSQL enforcement

The seed credentials are development-only and can be changed through `.env` before the first
volume initialization.

```powershell
$env:PGPASSWORD="didaca_sg_dev"
psql -h localhost -p 55432 -U "kanton-st-gallen" -d didaca_sample -c "select * from tax_statistics;"
```

The denied user receives no rows:

```powershell
$env:PGPASSWORD="didaca_bern_dev"
psql -h localhost -p 55432 -U "kanton-bern" -d didaca_sample -c "select * from tax_statistics;"
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

These root commands build/test both Angular workspaces and all Python services; `npm test` also
runs both reviewed Rego suites with the pinned OPA image. `npm audit --omit=dev` reports no
production dependency vulnerabilities at the time of this implementation.

Architecture and PBAC details are in `docs/architecture.md` and `docs/security/pbac.md`. The
combined component, PBAC, WSO2, PostgreSQL projection, and request-activity diagrams are in
`docs/architecture-pbac-diagrams.md`. The root `AGENTS.md` is the AI capability harness and records
the deliberately unimplemented federation contract.
