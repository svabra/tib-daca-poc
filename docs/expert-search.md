# Expert search: context navigation and focus

## Personal search Views

The compact View selector sits between the search heading and search controls. **Neue View**
saves the current phrase and filters after asking for a name and optional description. Personal
Views are visible only to their owner. The adjacent disclosure menu offers **Bearbeiten**,
**Aktuelle Filter übernehmen** when the current search differs, **Teilen**, and confirmed **Löschen**.
Editing can change all existing filter fields. No SQL, arbitrary predicates, public/global Views
or additional filter taxonomy is introduced.

The interaction is inspired by [DataHub's View selector and saved-filter workflow](https://docs.datahub.com/docs/features/feature-guides/views/overview).
DaCa's sharing semantics are deliberately independent copies, as requested, rather than a live
shared definition. The existing federal forms, native modal focus containment and own tooltips
are retained. Labels support DE/FR/IT/EN. Mobile controls wrap and modal content scrolls within
the viewport.

The stored version-1 configuration contains:

| Field | Supported values |
|---|---|
| `query` | Existing search phrase, up to 200 characters; may be empty |
| `mode` | `context`, `focus` |
| `kind` | `all`, `product`, `logical`, `structure`, `field`, `term`, `domain`, `source` |
| `organization`, `domain` | Existing selected ID or `all` |
| `status` | `all`, `active` |
| `connection` | `all`, `connected`, `metadata` |
| `sort` | `relevance`, `name` |

Selecting a View replaces these controls together and keeps the preview behavior in both search
modes. An empty phrase in an active View searches the matching authorized catalog; ordinary
phrase searches keep the existing minimum length. A changed search is visibly marked until the
user explicitly saves it. Clearing the View selector leaves the current controls as an unsaved
search. The URL stores `view=<owned UUID>` alongside current filters and sort. An explicit empty
`q=` distinguishes a filter-only or modified active search from a short `?view=<UUID>` link, which
loads the stored definition. A reload never silently overwrites an explicitly modified query.
Unknown/deleted/other-user View IDs are cleared without loading another person's filters.

### Sharing and receiving

**Teilen** opens a searchable multi-recipient modal with name/organization, checkboxes and an
optional message. It sends the saved revision shown in the dialog, not an unsaved local search.
Up to 30 distinct active other users can be selected. Sharing the same revision with the same
recipient again does not duplicate messages. A later saved revision can be shared separately.

Each delivery freezes the name, description and filter configuration into a recipient-addressed
record, with sender, source revision and sent time. A `search_view_shared` workflow action links
the existing notification bell/tasks page to `/search?sharedView=<share UUID>`. The search toolbar
also exposes pending **Geteilte Views**. Notifications refresh by HTTP every 15 seconds while
the app is visible and on window focus; this is not email or an external messaging integration.

The recipient can inspect the exact sent filters, choose a local name and **Als eigene View
übernehmen**, or choose **Nicht übernehmen**. Accepting creates an independently owned View and
completes the message/task atomically; repeating acceptance returns the same View. A source edit
or deletion never changes sent or adopted copies. Recipient edits never change the sender's View.
If the adopted copy is later deleted, repeating an old acceptance returns Gone instead of creating
a surprise replacement. Dismissal completes only the recipient's message and creates no View.

Only filters are copied, not a frozen list of results and not any access grant. Current metadata,
authorization and source visibility remain authoritative for every user and read. A recipient may
therefore see fewer results than the sender. Absent filter IDs remain intact rather than broadening
silently to All. Preview pins, loaded result windows and collapsed groups are not persisted.

### Persistence and API

Migration **0046_personal_search_views** adds `search_views` (owner, configuration, optimistic
revision/timestamps), `search_view_shares` (immutable sent content and recipient decision), and
the optional `workflow_tasks.search_view_share_id` reference. These are private user settings,
not catalog assets, database views or authentication sessions. They survive logout/reload and
seeds. See the generated [catalog data model](data-model/catalog.md).

- `GET/POST /api/v1/me/search-views`, `GET/PUT/DELETE /api/v1/me/search-views/{id}`
- `POST /api/v1/me/search-views/{id}/share`
- `GET /api/v1/me/search-view-shares`, `GET /api/v1/me/search-view-shares/{id}`
- `POST /api/v1/me/search-view-shares/{id}/accept` or `/dismiss`

Owner and recipient predicates are checked server-side on every operation; an unrelated actor
gets 404. Validated active demo identity follows the existing auth boundary; production does not
accept demo headers. Responses use `private, no-store`. Update/delete/share require the saved
`If-Match` revision (428 if missing, 412 if stale). Names/descriptions/queries are bounded, unknown
configuration fields are rejected, and recipient validation/delivery is transactional. Limits are
100 private Views per user and 200 open received messages. Audit records contain IDs, actions and
revisions, never private filter phrases, descriptions or messages. Existing provenance stays
append-only. No delivery protocol, catalog grant, role or product policy changes.

Backend tests use an isolated PostgreSQL `_test` database and cover privacy, revision conflicts,
strict configuration, atomic recipient validation, duplicate delivery, source deletion, independent
adoption/editing, dismissal, quotas and safe audit details. UI tests cover filter capture/application,
recipient selection, preserved conflicts, notification routing and identity cancellation. The
`personal-search-views` Edge flow exercises actual dialogs, delivery, a changed/deleted source,
recipient adoption, persistence, filter-only results and cleanup of only its own temporary Views.
Validation: all 579 frontend tests and seven PostgreSQL API tests pass. The actual two-user
Edge flow passes on desktop and mobile. The View selector uses Angular's select value accessor
so asynchronously inserted options remain selected immediately after saving or adoption.

## Storage-neutral search contexts

**Data Structures** is the common physical search context, replacing **Tabellen** in both the
context sidebar and focus strip. It includes tables, views, materialized views and structured
S3 objects/datasets. Each result keeps its actual type: a table has a table icon, a view a view
icon, and an S3/Parquet object an object/cube icon. Group headings and the shared preview use
the same type/icon projection. Fields retain their field icon and link to their parent data
structure. S3 sources use cloud icons; database sources and declared inventories retain
appropriate database/document icons. The all-objects context uses a generic category icon.

Each context uses the existing `TooltipDirective`/catalog glossary appearance, with translated
explanations on hover or keyboard focus and dismissal with Escape. This adds no permanently
visible explanatory panels. The field explanation states the current physical-field indexing
boundary; source descriptions also cover metadata-only inventories without a direct connection.
`kind=structure` is the new URL value; legacy `kind=table` maps to the same context. Existing
metadata table/object IDs, detail route parameters, snapshots and persisted structures do not
change. No backend or database change is involved.

Terminology review: **Datenprodukte**, **Logische Modelle**, **Felder** and **Datenquellen** are
already storage-neutral. Suggested future wording is **Fachbegriffe** instead of **Terme** and
**Datendomänen** instead of **Domänen**, to distinguish business concepts from technical network
domains. Their current labels remain; tooltips explain them. Source/container/structure/field
are different levels: container search (database/schema/bucket/prefix), relationships,
constraints and indexes should become categories only when corresponding searchable catalog
objects are actually indexed. The example taxonomy does not introduce new connectors.

Validation of the generic-context update: all 538 web tests and the 28 targeted search tests
passed. Browser regression covers legacy/new context URLs, mixed database-table and S3-object
results, separate type labels/icons, and the existing tooltip in both layouts, in addition to
the existing preview/filter/mobile flow. Production build and data-model documentation check
passed. Evidence: `output/ui-regression/expert-search/data-structures-context-tooltip.png` and
`data-structures-focus-tooltip.png`.

The default `/search` view is **Kontext-Navigator**. A large two-tile switch at the right of the
page heading selects **Fokus-Suche**, represented in the URL by `mode=focus`. The query `q`,
object type `kind`, domain `domain`, organization `organization`, status `status` and connection
filter `connection` remain intact when switching. A new search without a mode starts in context
navigation. Layout switching itself remains URL-based; personal saved searches use the private
View persistence described above.

Both modes use the same filtered, accent-insensitive results and counts. Context navigation
groups physical field matches under their exact snapshot/table parent; the parent is contextual
information and is counted only if it independently matches. Groups can be collapsed. Focus
search lists the same matches without grouping. The initial page displays at most 30 matches;
**Weitere Treffer laden** extends that window. Type counts reflect the query and shared filters.

Results include visible data products, logical-model summaries, sources, latest physical tables
and their fields, active terms and domains. Logical field definitions are not indexed by this
iteration. Existing catalog/read-scope APIs remain authoritative: there is no new backend search
endpoint, direct source connection or data-row access. Source details are loaded only for the
latest snapshot IDs returned by the authorized source list, with at most four parallel reads.
Identity changes cancel previous reads and clear the metadata. Failed sections are explicitly
marked incomplete and may be retried; no substitute search fixtures are generated.
The identity effect deliberately leaves internal API-cache signals untracked, so metadata
responses cannot trigger a new loading cycle. Model contexts resolve current domain labels
and organization names rather than displaying internal reference IDs.

Physical fields open the existing source/table route with `snapshotId`, `tableId` and `columnId`
in the URL. The current explorer selects the snapshot and parent table; it does not yet scroll
to or highlight the individual column. Term results preserve the terminology `termId` link;
products, logical models and domains retain their existing detail routes.

## Progressive disclosure and preview

Unused filter controls stay collapsed. The context sidebar offers object types and collapsed
organization/additional-filter sections; the shared **Filter** button exposes the same controls
in either mode. Active filter chips can be removed individually. Reset leaves the phrase and
search mode intact. The input retains one labelled clear control and suppresses its native
duplicate decoration.

After a short hover or keyboard focus, the selected match appears in an optional shared preview.
The info button explicitly opens and pins it. Pinning keeps it stable while browsing other rows,
and changing mode preserves the selection. Close or Escape returns focus to its trigger; removing
the result from the active query/filter/identity clears its preview. On smaller screens the
preview becomes a dismissible overlay, keeping the search controls available.

Metadata, descriptions, identifiers, product quality/protocols, field type/nullability and parent
links appear only when available. The existing trusted source-connection flag distinguishes
configured connectors from metadata-only structures; it is not a health check or product access
grant. Unknown imported nullability is not shown as a verified required/optional field.

Personal Views are now implemented as described above; existing search projection and authorization
stay shared between ordinary and saved searches.
UI labels follow the current DE/FR/IT/EN language. Standard outline icons are Tabler Icons v3.50.0
under MIT, supplied as local SVG assets with their license. The existing federal shell is retained.

## Visual reference

The chosen concepts are the context navigator and focus search from the 30 October 2026 image
exploration. The revised reference includes the heading tiles and preview available in both modes;
PNG references and generation prompts live under ignored `output/imagegen/expertensuche-2026-10-30/`.
Implementation evidence is collected under ignored `output/ui-regression/expert-search/`.

Validation on 30 October 2026: 518 web tests passed; the final search projection passed all
20 search tests. The production build and data-model documentation check passed. The dedicated
`test:ui-regression -- --flow expert-search` browser flow verifies both modes, state preservation,
hover/focus/pinned previews, Escape, filters, one clear control, no repeated metadata loading,
no JavaScript exceptions, and layouts at 1440, 390 and 320 CSS pixels. The root `design-qa.md`
records the full-view and focused visual comparisons.
