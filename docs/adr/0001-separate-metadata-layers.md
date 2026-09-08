# ADR 0001: Keep catalog, logical, physical, and mapping metadata separate

- Status: Accepted
- Date: 2026-09-07

## Context

DCAT-AP-CH describes catalog resources, SHACL describes a logical structure, PostgreSQL catalogs
describe a deployed schema, and DaCa must retain governed links and drift evidence between them.
Reusing the existing product-field or semantic-mapping tables would make logical models depend on
a product and would conflate unrelated standards.

## Decision

Persist four bounded layers with stable DaCa URNs and immutable, explicitly linked versions:
DCAT catalog resources, logical SHACL resources, physical schema snapshots, and DaCa asset
mappings/drift.  A logical model pins a dataset version but needs no distribution, product,
physical implementation, or mapping.  Mappings pin exact logical and physical versions.

I14Y Concepts are cached read-only reference resources.  I14Y MappingTables remain code-system
mappings and are never used for DaCa logical-to-physical mappings.

## Consequences

Historical evidence survives edits and source drift, exports can apply standards-specific rules,
and each layer can be used independently.  The trade-off is more explicit version orchestration
and joins; aggregate APIs hide that persistence detail from the UI.
