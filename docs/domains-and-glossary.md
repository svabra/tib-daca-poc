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
label per language. For example, `Gepanzertes Fahrzeug` and British English `Armoured vehicle`
are two preferred labels of the same concept when their definitions have the same scope; US
English `Armored vehicle` is an alternative English label. Separate concepts are used when scopes
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

Abbreviations are normally not separate concepts. `GepFz`, `MWST`, `VAT`, `C2`, `Bodluv` and
similar short forms are language-scoped `skos:altLabel` values on the concept they denote. This
makes both the long form and abbreviation searchable without creating artificial graph nodes.
Only a short form with its own business meaning becomes a separate concept. For example, a
`Saldosteuersatz` (the rate) and the `Saldosteuersatzmethode` (the reporting method) remain two
related concepts rather than being collapsed because both are often discussed as `SSS`.

## Curated reference glossary

The additive seed `domain-glossary-reference-v4` installs 38 accepted, bilingual reference
concepts: 18 for the Swiss Federal Tax Administration and 20 for defence. It is idempotent and
also reconciles databases that already contain the original Journey 09 term or the v2/v3 reference
seeds. One accepted legacy concept remains canonical, reference/product links are rewired, and a
deterministic duplicate is retained only as a retired historical resource when its complete v2
state is provably unchanged. Curated v2 terms and relations are upgraded only from a known,
unchanged seed payload; later governed edits, removals and foreign-origin resources are preserved.
The tax definitions are source-faithful paraphrases of the official
[ESTV VAT material](https://www.estv.admin.ch/de/mehrwertsteuer),
[VAT principles](https://www.estv.admin.ch/dam/estv/de/dokumente/estv/steuersystem/dossier-steuerinformationen/d/d-grundsaetze-der-mehrwertsteuer.pdf.download.pdf/d-grundsaetze-der-mehrwertsteuer.pdf),
[flat-rate guidance](https://www.estv.admin.ch/de/mwst-saldosteuersaetze-pauschalsteuersaetze),
[UID guidance](https://www.estv.admin.ch/de/unternehmens-identifikationsnummer-uid), and the
official pages for [direct federal tax](https://www.estv.admin.ch/de/direkte-bundessteuer),
[source tax](https://www.estv.admin.ch/de/quellensteuer), and
[withholding tax](https://www.estv.admin.ch/de/verrechnungssteuer).

For defence concepts, exact public NATO definitions were verified only for
[Command and Control](https://www.nato.int/en/what-we-do/deterrence-and-defence/multinational-capability-cooperation)
and [NATO Integrated Air and Missile Defence](https://www.nato.int/en/what-we-do/deterrence-and-defence/nato-integrated-air-and-missile-defence).
The latter is also checked against NATO's
[2025 IAMD Policy](https://www.nato.int/en/about-us/official-texts-and-resources/official-texts/2025/02/13/nato-integrated-air-and-missile-defence-policy).
The [NATO publications page](https://www.nato.int/cps/en/natohq/publications.htm) identifies
NATOTerm as the source of NATO-agreed terminology. Although the NATOTerm application itself was
not directly retrievable during the initial research, the Czech Ministry of Defence subsequently
published an official [AAP-06 distribution page](https://oos.mo.gov.cz/standardizace/terminologie/terminologicky-slovnik-aap-06)
and its [28 May 2026 NATOTerm export](https://oos-data.army.cz/aap6/AAP-06_260114_AF.pdf).
DaCa uses that export for the NATO-agreed `Command and control`/`C2` concept and applies the
correction only to an untouched v3 seed; governed edits are never overwritten. The
[AAP-15 archive](https://archives.nato.int/nato-glossary-of-abbreviations-used-in-nato-documents-and-publications?sf_culture=en)
is used only to corroborate long forms and abbreviations, not as a source of definitions. The
[NATO GBAD factsheet](https://www.nato.int/nato_static_fl2014/assets/pdf/2021/2/pdf/2102-factsheet-m-gbad.pdf)
supports the capability description but is not presented as a NATO-agreed glossary definition.
Swiss systems and national designations use official VBS and armasuisse sources, including the
[future of the ground forces](https://www.vtg.admin.ch/dam/de/sd-web/dVxswQ0daFuH/81_239_d_Zukunft-der_Bodentruppen.pdf),
[Armament Programme 2025](https://www.vtg.admin.ch/de/ruestungsprogramm-2025), and the
[Pionierpanzer procurement](https://www.ar.admin.ch/de/beschaffung-pionierpanzer),
[Bodluv MR procurement](https://www.vtg.admin.ch/en/newnsb/ZjsNYPpgoETj), and
[ADS 15 systems engineering](https://www.ar.admin.ch/en/systems-engineering). The
`Radschützenpanzer 93` is modelled as the officially documented
[PIRANHA II 8×8 armoured personnel carrier](https://www.vtg.admin.ch/dam/de/sd-web/xNhWConnUpOb/81_325_e_Konzeption_Zukunft_der_Armee.pdf),
not as the 6×6 GMTF platform or as an infantry fighting vehicle. DaCa does not
invent NATOTerm identifiers: a NATO mapping is only recorded when a stable, concept-specific URI
is available and the semantic scope has been verified. `GepFz` is retained as a useful
user-provided legacy/demo alternative label; the concept uses a source-backed working definition,
but this exact abbreviation could not be confirmed in the reviewed public VBS material and is not
presented as NATO terminology. `VHF` is stored as an alternative label in both languages on the
same concept; German uses `Ultrakurzwelle` and English uses `Very High Frequency` as their distinct
preferred labels. Its 30–300 MHz range follows the official
[ITU terminology entry](https://www.itu.int/net/ITU-R/asp/terminology-definition.asp?lang=en&rlink=%7BF41BA235-2F36-40B7-A5C0-C53623263CBF%7D).

## Deterministic suggestions

The PoC suggestion provider compares a product's title, description, keywords, and field
descriptions with active domain and accepted-term labels. RapidFuzz produces a bounded, stable
ranking with the matched field and an explanation. Results are labelled `Regelbasiert · PoC`, are
never persisted automatically, and do not claim to be AI decisions. The provider interface leaves
room for a later multilingual embedding implementation without changing the product editor's API.
The default minimum score is `70` and can be changed with
`DACA_SEMANTIC_SUGGESTION_THRESHOLD`; callers can override it per request with the bounded
`threshold` query parameter.

## Term entry points in the Catalog UI

Term capture is contextual but always uses the same governed proposal form:

- the `Glossar` section under `Domains & Glossar` has a primary `Neuen Term vorschlagen` action,
  searchable accepted terms, and an `Änderung vorschlagen` action on every active term;
- each domain detail page starts a proposal with that domain preselected;
- a product overview starts a proposal with its product and current domains retained;
- an empty expert-search result carries the search text into the proposed German label;
- Metadata Studio places `Term vorschlagen` and `Begriffe aus Metadaten ableiten` before the
  accepted-term picker. The local PoC derivation extracts at most three candidates from the
  current, even unsaved title and keywords and never submits or assigns one automatically.

Duplicate hints can switch the same form to an update proposal without discarding product,
domain, or unsaved metadata context. The form supports DE/EN labels and definitions,
language-scoped abbreviations, domain selection, and an optional relation to an accepted target
term. Automatic attachment remains enabled only for the product owner or deputy and only when
product and term share a selected active domain.

Alternative labels are literals on one SKOS concept, not independent nodes. The JSON-LD export
therefore represents abbreviations as language-tagged `skos:altLabel` statements. The domain UI
also prints these labels in term cards and in its textual graph alternative, so the semantics do
not depend on reading a dense visual graph.

The seed specification and this document retain the official research URLs used for the PoC.
Source provenance is not yet a first-class property of a persisted term and is consequently not
published in JSON-LD. A production terminology register should add governed, per-definition
source citations in a later schema revision instead of inferring provenance from seed code.

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
from that product and refines the accepted bilingual `Gepanzertes Fahrzeug` / `Armoured vehicle`
concept through a governed update proposal. It demonstrates that Sibilla and Kassandra must
approve the same proposal revision before the updated term is attached to the product. The same
update route is available from every accepted term to authorized users.

The demo-auth-protected `/api/v1/poc/domain-glossary-fixture` prepare and reset actions affect only
the synthetic vehicle product and its journey artifacts. The Catalog UI exposes them at
`/poc-simulation/domain-glossary`; reset requires the exact confirmation text `DOMAIN-GLOSSARY`.
