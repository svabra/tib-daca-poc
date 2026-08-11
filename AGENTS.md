# BIT DiDaCa AI Harness

## Mission

BIT DiDaCa (Distributed Data Catalog) is a federation-ready catalog ecosystem. A catalog is
usable on its own and owns metadata about data products, endpoint descriptions, lineage,
provenance, and access policies. The control plane observes and configures relationships; it
must never become a runtime dependency for a standalone catalog.

## Implemented capabilities

- Edit and version DCAT-AP-CH-friendly product metadata with optimistic concurrency.
- Register only HTTP/REST and PostgreSQL endpoints; endpoint records never contain credentials.
- Display product lineage and append-only provenance/audit history.
- Author a constrained PBAC policy and generate Rego for a local OPA PDP.
- Enforce HTTP access at a FastAPI PEP and PostgreSQL access with ACLs plus forced RLS.
- Register catalog instances and record directed trust grants and desired sync configurations.
- Stream health/configuration observations over HTTP Server-Sent Events.
- Demonstrate ESTV access where only `kanton-st-gallen` may read the synthetic product.

## Protocol boundary

HTTP is used for REST, SSE, OPA decisions, and OPA bundle distribution. PostgreSQL wire protocol
is the only non-HTTP protocol. Do not add GraphQL, gRPC, Kafka, WebSockets, S3 data endpoints, or
another product-delivery protocol without an explicit architecture decision.

## Future federation capability (not implemented)

Catalogs may eventually exchange metadata, lineage, provenance, endpoint descriptions, and
access-policy settings. Future resources must retain a stable `urn:didaca:*` URI,
`originCatalogId`, monotonic revision, content hash, and tombstone/retirement information.
Synchronization must require directed trust, declare resource scopes, preserve origin ownership,
be idempotent, expose desired/observed revisions, and define conflict handling. The POC records
`origin-wins` as its intended default but sends no federation traffic. Policy synchronization is
opt-in and disabled by default because it carries a higher trust requirement than metadata.

## Security invariants

- Default deny. Missing, undefined, malformed, or unavailable PDP decisions expose no data.
- Product owner/classification attributes are loaded from trusted catalog/PIP data, never from a
  caller-controlled request body or header.
- Demo identity headers are accepted only when `DIDACA_DEMO_AUTH=true` (catalog/product) or
  `DIDACA_CONTROL_DEMO_AUTH=true` (control plane), and are not production authentication.
- Control-plane health polling accepts only SSRF-validated HTTP(S) catalog endpoints; private,
  loopback, link-local, reserved, credential-bearing, and unresolvable targets are blocked unless
  the hostname is explicitly allowlisted for the local Compose network.
- Direct PostgreSQL consumers are never table owners, superusers, or `BYPASSRLS` roles.
- Policy publication is complete only when the OPA and PostgreSQL projections report the same
  revision.
- Provenance and audit records are append-only; secrets and protected record payloads are not
  written to audit logs.

## Repository map

- `apps/catalog-ui`: catalog Angular PWA.
- `apps/control-plane-ui`: control-plane Angular PWA.
- `services/catalog-api`: standalone catalog/PAP API.
- `services/control-plane-api`: catalog relationship and health API.
- `services/sample-data-product`: ESTV sample product and HTTP PEP.
- `packages/design-system`: shared federal CI tokens/assets.
- `infra`: PostgreSQL and OPA local runtime configuration.
- `docs`: architecture, PBAC explanation, and verified mockup screenshots.
