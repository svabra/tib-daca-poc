# PBAC policy flow

The POC demonstrates policy-based access control for one synthetic ESTV product. The only allowed
subject is `kanton-st-gallen`; `kanton-bern`, a missing identity, an unknown protocol, and every
other combination are denied by default.

## Components

- **PAP** — the catalog UI and API store the structured policy, generate Rego, validate it, and
  publish an immutable revision.
- **PIP** — product ownership, classification, origin, and endpoint details come from the trusted
  catalog database and are placed in the OPA bundle. Request method/action and the development
  subject identity are supplied by the PEP.
- **PDP** — OPA evaluates `data.daca.authz.decision` locally.
- **HTTP PEP** — the sample FastAPI dependency rejects before it reads PostgreSQL.
- **PostgreSQL PEP** — ACLs plus `FORCE ROW LEVEL SECURITY` consult the projected entitlement by
  `SESSION_USER`; the service login may supply request context only for its own session.

```mermaid
flowchart LR
  Owner[Data owner] -->|structured policy| PAP[Catalog PAP]
  PIP[(Trusted catalog PIP)] --> Bundle[Versioned policy + data bundle]
  PAP --> Bundle
  Bundle -->|HTTP pull + atomic activation| PDP[OPA PDP]
  Consumer --> RestPEP[REST PEP]
  RestPEP -->|decision input| PDP
  PDP -->|allow / deny| RestPEP
  RestPEP --> Product[(Protected product)]
  PAP -->|entitlement projection| RLS[PostgreSQL ACL + FORCE RLS PEP]
  PgUser[PostgreSQL consumer] -->|SESSION_USER| RLS
  RLS --> Product
  PDP --> Audit[(Masked decision log)]
  RestPEP --> Audit
  RLS --> Audit
```

```mermaid
sequenceDiagram
  actor Owner as ESTV data owner
  participant UI as Catalog UI (PAP)
  participant Catalog as Catalog API (PAP/PIP)
  participant OPA as Local OPA (PDP)
  participant Product as Sample API (HTTP PEP)
  participant PG as Product PostgreSQL (RLS PEP)
  participant Audit as Audit / deployment status
  actor Consumer

  Owner->>UI: Define subject, product, action, protocols
  UI->>Catalog: Publish structured policy revision
  Catalog->>Catalog: Validate, generate Rego and PIP data
  Catalog->>Product: Project revision and entitlements
  Product->>PG: Transactionally replace entitlement revision
  Product-->>Catalog: Acknowledge PostgreSQL revision
  Catalog->>Catalog: Commit immutable active revision
  OPA->>Catalog: Pull ETag-versioned bundle
  OPA->>OPA: Atomically activate policy + data
  OPA-->>Catalog: Report activated bundle revision
  Catalog->>Audit: Record publication and target status

  Consumer->>Product: GET product + X-DaCa-User
  Product->>OPA: subject + action + trusted resource + protocol
  OPA-->>Product: allow/deny + reason + decision ID
  OPA->>Audit: Emit decision log without product rows
  alt allowed
    Product->>PG: Query with scoped subject context
    PG->>PG: Forced RLS checks projected entitlement
    PG-->>Product: Synthetic aggregate rows
    Product-->>Consumer: 200 + rows
  else denied
    Product-->>Consumer: 403 without querying product data
  else PDP unavailable or undefined
    Product-->>Consumer: 503, fail closed
  end

  Owner->>Catalog: Revoke/new revision
  Catalog->>OPA: New bundle revision
  Catalog->>Product: New PostgreSQL projection
  Product->>PG: Remove or reduce entitlements first
  Catalog->>Audit: Record revocation and convergence
```

On publication or revocation, failure to deploy the PostgreSQL projection returns `503` and
retains the previous active catalog policy; stale direct-database access is not silently presented
as converged. A revision is shown as fully deployed only after OPA and PostgreSQL acknowledge it.

## Why PostgreSQL does not call OPA per statement

PostgreSQL has no built-in transparent OPA hook for arbitrary raw SQL. OPA SQL filtering can help
a managed query layer construct predicates, but it cannot stop a raw client from reaching an
unprotected base table. This POC therefore projects the constrained policy into native
entitlements and forced RLS. A production system that requires a live OPA decision for every
connection/query would need a mandatory PostgreSQL-aware gateway or a broker issuing short-lived
credentials; that is deliberately outside this lean POC.

## Production hardening deferred from the POC

Replace the development header with validated OIDC claims; add TLS/mTLS, signed and persisted OPA
bundles, short-lived PostgreSQL identities, external secret management, revocation/session rules,
decision-log masking, and deployment monitoring. OPA input and decision logs may contain sensitive
attributes and must not be retained unfiltered.
