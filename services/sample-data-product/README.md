# Synthetic ESTV data product

This service is the HTTP policy-enforcement point for synthetic aggregate tax statistics. It
asks OPA before touching product data, then PostgreSQL forced RLS checks the same projected
entitlement again. Direct PostgreSQL clients are checked by `SESSION_USER`.

The development identities are `kanton-st-gallen` (allowed) and `kanton-bern` (denied). The
header-based identity mode is deliberately gated by `DACA_DEMO_AUTH` and is not production
authentication.

