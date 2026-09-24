# BIT DaCa Control Plane API

FastAPI service for administrative observations of the central DaCa catalog. The
existing instance, trust and synchronization-intent endpoints retain historical PoC
configuration; this service **does not synchronize catalog resources**.

## Responsibilities

- Register catalog identity, organization, environment, endpoint, capabilities, and
  desired/observed configuration revisions.
- Record current and historical catalog health observations and stream new
  observations with Server-Sent Events (SSE) over HTTP.
- Manage directional provider-to-consumer trust grants with validity windows,
  resource scopes, and optional product/owner/domain filters.
- Manage declarative push/pull sync configurations. Enabling a configuration
  requires a currently valid, approved grant in the source-to-target direction.
- Keep policy sharing opt-in (`DACA_CONTROL_POLICY_SYNC_ENABLED=false` by
  default), force the future conflict rule to `origin-wins`, and automatically
  disable configurations whose trust is withdrawn.
- Record append-only audit and deployment observations.

Only HTTP and PostgreSQL wire protocols are used. There is no GraphQL, gRPC,
message bus, WebSocket, or catalog-resource transfer implementation.

## Local development

Python 3.14 and [uv](https://docs.astral.sh/uv/) are required.

```powershell
uv sync --extra test
$env:DACA_CONTROL_DATABASE_URL = "postgresql+psycopg://daca_control:replace-me@localhost:55432/daca_control_plane"
$env:DACA_CONTROL_DEMO_AUTH = "true" # local POC only
$env:DACA_CONTROL_ENDPOINT_HOST_ALLOWLIST = "catalog-api"
uv run alembic upgrade head
uv run daca-control-plane-seed
uv run uvicorn daca_control_plane.main:app --reload --port 8002
```

The Docker image performs the migration and idempotent seed before starting the
server. The monorepo Compose stack supplies the PostgreSQL URL and starts the
image on port `8002`.

## API

Interactive OpenAPI documentation is at `http://localhost:8002/docs`.

| Resource | Operations |
|---|---|
| `/api/v1/catalogs` | create, cursor-list, read, revision-safe patch |
| `/api/v1/catalogs/{id}/health-checks` | actively probe `{endpoint}/health/ready` |
| `/api/v1/health-observations` | report and list observations |
| `/api/v1/events/health` | SSE stream of newly committed health observations |
| `/api/v1/trust-grants` | create, list, read, revision-safe patch |
| `/api/v1/sync-configurations` | create, list, read, revision-safe patch |
| `/api/v1/deployment-observations` | append and list desired/observed state |
| `/api/v1/audit-events` | read-only append log |
| `/health/live`, `/health/ready` | container health checks |

JSON fields are camelCase. Mutable resources return an `ETag`; updates require
that value in `If-Match`. Missing and stale preconditions produce `428` and `412`.
Errors use `application/problem+json` and all responses carry `X-Request-ID`.

All `POST` and `PATCH` routes are fail-closed. For the local POC,
`DACA_CONTROL_DEMO_AUTH=true` enables mutations and each mutation must carry a
nonblank `X-DaCa-Actor`. With demo auth disabled (the code default), mutations
return `503` because no production identity provider is configured; read routes
remain available. This header is a clearly labelled demo identity, not production
authentication.

Catalog endpoints are accepted only when they use HTTP(S), contain neither URL
credentials nor fragments, and resolve exclusively to public addresses. Loopback,
link-local, private, reserved, multicast, unspecified, and unresolvable targets are
rejected. `DACA_CONTROL_ENDPOINT_HOST_ALLOWLIST` is a comma-separated list of
explicit hostnames or `*.example.org` patterns for intentional internal targets;
Compose allowlists only the `catalog-api` service. Endpoint policy is checked again
before every health probe, redirects are disabled, and blocked legacy endpoints are
recorded as `unreachable` without making a request. The seeded
`catalog-st-gallen.invalid` placeholder is intentionally skipped by the poller; an
explicit manual probe of it returns `422`.

Example: create an approved directional grant and a disabled future sync:

```bash
curl -X POST http://localhost:8002/api/v1/trust-grants \
  -H 'Content-Type: application/json' \
  -H 'X-DaCa-Actor: demo-control-admin' \
  -d '{"providerId":"<source-id>","consumerId":"<target-id>","state":"approved","allowedResourceTypes":["metadata","lineage","provenance"]}'

curl -X POST http://localhost:8002/api/v1/sync-configurations \
  -H 'Content-Type: application/json' \
  -H 'X-DaCa-Actor: demo-control-admin' \
  -d '{"name":"Federal to canton","sourceId":"<source-id>","targetId":"<target-id>","trustGrantId":"<grant-id>","direction":"push","resourceScopes":["metadata"],"schedule":"manual","enabled":false}'
```

The seeded configuration is deliberately disabled. Setting `enabled: true` only
validates and records desired state; it never initiates network transfer.

## Test

```powershell
uv run pytest
uv run pytest --cov=daca_control_plane --cov-report=term-missing
```

The focused suite uses SQLite for isolated contract tests. Production and Compose
use PostgreSQL via Psycopg and Alembic.
