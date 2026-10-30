# Domains and business glossary

## Own-office display filter

**Nur amtseigene anzeigen** is optional and initially off for domains and terms. It applies
to cards and networks, combines with the existing card search, and remains in the URL as
`ownOffice=1` across view changes and the two semantic tabs. The checkbox uses the shared
catalog tooltip on hover or keyboard focus to explain the selected office and its subordinate
units. Labels, tooltip, loading and failure messages support DE/FR/IT/EN.

The resolved current identity's `office` supplies the same context used to default the
organization term network. `GET /api/v1/semantic-graphs/organizations/{office}` supplies
`scopeDomainIds` and `scopeTermIds` from trusted object responsibilities and active memberships.
Explicit object organization takes precedence; terms retain their independent responsibility
even when classified under a foreign domain. Broad editing mandates, display-name matching
and a term's domain classification do not widen this filter. Missing office disables activation;
unavailable scope shows retry with no fallback to all objects. Identity changes cancel old reads.

The term network follows the own office while enabled; its organization selector reappears
when disabled. Switching from a foreign network respects the existing unsaved-draft guard.
Canvas filtering hides foreign reference cards and edges to them without changing saved
positions, hidden/additional node IDs or relationships. Toggling does not save or dirty a graph;
moving or arranging visible nodes retains the stored positions of filtered-out nodes.

Browser regression: `npm run test:ui-regression -- --flow semantic-own-office` checks two
identities against the server scope, both card/network views, keyboard tooltips, mobile filter
layout, URL/tab retention and clearing. It verifies that both shared graph responses remain
unchanged. Screenshots are local ignored artifacts under `output/ui-regression/semantic-own-office`.
Focused unit cases also cover independent term ownership, failed/cancelled scope reads, missing
office, local drafts and retaining foreign node positions while arranging the visible scope.

## Hand over domain responsibility

**Domäne abtreten** appears on the detail page and in the card's **…** menu when the server
returns `canTransferOwnership`. Current Data Owners/deputies, ALDS/deputies in the domain's
office/subordinate scope and LDSD/deputies in its department may hand it over. An unrelated
Owner profile or foreign mandate grants no authority. LDSD scope uses the trusted department
registry code, including older office records whose parent link is missing; text labels and
person profile strings are not authorization input.

The modal searches active directory people by name/organization/ID and requires a new Owner,
a different deputy, a reason and a confirmation. These people need no prior global Owner
profile: the responsibility is assigned to this concrete domain. Cancel changes nothing;
failed/conflicting requests retain the form. Only explicit transfer writes to
`POST /api/v1/domains/{id}/transfer`, with `If-Match` for the displayed revision.

The server locks the domain, rechecks current authority and mandate validity, validates active
recipients and replaces owner/deputy fields and active Owner COR rows in one transaction.
Other COR roles are retained. Old object-owner rights cease unless the person is explicitly
chosen again; separate office/department mandates remain independent. Existing organization
scope is pinned in the new responsibility rows. `provenance=domain-handover` also marks an
explicitly unscoped handover, preventing the recipient's home office from silently supplying
new office authority. The ownership change increments revision/hash and appends an
`ownership-transferred` event with old/new people, reason and office IDs.

The operation preserves localizations, terms, model versions, physical links and product
ownership. Pending term **creation** reviews follow current domain responsibility. Their task
recipients are reconciled across all pending domains, so a shared former reviewer remains
assigned where still responsible. Reviews of existing terms retain their term owners.
Logical-model review tasks follow the new domain reviewer, excluding their own submitter.
Pending domain-change requests based on the older revision become stale and close their tasks.
Subsequent seeds preserve the handover. No approval/acceptance workflow or external message is
implicitly created for the recipient.

## Domain metadata editing and office mandates

The detail page exposes **Domäne bearbeiten** only when `canEditMetadata` is true. Its native
dialog edits names/definitions in all existing localizations. Changes remain local until Save;
Cancel does not write. Failed requests retain input, and the detail heading/labels/revision and
audit history update after success without replacing a local graph draft. Leaving a dirty
metadata dialog uses the existing unsaved-change pattern.

`PATCH /domains/{id}` rechecks current active object ownership or an explicit active ALDS/
deputy mandate for an active office. Office domains use the same trusted object scope as the
organization network, including subordinate units. A profile label or deputy owner's home
organization does not grant an office mandate. ALDS-only actors may update `localizations`;
retirement and other object decisions retain owner/deputy guards. Ownership handover has
the separate scoped ALDS/LDSD endpoint documented above.
Revision checking, row locking and append-only domain audit evidence remain transactional.

The organization mandate table stores LDSD separately from ALDS, with a named deputy. LDSD
does not implicitly become Owner of every domain. The confirmed local assignments and operator
provisioning procedure are documented in [governance information](object-governance-and-raci.md).

## Search by responsibility

The existing domain and term card search inputs match Data Owner and deputy names and user IDs
alongside names, definitions and term alternative labels. Domain organization matches remain
available. Case and combining accents are normalized, so `noemie` finds `Noémie`. Term person
names resolve reactively from the same directory used by their cards; a later directory response
updates an active filter. A term's assigned domains do not confer ownership or supply owner
search matches. Empty queries show all already loaded cards; no extra access is granted.

Organization views also cover older federal directory entries with a trusted registry
organization ID when they have never had a primary membership record. Any primary membership
history takes precedence, including expired records; fallback cannot resurrect that affiliation.

## Domain card and network views

The **Domänen** section offers **Kacheln / Domänennetz**, using the same secondary-button
pattern as Terminology's **Kacheln / Termnetz**. The network is no longer a separate primary
section tab. `/domains` opens cards; `/domains?view=network` embeds the existing domain editor
under the shared page heading and navigation, without a duplicate title or back link.
`/domains/network` redirects to that view while retaining query parameters. The detail-page
network link uses the canonical address. Switching to cards or another section checks the
existing graph's unsaved-change guard; save, ownership and shared layout behavior are retained.
View labels are available in DE/FR/IT/EN.

## Organization term network and term cards

The terminology page has **Kacheln** and **Termnetz** views. The latter is directly addressable
as `/domains/terminology?view=network`; it reuses the domain-detail graph editor rather than
replacing those existing graphs. An organization selector initially follows the identity's
current modeling area. In the current directory, Christian Spider's first modeling area is
armasuisse Immobilien and Sibilla Micheli's is Verteidigung; the view does not change their
primary memberships or role assignments. Other organizations can be selected for exploration.
While no manual choice exists, a resolved modeling organization replaces a provisional value
for the same person. A manual choice survives subsequent directory updates; changing identity
restores the new person's default. Read failures with connection status 0 or gateway statuses
502/503/504 retry twice after bounded 300/600 ms delays. Other failures, including 401/403,
remain explicit and do not trigger an authentication or authorization bypass. Cancelling a
scope request also cancels its pending retry, so an old response cannot repopulate the canvas.

The server determines active object IDs for the selected organization and its descendants.
Explicit organization scopes on active object responsibilities take precedence; otherwise
domains follow their Data Owner's currently valid primary membership and terms follow their
own explicitly assigned Data Owner's primary membership. A term's classification in a domain
does not transfer ownership or pull unrelated terms into this view. Actual classification and
domain/term relationships are drawn only between included cards; terms without a visible
classification remain standalone. External references may be added explicitly via search.
Empty organizations have a visible empty-state explanation; failed requests do not retain the
previous organization's cards. Switching organization/view or navigating away checks unsaved
work. Identity changes clear/reload the editor's scope and ignore abandoned responses.

`GET/PUT /api/v1/semantic-graphs/organizations/{organizationId}` use the existing shared
layout contract, including positive saved revisions, transaction advisory locks, conflict 409
responses and atomic append-only audit. Read responses add `organizationName`, `scopeDomainIds`
and `scopeTermIds`. Layout editing requires a current modeling assignment covering the selected
organization or responsibility for an included object. A global role alone does not grant
organization layout editing. Organization layout writes cannot change domain or term links.
Term edits continue through the original proposal and approval APIs; layouts remain independent.

Term cards expose a single **…** trigger. Its compact menu preserves **Änderung vorschlagen**
(the existing prefilled proposal page), **Stilllegung beantragen** (the existing confirmed
workflow), and disabled **«TERMDAT»-Aufnahme beantragen**. Arrow/Home/End navigation skips
disabled items, Escape restores trigger focus and outside clicks dismiss the menu. Menu labels
are provided in DE/FR/IT/EN.

### Additional domain relationships

`interfacesWith` (**hat eine fachliche Schnittstelle zu**) and `overlapsWith`
(**hat Überschneidungen mit**) are implemented domain relation types alongside `related` and
`partOf`. The existing relationship editor selects them; applying stays local until
**Netz speichern**. Source-owner authorization, revisions, audit, one edge per unordered pair
and retirement checks also apply to these types. Both are symmetric, carry no hierarchy and
never participate in `partOf` cycle checks. No database migration is needed: persisted relation
JSON keeps its shape and existing values. New enum values are validated by the API.

| Label | Direction | Intended meaning |
| --- | --- | --- |
| **hat Überschneidungen mit** | Symmetric | Subject areas share some concepts, processes or responsibilities without containing one another. |
| **hat eine fachliche Schnittstelle zu** | Symmetric | Subject areas coordinate an agreed handover or collaboration boundary. |
| **ist abhängig von** (proposal only) | Directed; inverse **wird benötigt von** | Work in one subject area requires information or results from the other. |

Domain, neighboring-domain and organization graphs share the same label/help vocabulary in
DE/FR/IT/EN; neither new type falls back to the generic related label. Dependency remains a
future proposal. The [W3C SKOS Primer](https://www.w3.org/TR/skos-primer/#secrel) distinguishes hierarchical
and associative relationships. These specializations are DaCa business vocabulary;
they imply neither access rights nor automatic inference, and do not configure technical endpoints.

## Domain overview cards

The complete heading is a native link to the domain, including the padded area and status.
The card body has a single **…** button. Its menu contains **Domain öffnen**, change/retirement
requests and direct edit/retirement when permitted by the existing object checks. Retired or
read-only cards retain the open action. The menu reuses the shared compact context-menu styles,
supports arrow/Home/End navigation, Escape, Space activation and outside dismissal, and returns
focus to its trigger when closed by keyboard. Existing confirmation and request dialogs remain
the action targets; editing focuses the first field. New accessible/menu labels cover DE/FR/IT/EN.

## Shared semantic diagrams

### Hold-to-create and card removal

A quick left drag repositions the card. Holding a term/domain card for 180 ms first activates
a red endpoint and line instead. Dropping on another eligible term prepares a relationship;
dropping onto an active domain immediately adds a local `related` edge for authorized editors.
It does not open a dialog or save automatically. Right-click changes the type afterward;
dropping onto free canvas opens **Neuen Begriff erstellen / Begriff suchen** (or the domain
equivalents). Node context menus expose the same create/search entry for keyboard users.
Escape and pointer cancellation end the gesture without publishing anything.

Blue connection points appear only on the card sides used by currently visible edges, in both
domain and term networks. Hiding/removing a line or card removes its unused points; moving a
card updates the used sides. A disconnected card can still start a connection by holding its
heading, description or padding, or through its context menu. The temporary red point and line
remain visible during an eligible held gesture even if no blue point existed beforehand.

The hold tolerates 8 CSS pixels of hand jitter around the original press during its 180 ms
threshold, consuming those movements so the source does not move. A larger early movement
continues as a card drag. Captured pointer releases are hit-tested against cards in the current
canvas before clearing the preview/capture, rather than using the event's captured source.
Dropping on either heading or description works. A pending click-based source survives target
pointerdown. Missing domain source ownership is explained directly in the canvas, with no
connection or save; object authorization remains unchanged.

All application context menus use the shared design-system `[role="menu"]` styles: 14 px text,
34 px minimum rows (44 px for coarse pointers), consistent spacing, focus/hover treatment,
rounded panels and disabled states. Graph descriptions use `TooltipDirective`, which reuses the
catalog glossary tooltip appearance, closes on drag/Escape/scroll and preserves existing ARIA
descriptions. Description text retains the card's grab cursor. Domänennetz follows Domänen in
the navigation. Term actions use secondary buttons; TERMDAT intake remains visibly disabled.

The domain term graph has a **…** display menu. **Direkt verbundene Domänen anzeigen** is off
by default and loads only active one-hop neighbors from the real saved domain relation graph,
with correct edge direction/type. This is an ephemeral view setting; it does not add assignments,
infer relationships or alter the global domain network. Neighbor cards can be moved and their
positions saved/shared in the current concept layout. Hiding them preserves saved coordinates.
New neighbor cards without saved coordinates avoid existing visible cards; explicitly saved or
manually moved cards keep their positions.

The gesture search uses selection mode: it restores/adds a reference card at the drop location
(an already visible card keeps its position), then opens the local relationship editor. It does
not change a term's governed domain membership. The separate general four-type context search
still navigates to the selected object. References outside the current domain are labelled
**zeigt Referenz**, rather than **verwaltet**.

New-term modals embed the existing multilingual glossary proposal form, preselecting this domain
and a related-term reference to the source. Existing domain-owner approvals remain mandatory.
Domain modals capture name/definition and distinct Data Owner/deputy; eligible owners create
under their own ownership, while requests for another owner go to that proposed owner/deputy. The graph labels pending
objects explicitly as personal proposals, not published terms/domains. Browser-session records
under the acting identity retain pending card coordinates; proposal data comes from the approved
request APIs and is never written into a shared layout. A directly created domain's relationship
stays a separate local draft until **Netz speichern**.

**Vom Canvas entfernen** adds a shared-layout hide marker, with no prompt. It preserves the
catalog object, domain membership and semantic links. **Wieder einblenden** restores the card;
both actions are staged until the layout is saved. **Im Katalog löschen …** is offered to object
owners/deputies and requires a confirmation naming the object and explaining immediate retirement and
history preservation. It is a catalog soft deletion, not a physical row purge. The backend checks
the trusted role and current revision again. Direct term retirement rejects open target proposals.

Right-clicking a connection opens **Verbindungstyp ändern** and **Verbindung löschen**.
Both preserve local-draft/approval semantics; line deletion itself never prompts or publishes.
Deleting an object is separate from deleting its line or hiding its card.

The domain detail's term network loads `GET /api/v1/semantic-graphs/concepts/{domainId}`.
Moving cards is local; **Layout speichern** shares a complete position snapshot and **Layout
verwerfen** restores the last loaded shared layout. Layouts are separate from terminology
proposals and their domain-owner approvals. An old browser-local arrangement is imported as
an unsaved draft only if the central graph has revision 0; it never overwrites an existing shared
layout automatically. Unsaved layouts participate in navigation/unload warnings.

The **Domänennetz** navigation entry opens `/domains/network`. It uses movable domain cards,
ports, context menus, zoom, print, fullscreen, rewiring and a text alternative. **Netz speichern**
publishes its local layout/link draft; deletion stays local until then, with no confirmation prompt.
The backend returns separate `canEditLayout` and `canEditRelations` permissions. Catalog Data
Owners, Data Stewards (including active modeling assignments) and explicitly assigned object
roles may save a layout. Domain links require owner/deputy authority over each changed source
domain. Preserving another owner's links during a save does not require authority to change them.
Inactive identities cannot call these APIs.

Four relationship types keep the domain vocabulary small:

| API type | Label and direction | Meaning |
| --- | --- | --- |
| `related` | A **verwandt mit** B (symmetric) | Subject areas are associated without hierarchy. |
| `partOf` | A **ist Unterdomäne von** B; inverse: B **umfasst Unterdomäne** A | A is a subject-area subdivision of B. |
| `interfacesWith` | A **hat eine fachliche Schnittstelle zu** B (symmetric) | The domains coordinate a business handover or collaboration boundary. |
| `overlapsWith` | A **hat Überschneidungen mit** B (symmetric) | The domains share subject matter, concepts or processes without containing one another. |

The naming is inspired by the hierarchical/associative distinction in the
[W3C SKOS Primer](https://www.w3.org/TR/skos-primer/#secrel). Domains are governed subject areas;
these links do not declare them SKOS concepts, implement mathematical subset reasoning or infer
access rights, organizational membership or transitive assignments. No relationships are seeded
merely from similar names. Server validation rejects self-links, inverse duplicates and hierarchy
cycles. Existing links to retired domains remain readable/removable, but cannot be created anew.

`GET/PUT /api/v1/semantic-graphs/domains` and the corresponding concept endpoints share revision
checks. PostgreSQL transaction advisory locks serialize even concurrent first saves; concept
writes also lock the owning domain. Conflicts return 409 with local drafts retained. Persistence
and append-only audit commit together. Concept endpoints never change glossary links. See
[catalog persistence](data-model/catalog.md) for the stored JSON contract.

### Searching from context menus

Blank canvas, node and relationship actions in term, domain and mapping graphs provide **Term**,
**Domäne**, **Logisches Modell** and **Physisches Modell suchen und öffnen**. The common modal
supports filtering, error/retry, focus containment and Escape. Selection navigates through the
router and its unsaved-change guards; it does not mutate any graph. Terms open the terminology
list filtered by their label. Domains/models open their existing detail/workspace routes. Physical
results come from latest accessible persisted source snapshots; personal source opt-outs remain
effective, and failed reads clear previous results. Changing identity clears the search and graph
state before reloading. Domain details respond to parameter changes when navigating between domains.

DaCa treats a **domain** as a governed subject area, not as an administrative organization. A
domain may cross departments and offices, while its Data Owner and deputy remain ordinary trusted
catalog identities whose organizations are displayed separately.

Products may be assigned to zero, one, or many active domains. Zero domains is valid for a draft,
but does not satisfy the business-metadata quality criterion. The legacy `data_products.domain`
text is retained temporarily as an interoperability hint; normalized domain assignments are the
authoritative source for new catalog behavior. Keywords remain free-form tags and are deliberately
separate from governed domains and glossary concepts.

## Governance

Every domain has one primary Data Owner and one different deputy. They govern that domain,
including direct audited changes and retirement. There is no separate register-owner role.
Other people submit requests to the current object's owners (or proposed owners for creation).
The requester does not review their own request; current assignments are rechecked on decision.
Changing the proposed future owner does not grant that person approval over an existing object.

Any authenticated catalog user can propose a glossary change for one or more domains. Owners and
deputies of each affected domain can edit and decide creation proposals. Existing-term proposals
belong to the term's explicitly assigned owner/deputy, independent of its current domains.
The same proposal revision must be approved for its review contexts. Editing the draft
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
not add a graph database, SPARQL endpoint, or cross-catalog transfer.

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

- the `Terminology` section under `Domäne und Terminology` has a primary `Neuen Term vorschlagen` action,
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

The feature stays inside the central Catalog API:

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
reviews and approves the request as the domain's Data Owner, after which Sandro assigns both
`Verteidigung` and `Mobilität & Logistik` to the synthetic vehicle-fleet product. Journey 09 starts
from that product and refines the accepted bilingual `Gepanzertes Fahrzeug` / `Armoured vehicle`
concept through a governed update proposal. It demonstrates that Sibilla and Kassandra must
approve the same proposal revision before the updated term is attached to the product. The same
update route is available from every accepted term to authorized users.

The demo-auth-protected `/api/v1/poc/domain-glossary-fixture` prepare and reset actions affect only
the synthetic vehicle product and its journey artifacts. The Catalog UI exposes them at
`/poc-simulation/domain-glossary`; reset requires the exact confirmation text `DOMAIN-GLOSSARY`.
