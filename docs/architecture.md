# BIT DiDaCa architecture

BIT DiDaCa is a catalog ecosystem in which each catalog remains independently useful. The
control plane records relationships and desired federation settings; it is not on the catalog's
metadata or authorization request path.

```mermaid
flowchart LR
  Owner[Data owner] -->|HTTP| CatalogUI[Catalog Angular PWA]
  CatalogUI -->|REST| CatalogAPI[Standalone catalog API / PAP]
  CatalogAPI --> CatalogDB[(Catalog SQLite / POC)]
  CatalogAPI -->|policy + PIP bundle over HTTP| OPA[Local OPA / PDP]
  Consumer[REST consumer] -->|HTTP + identity| ProductAPI[ESTV sample API / PEP]
  ProductAPI -->|decision input| OPA
  ProductAPI -->|authorized query| ProductDB[(Product PostgreSQL / RLS PEP)]
  PgConsumer[PostgreSQL consumer] -->|PostgreSQL wire| ProductDB

  Operator[Platform operator] --> ControlUI[Control-plane Angular PWA]
  ControlUI -->|REST + SSE| ControlAPI[Control-plane API]
  ControlAPI --> ControlDB[(Control-plane PostgreSQL)]
  ControlAPI -. health observations .-> CatalogAPI
  ControlAPI -. desired trust and sync only .-> Federation[Future federation adapter]
```

## Technology choices

- **Angular 22 / Node 24**: standalone components, route-level code splitting, signals, RxJS,
  service worker support, and a long-lived enterprise UI platform. Only the shell and initial
  dashboard are eager; graphs, policy tools, audit, and federation features are lazy.
- **Python 3.14 / FastAPI**: typed OpenAPI-first services with a natural future path to Pandas,
  Polars, PyArrow, profiling, schema inference, and lineage extraction. CPU-heavy wrangling can
  move to separate workers later without changing API contracts.
- **SQLite 3**: persistent catalog metadata for the POC, isolated in the catalog container volume.
  SQLAlchemy and Alembic keep the persistence boundary ready for the planned PostgreSQL migration.
- **PostgreSQL 18.4**: versioned control-plane data and direct product delivery. The local server
  contains two service-owned databases; production deployments may split them without changing
  ownership boundaries. Docker exposes it on host port `55432` because the reference workbench
  already owns the conventional local port `5432`; containers still use PostgreSQL's native 5432.
- **OPA 1.18.2**: local, fail-closed policy decisions. It consumes bundles so policy and PIP data
  activate together.

## Control-plane controls

The POC controls instance registration/lifecycle, capability declarations, directed trust,
resource scopes, synchronization direction and schedule, policy-sync opt-in, desired/observed
revision, health, and audit. A sync configuration is configuration only: no resource is copied.
`origin-wins` is recorded as the future conflict rule.

## Protocol boundary

REST, SSE, OPA decisions, and bundles use HTTP. Direct database consumers use PostgreSQL wire
protocol. SSE is an HTTP response stream, not a WebSocket. No other data-product protocol is
implemented.
