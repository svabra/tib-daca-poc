# Synthetic ESTV data product

Configured consumer reads emit minimal catalog receipts through `CATALOG_ACCESS_EVENTS_URL`
using `CATALOG_INTERNAL_TOKEN`. `CATALOG_ACCESS_EVENT_ROUTES` maps trusted deployment keys
`product UUID:person|machine:subject ID` to lineage edge UUIDs; caller headers cannot select an
edge or receipt ID. Only successfully completed reads get outcome `success`; denial/fetch errors
are distinct. The PEP retries the same UUID once; if the configured reporter is unavailable,
it returns 503 without data. Unmapped routes have no inferred telemetry. Direct PostgreSQL
sessions need a separate reporter. No records, credentials, raw requests or decision input enter
the receipt. Both demo identity types remain gated by `DACA_DEMO_AUTH` and mixed identities fail.

This service is the HTTP policy-enforcement point for synthetic aggregate tax statistics. It
asks OPA before touching product data, then PostgreSQL forced RLS checks the same projected
entitlement again. Direct PostgreSQL clients are checked by `SESSION_USER`.

The development identities are `kanton-st-gallen` (allowed) and `kanton-bern` (denied). The
header-based identity mode is deliberately gated by `DACA_DEMO_AUTH` and is not production
authentication.

