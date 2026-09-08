# ADR 0003: Relational SKOS and optional language assistance

## Status

Accepted for the PoC.

## Decision

PostgreSQL remains the source of truth for DaCa domains and terminology. Term roots, immutable
versions, language values, domain assignments and canonical directed relations are relational;
JSON-LD/SKOS is generated at read time. `broader` is stored once, `narrower` is derived, and
symmetric relations are mirrored only in the representation.

This does not conflict with I14Y. Local terminology and domains use SKOS, logical model structure
uses SHACL, datasets use DCAT-AP-CH, and fields reference I14Y ISO 11179 concepts with
`dcterms:conformsTo`. I14Y code-list roots are concept schemes and are never assigned an automatic
`skos:exactMatch`.

TERMDAT is queried through its official public API and dereferenceable register URI. Import creates
`dcterms:source` provenance, not semantic equivalence. DeepL Free is invoked only by the backend
for `unclassified` text. Existing language values are not overwritten; accepted suggestions store
provider, source hash, retrieval time and payload hash on the immutable model version.

## Consequences

A triple store is unnecessary for this PoC; RDF is a representation rather than a storage
requirement. SKOS integrity checks remain transactional in PostgreSQL. External-provider outages
degrade to manual editing, and secrets never reach UI responses, logs or audits. TERMDAT reuse
licensing requires Federal Chancellery confirmation before production use.

## References

- [SKOS Reference](https://www.w3.org/TR/skos-reference/)
- [W3C RDB2RDF](https://www.w3.org/groups/wg/rdb2rdf/publications/)
- [I14Y information model](https://i14y-ch.github.io/handbook/de/gouvernanz/informationsmodell/)
- [TERMDAT Public API](https://api.termdat.bk.admin.ch/swagger/v2/swagger.json)
- [LINDAS dereferencing](https://lindas.admin.ch/know-how/dereferencing/)
- [DeepL authentication](https://developers.deepl.com/docs/getting-started/auth)
