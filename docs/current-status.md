# Current status

DaCa is the central data catalog of the BIT data platform. Earlier trust and synchronization
fixtures in the control-plane prototype remain inspectable, but they do not define the catalog's
operating model or transfer catalog resources. Catalog UI, glossary, footer and metadata now use
the central-catalog description in all supported languages.

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
model can list and switch among multiple versioned physical representations; exact type-compatible
name matches are reviewed before becoming ordinary local drafts, with M:N and transformation
mappings still available manually.
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
