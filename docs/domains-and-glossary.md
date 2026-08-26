# Domains and business glossary

DaCa treats a **domain** as a governed subject area, not as an administrative organization. A
domain may cross departments and offices, while its Data Owner and deputy remain ordinary trusted
catalog identities whose organizations are displayed separately.

Products may be assigned to zero, one, or many active domains. Zero domains is valid for a draft,
but does not satisfy the business-metadata quality criterion. The legacy `data_products.domain`
text is retained temporarily as an interoperability hint; normalized domain assignments are the
authoritative source for new catalog behavior. Keywords remain free-form tags and are deliberately
separate from governed domains and glossary concepts.

## Governance

Every domain has one primary Data Owner and one different deputy. Data Owners can request domain
creation, amendment, or retirement. A user with the `domain_register_owner` role decides those
requests and may also perform a directly audited register change. In the PoC, Sibilla Micheli is
the seeded register owner.

Any authenticated catalog user can propose a glossary change for one or more domains. Owners and
deputies of each affected domain can edit the common review draft, but only the primary owner can
approve or reject it. All domain owners must approve the same proposal revision. Editing the draft
increments that revision and invalidates earlier approvals; one rejection rejects the complete
proposal. Rejection requires a reason.

An accepted product-linked proposal is attached to the source product only when the requester was
allowed to edit that product and the product still shares an active domain with the term. The
attachment is idempotent and creates the normal product revision. Otherwise, the concept is still
accepted and the requester receives an informational task describing the manual follow-up.

No domain or term is hard-deleted through the production API. Retirement is a tombstone: history
and existing references remain visible, while new assignments are rejected. Proposals, reviews,
decisions, and assignments are recorded in the append-only audit trail without copying protected
payloads into audit details.

## Semantic model

Domains and terms carry stable `urn:daca:*` identifiers, an origin catalog, monotonically
increasing revision, canonical content hash, and retirement information. Labels and definitions
use BCP 47 language tags; the first UI supports German and English while persistence is not limited
to those languages.

One real-world concept should normally be represented by one glossary term with one preferred
label per language. For example, `Gepanzertes Fahrzeug` and `Armored Vehicle` are two labels of the
same concept when their definitions have the same scope. Separate concepts are used when scopes
differ, connected with one of the supported SKOS relations:

- `exactMatch` and `closeMatch` for mappings between concepts;
- `broader` and `narrower` for hierarchy;
- `related` for an associative relationship.

The JSON-LD knowledge-graph endpoint exposes only accepted catalog semantics. The catalog points
to the domain taxonomy with `dcat:themeTaxonomy`; products point to domains with `dcat:theme` and
to glossary concepts with `dcterms:subject`. Localized term data uses `skos:prefLabel`,
`skos:altLabel`, and `skos:definition`, and verified relations use the matching SKOS properties.
Terms can belong to multiple domain concept schemes. Governance requests, personal workflow
tasks, and personal contact data are not exported. DaCa provides JSON-LD over HTTP only: it does
not add a graph database, SPARQL endpoint, or federation traffic.

## Deterministic suggestions

The PoC suggestion provider compares a product's title, description, keywords, and field
descriptions with active domain and accepted-term labels. RapidFuzz produces a bounded, stable
ranking with the matched field and an explanation. Results are labelled `Regelbasiert · PoC`, are
never persisted automatically, and do not claim to be AI decisions. The provider interface leaves
room for a later multilingual embedding implementation without changing the product editor's API.
The default minimum score is `70` and can be changed with
`DACA_SEMANTIC_SUGGESTION_THRESHOLD`; callers can override it per request with the bounded
`threshold` query parameter.

## Catalog API

The feature stays inside the standalone Catalog API:

- `GET|POST /api/v1/domains` and revision-bound direct register changes under
  `/api/v1/domains/{id}`;
- `GET|POST|PATCH /api/v1/domain-change-requests` plus the revision-bound `decision` action;
- `GET /api/v1/glossary/terms` and `GET|POST|PATCH /api/v1/glossary/term-proposals`, with one
  revision-bound decision route per affected domain;
- `GET /api/v1/data-products?domainId=…` for a visibility-aware, domain-scoped product list;
- exact-set product writes with `domainIds` and `glossaryTermIds` on the existing product PATCH;
- `GET /api/v1/data-products/{id}/semantic-suggestions` and public
  `GET /api/v1/knowledge-graph?domainId=…`;
- `POST /api/v1/tasks/{id}/acknowledge` for informational workflow items.

All governance writes require the demo or production authentication configured for the catalog.
The knowledge graph is intentionally public metadata and excludes requests, tasks, owners, and
deputies. Interactive FastAPI documentation is available at `/docs` in a running Catalog API.

## Demonstration journeys

Journey 08 starts with Sandro Wenger's request for the `Verteidigung` domain. Sibilla Micheli
reviews and approves the request as domain-register owner, after which Sandro assigns both
`Verteidigung` and `Mobilität & Logistik` to the synthetic vehicle-fleet product. Journey 09 starts
from that product, proposes the bilingual `Gepanzertes Fahrzeug` / `Armored Vehicle` concept, and
demonstrates that Sibilla and Kassandra must approve the same proposal revision before the term is
created and attached.

The demo-auth-protected `/api/v1/poc/domain-glossary-fixture` prepare and reset actions affect only
the synthetic vehicle product and its journey artifacts. The Catalog UI exposes them at
`/poc-simulation/domain-glossary`; reset requires the exact confirmation text `DOMAIN-GLOSSARY`.
