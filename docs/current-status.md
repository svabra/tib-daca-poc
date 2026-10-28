# Current status

Domain handover is available on details and the card menu. Server-computed
`canTransferOwnership` distinguishes object ownership from office ALDS and department LDSD
authority, including explicitly named deputies. `POST /domains/{id}/transfer` rechecks current
roles, locks the domain/current mandate, checks ETag and validates a different active recipient
and distinct deputy. A reason and explicit UI confirmation precede the direct, audited change.
Former owner COR rows are revoked, office scope is pinned (including an explicitly unscoped
handover), and existing term/model/product responsibilities are preserved. Only term creation
reviews and logical-model domain reviews follow the handover; multi-domain task routing retains
other domains' reviewers. Outdated domain requests become stale. Card reads reload on identity
changes so a former actor's server capabilities are not reused.
Verified with 42 distinct domain/metadata/scope backend cases (including concurrent handovers),
all 488 frontend tests, production builds and the dedicated `domain-transfer` browser flow.
The browser simulates a conflict response before the server receives any transfer, checks
retained input/cancellation and exercises desktop/mobile scoped menus without changing live
responsibilities. This was a targeted UI regression flow; no commit was created.

Domain detail metadata editing now uses server-computed `canEditMetadata` for active object
owners/deputies and explicitly appointed office ALDS/deputies. Native modal editing preserves
existing languages, saves only localizations, checks ETag and records the domain audit event.
ALDS rights follow the same trusted office/subordinate-object scope as organization networks;
the metadata endpoint does not grant foreign-office edits, retirement or term approval.
Ownership transfer now has its own scoped ALDS/LDSD action above.
Migration `0044_office_alds_mandates` persists LDSD/ALDS appointments separately from object
roles. The named assignments are bootstrapped once through an explicit seed function; subsequent
seeds retain changed or revoked mandates. Static Information now names LDSD, deputy ALDS and
the confirmed people/scopes. Operator provisioning records the appointment decision reference;
there is still no appointment UI or complete general office-configuration workflow.
The requested **Data Analytics Rapid Prototyping** domain is initialized once with Joel Ruod
as Owner and Thomas Kriegli as deputy, preserving later edits/retirement. Verified: 485 frontend
tests, 29 distinct domain/scope/backend regression cases, the production builds and the dedicated
read-only browser flow across ten owner/ALDS/foreign-office cases, including mobile cancellation.
The browser checks the updated LDSD/RACI reference too. This was a targeted UI regression flow,
not a full commit gate; no commit was made.

Domain/term card searches now include their assigned Data Owner and deputy. Person names and
IDs match case- and accent-insensitively; term searches use explicit term ownership, not domain
classification ownership. Search hints describe these fields in DE/FR/IT/EN.
Verified with the six relevant component tests, the production UI build and the read-only
`semantic-owner-search` browser flow covering both owner/deputy fields and filter clearing.

Domain navigation now mirrors Terminology: one **Domänen** section with **Kacheln** and
**Domänennetz** buttons, instead of a separate top-level network tab. The embedded graph keeps
its editor, save/discard behavior and navigation guard. `/domains?view=network` is canonical;
legacy `/domains/network` redirects preserve other query parameters.
Verified with 21 relevant component tests, the production UI build and read-only browser flows
for the domain submenu/dirty-view cancellation and the existing organization term network.

The [28 October authorization audit](authorization-consistency-audit.md) found and corrected
unrelated-user product PATCH access, inconsistent product deputy/list/SLA rights, stale
publication approvers and overly broad delegated model publication. Pending logical-model
reviews now recheck the current domain owner/deputy and exclude self-approval. Review reads
are cleared/cancelled on identity changes. Migration `0043_deputy_steward_role` adds the fourth
modeling role without granting it to anyone. Legacy model/source scope guards and independent
model ownership still need alignment. The subsequent LDSD/ALDS implementation above adds
appointment persistence and domain-metadata authority; general office configuration remains open. See the audit's open findings before treating the
project as fully consistent with object ownership.
The targeted audit covered 134 distinct catalog tests plus 46 Control Plane/PEP tests;
all 483 frontend tests and 18 OPA cases pass. Build, lint, migration and documentation checks
pass. Two read-only browser regression flows also pass; this was not a full 467-test catalog
run or a full commit UI gate. No commit was created for the audit.

Terminology now offers **Kacheln / Termnetz**, including a deep link with `?view=network`.
The term network uses the acting person's current modeling organization by default and permits
an explicit organization switch. Trusted object scopes and current primary owner memberships
select active domains/terms, including subordinate organizations; term domain membership does
not reassign ownership. Existing domain-detail graphs remain available. The same editor handles
layout saving, held connections, local semantic drafts, proposal approval and navigation guards.
Organization layouts use `organizations:<organization ID>` in the existing semantic graph table.
Term card actions now share the compact **…** menu pattern, retaining the disabled TERMDAT item.
Domain links support `related`, `partOf`, `interfacesWith` and `overlapsWith`. The new symmetric
interface/overlap types are selectable through the existing relationship editor and survive
explicit save, reload and reseeding. All graph views share labels/help in DE/FR/IT/EN. These
types do not infer hierarchy or permissions; source-object ownership checks remain unchanged.
The suggested directed dependency type is still a proposal.
Organization-network startup now follows late identity/organization updates until the user
chooses a scope explicitly. Graph reads retry only temporary connection/502/503/504 failures,
at most twice; 401/403 errors are not retried. Both personas are checked on initial entry and
on a subsequent normal session reload without a `demoUser` shortcut.

Semantic graph endpoints are shown only on sides with a visible relationship. The 180 ms hold
absorbs up to 8 CSS pixels of hand jitter without moving the card. Domain drags capture the
pointer and resolve the card under the release coordinates before clearing the preview;
target clicks also preserve an already selected source. Missing source ownership is explained
inside the canvas. These interactions do not save relationships automatically.

Domain overview cards now have one **…** action trigger instead of separate action buttons.
The full card heading is a native detail-page link. Existing actions and role/lifecycle checks
are retained in the compact menu, with keyboard navigation, Escape/outside dismissal, and
focus restoration. Opening an edit action focuses the existing dialog's first field.

Object governance replaces the global domain-register role (`0042_object_governance`). Domain
owners/deputies control their domains and outgoing domain links; unrelated global role labels
grant no authority. Accepted terms have explicit owner/deputy responsibility rows, initialized
once from their responsible domain and retained across classification changes. Deputy Data
Steward rows are supported and carry no owner decision right. Domain and glossary workflow
responses expose trusted, actor-specific review capabilities; decisions recheck assignments.
Terms also appear as data objects in the responsibility perspectives.

The Information entry links to the expanded static documentation: object roles, departmental
LDS/office ALDS mandates and all 19 source-matrix activities with a RACI legend, without
department-specific abbreviations. SLDS is omitted as clarified by the user. A simple localized
text search filters all static articles, including role descriptions and the matrix, with reset
and no-results feedback. LDS/ALDS appointment tooling is outside this documentation change.

Semantic-network usability: held domain-to-domain drops draw a local `related` edge immediately;
the hold threshold is 180 ms and permission failures are explicit. All context menus now use
shared compact typography/rows with touch sizing. Card descriptions retain a grab cursor and
use the existing glossary tooltip appearance. Domänennetz is the second navigation entry;
term lifecycle buttons match the other actions and include a disabled TERMDAT intake placeholder.
The term graph's top-right display menu can show direct active domain neighbors, off by default.
Neighbor positions share the existing revision-checked layout; visibility is a temporary view option.

Term/domain cards now distinguish quick movement from a 180 ms hold. A held card exposes a red
point/line; dropping onto blank canvas opens create/search actions, and dropping onto another
card prepares a relationship. Each action opens a focused modal with Escape/cancel. Creation
reuses glossary proposals and domain requests; eligible owners may create domains directly under their own ownership.
Pending creation cards are personal until approval. A connection-search selection restores or
adds a card; the four-type context browser remains navigation-only.

Shared layouts now persist hidden cards and additional term references separately from governed
domain assignments (`0041_semantic_graph_visibility`). Removing a drawing preserves its object
and links; restore controls bring it back. Right-click connection actions stage type changes or
deletions without a prompt. Register-only catalog deletion has an explicit confirmation, requires
a current revision, and immediately retires the object with audit/history intact. Open term
proposals block direct term retirement. Retired cards disappear from active canvases.

Term layouts are now central and explicit: **Layout speichern** publishes the current arrangement
for all readers; terminology proposals retain their separate domain-owner approval. A legacy
private layout may be loaded as an unsaved draft only when no central layout exists.
`/domains/network` adds the domain graph with shared layout, local relationship drafts, zoom,
print, fullscreen, arrow-key movement, ports, rewiring and a textual alternative. Relationships are
`related`, `interfacesWith`, `overlapsWith` (symmetric associations) and `partOf` (source is a subdomain of target); assigned source-domain owners/deputies
manage those links. Cycles, inverse duplicates, self-links and new links to retired domains are rejected.
All three graph editors expose term/domain/logical/physical object searches in their context menus.
Selection opens the object; it never adds a card or link. Physical search uses authorized latest
snapshots. Domain-to-domain navigation reloads the selected detail rather than retaining the old route data.
Migration `0040_semantic_graph_states` stores the graph revision, positions and domain links with
transactional audit evidence. No graph write grants source access or bypasses glossary approval.

Mapping canvas positions are now shared per logical-model root through migration
`0039_mapping_canvas_layouts`. Owners/stewards move cards locally, then **Entwurf speichern**
commits their arrangement together with any model/mapping changes. All authorized readers load
the same arrangement on opening/reloading the workspace. Separate layout revisions and the model
row lock reject stale/concurrent writes without losing the local draft. Layout-only saves do not
create model or mapping versions. Hidden drawings remain a local display choice; positions of
inaccessible sources are filtered from responses and retained during another person's save.

Release **0.2.0** adds shared model/term layouts, editable domain networks and organization-scoped
term networks, compact context actions, owner search and searchable governance documentation.
Current object assignments and explicit LDSD/ALDS mandates govern domain editing and ownership
handover with revision checks and append-only audit. Apply all migrations through
`0044_office_alds_mandates` before starting the API. Existing access returns and layout data
remain intact. The authorization audit records remaining model/source scope limitations;
see [the audit](authorization-consistency-audit.md).

Release **0.1.32** packages the source-access workflow, mapping/editor changes and AdA import
journey described below. All managed UI/API/package/image versions advance together; release
0.1.31 notes are retained separately. The mandatory UI-regression hook can target an isolated
local stack through `DACA_UI_REGRESSION_BASE_URL`, with the same complete suite and assertions.

The searchable documentation journey index includes **Import physisches Datenmodell – AdA**
(journey 14), with six steps, prerequisites, role, outcome and repeatability. Its tile includes a
labelled, keyboard-accessible three-dot menu. The AdA detail header offers the same menu beside
duration and difficulty, with the same reset navigation and guards. Models and source pages
contain no journey menu.
The tile downloads the exact packaged AdA CSV and offers a scoped reset with confirmation and the
persisted inventory name. The backend computes the target from its own example fingerprint and
the authorized organization, never a caller-supplied source ID. Reset shares inventory deletion
guards, optimistic revision checking and append-only deletion audit; logical representations or
mapping history block removal. An absent example is an idempotent success. Imports and resets
serialize on the same source key. Successful UI resets navigate from the journey tile to a fresh
CSV importer on the sources page in the selected scope. The one-use import query parameters are
removed from the URL after opening. Errors retain the confirmation target.
`journey:ada:reset` uses a local authenticated demo session, previews by default and requires
`--yes` to reset; no catalog-wide reset, direct database access or forced deletion is included.

The supplied physical-model import journey is already supported through both Datenmodelle and
Datenquellen. The CSV dialog now adds a visible drag-and-drop target while retaining the file
picker, generation-safe preview, validation and explicit import step. Multiple dropped files are
rejected; dropping during import is ignored. Preview/cancellation never persist a source.

The versioned [AdA example](../examples/ada-bewirtschaftung/README.md) provides 11 tables and 62
fields as compatible CSV metadata plus executable PostgreSQL DDL and entirely fictional rows.
PK/FK/default/nullability declarations remain inspectable CSV originals; structured CSV nullability
continues to be unknown. SQL constraints are separately validated in an isolated example database.
This is a proposed administrative source model, not an official Army system schema or a DaCa seed.

The mapping workspace no longer shows the model dropdown, active-representation dropdown or
the adjacent visible-sources button. Model context comes from navigation/deep links, and
representation cards still select the active snapshot for drift inspection.

Relationship removal now follows the workspace draft flow. The graph and inspector remove a
line locally without a confirmation dialog or immediate API mutation. Persisted removals carry
their original mapping version/lock in a pending list; new local mappings are simply discarded.
Save draft atomically appends superseded mapping versions with other model/mapping changes.
Failures keep removals pending; existing field-save rebasing updates their expected versions.

The mapping field panel now publishes a local draft on each edit. Field names immediately
appear in the graph, matrix, inspector and mapping dialogs, using unchanged stable field IDs.
The saved model/revision stays unchanged while typing. Switching Graph/Table/Drift retains the
field form. The workspace save action accepts field-only drafts and commits model characteristics
and mappings atomically, rebasing references to the new immutable model version. Failed saves
retain all draft inputs; navigation warnings include unsaved field characteristics.

The entity in field characteristics is read-only, with a magnifying-glass action for moving the
saved field to an entity of another logical model. The searchable popup checks editable scopes
and requires acknowledgement plus the exact field name after explaining removal and mapping
consequences. Pending field/mapping edits must be saved or discarded first. Both model revisions
are locked and saved in one transaction; stale versions, duplicate names, unavailable rights and
moving the last field are rejected. Physical mappings are not transferred; their history remains.

In the mapping graph, hold a logical or physical field for 350 ms and drag its red point
and red preview line onto a field of the opposite model type. A compatible, nonduplicate pair
creates a direct draft with blue endpoints; save it with the existing draft action. Invalid
or cancelled drops leave mappings unchanged. Click selection, keyboard actions and existing
line-end rewiring remain available.

Connected-source cards now use one labelled three-dot button instead of three differently sized
action buttons. Its compact menu contains open source, import/reimport with drift checks and
voluntary access return. Disabled imports and conditional return permissions are preserved.
Arrow keys, Home/End, Escape and Tab support keyboard use; cancelling the return confirmation
restores focus to the menu trigger. CSV inventory actions and source detail actions are unchanged.

Logical-model editing now converts zero-based API entity/field positions to one-based order
controls and back on save, including directly derived physical models. Unicode technical names
work consistently in the editor, logical writes and derivation bindings. Field-panel saves show
actionable server errors; issues outside form inputs are listed explicitly, and errors for later
entities mark their actual fields. Migration 0038 allows the public assistance-origin vocabulary
(`machine_translated`, `accepted_suggestion`, `edited`, `source_import`) alongside historical
`machine`/`accepted` evidence. Historical rows are not rewritten; API reads normalize aliases.

Connected sources support personal voluntary access return. Confirmation on a source card or
detail page persists an opt-out that overrides inherited organization access and the VIBDBU
read exception. Sources disappear from the actor's source register, search and physical selectors;
direct structure access, import and derivation return 403. Other people retain their access.
The separate returned-source section exposes only names, organizations and request status.
Restoration requires a reason and approval by another current organization Data Owner through
My Tasks. The first decision closes every linked review task; rejection permits a new request.
Sources, snapshots, logical models and mappings remain persisted. Seeds cannot reset opt-outs.
Migration 0037 adds personal states and restoration requests without changing existing access.
CSV inventories, external database accounts and product-delivery policies are outside this flow.

DaCa is the central data catalog of the BIT data platform. Earlier trust and synchronization
fixtures in the control-plane prototype remain inspectable, but they do not define the catalog's
operating model or transfer catalog resources. Catalog UI, glossary, footer and metadata now use
the central-catalog description in all supported languages.

## Release 0.1.31

Structure inventories are now distinguished from connected sources. Authorized users can archive,
restore or delete unreferenced inventories with durable actor/time audit evidence. Inventories can
also represent logical models in another organization when the user is independently authorized
for both scopes; source ownership and snapshot references remain unchanged. The picker and API use
one eligibility rule, while connected sources retain their organization boundary.
The version overlay describes these changes in German and English. Release 0.1.30 retains its
original six feature entries in the searchable archive. Migration 0036 adds inventory archival.

## Physical-model CSV loader

The representation picker no longer requires identical model/inventory organizations. It requests
model-specific source eligibility from the API. Active CSV inventories are selectable across
organizations only with model edit rights and an independently authorized inventory scope;
connected PostgreSQL/S3 sources retain the same-organization rule. Batch saves, individual mapping
writes, workspace inspection and domain propagation apply the same compatibility rule with their
existing read/write checks. Revoking either scope prevents the corresponding operation. Source
ownership, organization metadata and imported snapshots are not rewritten to enable attachment.

The source register now distinguishes **Angebundene Datenquelle** and **Strukturinventar** under
**Registrierte Quellen und Strukturinventare**. CSV import creates an inventory without a technical
endpoint; its tables remain physical models with origin **Aus Strukturinventar**. Inventory cards use
**Metadaten importiert** and **Inventar öffnen**, and omit the old automatic CSV suffix in displayed names.
Owners, deputies and stewards in the responsible organization can archive, restore or delete with
confirmation and optimistic revision checks. Archived inventories disappear from active source/model
selection but remain inspectable through **Archivierte Inventare anzeigen** and existing bindings.
Deletion removes only unreferenced inventories; model bindings or mapping history require archival.
The scoped **Inventarprotokoll** retains actor, action, revision and time even after deletion.
Migration 0036 permits archival only for CSV inventories, without changing historical snapshots or
requiring a backfill. All lifecycle changes and their audit evidence commit atomically.

On the source page, the CSV import button sits below both information notices and immediately
before the source register, keeping the page title first.

Models and the visible-source register now expose **Strukturinventar aus CSV laden** with a native
modal, file validation, organization selection and a searchable table/field preview. Import is an
explicit action; cancellation has no persistence effects. UTF-8/BOM and Windows-1252 inventories,
quoted multiline descriptions and Excel CRCRLF record separators are supported. The corrected
Gebäude.csv contains 31 tables, 270 declarations and 267 unique fields across SAP, ImmoGIS and BIM.
Duplicate compatible field definitions retain all source records; conflicting definitions reject the
whole file. Two entries without field names remain table notes. Missing nullability is shown as
unknown, and raw SAP/IFC types, source lengths/scales, classifications and value-list names stay
inspectable. CSV models use the existing snapshot explorer, representation picker and mappings.
The explorer preserves multiple source-system namespaces and opens the first imported object.

The HTTP metadata loader enforces modeling organization permissions, size/row/table limits and
preview fingerprints. One atomic transaction writes a CSV source, immutable snapshot, tables,
fields and audit evidence. Concurrent identical imports in the same scope reopen the same snapshot;
changed inventories create separate sources. Live PostgreSQL/S3 imports are unaffected. Migration
0035 adds CSV source support and nullable original-metadata JSON, with no historical backfill.

## Physical representations in the canvas

The blank-canvas/model-header context menu opens a source/object picker.
All attached PostgreSQL and S3/Parquet structures appear together. Unique case-insensitive exact
names become local draft links, including visible type conflicts; ambiguous names remain manual.
The dialog and source explorer share metadata-only object inspection. An explicit membership
preserves objects without field links. **Entwurf speichern** commits bindings and mapping drafts
atomically; failures preserve local changes, and leaving warns before discarding unsaved work.
Model and mapping version checks and existing organizational permissions remain server-enforced.

Assigned mapping-type values in the table and inspector expose the same central explanations on
hover, keyboard focus or tap using the shared glossary tooltip. Graph lines expose the assigned
type and explanation in their SVG tooltip and accessible label; selected-type controls and options
also carry the description. On small screens, type triggers retain a 40 px touch target. Tooltips
are positioned from their rendered bounds so the assigned value remains visible. Inspecting a type
never changes the mapping or creates a draft.

Connection lines have an invisible 14 px hit area; only the visible line thickens temporarily
on hover; keyboard focus has a separate outline. Right-click or Shift+F10 opens relationship actions with a mapping-type
selector, a plain-language description and, where applicable, a transformation/lookup-rule input.
Selecting a line exposes both draggable ends. Each end can be moved to another field in the same
logical model or the same physical table/object and snapshot; the menu provides equivalent field
selectors for keyboard use. Invalid drops, duplicate field pairs, Escape and pointer cancellation
preserve the previous connection. Type, rule and endpoint edits remain local until **Entwurf
speichern**, which creates an unvalidated successor even for a previously validated or submitted
mapping; history, snapshot identity, version checks and write permissions remain intact.

**Beziehung löschen** removes a local relationship immediately or confirms retirement of a saved
relationship into its superseded history. Physical representation bindings remain. For a mapping
with one logical field and several physical targets, deletion removes only the selected target;
remaining targets become a local draft. Shared multi-field mappings are identified in the menu:
type/rule changes apply to the whole mapping, rewiring replaces the selected field in that mapping,
and deleting such a shared relationship retires the entire mapping after confirmation.

A stationary **+** control at the canvas viewport’s top right opens fullscreen (**−** exits).
The adjacent printer control prints only the complete visible graph and its model-specific canvas
title, fitted to one A4 landscape sheet, including cards outside the current scroll viewport.
A compact federal-administration logo appears at the upper left; the upper right reads
**Datenkatalog**, with **Data Platform BIT** below it. The print header separately labels the
logical model's last saved update and revision (**Modellstand**) and the current **Druckdatum**,
both in Swiss date format and the Europe/Zurich time zone. Header space is reserved before scaling
the graph; the logo is loaded before printing.
Hidden representations, editor panels and canvas controls are omitted. Connections use thin
1 px lines (1.5 px when selected) and attach to the facing sides of cards: a representation to
the left uses the logical field’s left port and the physical column’s right port. Simultaneous
left/right representations use both logical ports. Drag logical and physical card headers
to arrange the canvas, or use arrow keys on a focused header (Shift for larger steps). Connections
follow their field ports. Clicking or opening the context menu on a physical card offers
**Darstellung der physischen Repräsentation entfernen**; this hides its drawing and connections
without deleting bindings or mappings or creating an unsaved draft. Selecting it in the
representation list restores the card. Layout and visibility survive Graph/Table/Drift switches
within the workspace; they reset when the workspace is reloaded. New representations are added
through the blank-canvas or logical-header context menu (also Shift+F10).

The Parquet seed targets the existing configured S3 store and only writes the dedicated
`vehicle_inventory_mapping_demo.parquet` object, with three synthetic rows and uppercase fields.
A real import persists footer row count, replacing the former misleading object-count-as-row-count
label. The optional existing-S3 Compose overlay connects DaCa to a running store without creating
another storage service. Migration 0033 backfills current non-superseded representation bindings.


When **Entwurf speichern** is disabled, hovering over it or focusing it with Tab explains the
active blocker: no unsaved representation/mapping changes, loading or saving, the local fallback,
a locked model lifecycle state, or missing organizational write scope. Escape dismisses the hint.
The same check controls the button and save handler. Existing persisted drafts, type conflicts and
drift do not independently block saving new local drafts.

### Domain actions in the mapping editor

Logical and physical card headers display their current catalog domain (or explicitly show that
none is assigned). Right-click or Shift+F10 on the logical header or a physical card offers
**Domäne zuordnen** only when unassigned and writable; existing domains offer **Zugehörige Domäne
anzeigen**, opening the domain detail in a separate tab. Menu hover and keyboard focus highlight
the whole enabled row with a red background, left edge and underlined label.

Assigning a logical model opens a modal that preselects all writable physical representations,
including hidden cards and memberships without field links. Uncheck any object to leave its
physical domain membership unchanged. Retired sources are disabled with a reason. Existing
physical domains are retained; the chosen domain is added explicitly. The same selection appears
before saving a changed domain in the full model editor or saving a physically derived model.
Cancel writes nothing. Domain actions preserve local mapping drafts, positions and visibility.

Physical assignments reuse `physical_domain_assignments`, keyed by source and stable table/object
key, so imported snapshots remain immutable and subsequent imports retain the catalog assignment.
Physical membership is explicit, never inferred merely from a field mapping. Logical assignment
creates an immutable model/DCAT successor and rebases mappings; the response contains persisted
versions so local drafts can be rebased without discarding them. It does not transfer model
ownership; the domain register still determines the reviewer. The server validates active domains,
organization/write scope, source lifecycle, snapshot membership, model ETags and physical-assignment
hashes. The selected set is committed atomically; conflicts retain the dialog and local drafts.

Migration **0034_unassigned_model_domains** permits `dcat_dataset_versions.data_domain_id` to be
NULL for logical drafts awaiting assignment. Existing domain values and history are unchanged;
there is no automatic backfill from logical mappings to physical domains. Review/publication
still requires an active domain. Downgrade requires resolving any unassigned drafts first.

## Catalog documentation and responsibilities

Glossary-word triggers now use a light-gray wavy underline. Tooltip and glossary navigation behavior is unchanged; DAAIF applies the same visual marker to its separate application glossary.

The thirteen DaCa-specific User Journeys now show curated tags. Journey 13 covers a missing physical counterpart, the Data Owner decision and Data Steward investigation. The overview combines free-text search across title, summary, outcome, roles and tags with a topic-tag filter, plus a result count and empty state. Journey IDs and deep links are unchanged; DAAIF maintains its own, separate journey content and tags.

The mapping graph is compact enough to leave the right-hand field editor visible on desktop. A connection can be superseded without deleting historical revisions. Logical fields can be removed in the embedded editor. Once a model has a physical linkage history, uncovered logical fields are saveable but rated as consistency errors. PostgreSQL stores each issue and creates an owner task. The owner accepts it with a reason or dispatches it to a scoped Data Steward; adding a mapping or deleting the field resolves the issue and completes open tasks. Static documentation now includes category, tags, creation date and two interface images for this case.

The catalog header now links to a documentation hub with the existing PoC User Journeys,
static catalog guidance and the DaCa glossary. The separate PoC Leitfaden navigation link is
removed; old journey URLs remain usable. Glossary list and detail pages read the dedicated
PostgreSQL DaCa application-glossary tables with ID, abbreviation, localized term, short and
detailed descriptions, and the explicit TERMDAT flag. Governed business terminology is stored
separately and never appears here automatically, even when labels coincide. Data Owner and Data
Steward entries explain their tasks, authority and accountability. Wavy-underlined role terms
load their short explanation on first interaction and link to the full entry. Catalog users
cannot edit the DaCa glossary; future Control Plane editing and TERMDAT enrichment remain open.
The glossary popup now tolerates the pointer crossing the small gap to its link, so the link
remains clickable; keyboard focus within the popup also keeps it open.

Settings now includes **Rollen und Zuständigkeiten** with category-, person- and domain-oriented
perspectives. All three use one API projection of existing persisted owners, deputies,
organization-scoped modeling roles, source mappings and additional object responsibility rows.
Physical table-to-domain links are now persisted separately, so VIBDBU appears under
Immobilienmanagement VBS even before a logical model has been derived.
The latter rows describe assignments but do not grant write permissions. The domain view shows
the responsible people for related objects as well as the domain itself. Details and the
data-model boundary are in `docs/catalog-documentation-and-responsibilities.md`.

The **Rollenprotokoll** submenu now displays a paged, searchable sequence of role and owner
changes. Migration `0028_role_change_protocol` marks existing assignments as baseline, and
PostgreSQL triggers capture future assignment, change and removal events even for direct SQL
writes. The protocol rejects update, delete and truncate operations. PoC startup seeding now
preserves revoked modeling assignments and recorded product-owner changes. The new User Journey
**Zugriff und Verantwortung im Überblick behalten** connects the three perspectives to this
history and to the separate data-access view. The bounded UC and acceptance criteria are in
`docs/use-cases/role-changes.md`.

## Release information for users

Catalog and Control Plane now show the same translucent, blue-accented version card as DAAIF.
The card places `Co-Designed by V, armasuisse, ESTV und BIT` above the version status.
Its popup describes only the latest release. The popup link opens a dedicated feature list with
search across descriptions and tags. The settings icon opens a DAAIF-style settings page with a
submenu for personal language, appearance, feature list and responsibilities. There is no tenant language
section. Settings and day/night icons have visible hover/focus tooltips; language and theme changes
retain the explicit browser-or-profile confirmation.
Catalog and Control Plane open the same DAAIF-style update dialog automatically once a new PWA
build is ready. It shows the version transition, warns about unsaved page content, offers the
target release summary and a link to the full feature list. The user can apply the update with a
full reload or defer it and continue working; the version card remains available for later.
The archive covers published versions verified in the `VERSION` history from 0.1.1; unreleased
numbers are omitted. Every release item explains its practical use and has searchable tags.
Both pages identify simulated workflows. The canonical `VERSION` and managed release surfaces
are synchronized at 0.1.29. The latest catalog notes cover direct focus in the field editor,
logical-field context actions, and the co-design credit; 0.1.28 remains searchable in the archive.
Catalog UI: 350 Angular tests passed; Control Plane UI: 6 tests passed. Both production builds,
`version:check`, `version:check-build` and Compose validation passed. The PWA A/B browser smoke
verified the startup and in-session update dialogs, deferral without reload and exactly one reload
after confirmation. Two pre-existing component CSS budget warnings remain in the Catalog build.

## Logical-model capture and review

Logical-model drafts persist independently in PostgreSQL. Saving and submission are deliberately
separate: saving creates no task, while submission produces one immutable review snapshot and one
task for the selected domain's primary owner. The deputy remains visible but cannot decide. Reads
are catalog-wide; writes follow the imported department, office, and division hierarchy.

The capture form has contextual DE/FR/IT help, optional I14Y fields with reset actions, and an
optional organisation-derived identifier. Identifiers are whitespace-free and case-insensitively
reserved per logical-model root by PostgreSQL. `Geheim` remains shown but disabled for new
classification selection. Department is required; office, division, application name, and creator
type are optional.

The demo-user selector includes Giuseppe Starwars as Data Owner and Thomas Wikinger as Data
Steward in armasuisse, so both personas can be used in the VBS modelling scope.

Save errors present an actionable German explanation and focusable field errors directly below the
save action. Safe technical support details include the error code, HTTP status, request ID,
normalised PostgreSQL category/constraint, and timestamp; the copy button never contains SQL,
record values, or a stack trace. Only a real ETag conflict advises reloading.

## Logical-first and physical-first modelling

The PoC guide places **Logisches Datenmodell erfassen** (Journey 10) directly beside
**Logisches Modell von physischer Repräsentation ableiten** (Journey 11). Journey 10 creates one
logical model from a blank form, manually adds entities and fields, then saves and submits it
without a physical representation. Journey 11 opens the seeded VIBDBU table as Christian Man,
derives a technical draft plus 47 pinned direct mappings, and reviews the editable result.
Journey actions with a demo person reload through the local sign-in so the session and visible
identity agree.

`Neues logisches Modell` offers two keyboard-accessible choices: an empty logical form or a start
from **Sichtbare Datenquellen**. `/models/new` remains the logical-first deep link. The source
register now shows a federal administration level filter with Bund selected; Kantone, Gemeinde,
Bundesnahe Betriebe and Kantonalbanken are visible but disabled until sources at those levels are
available. Its tooltip explains the classification and current scope. The physical entry follows
DAAIF: active source cards first, then a database/schema/table explorer for one
opened source. Every table exposes an actions button on hover/focus. Its context menu enables
`Logisches Modell ableiten`. A referenced table enables `Referenziertes logisches Modell öffnen`,
which opens the linked model's mapping workspace with its exact snapshot and table selected. The
blue and gray link icon beside a referenced table opens the logical model detail page; its tooltip
explains this on a separate line. With several linked models, the most recently updated one opens;
product-publication and DAAIF-investigation actions remain deliberately disabled.

The synthetic SAP VIBDBU source is
catalog-readable across modeling scopes, while importing it requires a modeling role in the
armasuisse Immobilien scope. A blue
notice leads to Expertensuche and passes the source filter as `q`; that search also shows matching
visible physical sources beside product results. The catalog header exposes
profile images or initials, local sign-out and a sign-in picker on a fresh browser, and language and light/dark
preferences with a conscious browser-versus-server-profile choice. Header controls have no
surrounding boxes. The language list uses contrasting option colors in light and dark mode, and
the selected control has no focus frame. The federal logo has a transparent background and white
lettering in dark mode, with the original red shield retained. Language selection updates the interface immediately; cancelling the storage
dialog restores the prior language. Local sessions have revocable
HttpOnly cookies and no tenant selection; the demo header remains available for PoC/CLI use and
is not production IAM. Server preferences are stored on `demo_users.preferences`. The active person
is displayed in the header, with redundant Arbeitskontext panels removed from the workspaces.
DE/FR/IT/EN translations cover the shell, local sign-in, source register, expert search,
welcome page, product overview, model overview, task overview and main domain view.
Specialist editors and some workflow details still use German text.

Each connection card represents one system instance, identified by its catalog path; duplicate
active registrations of the same instance are consolidated while multiple PostgreSQL, S3, or future
Oracle instances remain distinct. The register has free-text search across instance name, catalog
path and owner, together with type and owner filters. The `SAP VIBDBU Gebäudebestand` demo source
is seeded as active and remains available for a new metadata import.

`Datenquellen` is now its own primary navigation item between `Meine Datenprodukte` and
`Domäne und Terminology`. The hierarchy uses the DAAIF server/provider, database, schema, table and
view icons rather than generic substitutes.
Tables already connected to a logical model display a model icon before the compact `…` menu;
its tooltip describes the link regardless of draft, review, validated, broken, or historical status.
It closes immediately when the pointer leaves the icon.

Direct derivation resolves only a unique governed domain already established for the source scope,
marks the technical I14Y decision as provisional no-match, creates the logical draft plus all
pinned 1:1 mappings in one transaction, and routes straight to the mapping workspace. The graph
describes the forward edge as `1:1 · wird repräsentiert durch`; its reverse reading is
`abgeleitet aus`. One logical
model displays multiple versioned physical representations together; unique case-insensitive exact
name matches become local drafts immediately, including visible type conflicts. Ambiguous names,
M:N and transformation mappings remain manual. The active representation selects the drift view.
The physical snapshot card in the mapping graph names the scope's Data Owner, displays the
matching data-source-type icon, and shows the complete canonical catalog path and pinned revision.
Graph edges use the rendered connector centres, keeping their endpoints aligned after metadata
changes the height of the snapshot card.

Direct derivation opens the mapping workspace with the selected logical field immediately editable
in a persistent right-hand panel. The graph or mapping table remains visible while name, business
object, type, length, precision/scale, order, nullability, cardinality, classification, descriptions,
source and I14Y links are changed and saved. Conventional model entry uses the same extracted Angular
field-characteristics component: fields appear in a selectable table, `Feld hinzufügen` and
`Entfernen` change its rows, and `Tabelle`/`Relation` switch between logical structure and physical
binding. `Model Merkmale` remains on `Modellebene`. Snapshot metadata prefills all defensible
technical values while domain semantics remain deliberate choices. Field help is tied
to the title itself, appears above it on hover/focus, repeats the title, closes when the pointer
leaves the title, closes any previously open field help, and uses no separate icon.
The detail page places the model title above three keyboard-accessible tabs. Existing models
open with `Status & Klassifikation` (summary, publication readiness, version history, exports);
`Model Merkmale` contains DCAT-AP-CH and organization fields; `Logische Entitäten und Felder`
contains the selectable field table and editor. New models open on `Model Merkmale`, and
switching tabs preserves unsaved input in the shared form.
In the mapping graph, right click or Shift+F10 on a logical field opens its context menu.
Activating a graph field moves the text cursor to the first field characteristic, `Entität`, after the editor renders.
Scoped Data Owners and Data Stewards can edit field characteristics, start a connection,
remove a particular physical link, or remove the logical field. Removing a saved link
preserves its previous revision; removing a field saves a new model version. Local drafts
are edited locally. Both UI and API reject these removals outside the allowed role and scope.
The logical-model overview renders its `Geändert` value with the local time as well as the date.

The released sample database migration provides `daca_sample.public.VIBDBU` with the 47 CSV-defined
fields and 1'000 deterministic synthetic Swiss-building records in every deployed environment. Its
seeded, scope-restricted PostgreSQL source includes the matching credential-free structural snapshot,
so it is browsable as Mirjam Keller immediately after deployment. Catalog snapshots store only
structure metadata and comments, never those rows or a connector credential.

### Personal profile and additional VIBDBU editors

Clicking the signed-in name opens `/profile`. It shows the person's photo or initials, primary
organization, active modeling assignments from the server, other application roles, and an action
map for each role. The interface is available in DE/FR/IT/EN and both visual themes.
The header name is the sole entry to the profile and has no text underline. Sign-out is shown on
that page, not in the header. Without a local session, every DaCa route first shows the
demo-person picker; after sign-out the picker returns.

Christian Spider and Christian Man now hold additional Data Steward assignments for
`VBS / armasuisse Immobilien`. They can create and derive VIBDBU logical drafts and edit mappings;
the scoped role also permits structural metadata management. Their primary Verteidigung
memberships stay intact. Other Verteidigung users remain read-only for this source, and
publication still requires the model's named owner or delegated deputy.
The six Verteidigung modeling personas have explicit primary organization memberships, which
keeps their home organization accurate when an additional modeling scope is assigned.

## DAAIF reference journey

Journey 02 now contains an explicit hand-off from the closed-by-default DAAIF source explorer to
DaCa physical models and mappings. DaCa remains the semantic system of record. The documented
cross-system reference pins a logical-model URN plus model and mapping revision; it never carries
source content, credentials, a shared database key or an unversioned “current model” assumption.

## Quality gates

Run `npm run test:ui-regression` before every commit. The versioned pre-commit hook is installed
with `npm install` or `npm run setup:git-hooks`; the PR workflow runs the same Compose-based
browser journey and keeps failure evidence for three days only. Persistence changes also require
`npm run docs:data-model` followed by `npm run docs:data-model:check`.

## Continuation notes

Keep this file, `README.md`, the relevant design document, and the feature list current whenever
a user-visible workflow changes. The catalogue's required model-level reference is generated under
`docs/data-model/`; do not edit generated sections by hand.


The domain detail page lists explicitly assigned logical models and visible physical models,
with a shared search over names, descriptions, source and type. Logical membership uses the
current model revision; physical membership uses `PhysicalDomainAssignment` and the latest
source snapshot, including objects without mappings. It follows the existing catalog-wide
logical metadata and scoped physical-source read rules; historical/removed objects are not
duplicated. Links open the logical editor or the exact snapshot/object in the source explorer.
The Personal demo includes ten deterministic synthetic glossary terms and ten SKOS relations
(person, employees, employment, personnel number, organizational unit, position, function,
employment percentage and entry/exit dates). The ontology renders shared term nodes with
labelled direct relationships, zoom/scroll controls and a readable text equivalent. The
idempotent `personnel-glossary-demo-v1` seed preserves subsequent edits and retirements;
these are local demo concepts, not asserted TERMDAT or I14Y imports.

Structural drift evidence excludes current domain-assignment overlays; reimporting or removing an assigned object retains JSON-safe technical history and does not persist mutable domain membership inside snapshots.


The domain concept network now uses an interactive editor canvas: every domain-to-term and
term-to-term edge is explicitly drawn with a label and endpoints. All cards (including domain,
product and external-reference cards) can be freely moved with pointer or arrow keys. Connections
follow their facing sides; wide invisible hit regions keep thin edges selectable, with hover
emphasis, context-menu SKOS type/target/source editing and deletion. Both endpoints can be
rewired onto other terms in the same domain. Term names and definitions are editable while
preserving other language labels and domain memberships. The canvas provides sticky fullscreen
plus/print controls, zoom, automatic layout, keyboard menus and a text alternative.
Layout is shared per domain after explicit Layout speichern; unsaved layout changes stay local.
Unfinished semantic drafts survive a reload in the same tab and are protected on navigation. `Änderungen einreichen` submits existing glossary
update proposals with an expected term revision. It never directly publishes terminology;
the existing responsible domain owners still approve the proposals. Open proposals by the
current author reload as an explicitly pending preview with review links. If one of several
term submissions fails, already submitted proposals are retained and only remaining drafts
are retried. No new terminology store is introduced; shared presentation uses the separate semantic_graph_states table.
