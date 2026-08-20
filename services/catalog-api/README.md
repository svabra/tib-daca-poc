# BIT DaCa Catalog API

This independently runnable FastAPI project is the PostgreSQL-backed metadata store and Policy Administration Point (PAP) for one standalone DaCa catalog instance. The service contains aggregate-only synthetic ESTV examples and no real taxpayer or personal data.

## Responsibilities

- DCAT-AP-CH-friendly product metadata with optimistic revisions
- Strict `http-rest` and `postgresql` endpoint descriptors (never embedded credentials)
- Read-only lineage and append-only provenance/audit history
- Persistent access requests for people and machine identities, without credentials or secrets
- Structured PBAC policy drafting, immutable publication/revocation revisions, and generated Rego
- Versioned best-effort service levels with a separate control person and four-eyes publication
- OPA bundle distribution with trusted Policy Information Point (PIP) resource attributes
- PostgreSQL entitlement projection to the sample data product

Federation and synchronization are intentionally not implemented here. Stable URNs, origin catalog, and revisions preserve the information needed by a future sync protocol.

## Local development

Python 3.14 and `uv` are expected. When running this project outside the root workspace:

```powershell
uv sync --extra test --no-workspace
$env:DATABASE_URL = "postgresql+psycopg://daca_catalog:daca_catalog_dev@localhost:55432/daca_catalog"
uv run --no-workspace alembic upgrade head
uv run --no-workspace daca-catalog-seed
uv run --no-workspace uvicorn daca_catalog.main:app --reload --port 8001
```

From the monorepo, use the root Compose workflow. PostgreSQL stores the catalog in the
`daca_catalog` database. The container runs Alembic and the idempotent deterministic seed before
Uvicorn. The service listens on port `8001`; through the Catalog UI proxy OpenAPI is available at
`http://localhost:8080/catalog-api/docs`.

Configuration is read from environment variables. Copy `.env.example` for local use and replace its placeholder credentials. `SAMPLE_POLICY_PROJECTION_URL` is the base path ending in `policy-projections`; the product UUID is appended. A `{product_id}` placeholder is also accepted. The bearer token can be supplied as either `SAMPLE_POLICY_PROJECTION_TOKEN` or `DACA_POLICY_DEPLOYMENT_TOKEN`.

## API shape

All public JSON fields are camelCase. Errors use `application/problem+json` and every response includes `X-Request-ID`. UUID `11111111-1111-4111-8111-111111111111` identifies the seeded ESTV product.

Key routes:

- `GET /api/v1/data-products` — cursor-paginated catalog
- `GET|PATCH /api/v1/data-products/{id}` — metadata and revision ETag
- `GET|POST /api/v1/data-products/{id}/endpoints` — endpoint descriptors
- `GET /api/v1/data-products/{id}/lineage`
- `GET /api/v1/data-products/{id}/provenance`
- `GET /api/v1/data-products/{id}/activity` — safely aggregated product lifecycle for every viewer who may see the product
- `GET /api/v1/data-products/{id}/audit-events` — raw technical audit details, restricted to the data owner and assigned approvers
- `GET /api/v1/data-products/{id}/service-level` — effective published SLA or the platform baseline, including scheduled successors and legal context
- `GET|POST /api/v1/data-products/{id}/service-level/revisions` — public published history or the owner/control-person review view
- `GET|PUT /api/v1/data-products/{id}/service-level/revisions/{revisionId}` — one visible revision; only an owner draft is editable
- `POST /api/v1/data-products/{id}/service-level/revisions/{revisionId}/submit` — submit the exact owner draft for four-eyes review
- `POST /api/v1/data-products/{id}/service-level/revisions/{revisionId}/withdraw` — withdraw a pending review as owner
- `POST /api/v1/data-products/{id}/service-level/revisions/{revisionId}/decision` — approve or reject as the assigned control person
- `PUT /api/v1/data-products/{id}/control-person` — assign an active publication approver distinct from the owner
- `POST /api/v1/data-products/{id}/access-requests` — submit an access request
- `GET /api/v1/data-products/{id}/effective-access` — actor-safe projection of currently effective grants, expiry and renewal eligibility
- `POST /api/v1/data-products/{id}/access-renewals` — extend an eligible actor-owned grant without widening its technical scope
- `GET /api/v1/data-products/{id}/access-requests/mine` — current actor's requests for one product
- `GET /api/v1/access-requests/mine` — current actor's requests across the catalog
- `GET|POST /api/v1/data-products/{id}/policies`
- `GET /api/v1/data-products/{id}/policies/latest`
- `POST /api/v1/data-products/{id}/policies/{revisionId}/publish`
- `POST /api/v1/data-products/{id}/policies/{revisionId}/revoke`
- `GET /api/v1/data-products/{id}/policy-deployments`
- `GET /api/v1/opa/bundles/catalog.tar.gz`
- `GET /health/live` and `GET /health/ready`

Metadata, endpoint, and policy writes require `If-Match`. Read the resource’s `ETag` first. Missing preconditions return `428`; stale revisions return `412`.
Full policy definitions, generated Rego and deployment evidence are restricted to the Data Owner
and assigned approver. Consumers use the actor-safe `effective-access` projection instead.

Service-level writes use the same optimistic concurrency rules. Creation compares `If-Match`
with the latest SLA revision (`"0"` before the first draft); mutations compare it with the row's
lock version. Exactly one draft or pending review may exist per product. Published definitions are
immutable, dates are inclusive in `Europe/Zurich`, and a newer publication explicitly supersedes
the prior published revision. SLA publication records catalog evidence only: it does not mutate
access requests, policy deployments, OPA/PostgreSQL grants, I14Y delivery or BAR evidence.

Access renewals are linked to the exact active policy grant and its original approved request.
Only purpose and end date can be reconfirmed; subject, actions, protocols, data variant and weekly
availability remain immutable. The old policy stays active through owner review, four-eyes review
and deployment. DaCa switches the active revision only after OPA and PostgreSQL confirm the same
new revision. The deterministic `/api/v1/poc/access-renewal-fixture` prepare/reset routes are
owner-only PoC helpers and never delete unrelated requests, policies or governance evidence.

```bash
curl -i http://localhost:8001/api/v1/data-products/11111111-1111-4111-8111-111111111111
curl -i -X PATCH \
  -H 'Content-Type: application/json' \
  -H 'If-Match: "1"' \
  -H 'X-DaCa-User: estv-data-owner' \
  -d '{"updateFrequency":"quarterly"}' \
  http://localhost:8001/api/v1/data-products/11111111-1111-4111-8111-111111111111
```

## PBAC publication and enforcement hand-off

The seeded structured policy allows only `kanton-st-gallen` to perform `data.read` on the ESTV product over HTTP or PostgreSQL. Everything else is denied by default.

1. The data owner edits structured selectors in this PAP; unrestricted Rego is never accepted.
2. Publishing adds an immutable revision. OPA polls the bundle route and atomically loads `data.json` plus generated package `daca.authz`.
3. PIP data in the bundle maps the trusted product UUID to its URN, owner, classification, and origin. Rego resolves resource selectors from those attributes, not caller-supplied owner values.
4. The HTTP PEP asks OPA for `data.daca.authz.decision`. The sample product fails closed if that decision is unavailable or malformed.
5. In parallel, this service sends `{revision, entitlements}` to `PUT /internal/v1/policy-projections/{productId}`. The sample product projects the narrow supported subset into PostgreSQL ACL/RLS state. Publication records OPA and PostgreSQL desired/observed revisions independently.
6. Revocation produces a new immutable policy revision, removes the policy from the OPA bundle, and sends an empty PostgreSQL entitlement projection.

OPA cannot transparently intercept arbitrary PostgreSQL statements. Direct PostgreSQL protection therefore uses native grants and forced Row Level Security, with non-owner roles that cannot bypass RLS. A mandatory PostgreSQL-aware gateway or short-lived credential broker is a future production option.

## Tests

```powershell
uv run --no-workspace --extra test pytest
docker run --rm -v "${PWD}/tests/opa:/policy" openpolicyagent/opa:1.18.2 test /policy
```

The focused suite may use an isolated in-memory database for fast contract tests. CI additionally
runs the full Catalog API suite, Alembic and the idempotent seed against PostgreSQL 17 and 18.4.
PostgreSQL-specific ACL/RLS enforcement is tested by the sibling sample-data-product project.
