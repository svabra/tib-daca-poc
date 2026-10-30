# Expert search: context navigation and focus

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
navigation. No preference or saved search is persisted in the database or local storage.

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

Saved search views remain future work; there is no inert Save button or new persistence model.
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
