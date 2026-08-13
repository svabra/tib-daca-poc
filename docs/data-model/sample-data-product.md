# Sample data-product model

The sample ESTV product owns synthetic product rows and the local PostgreSQL authorization projection.

**Storage:** PostgreSQL (`didaca_sample`).

## Authorization boundary

The catalog policy revision is projected into this database by product ID and revision. This is an application-level projection, not a cross-database foreign key. OPA protects HTTP access; forced PostgreSQL RLS independently evaluates the local entitlement projection.

<!-- BEGIN GENERATED: data-model. DO NOT EDIT. -->

- SQLAlchemy source: [`services/sample-data-product/app/models.py`](../../services/sample-data-product/app/models.py)
- Alembic head: `0002_timed_entitlements`
- Schema fingerprint: `66b6fe58d4af6144`
- Migration fingerprint: `4ed037d35c19fa8c`
- Tables: `3`

## Domain status vocabulary

- Entitlement subject type is `person` or `machine`; action is currently `data.read`.
- Protocols are `http-rest` and `postgresql`; variants are `original` and `modified`.
- An entitlement is effective only when `active` is true and the current date is between `valid_from` and `valid_until` inclusive.

## Persisted structured values

- The sample database contains no JSON columns. Policy grants arrive as catalog projections and are normalized into relational entitlement rows.

## Entity relationships

```mermaid
erDiagram
    policy_deployments {
        uuid product_id PK
        bigint revision
        datetime deployed_at
    }
    policy_entitlements {
        uuid product_id PK
        string subject_id PK
        string subject_type PK
        string action PK
        string protocol PK
        date valid_from
        date valid_until
        string data_variant
        bigint policy_revision
        boolean active
    }
    tax_statistics {
        integer id PK
        uuid product_id
        string canton_code
        integer tax_year
        integer taxpayers
        numeric taxable_income_million_chf
        text source_note
    }
```

Relationships in this diagram are physical foreign keys inside this database only.

## Table reference

### `policy_deployments`

Latest policy revision projected into the protected PostgreSQL database.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `product_id` | `UUID` | no | PK | — |
| `revision` | `BIGINT` | no | — | — |
| `deployed_at` | `DATETIME` | no | — | `<lambda>` |

Constraints and indexes:

- No additional constraints or explicit indexes.

### `policy_entitlements`

Time-bounded person or machine grants used by forced RLS.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `product_id` | `UUID` | no | PK | — |
| `subject_id` | `VARCHAR(200)` | no | PK | — |
| `subject_type` | `VARCHAR(32)` | no | PK | `person` |
| `action` | `VARCHAR(100)` | no | PK | — |
| `protocol` | `VARCHAR(32)` | no | PK | — |
| `valid_from` | `DATE` | no | — | `0001-01-01` |
| `valid_until` | `DATE` | no | — | `9999-12-31` |
| `data_variant` | `VARCHAR(32)` | no | — | `original` |
| `policy_revision` | `BIGINT` | no | — | — |
| `active` | `BOOLEAN` | no | — | `True` |

Constraints and indexes:

- No additional constraints or explicit indexes.

### `tax_statistics`

Synthetic aggregate ESTV records protected by the HTTP PEP and PostgreSQL RLS.

| Column | Type | Null | Keys | Default |
|---|---|:---:|---|---|
| `id` | `INTEGER` | no | PK | — |
| `product_id` | `UUID` | no | — | — |
| `canton_code` | `VARCHAR(2)` | no | — | — |
| `tax_year` | `INTEGER` | no | — | — |
| `taxpayers` | `INTEGER` | no | — | — |
| `taxable_income_million_chf` | `NUMERIC(14, 2)` | no | — | — |
| `source_note` | `TEXT` | no | — | — |

Constraints and indexes:

- Index `ix_tax_statistics_product_id` on `product_id`

<!-- END GENERATED: data-model. -->
