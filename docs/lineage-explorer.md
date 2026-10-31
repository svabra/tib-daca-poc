# Lineage explorer

## Owner-only access receipts

Right-click an edge or its relationship pill, or use Shift+F10 on its keyboard-focusable path,
to open the edge menu. **Zugriffsprotokolle öffnen** opens
`/products/:id/lineage/:edgeId/access-events` in a native new tab (`noopener`, external-link icon).
The option remains visible and disabled for every other user, with the shared explanatory tooltip.
Escape closes the menu and restores the trigger; viewport bounds keep it usable on mobile.

`canViewAccessLogs` is a server-computed capability on each lineage edge. Its source URN is the
accessed resource, and its target URN is the consumer. Current `DataProduct.owner_user_id`, a
registered source's scoped active `data_owner` assignment, or an exact SourceCatalogEntry owner
determine access. A deputy, ALDS, generic owner profile or the displayed downstream product's
owner has no implicit right. Unknown reference-only source URNs remain disabled. Direct API
reads independently recheck this ownership and product visibility, including after transfers.
The UI invalidates capability flags and private rows when the identity changes.

The private page defaults to successful reads in the last seven days. Type (person/machine),
outcome (success/denied/error) and period filters run on the server. Results show UTC time,
current directory name when available, stable subject ID, protocol and outcome. Cursor pages
sort by timestamp and event UUID; no global audit payload or response data is exposed. Refresh
and filter changes clear previous results and cancel stale requests. Loading uses the shared
small spinner; denial and empty states have no fallback fixture receipts. Responses use no-store.

Execution-side reporters send `POST /internal/v1/lineage/{edgeId}/access-events` with the existing
internal service bearer identity. User/demo headers alone cannot submit receipts. The strict body
contains a reporter-generated UUID, aware UTC timestamp, subject ID/type, protocol and outcome.
The catalog derives resource/consumer URNs from the actual edge and appends an `audit_events`
record of resource type `lineage-access`, resource ID=edge UUID and action `data-read`. Its
versioned details contain only resource/consumer URNs, subject type, protocol and outcome; the
actor is the stable principal ID. Event-ID retries are idempotent; changing an existing receipt
returns 409. Retired edges reject new receipts; retargeted edges cannot expose prior resources'
or consumers' receipts. No SQL schema or grant changes are necessary; audit immutability remains.

The sample HTTP PEP supports person and machine demo identities, gated by DACA_DEMO_AUTH, and
uses deployment-only `CATALOG_ACCESS_EVENT_ROUTES` (product UUID:type:subject ID -> edge UUID).
Only a configured consumer route is reported; a caller cannot supply the edge or event ID.
Completed server reads are reported before returning records, and denial/fetch failure have
separate outcomes. A lost acknowledgement retries the same UUID once; reporting failure returns
503 without product data. A receipt confirms server-side completion, not client delivery.
The Compose fixture maps the SG person and finance service principal to its actual consumer edge.
No historical receipts are invented. Other source/consumer routes and direct PostgreSQL sessions
need their own trusted execution-side reporters; missing logs are not evidence of no access.

Validation: 589 frontend tests, five isolated PostgreSQL receipt/ownership cases and 17 sample
PEP/authorization tests pass. The `lineage-access` browser flow checks actual PEP person/machine
outcomes, the owner menu/new tab, filters and mobile layout, loading, disabled non-owner action
and direct-URL denial. These real test read receipts remain append-only evidence.

The product lineage page (`/products/:id/lineage`, also `/lineage`) draws metadata relationships
from upstream source through processing/product to downstream consumer. Edge `sourceUrn` and
`targetUrn` determine flow direction; relation names never reverse the arrows. Two staggered
ice-blue SVG light bands travel along each routed edge, pulsing in brightness and width instead
of showing circular particles. They illustrate direction, not live traffic.
`prefers-reduced-motion: reduce` hides impulses while retaining static arrows and relationship styles.

Cards use semantic kinds, not sibling position: source blue, transformation amber, product red,
consumer green. Compact 208 × 112 px cards have 2 px corners, wrapped titles (up to three lines)
and a catalog footer. Hover/focus lifts the existing card border by 2 px without adding an outline
or a second border; keyboard focus also underlines the title. Reduced motion disables the lift.
Selected cards retain their type-colored border without an extra surrounding ring;
the full title is available in the summary. Dagre reserves relationship-label dimensions and routes
each edge independently, including parallel relationships. Label pills stay in the space between
cards. The graph has a content-derived extent and scrolls within its own surface on narrow screens.
The selected-object panel moves below the graph when both no longer fit side by side.

## Shared tooltips and object summaries

Legend terms and relationship labels use the catalog `TooltipDirective` and the shared glossary
surface. A faint wavy underline indicates additional explanations. The requested legend wording is:

- **Verified:** Zertifikat dieser Quelle verfügbar
- **Declared:** Quelle wurde durch den Data Owner manuell deklariert

The existing API's active/inferred edge states still drive its verified/declared presentation;
these labels introduce no certificate download, issuance or cryptographic verification workflow.

Hovering or focusing a card opens a compact interactive summary with kind, catalog, full name,
Data Owner, exact URN and a short description when available. The shared tooltip directive accepts
an Angular template for this summary, uses a labelled dialog role for its interactive link, and
keeps its ordinary text-only tooltip behavior. Pointer users can cross the small gap into the
summary. Tab from the card reaches its link; Shift+Tab returns; Escape closes and restores focus.
Scrolling closes pointer-only tooltips; keyboard-focused hints and summaries reposition while their trigger
remains visible, including when focus scrolls the graph. Scrolling within the summary preserves it.
Resizing, outside interaction and destruction clean up the floating surface.

Known data products resolve to their actual product overview in a native new tab with `noopener`
and an external-link icon. A source, transformation or consumer present only as a lineage URN has
no independent catalog-detail resource in the current API. Its link opens the same graph in a new
tab with `asset=<exact URN>`, selecting that reference and showing its details. The summary explicitly
labels this destination **Referenz im Herkunftsgraphen**. Missing owner metadata is **Nicht erfasst**;
the current product's owner is never copied to unrelated objects. URNs are not prefixed again.
The product summary reacts to product metadata arriving after the lineage response.

Diagram styling preserves lineage-edge records and protocol boundaries. Provenance remains the
existing append-only event feed; private access receipts and their owner authorization are separate,
as described above. The UI does not assert a signed chain or origin attestation without
corresponding verification evidence.

## Validation

Component tests cover layout spacing, parallel edges, source-to-target order, exact URNs, native
new-tab targets, unknown-owner handling and keyboard summary access. Shared-tooltip tests cover
the interactive pointer gap and cleanup alongside existing plain/fullscreen behaviors. The
`lineage-explorer` Edge regression flow checks real SVG motion, legend colors and explanations,
native new-tab opening, reference deep links, reduced motion and mobile bounds. The compact-card
checks include the actual Edge flow, with 208 × 112 px bounds,
2 px corners, a single moving border and changing light-band position/brightness.
