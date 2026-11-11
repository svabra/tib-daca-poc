# BIT DaCa

Release **0.3.10** adds four interactive documentation animations, a complete animation index,
shared chevron steps and icons, the PostgreSQL sourcing door/conveyor, explicit Data Owner
approval flows and consistent German access-policy vocabulary. The version overlay summarizes
these changes in DE/EN and preserves 0.3.9 in the searchable release archive.

The documentation hub includes **Animierte Dokumentation** at `/documentation/animated`:
an **All animations** list above the overview links directly to Data Pipeline (26 s),
Data Sourcing (24 s), Find data and request access (24 s), and Data Access Management (32 s).
The overview entry scrolls to the pipeline on the same page. Links have visible keyboard
focus and no decorative arrows or underlining.

The three detailed use cases share one compact chevron station component: circular two-digit
numbers, title, localized start/end seconds, a 56 px minimum height, and a translucent active
frame following the arrow outline. Chevrons interlock with narrow gaps; each wrapped row starts
with a flat edge. All station lists wrap at the same breakpoints. Reused persons,
databases, buckets, files, documents, identity cards, tables, locks, shields and playback
controls come from one SVG sprite, keeping their proportions consistent across scenes,
legends and sizes.

German animation copy consistently uses **Zugriffsrichtlinie** for access policies, including
steps, legends, status and audit explanations. The standard names Policy Administration Point,
Policy Enforcement Point and Policy Decision Point retain their established expansions.

The main Data Pipeline shows
six tall layers arranged from left to right. Its introduction describes how data becomes
information, information becomes knowledge, and knowledge supports informed decisions.
Multicolored data flows from S3, files, databases and REST API into a raw-data bucket,
follows different paths through refinement gears and emerges uniformly gold. The small gold
points arrive at the product center, then remain visible on small circular orbits. Only after
all six have gathered does a rotating ring weld them into one growing product, followed by a
completion pulse. The product receives a shield in the protection layer and is distributed
simultaneously to all three consumers. Each branch keeps the same full-size gold product
and shield, illustrating reuse by multiple consumers.

One animation clock aligns the complete 26-second pass. No large product appears before
welding starts at 15.4 seconds; initial load, restart, seeking to zero and the loop boundary
all show an empty start. Restart, pause/play and a compact 0-26 second timeline support
self-paced reading. A thin track, small thumb and adjacent current/total seconds share one
unboxed desktop row; narrow screens place the full-width track below its label and time,
which can wrap for enlarged text.
Seeking pauses and Play resumes there. The active layer has a 4 px outer frame at 55 percent
theme-blue opacity and a blue title, using the regular card surface. Reserved spacing keeps
selection changes from shifting the diagram; the frame transition takes 160 ms. On this
overview, linked layer titles and their detail actions use plain text without decorative
arrows or underlining, with native link activation and visible keyboard focus.
Gears share the same clock; their symmetric 12/8-tooth profiles have concentric hubs and
matched pitch, spacing and opposite rotation. Selectable explanations and static reduced-motion
mode remain available. Narrow viewports keep the same horizontal architecture in a
keyboard-accessible scroll area. DaCa's central metadata, lineage and policy role is distinct
from platform processing and delivery. This illustrates the architecture, not live traffic.
See [the documentation design](docs/catalog-documentation-and-responsibilities.md).

The overview's **06 Datenkonsumenten** layer and its detail action open the 32-second
**Data Access Management** explanation at
`/documentation/animated/data-consumers/access-management`. Five stations show initial denial
(0 s), Consumer A applying through DaCa (6 s), forwarding to and review by the Data Owner
(10 s), approval recorded as a policy (14 s), and renewed data access (20 s). Submitting an
application does not grant access. After approval, the Data Owner authors the Consumer A /
Read policy in DaCa's **Policy Administration Point (PAP)**. The policy remains
stored there while each persistence's SDAL enforces its assigned projection. A logical-model
scope covers all three illustrated resources; a persistence scope lets the reader select a
subset, initially files only. Unselected resources stay visible and deny access. An empty
selection denies all requests. The scene also reconstructs an illustrative audit of every
request, including denials, with identity, time, resource, action, result and reason.

The **01 Datenquellen** layer opens **Data Sourcing** at
`/documentation/animated/data-sources/sourcing`. The focused 24-second scene shows one task
with exactly one **PostgreSQL** source, **Secure Data Access Layer PostgreSQL** (SDAL PG)
and **Source Connector PostgreSQL** (SC PG). The UI spells out both names. Four numbered stations
pause and seek to the task description in DAAIF (0 s), handover to SC PG (5 s), personalized
permission checked at SDAL PG (9 s), and the protected data flow (14 s).
The data path is **PostgreSQL -> SDAL PG -> SC PG -> selected Data Lake target**.
SDAL PG provides PEP/PDP enforcement and permitted introspection metadata; SC PG extracts.
The other source types, merge stage and repeated acquisition-mode episodes have been removed
from this explanation so it follows a single task.

DAAIF sits directly above the Source Connector; its task travels vertically downwards.
A person icon identifies the Data Analyst. In the wizard, a database, cogwheel and S3 bucket
replace the form lines, with Source / Transformation / Target labels. They appear one after
another during the first four seconds and remain visible for the rest of the task.
The wizard's database icon carries a small **PG** label; the Data Lake bucket is marked
**S3** to match the wizard's target icon, with space reserved below incoming data points.
The access layer's door starts closed, opens after the policy decision (12-12.9 s), remains
open while all six data points pass through, and closes at 19.1-19.8 s. The Source Connector's
conveyor starts folded upright. As the door opens, it lowers and telescopes left into a
bridge stopping just before the door frame, with its rounded end clear of the opening.
Moving treads and rollers carry the
points during extraction (14-21.5 s). The bridge stays down after the door closes until all
data has cleared, then folds up at 21.6-22.5 s. Door, bridge, conveyor and data points all use
the same clock, including reverse seeking, pause and restart.
A compact legend below the scene pairs the actual symbols with short explanations for
the analyst, source, transformation, storage targets, door, conveyor, task, personalized
policy check, permission/introspection and transferred data. It wraps for narrow screens.

Choose structured or unstructured target: six illustrative records enter either the container
with inner cells or the open bucket. The other target stays empty. Switching target pauses at
the retained scene time for comparison. One clock drives all movement, counts, station state,
seeking, pause, restart and looping. Reduced motion permits static manual exploration;
dark styling and mobile horizontal scrolling preserve the diagram.

The question mark beside Policy links to a separate 24-second animation at
`/documentation/animated/data-consumers/access-request`: find data using prose metadata,
request introspection metadata, then submit a separate electronic payload request in DaCa
for queries or Data Sourcing Tasks. Introspection approval does not authorize payload access;
the final payload request remains pending. The same Policy help appears in Data Access
Management. All tasks, permissions and data flows are explanatory frontend state, without
real jobs, credentials, protected data calls, persisted DAAIF structures or new protocols.
Central DaCa policy authority and actual HTTP/REST and PostgreSQL security remain unchanged.

The optional source hub at `/documentation/animated/data-sources` retains exactly two cards:
**Meta Daten** and a **Data Access Management** cross-link to section 06. Metadata
at `/documentation/animated/data-sources/metadata` explains source name, schema, provenance,
Data Owner, classification and endpoint descriptions in the central catalog.
Both source pages also provide a direct Data Sourcing link. The former
`/documentation/animated/data-sources/access-management` address redirects to the consumer
explanation. The main navigation's Datenquellen page remains the physical-model view.
Compact playback controls, story steps, reduced motion and back links support exploration.
Scope changes pause at the current time and reconstruct the scenario without API writes,
real grants, protected data requests or persisted audit events. Actual PoC enforcement remains
HTTP PEP/OPA and PostgreSQL ACLs plus forced RLS; publication requires matching confirmed
OPA/PostgreSQL revisions. S3 illustrates storage rather than a new delivery endpoint.
The raw-data bucket uses a clean outline without the former faint U-shaped grip line.

Release **0.3.9** corrects the height of external organization cards in the data landscape.
German/English release notes describe the fix; 0.3.8 remains archived. Managed application,
API, PWA and OpenShift image versions are synchronized.

Organization cards in the data landscape size to their content, including external organizations.
The obsolete fixed satellite height has been removed so organization names and both product-count
rows retain their padding in normal, fullscreen and narrow views, including translated labels.

Release **0.3.8** adds searchable current permissions, individual revocation and public
permission logs, inline open/answered access-request history, Mapping draft saving despite
type warnings, the **Datenprodukte** label with an adaptive start filter, and space below
the organization boundary. German/English release notes describe these five changes; 0.3.7
is retained in the archive. Managed application, API, PWA and OpenShift versions are synchronized.

The data-landscape canvas now extends below the blue organization boundary, leaving a full
external organization-card row with movement clearance. Cards can be dragged, moved by keyboard
or grouped there and saved/restored in normal and fullscreen views. Existing anchors retain
their coordinate origin; external organizations still cannot enter the focused boundary.

The product catalog is labelled **Datenprodukte** throughout navigation, page titles and
breadcrumbs. It initially selects **Von mir angeboten** when the current identity offers
products; otherwise it selects **Alle Datenprodukte**. Explicit URL filters and manual filter
choices take precedence, including while catalog data loads or refreshes.

**Freigaben → Zugriffsanfragen** shows open and answered product requests directly on the
product access page. Requests default to newest arrival first, with reversible sorting,
arrival/last-edit timestamps, outcome and expandable details. Current Data Owners, deputies
and existing responsible users can inspect this private request history; the task inbox
continues to contain open work only.

Mapping drafts can be saved directly in the detail inspector, including type conflicts and
validation warnings. **Speichern & zur Prüfung einreichen** persists workspace changes before
submitting the saved mapping revision. Warnings remain visible; validation and approval remain
separate from draft storage. Failed submission preserves the successfully saved draft.

Product **Freigaben** now shows a searchable registry of currently valid person, machine and
group permissions, including frozen group members and scope/validity conditions. Every reader
who may see the product may also inspect and search its permission history, with actor, revision
and before/after evidence. Data Owners can revoke one exact grant after confirmation; unrelated
grants remain intact. Governed products retain independent four-eyes review. Revocation is
reported complete only after matching OPA/PostgreSQL confirmation. See [PBAC](docs/security/pbac.md).

Release **0.3.7** includes product-page access requests, indefinite initial request dates,
current Data Owner receipt contacts, request/decision notifications and Control-click context
navigation. It also fixes missing CSV datatypes, restored physical field relations and logical
field discovery in expert search. German/English release notes include these changes; 0.3.6
remains archived. All managed package, API, PWA and OpenShift image versions are synchronized.

CSV structure imports assume `string` when a field has no declared type and show this assumption
in the preview. Original CSV declarations remain available. Existing missing-type imports are
interpreted consistently during display, logical derivation and mapping validation without
rewriting their immutable snapshots. The logical editor's Relations view restores saved physical
field mappings after reopening. Expert search includes logical fields with their model/entity
context, inherited organization/domain filters and direct links to the selected field.

Context-menu navigation now stays in the current tab by default. Hold Control to reveal the new-tab icon and use native Control-click to open the linked destination separately. The icon has permanently reserved space, so showing it never changes text wrapping or row heights. Filters, editing/selection dialogs, copying, downloads and other local actions never advertise a new tab. This also applies to navigation results opened from context-menu searches; explicit object selection still changes the current workspace.

The data-landscape canvas hides a BIT Easter egg: hold Control while hovering BIT to release small pink/red hearts that drift upwards, spread gently and fade. It works for office/satellite cards, focused BIT and fullscreen. Releasing Control, leaving the card or losing focus hides the hearts; reduced motion shows static hearts. This Easter egg is intentionally absent from feature lists.

Requesters receive private, acknowledgeable bell messages when their product-access request is approved pending activation, technically granted, or rejected. Messages link directly to that personal request under Data & Usage and refresh while the page is open. Final grant messages follow confirmed policy deployment; existing confirmed decisions are reconciled without duplicates or reopening acknowledged notices.

Access-request receipts show the current Data Owner with portrait, organization and a Teams contact link, resolved from the same product/person data as the overview. Known owners use their current directory email for Teams rather than a potentially stale metadata contact.

Data-product access requests now support **Unbestimmtes Enddatum** as an explicit option. The request stores and returns a null end date, and the same choice appears in the receipt, history and Data Owner review. Approval and policy publication retain the existing no-expiry policy representation and deployment checks. Bounded requests and finite renewal requests retain their date validation.

The blue header now keeps the notification bell visible with a DAAIF-style message panel, including an empty state and one entry/count per request. Assigned workflow messages and the request inbox are refreshed every 15 seconds while visible and on focus/visibility changes. Clicking a request opens its filtered task; review carries over the trusted requester identity, dates, protocol and requested data variant. Request/task duplicates are merged and status errors remain visible.

The product overview now offers **Zugriff anfragen** beside the title, above the status badge. Consumers open the same product-specific form as the context menu; responsible users retain the existing owner guard. Submitted requests create a Data Owner review task, appear in the notification bell and task inbox, and can be opened in access settings or decided there. The browser regression follows submission through owner notification/review and a persisted rejection visible to the requester; policy publication remains a separate governed step.

Release **0.3.6** keeps external organization cards outside the focused data-landscape boundary during pointer/touch, keyboard and group movement, including fullscreen. It also adds an existing-catalog delivery regression and a scoped PoC backfill runbook for the synthetic ROHS CPS products. The current release popup and searchable history describe both changes; 0.3.5 remains archived separately.

ROHS CPS examples are included in the published Catalog API image 0.3.5, including startup against an existing catalog. They are synthetic catalog use cases independent of the PoC hosting platform. For targeted backfill in the PoC, run `uv run --no-sync python -m daca_catalog.rohs_cps_seed` in the Catalog API pod; verify both products in search with active-only filtering disabled. See [PoC delivery verification](k8s/README.md#rohs-cps-example-metadata-in-the-poc).

External organization cards in the data landscape stay outside the focused organization's boundary, including pointer/touch dragging, arrow keys, group movement and fullscreen. Card edges retain floating clearance. Older overlapping personal anchors are projected outside for display without an automatic profile write; explicit Save retains the existing revision workflow.

Release 0.3.5 repairs automatic deputy selection after the PoC organization updates. Federal subdivisions resolve to their nearest active office through trusted memberships/directory IDs, so ESTV BI remains within ESTV without granting rights across EFD offices. Expired primary memberships cannot fall back to stale directory labels. PostgreSQL release tests now use the confirmed personas, hierarchical display labels, explicit object scopes and transactional domain handovers.

Shared canvas actions retain compact 32px desktop buttons and a 44px minimum target on viewports up to 700px as well as coarse-pointer devices. This keeps Mapping save/create actions and fullscreen exits usable in narrow desktop windows and mobile layouts.

Lineage product cards use the normal theme surface even when selected, matching domain-network product cards. The footer displays the actual Data Owner instead of the catalog identifier, and the accessible card name includes Data Owner. Missing ownership remains explicitly unknown; catalog identity is still available in the shared summary and selected-object details.

Data-highway packet flights now start and finish beneath the opaque source and target cards, instead of stopping at or before their visible borders. A shared 36-unit overlap covers the packet head, halo and 28-unit trail before the animation loops; smaller organization cards use an inset rectangle near their center. Lineage retains its routed visible path, while the data landscape retains exact subcurves of its ribbon. Three-second flight duration, direction, packet counts, reciprocal lanes, title clearance and saved layouts are preserved.

Lineage & provenance now uses the same slim blue-white data-highway skin as the organization landscape: gradient ribbons extend under the cards, one tailed pulsing packet per declared relationship crosses the source-to-target flight, including covered ends, in three seconds, and reduced motion leaves a stationary packet. Dagre routing and parallel relationships are retained; solid/dashed center spines still distinguish verified/declared evidence. Lineage cards share the domain-network asset-card structure (240 x 95 pixels, left type stripe, small icon/caption, wrapped title and compact metadata). Known products and explicit canonical organization/model/physical/term/domain URNs use the central type colors; unresolved sources, transformations and consumer references retain their actual lineage role. Provenance events and owner-only access-log authorization are unchanged.

The placement exclusion below the focused organization heading now follows the measured title, description and count block instead of a fixed 160-unit rectangle. The free strip immediately below the visible text is available for organization cards and domains, individual drag/keyboard moves, group movement and automatic placement. ResizeObserver tracks heading wrapping and fullscreen changes; the active language/focus identifies each measurement. Existing anchor origins, saved scopes and product relationships are preserved.

Ribbon connections now use one continuous cubic beneath both organization cards, eliminating the joins visible with diagonally offset organizations. The packet flight is an exact subdivision of that whole curve, clipped to inset points beneath measured cards. The band is slimmer (12 SVG units, with a 14-unit edge and 18-unit soft glow); the accessible hit area, packet spacing and three-second transit are retained. The focused organization area has a pale-blue background. Decorative ribbons extend underneath organization cards with flat ends, while packet flights start and finish underneath the measured cards and title text stays clear. Each ribbon has a gentle blue-white-blue gradient, and packets carry a tapered 28-unit fading tail aligned to travel direction. These treatments also apply in fullscreen and reduced-motion mode; dark mode uses the existing theme surface for the gradient highlight. Organization-to-organization relationships now use the selected **Lichtband** data-highway treatment: a softly glowing, translucent blue ribbon, a fine center spine and smooth cubic bends. Bright circular packets with short fading tails follow the actual curve at uniform path speed, taking exactly three seconds end to end. Reciprocal streams share one ribbon with separate offset lanes, and each distinct consumed product still contributes one packet. Successive packet heads now use an 18% phase gap and aim for at least 32 world units of separation on short paths (capped at 45% of a cycle and by the number of products), giving halos and tails more room without changing the three-second transit. A curve clearance check falls back toward a straight spine when a bend would cross an unrelated card or title. Domain assignments remain thin and dashed. Existing catalog evidence, private anchors, tooltips, navigation and accessible counts are preserved; reduced motion displays stationary packets along the same curve.

The data-landscape visibility controls sit in the upper arrangement toolbar, before fullscreen: **Orgs ohne DP-Beziehungen ausblenden** precedes the standard **Domänen** toggle. The relationship filter starts on (Domains remains off) and hides inner cards, satellites and overview peers only when both aggregated offered and consumed product counts are zero. Captions are compact/localized without terminal punctuation. The redundant unsaved-arrangement label and top rectangle-selection instruction are omitted; Save/Discard state and all selection interactions remain available. Producer-only and consumer-only organizations remain visible. The shared tooltip explains this rule, and organization/domain context menus expose the same checked option with keyboard navigation. The focused organization, breadcrumbs and independent domain layer remain available. This display-only filter neither reloads catalog data nor changes saved/draft anchors, permissions or product counts; switching it off restores hidden cards. Controls wrap on narrow screens and remain available in fullscreen.

Canvas object cards share central type-color tokens: organizations navy, logical models orange, physical representations/declarations purple, terminology pink and data products mustard. The data landscape uses the semantic object-card style for organizations, with a type caption, organization name, and separately labelled offered/consumed product counts in DE/FR/IT/RM/EN. German card labels are abbreviated to **angebotene DP** and **konsumierende DP**; tooltips and accessible descriptions keep the full terminology. Light/dark themes retain the same identity colors. Organization cards keep readable widths and fit their content vertically with 6px top/bottom padding; dense layouts scroll instead of shrinking their content, and personal anchors, context actions, group movement and round data-landscape domains remain supported.

The four editing canvases (data landscape, Mapping, domains and terminology) support a shared rectangle selection on blank space and group movement with stable relative positions. Shift/Ctrl adds/removes cards; Ctrl/Cmd+A selects visible objects, arrow keys move a group, and Escape cancels an active gesture or clears selection before fullscreen exits. Zoom/scroll, nested controls and layout permissions are respected. Changes use each canvas's existing explicit layout save/discard actions. Domain object layers now all support position anchors, including terms and logical/physical models, authorized through the same readable-object projection.

Expert search displays the shared blue loading spinner with its localized status text while catalog or search-data reads are pending, including organization/domain deep links from the data landscape and subsequent physical-snapshot reads. Both search layouts expose the same busy state and defer the empty-result notice until loading finishes.

Organization tooltips omit a description that repeats the office name, while retaining additional details. Data-flow points now cross a connection in 3 seconds, with the same speed for every product count and successive points still forming a visible train. The local Compose UI/API on localhost:8080 now include these changes; the external PoC rollout remains deferred. The organization-flow browser check enforces a 3000 ms transit and normal wall-clock playback on the running local application.

Release 0.3.4 collects the changes prepared in the local 0.3.3 working version: the organization data landscape, reciprocal product flows, expert-search context actions, compact/movable canvases, Romansh/localized counts, recent work, updated personas and additive PoC fixtures. Lineage now shares the data-highway treatment and domain-network card styling, with normal product surfaces, visible Data Owner and packets disappearing under cards. The feature overlay and all managed version surfaces use 0.3.4; published 0.3.2 notes remain a separate archive entry. Commit/push is authorized, including the existing CI image-build/publication workflow. The external PoC/OpenShift rollout remains deferred; checked-in image pins do not apply a deployment.

For reciprocal flows beside personal anchors, automatic placement first repairs a connected card overlapping a saved position, then minimizes relationship lengths. Saved anchors remain fixed; visible travelling points are checked against real card hit areas in the browser.

Verteidigung and armasuisse now exchange two distinct synthetic catalog products: armasuisse supplies **Schützenswerte Gebäude – armasuisse** to Verteidigung; Verteidigung supplies **Gebäudenutzungsbedarf der Verteidigung** (`urn:daca:ch:verteidigung:building-use-demand`) to armasuisse. The demand product reuses Data Owner Lawrence Hill, deputy Hong An Captain, consumer Giuseppe Starwars and the Verteidigung domain. One point travels in each direction on the same connection, with a small lane offset for visibility. A separate additive marker includes the reverse fixture in the Catalog API image startup seed, including upgrades of already seeded PoC databases, without overwriting either product or creating access grants.

Organization context menus in the data landscape offer **Alle Datenprodukte der Organisation anzeigen**. The action opens expert search with canonical `organization=<id>&kind=product`, without a name query or an active-only restriction. Existing centralized scope matching includes readable offered/consumed products and subordinate units; an organization without readable product references has a disabled action. Domains start hidden and can be enabled explicitly with the standard toggle or the assigned-domains context action; personal domain anchors are retained.

The PoC catalog includes **Schützenswerte Gebäude – armasuisse** (`urn:daca:ch:armasuisse:protected-buildings`). Existing Data Owner Giuseppe Starwars and deputy Thomas Wikinger provide the synthetic product in Immobilienmanagement VBS; existing Christian Man in Verteidigung consumes it. This creates the directed armasuisse → Verteidigung organization connection and one travelling point. The additive seed is part of `daca-catalog-seed`, which the Catalog API Docker image runs after migrations and before serving on every rollout, including existing databases. Its one-time marker preserves later edits and retirement. Catalog consumption metadata creates no endpoint, access policy or live access receipt.

The domain canvas keeps object-layer toggles and the filter/zoom toolbar directly adjacent: no bottom fieldset padding or top toolbar margin, tighter wrapped-row spacing and no empty hidden-domain placeholder. Existing 44px toggle-label targets and responsive wrapping remain.

The domain canvas aligns its blue connection buttons exactly with the relationship endpoints at the card's 60px center line. Selecting an edge reuses these buttons for endpoint dragging/editing; the duplicate white SVG handles are removed. Product cards support pointer/touch dragging and arrow keys while retaining ordinary new-tab links. Their `product:<UUID>` anchors share the existing personal view Save / Discard / Auto-arrange flow, remain when the layer is hidden, and update dashed membership lines without changing metadata or shared relationships. Escape/pointer cancel restores a drag; a completed drag suppresses link navigation.

The data landscape shows one strongly pulsing point per distinct consumed data product, with successive points travelling together from producer to consumer at a constant speed. Connections have no arrows; reciprocal exchange uses opposing lanes, and reduced motion retains static points. Shared tooltips explain the product count in DE/FR/IT/RM/EN, without claiming live requests or access receipts. A second synthetic ESTV product, **ESTV – Gemeindekennzahlen zur direkten Bundessteuer**, is consumed by existing St. Gallen personas: the ESTV → St. Gallen connection therefore carries exactly two points. The additive fixture preserves later edits and creates no new access policy or endpoint.

Domain bubbles in the data landscape can be positioned with pointer/touch dragging or arrow keys, including fullscreen. Movement creates a personal draft, pauses drift while dragging and follows the existing explicit Save / Discard / Auto-arrange actions. Toggling the domain layer retains anchors; dropping a moved link does not open domain details. Normal clicks and context actions remain available.

The data-landscape organization and domain context menus open the expert search with canonical `organization` or `domain` URL filters. Empty scopes have disabled menu actions. The expert search owns filtering, supports filter-only deep links, shows the domain selector directly, includes organization results, and loads every readable product page. Actor-readable object references use explicit office assignments, subordinate units and catalog consumption; display names never determine scoped membership. See [expert search](docs/expert-search.md).

The domain canvas omits the standalone relationship-type enumeration above the graph in every UI language.

The catalog adds **Rumantsch Grischun (RM)** beside DE/FR/IT/EN in the header and personal settings, with immediate switching and the existing browser/profile save choice. Central UI copy, navigation, settings, recent work and the data landscape have Romansh translations; untranslated inline details use English and business metadata keeps its recorded language. Offered/consumed products and relationship counts use shared locale-aware singular/plural forms in cards, focus headings, tooltips and accessible descriptions. See [localization](docs/localization.md).

When an organization has no child offices, its explanatory notice appears below the graph, keeping long localized supply/consumption counts and domain bubbles clear.

Organization, Mapping, domain and terminology canvases share compact action styling (32px desktop, 44px touch), wrapping action groups and a fixed, labelled fullscreen exit at the top right with an Escape hint. Domain automatic arrangement now sits next to save/discard, and terminology automatic arrangement sits next to shared-layout save/discard. Mapping retains its draft-save action; terminology business submissions remain separate from shared layout publication. Domain and terminology fullscreen use the same native/full-viewport fallback behavior as Mapping: Escape, explicit close, browser fullscreen changes and destruction restore page scrolling and focus. Nested menus/dialogs consume Escape before the canvas exits, and Tab focus stays inside the fullscreen canvas. A denied native entry or failed exit cannot leave the page scroll-locked. No save, permission, proposal or persistence semantics are changed.

Automatic arrangement in the domain network now packs whole domain/object clusters using each pair of actual bounds and a 32px minimum gap. A radial seed is compacted inward and into free neighboring pockets, avoiding the previous global-largest-cluster spacing. The final content remains centered, including wide/fullscreen and mobile canvases. Auto-arrange fits the natural content afresh up to 100% zoom, so an earlier 42% zoom no longer prevents enlargement; manual zoom still supports 40-160%. Existing saved/manual positions change only after the user explicitly rearranges, and saving remains a separate action. Hidden positions and shared relationships are retained.

In organization breadcrumbs, focused headings and inner cards, organization codes omit a repeated direct-parent prefix: BIT > BIT-PS > BIT-PS-CPS is displayed as BIT > PS > CPS, and ESTV-BI becomes BI under ESTV. Prefix detection uses the trusted parent relationship and canonical/localized parent codes. Standalone outside organizations, registry labels, IDs, search queries and saved positions retain their full identities.

The organization context menu only offers Explore here when the selected organization differs from the current focus. Choosing it opens that organization and closes the menu. The no-op entry is omitted on the already-open organization title and focused canvas; other context actions remain available.

The data-landscape actions use compact 32px desktop buttons (44px touch targets). Fullscreen is placed at the right of the arrangement toolbar below the heading. The inner placement field extends upward beside a narrower centered organization heading, with a reserved middle rectangle preventing automatic cards, domains and new drag positions from covering the title/description/counts. Existing saved positions retain their original anchor origin; new positions in the upper strip use office y values down to -120. The overview and satellite coordinate systems are unchanged.

Within a focused organization, child organization cards with zero offered and zero consumed visible products use muted gray text and borders on the normal surface, including hover/focus and fullscreen. Either offering or consumption keeps the usual appearance. Muting never disables drilling down, tooltips or arranging cards. This visual rule uses the existing aggregated counts and changes no catalog records.

The data landscape distinguishes **offering** from **consumption** for every organization, including the overview, focus header, satellites, fullscreen and accessible list. Compact cards show an upward arrow with the offered-product count and a downward arrow with the consumed-product count; a localized legend and the shared tooltip explain both. Offering remains the count of active, visible products assigned to the Data Owner's organization. Consumption counts distinct active, visible source products assigned through catalog consumers/shares, current published allow-policy recipients or active product lineage. Multiple people, grants, lineage edges and subordinate consumers do not multiply the same product within a subtree. Requests alone, inferred lineage alone, retired products and hidden products do not add consumption. Both counts can be nonzero, as for the cantons and ESTV. These are catalog relationships and valid grants, not statistics of actual data access. The existing directed producer-to-consumer connections and saved anchors remain intact; no persisted schema changes are introduced.

The start page now shows **Meine letzten Arbeiten** under the search in the right sidebar. Each nonempty category contains at most three distinct products, models (logical and physical combined), domains or terminology entries, ordered by the current user’s last saved edit. Titles link to the current object and show its own edit timestamp; long titles use the shared tooltip. Browsing, ownership alone and personal canvas saves do not count. The independent read-only `/api/v1/me/recent-work` projection uses actor-bound mutation audit events, resolved proposal/mapping/import references and logical-version authorship. It rechecks current visibility, omits retired/deleted objects and returned/out-of-scope physical sources, deduplicates before limiting and never changes audit history or permissions. Empty categories are hidden; loading/retry/empty states do not block search or the canvas. Identity changes clear stale items and cancel requests; all four UI languages are supported.

The data landscape now selects organization names, abbreviations and descriptions for the active UI language throughout titles, cards, breadcrumbs, menus, relation labels, tooltips and the accessible list. The API includes the existing registry localizations in one bulk read. Imported labels/short labels take precedence; read-only ASTRA fallbacks use the official OFROU (fr), USTRA (it) and FEDRO (en) names. Missing translated registry names fall back to the short code rather than a German long description; free directory proper names remain intact. Context groups and canton prefixes are localized too. Switching languages does not reload the network, leave the focused organization, reset drafts or change saved anchors, IDs, relationships or governance. Product searches continue using the canonical organization code.

The data-landscape placement now optimizes organization-to-organization catalog relationships together with domain assignments. Deterministic slot exchanges and free-position refinement penalize long links, edge crossings and links through unrelated cards or the organization heading. Exterior cards remain in perimeter lanes; all personal saved anchors remain fixed, and automatic arrangement restores an optimized draft for the current level. Scope projection uses the same visible organization hierarchy as the displayed connections. No connections, ownership or saved-layout schema are changed. The data-landscape and domain canvases share context-menu styling, standard outline icons, grouped actions, compact standard action rows (34px, 44px on touch devices), keyboard focus/hover states and theme colors. Data-landscape menus measure available screen space and scroll internally when needed.

The data landscape now groups domain bubbles near their assigned visible offices instead of scattering them independently. A shared hierarchy projection drives spatial grouping, dashed assignment lines and the small organization label: ROHS under PS/CPS projects to BIT in EFD, while Mehrwertsteuer projects to ESTV. Drilling down exposes the respective subunit; the shared tooltip shows the complete trusted organization path. Organization slots and domain slots are optimized with drift clearance; saved organization anchors remain fixed and nearby domains follow them. This is a display correction using existing trusted organizationIds, not a reassignment of domain ownership, governance or persisted data.

Domains are hidden by default when the data landscape opens, including its overview and fullscreen. The existing shared identifier-mode toggle (native button, switch role, checked state and standard thumb) controls hiding/showing them; no custom switch styling or persisted preference is introduced.

Relationships attached directly to the focused organization now end at its measured title perimeter with a small text clearance, instead of the empty center of its container. This applies to incoming/outgoing catalog relationships and domain assignments; visible child-organization endpoints retain their own cards. Measurements follow viewport/fullscreen size and language changes.

The organization canvas draws organization-to-domain assignments as dashed lines whenever the domain layer is enabled, using trusted organization IDs. Each domain connects to the most specific visible assigned organization, avoiding duplicate ancestor lines. Measured card and bubble positions keep endpoints aligned after arranging, scrolling or switching fullscreen. Organization-to-organization relationship rendering is unchanged; a separate legend identifies domain assignments.

The start-page search no longer displays the canton/ESTV search-tip sentence in any language.

The start-page data landscape now offers **Vollbild**, **Anordnung speichern**, **Entwurf verwerfen** and **Automatisch anordnen**. Drag organization cards with mouse/touch or move focused cards with arrow keys (Shift for larger steps). A drag moves a card without drilling into it; click/Enter still drills down. Floating pauses during movement and resumes gently about the chosen anchor. Reset restores only the current level's deterministic starting positions and remains a draft until saved.

Layouts are personal and saved to the current user's profile separately for the overview and each organization level. Inner offices and outside satellites retain independent anchors. Fullscreen uses the same draft and saved positions, with a contained scroll area, keyboard focus containment and Escape to exit/cancel. Switching levels keeps all draft edits; leaving the page warns about unsaved changes. Saves use optimistic revisions, keep drafts on failure/conflict and never alter organizations, relationships, product counts or governance. The domain layer uses the familiar toggle.

Domains and terminology now default to their networks (`/domains`, `/domains/terminology`); explicit `?view=cards` opens cards and `?view=network` remains supported. Selecting cards writes `view=cards`; selecting the default network removes the parameter.

Semantic reads no longer block the domain canvas on terminology or governance: each stream has independent readiness, loading tab counts display an ellipsis, and secondary failures leave the domain register usable. Identical pending domain reads are coalesced per actor/options without a completed-response cache. The embedded domain network reuses the parent's domains/change requests, and the organization term editor reuses its already loaded graph. Identity changes clear normalization data and reject late prior-actor responses.

Backend domain/term lists use a request-local bulk snapshot for labels, counts, ownership, office memberships, organizations and mandates. Existing authority helpers retain their semantics; the snapshot is removed in `finally` before any later operation. On the local 78-domain fixture, the register projection fell from **1,101 SQL statements to 10**, including the initial domain query. Tests compare batched and individual responses for multiple actors and bound SQL counts; no persisted model, policy, API response contract or access rules change.

The domain-network canvas now groups **Nur amtseigene anzeigen** and **Stillgelegte Domänen anzeigen** side by side immediately above the canvas. Zoom and **Automatisch anordnen** align to the right on the same toolbar; controls wrap in that order on narrow screens. The own-office filter is projected from the existing semantics page, so its URL-based scope, loading/error handling and disabled state remain authoritative in fullscreen too. These filters and all four object layers now use the existing identifier-mode switch design (rounded track/thumb), with native buttons, `role="switch"`, accessible labels and `aria-checked`. Card/terminology views reuse the same office toggle. No profile, persistence structure or permission changes are involved.

The domain network now arranges domains and their enabled object clusters radially about a common center. It replaces the left-aligned hierarchy/column fallback even for disconnected domains. Whole cluster bounds reserve room for products, terms, logical models and physical structures; a radial seed and compact packing keep clusters apart using their individual sizes. The automatic layout centers its complete bounds in the actual viewport, including wide/fullscreen views, and centers the scroll position when the graph is larger. Existing manual positions remain until **Automatisch anordnen** is selected; this resets only visible domain positions, remains a personal draft and requires explicit save. Hidden positions and shared relationships are retained.

Connected organizations outside the focused area now use normal ink, a light surface and a blue border. Unconnected satellites remain gray. Connections in either direction, including subordinate units, count; individual canton cards show a small localized “Kanton” prefix.

The organization graph now includes current published allow-policy recipients resolved through trusted directory identities. This restores **ESTV → Kanton St. Gallen** from the existing legacy organization principal. Relationships are catalog context, not access receipts or proof of deployed or executed access. Requests alone and unknown identities do not create relationships; hidden products remain excluded. Multiple sources for the same product/organization pair count once.

The additive PoC fixture **Zeughäuser Kanton St. Gallen** (`urn:daca:ch:sg:zeughaeuser`) records **Kanton St. Gallen → VBS armasuisse**. It reuses Beat Stalder as Data Owner, Sarah Brunner as deputy and Giuseppe Starwars as the armasuisse consumer. These personas already hold the required roles. The example contains only synthetic metadata; no endpoint or access policy is published. A one-time marker preserves later edits and retirement.

The welcome introduction now opens with “Entdecken, beschreiben, schützen” and explicitly
includes consumer usage logging alongside metadata, interfaces, provenance and access rules.
It also explains reuse, clear responsibilities and understandable relationships across
organizations, followed by the call to improve administrative efficiency, security and
reliability. German, French, Italian and English copy are aligned.


The start-page organization canvas now has a **Gesamtübersicht** above the department level.
It shows departments, the Federal Chancellery, canton/bank/public-directory groups and public
organizations such as SBB, Post and the ETH area as freely floating peer cards across the full
canvas. It has no central organization or enclosing department frame. The default entry remains
the current user's own area. The overview breadcrumb is always available; **Eigener Bereich**
returns to the user's starting area. Click cards to drill into departments or context groups.
`/?organization=all` opens the overview directly, including for users without a home assignment.
Optional domains remain round bubbles. Catalog relations project to the visible ancestor cards;
relationships within the same overview card do not create a self-thread. Counts, visibility,
authorization and directory membership still come from the existing read-only API. No backend,
persistence or permission change is involved.


The Neuchâtel welcome motif now uses a bright daytime photograph with the castle, collegiate church, lake and green foliage. The former yellow sunrise horizon is replaced. New `swiss-neuchatel-summer-daylight-*` URLs provide responsive 960/1600 px AVIF/WebP images and avoid stale cached copies; theme rotation and welcome layout are unchanged. Source and attribution are recorded in `docs/image-credits.md`.


Journey 08's trusted repeatable fixture reactivates the existing Verteidigung domain in its
retained office scope. Its ALDS review therefore remains with Christian Man, independently of
Sibilla's GS-VBS employment. This exception is limited to the stable, server-managed fixture
request; public new-domain requests still use the proposed owner's current primary office.


The confirmed PoC personas use their actual home organizations independently of scoped object duties:
Sibilla Di Ciesa is in GS-VBS (`vbs-gs`) and holds the VBS Local Data Steward Department (LDSD)
mandate. Christiano Stadello (`christian.spider`, stable ID retained) belongs to armasuisse and
holds its Amt Local Data Steward (ALDS) mandate. Thomas Wikinger is the armasuisse Local Data
Steward (LDS), represented by its scoped `data_steward` modeling assignment. Thomas Kriegli and
Joel Ruod belong to EFD / ESTV / BI (Business Intelligence, `efd-estv-bi`). Thomas owns the new
**Data Analytics** domain, with Joel as its PoC deputy. The separate **Data Analytics Rapid
Prototyping** domain keeps Joel as Data Owner and Thomas as deputy.

The one-time `poc-persona-governance-scopes-2026-10-31-v1` correction updates current names,
contacts, directory entries and primary memberships. Stable IDs, portraits, product ownership,
control people, existing object duties and historical evidence remain intact. The existing
Verteidigung and Personal domains retain explicit `vbs-verteidigung` scope even though their
responsible people have different home offices. The profile separately shows current ALDS/LDSD
mandates and scoped modeling assignments. New domains require their own office's ALDS approval;
Journey 08 explains creation under Lawrence Hill in Verteidigung followed by an evidenced
handover to Sibilla when a fresh exercise is needed. Apply an existing-runtime correction with
`docker compose exec -T catalog-api uv run --no-sync python -m daca_catalog.poc_identity_updates`.
Later operator changes, revocations and domain retirement are preserved.


Fausto Marzo belongs to **EFD BIT PS** (`efd-bit-ps`), without CPS. Fresh fixtures and the
browser fallback use PS. The scoped `poc-fausto-ps-organization-v1` update corrects the existing
user label, directory organization and primary membership in place; it creates no modeling role
and preserves his portrait, identity and control-person assignments. Apply existing-runtime
corrections with `python -m daca_catalog.poc_identity_updates` inside the catalog-api container.

Fausto Marzo now has a synthetic local profile portrait at `/assets/data-owners/fausto-marzo.webp`.
The scoped portrait backfill upgrades only his old FM initials placeholder or a missing photo,
preserving custom photos and all roles/assignments. Source prompts and export details are
recorded in `apps/catalog-ui/public/assets/data-owners/portraits.provenance.json`.

Sibilla Di Ciesa is the current PoC display name for the existing `sibilla.micheli` identity.
The stable ID, existing object responsibilities and portrait are retained; current organization and contact details follow the confirmed persona assignments above.

Enabled domains appear as round bubbles among the floating organizational rectangles. Both
types share collision-separated placement; domain bubbles retain their detail links, shared
tooltips and offer counts. The layer can be switched off again.

The welcome section retains its original typography, spacing and size above the explorer.
The explorer is titled **Datenraum der Schweizer Verwaltung und der bundesnahen Betriebe**.
Dismissal, shared tooltips, Settings / Home page and floating organization rectangles remain available.

The welcome close control uses the shared catalog tooltip and explains restoration under
Settings / Home page. This dedicated settings section replaces the former Appearance placement.
Organization containers/cards are rounded rectangles; offices are scattered freely with spacing
and drift calmly, just like the outer context cards. Reduced motion stops both layers.

The home page now includes an [organization explorer](docs/organization-explorer.md): own-department
offices, drill-down units, gray context satellites, visible active-offer counts and evidence-backed
relationship threads. Domains can be toggled. Search stays on the right. Hide the compact welcome
introduction after confirmation and restore it under Settings / Home page in the same browser.

UI vocabulary uses **Data Owner** in German, French, Italian and English, including deputy
roles, menus and help. Business terms are grouped under **Terminologie** in German
(Terminologie / Terminologia / Terminology in French / Italian / English).

All 26 selectable PoC personas have individual local portraits, including Fausto Marzo.
Fausto is selectable as Publication Approver and is the control
person for all products owned by Marcello Hebeisa, including newly created products.
Federal person/owner labels follow **department office organizational unit**, for example
`EFD ESTV`, `VBS V` and `EFD BIT PS CPS`. The display follows the current primary registry
membership, falling back to the federal directory only when there is no primary membership
history. Stable IDs, official registry names and policy attributes remain unchanged.
See [personal identity display](docs/personal-settings.md#poc-portraits-and-organization-display).

Release **0.3.2** brings personal domain exploration with related object layers, saved and
shared search Views, physical-first model derivation and consistent physical-instance menus,
Lineage access logs, ALDS domain proposals and synthetic ROHS CPS examples. The release popup
summarizes these changes; the searchable feature history preserves 0.2.1 and older notes.

The domain network offers a private, PostgreSQL-backed canvas view for every active user:
add existing domains across departments, move/hide cards, and switch related products (default),
terms, logical models and physical representations/declarations. Domain cards show their Owner;
foreign-department cards show department/office codes in gray and remain read-only. Shared
typed relationships still require source-domain ownership or deputy responsibility.
The synthetic [ROHS CPS scenario](docs/domains-and-glossary.md#rohs-cps-poc) includes selectable
Marcello Hebeisa and Matteo Duca, scoped to EFD–BIT–PS–CPS, with a linked catalog of telemetry
and analytics metadata. No production system connection or data access is provisioned.
Local demo identity checks finish before the route transaction begins. Request sessions borrow
a database connection only on their first query, retaining trusted transaction-local audit actors
without holding pool slots while waiting for a handler thread.

The shared small loading indicator draws its ring and arc as a 20 px SVG, keeping the spinner
visible without border styling and using the current theme color. Domain register/network
loading is browser-checked for actual visible geometry and motion, including reduced motion.

Physical representation/declaration menus can remove a specific current domain membership.
The version-checked action updates canvas and bindings immediately after confirmation by the API,
preserving other domains, mappings and the logical model. It is also available in a physical-only
Mapping workspace. The separator immediately after the preserved-bindings hint is removed.

Lineage edges offer owner-only **Zugriffsprotokolle** in a native new tab. The page separates
actual person/machine read receipts from grants, with outcome/period/type filters and pagination.
Both capability flags and direct API reads resolve the current resource Data Owner; other users,
including deputies, cannot read the logs. The configured sample HTTP PEP reports completed reads
and denials through a trusted internal endpoint. External/direct PostgreSQL execution needs its
own reporter; missing receipts never prove non-use. See [lineage details](docs/lineage-explorer.md).

Domain canvas menus group object actions and named semantic searches before general model searches;
the blank canvas starts with **Domäne erstellen …**. New domains appear as personal proposal cards
until the proposed owner's office ALDS or mandated deputy approves, excluding the requester.
Direct active creation is blocked. Domain/register/form loading uses the shared small spinner.

Blue informational notices on the visible-sources page have a small close button at the right.
Dismissal is local to the mounted page and resets on reload; it is not saved as a preference.
The discovery hint links to expert search and business domains and suggests contacting domain owners.

Expert search offers **personal Views**: save the current search and filters, edit or delete
private presets, and share a frozen filter copy with selected users. Recipients receive an
in-app task/notification and can adopt their own independent View. Later source changes do not
synchronize. See [personal search Views](docs/expert-search.md#personal-search-views).

The [lineage explorer](docs/lineage-explorer.md) uses compact cards with 2 px corners and a subtle
hover lift, pulsing light bands along the flow, wrapped titles, semantic type colors,
spaced relationship labels and directional ice-blue impulses. Shared glossary tooltips explain
the legend; interactive object summaries expose owner, exact URN, optional description and a
new-tab detail link. Referenced assets without their own catalog record remain clearly labelled.

Physical-instance UI terminology consistently uses **Physische Repräsentation** for connected
structures and **Physische Deklaration** for CSV inventories. Loading, mapping dialogs, bindings,
source history and derivation use **Revision** for version numbers; see the
[terminology reference](docs/logical-models-i14y-mapping.md#ui-terminology).

The Mapping canvas labels logical models, connected **physical representations**, and CSV
**physical declarations** explicitly. Bindings, canvas headers, physical search and field choices
use each object's own system/schema/name (for example `SAP.CSV.VIBDBU`), even when an inventory
contains multiple systems. Canvas background actions offer model searches and creation with matching outline icons;
term/domain searches are reserved for actual model cards. Canvas and binding cards share one grouped actions menu, including
source navigation in a new tab and semantic searches prefilled with the object name in new tabs. CSV source
cards use the same three-dot pattern for opening, archiving/restoring and confirmed deletion.
Physical menus start with source navigation followed immediately by drawing removal and its
non-destructive hint. Domain actions, named semantic searches and general model searches follow
in separate groups. General logical/physical model search results open in new tabs.
Mapping status legends and counters explain valid, review and broken states through the shared
hover/focus tooltips, with faint wavy underlines.
Selecting a logical counterpart for Mapping remains a dedicated action in the current workspace.
The common object-search dialog shows qualified physical names and readable source/type labels;
its keyboard-accessible origin tooltip exposes owner, import time, revision and exact source/object IDs.

Release **0.2.1** brings context/focus expert search with previews, direct Mapping entry and
private recent work, synchronized physical bindings, own-office semantic filters and footer
version information. The searchable release history retains the 0.2.0 notes.
Physical metadata imports have a bounded 60-second request budget so a longer drift check
does not prematurely report an unavailable API after eight seconds.

Domains and terminology enable **Nur amtseigene anzeigen** by default in card and network views.
The toggle sits beside the card search, stacking below on mobile. Explicit All choices remain
in the URL as `ownOffice=0` across views and semantic tabs.
The filter uses the current user's office and its subordinate units with trusted object
responsibilities, independently of a term's domain classification. Tooltips explain the scope;
filtering preserves shared graph data and local drafts. See [office filtering](docs/domains-and-glossary.md#own-office-display-filter).

The data-model overview defaults its department filter to the signed-in user's department.
Users can explicitly choose All or another department; Reset filters restores their own department.
Profile loading and identity changes update this default without overwriting deliberate choices
on model refreshes. A known user department stays selectable even if it has no models.

The logical-to-physical workspace tab is **Mapping** in every application language. Mapping
actions, headings and status messages use the same term; plural references use **Mappings**.

Expert search groups physical assets under **Data Structures** across storage types, including
tables, views and structured S3 objects/datasets. Results and previews retain concrete types
and icons. Existing catalog tooltips explain each search context on hover and keyboard focus.

**Mapping-Arbeitsplatz** now opens a selection page instead of an arbitrary first model.
Selecting a logical model opens its mapping immediately. Selecting a physical object opens
that representation directly in the canvas, with an existing logical counterpart selectable there
or a new logical model derivable through the full standard editor. The latter is only persisted
after completing and saving model metadata and field decisions; its physical links remain intact.
No additional **Mapping öffnen** confirmation is needed. The model overview also shows the shared small spinner while loading. Small loading spinners accompany
independent model, physical-detail and recent-work reads. Five
**Letzte Mapping-Arbeiten** let the current user resume model, physical object and view;
PostgreSQL keeps a bounded private history across sessions, separate from unsaved drafts.
See [mapping entry and recent work](docs/logical-models-i14y-mapping.md#mapping-entry-and-recent-work).

Expert search now defaults to **Kontext-Navigator** with grouped table/field context. Large tiles
beside the heading switch to **Fokus-Suche** while retaining the query and filters. Both modes
offer hover/focus previews that can be pinned, closed or opened as existing catalog details.
See [expert-search behavior and boundaries](docs/expert-search.md).

The mapping workspace's **Physische Bindungen** lists exactly the physical cards visible in the
graph, including local drafts and drift previews. Hiding or restoring a drawing updates both
views immediately. **Mit Quellenanbindung** identifies a configured source connector;
**Nur Strukturmetadaten** identifies structures without a technical connection. The workspace
refreshes every five seconds while visible and on focus; local edits pause replacement of the
displayed state so unsaved work survives.

Catalog and Control Plane show their version, Co-Design credit (V, armasuisse, ASTRA, ESTV and BIT)
and **Neu in dieser Version** in the page footer. Each footer credits co-designers once in the
version area; the optional welcome introduction uses the same current participant list. The
translated footer description contains no duplicate credit.
The version area scrolls with the page and
stacks below the footer text on small screens. The redundant current-version status is omitted; available PWA updates still
offer their notification and confirmation dialog.

Domains can be handed over through **Domäne abtreten** on their detail page or card menu.
Current object owners/deputies, office ALDS/deputies and the department LDSD/deputy can assign
new active people with a reason and explicit confirmation. The handover preserves office
scope, replaces former owner assignments, reroutes domain-governed reviews and appends audit
evidence. Terms, models and products retain their independent responsibilities.

Domain detail pages offer **Domäne bearbeiten** for their Data Owner/deputy and the explicitly
appointed office ALDS/deputy. Names/descriptions are edited in the existing languages; Save
checks the revision and appends audit evidence. ALDS metadata PATCH cannot change ownership or retire a domain; the separate, audited
handover action permits scoped ALDS/LDSD ownership transfer. Migration `0044_office_alds_mandates` stores distinct LDSD/ALDS mandates and named
deputies. [Governance information](docs/object-governance-and-raci.md) records the confirmed
people/scopes. No general Steward profile implies an ALDS mandate.

Domain and term card searches include Data Owner and deputy names/IDs. Matching ignores case
and accents; term ownership is searched independently of the owners of its assigned domains.

**Domänen** now groups **Kacheln / Domänennetz** below its section tab, matching
Terminologie's **Kacheln / Termnetz** switch. The network is directly addressable at
`/domains?view=network`; existing `/domains/network` links redirect there. Unsaved graph
changes are checked before switching views or leaving the section.

The [authorization consistency audit](docs/authorization-consistency-audit.md) records the
28 October 2026 review against the four object roles. Product edits now require an active
object assignment, deputies share the owner's product decisions, and publication/model reviews
recheck current responsibilities. Migration `0043_deputy_steward_role` completes the modeling
role vocabulary without assigning new people. **Open:** legacy model/source actions still use
organization-wide rights in places; LDSD/ALDS appointments are now persisted for domain metadata
but appointment UI and general office configuration remain future work. The audit does not certify full compliance with the new ownership model.

Domain links now support **hat eine fachliche Schnittstelle zu** (`interfacesWith`) and
**hat Überschneidungen mit** (`overlapsWith`), alongside related/subdomain relationships.
Right-click a line, select **Verbindungstyp ändern**, apply the draft and **Netz speichern**.
Both new types are symmetric and retain the existing source-owner checks. Domain, neighboring
domain and organization term graphs use the same localized relationship labels.

**Terminologie → Termnetz** (`/domains/terminology?view=network`) shows the selected
organization's active terms and domains. The initial organization follows the current modeling
area; it can be changed explicitly. Object scopes or the responsible owner's current primary
membership determine inclusion, independently of term classification. Organization layouts are
shared with an explicit save; semantic edits retain the existing proposal/approval workflow.
Term cards now group change, retirement and disabled TERMDAT actions in one **…** menu.
The initial network follows organization details that arrive after identity startup, while an
explicit organization choice stays selected. Brief network/gateway failures retry twice;
authorization failures retain their normal denied result.

Semantic graph connection points appear only on card sides used by visible relationships.
Holding tolerates small hand movements without shifting the source card; releasing over a
target's heading or description resolves the target independently of pointer capture. Domain
ownership failures appear directly in the canvas. Connections remain local until explicitly saved.

Domain cards open through their complete heading, including its padding and status area.
The existing open/request/edit/retire actions are grouped in a single **…** menu using the
shared compact context-menu style and the same object permissions. Keyboard navigation,
Escape, outside-click dismissal and focus restoration follow the source-card menu pattern.

**Information → [Rollen und Zuständigkeiten](docs/object-governance-and-raci.md)** is available at
`/documentation/static#rollen-zustaendigkeiten`, with a searchable static documentation page and
the 19 activities of the supplied RACI matrix. Department-specific abbreviations are omitted;
LDS and ALDS mandates are documented separately from the four object roles.

Migration `0042_object_governance` removes the legacy register role. Domain Data Owners and
deputies govern their own objects; changes to domain links check the source object's owner and
preserve unrelated links. Term ownership is stored explicitly, remains independent of later
domain membership/owner changes, and appears in the responsibility views. Requests route to
the actual object owners; decisions recheck current assignments. Other metadata modules retain
their existing scope checks. Organizational LDS/ALDS appointments are described here; this
change does not introduce an appointment UI.

In term and domain networks, hold a card for 180 ms, then drag the red point onto free canvas
space to **create** or **search** in a modal. Quick drags still reposition cards. The gesture's
search inserts a reference/visible card and prepares a local relationship; general context search
continues to open objects. **Vom Canvas entfernen** changes only presentation after Save:
the personal domain-network view, or the existing shared term-network layout.
Assigned object owners/deputies can confirm **Im Katalog löschen**, which immediately retires the object while
retaining its history/references. Right-click a connection to change its type or remove it locally.
Apply migration `0041_semantic_graph_visibility`. New term proposals retain domain-owner approval.

Dropping a held domain onto another active domain immediately draws a local **verwandt mit**
connection; **Netz speichern** publishes it under the existing role checks. Context menus share
compact 14 px typography and 34 px minimum rows (44 px for touch), and graph descriptions use the
catalog's rich tooltips with a drag cursor. **Domänennetz** is the second terminology tab. Term
actions share the same button style; **«TERMDAT»-Aufnahme beantragen** is a disabled placeholder.
In a domain's term graph, **… → Direkt verbundene Domänen anzeigen** shows active one-hop
neighbors and their real relationships. They are hidden by default; their positions can be saved.

The term network now shares its layout through **Layout speichern**, separately from glossary
approval. **Domänen und Terminologie → Domänennetz** opens the new domain graph, with related
domains and subdomain relationships. Graph context menus open one searchable browser for terms,
domains, logical models and accessible physical models. See [semantic design](docs/domains-and-glossary.md).
Apply migration `0040_semantic_graph_states` as well as preceding migrations.

Mapping canvas card positions can be shared per logical model. Data Owners and Data Stewards
move the logical/physical cards, then use **Entwurf speichern** to publish the arrangement for
all authorized readers. Moves remain local until that save; conflicting saves preserve the local
draft and require a reload. Apply migration `0039_mapping_canvas_layouts` before starting the API.

Release **0.2.0** adds shared model/term layouts, editable domain networks and organization-scoped
term networks, compact context actions, owner search and searchable governance documentation.
Current object assignments and explicit LDSD/ALDS mandates govern domain editing and ownership
handover with revision checks and append-only audit. Apply all migrations through
`0044_office_alds_mandates` before starting the API. Existing access returns and layout data
remain intact. The authorization audit records remaining model/source scope limitations;
see [the audit](docs/authorization-consistency-audit.md).

Release CI tests historical reversible migrations before crossing the object-governance
barrier, then verifies that an automatic downgrade is rejected without changing the seeded
head schema. Reversing role cleanup requires a reviewed backup restoration.

Release **0.1.32** adds personal source-access return and owner-reviewed restoration, draft-only
mapping edits, improved field editing and the repeatable AdA CSV-import journey. Release 0.1.31
notes remain in the version history. For a separate local UI-regression stack, set
`DACA_UI_REGRESSION_BASE_URL` before running the regression command or committing; explicit
`--base-url` takes precedence and the pre-commit hook runs the same full regression gate.

The **Import physisches Datenmodell – AdA** tile under **Documentation → User Journeys**
opens a six-step guide. The tile and the guide header beside duration/difficulty share a
three-dot menu that downloads the versioned AdA example inventory
and resets its import in a selected authorized organization. Confirmation
removes only that exact CSV inventory and its structures, then reopens an empty importer.
Logical/model-history references block reset; audit evidence and unrelated sources remain.
The equivalent local command is `npm run journey:ada:reset -- --demo-user christian.man --yes`;
omit `--yes` for a preview. Journey actions live on the tile and detail header; CSV-import controls on the models
and sources pages stay separate. See the [example guide](examples/ada-bewirtschaftung/README.md).

The physical-model CSV journey supports both model and source entry points, file selection or
an explicit drag-and-drop area, preview, organization selection and persisted inventory inspection.
The [AdA administration example](examples/ada-bewirtschaftung/README.md) supplies an importable
CSV with 11 tables / 62 fields, PostgreSQL DDL and fictional administrative records. It is a
proposed source model, separate from DaCa application persistence and official Army systems.

The mapping workspace opens directly in its model context without the redundant selection bar.
Physical representations are selected through their cards; the existing model overview and
canvas representation picker provide navigation and additions.

Deleting a relationship line immediately removes it from the local draft without confirmation.
Only **Entwurf speichern** persists the removal, together with other workspace edits. Reloading
and discarding an unsaved draft restores the stored relationship; failed saves retain the draft.

Field names update the graph, mapping table and inspector immediately as a local preview.
Typing makes no catalog write. **Entwurf speichern** commits pending field characteristics,
representations and mappings together; failures preserve the local draft for correction.

Field characteristics show the entity as read-only. The magnifying glass opens a search for
another logical model and destination entity. Moving a field requires a warning review, an
explicit acknowledgement and retyping its name. Both models receive drafts atomically;
physical mappings stay in the source history and do not move with the field.

In the mapping graph, hold a logical or physical field for 350 ms and drag its red point
and red preview line onto a field of the opposite model type. A compatible, nonduplicate pair
creates a direct draft with blue endpoints; save it with the existing draft action. Invalid
or cancelled drops leave mappings unchanged. Click selection, keyboard actions and existing
line-end rewiring remain available.

Connected source cards group opening, metadata import/drift checks and personal access return
in a compact three-dot actions menu. Existing permissions and return confirmation still apply;
keyboard navigation, Escape and outside-click dismissal keep the menu accessible.

Logical field characteristics display order starting at 1; the Angular API boundary converts
to and from the existing zero-based `position` contract without shifting saved mappings.
Technical entity and field names accept Unicode letters, including umlauts. Save failures list
server validation details even in the compact mapping field panel. Migration 0038 aligns
assistance provenance origins with the API while preserving immutable historical evidence.

**DaCa** is the central **Data Catalog** of the BIT data platform. This proof of concept contains
the catalog, an administrative control-plane prototype, and a synthetic ESTV data product
protected over both REST and direct PostgreSQL access.
The original PoC catalog description is corrected in a new metadata revision, retaining its
previous wording only as version history.

Connected source cards and detail pages support **Berechtigungen zurückgeben**: a confirmed,
personal opt-out removes the source from the user's visible sources and blocks direct catalog
structure access, including inherited role access. Other users and stored models remain intact.
The separate returned-source section supports reasoned reapplication; another current Data Owner
must approve through My Tasks. CSV inventories, external database accounts and data-product
delivery permissions are unchanged. Migration 0037 persists this state across restarts and seeds.

## Release 0.1.31

Structure inventories are now distinguished from connected sources. Authorized users can archive,
restore or delete unreferenced inventories with durable actor/time audit evidence. Inventories can
also represent logical models in another organization when the user is independently authorized
for both scopes; source ownership and snapshot references remain unchanged. The picker and API use
one eligibility rule, while connected sources retain their organization boundary.
The version overlay describes these changes in German and English. Release 0.1.30 retains its
original six feature entries in the searchable archive. Migration 0036 adds inventory archival.

## Physical models from CSV

In **Datenmodelle** or **Sichtbare Datenquellen**, choose **Strukturinventar aus CSV laden**.
The dialog offers a full-width CSV drop area and the standard **Datei auswählen** / **Datei wechseln**
button. Name and responsible organization use compact, aligned standard fields; detailed format
help is collapsed initially. Intro and preview identify physical models as **Physische Repräsentation**.
On the source page, this action sits below the information notices, immediately before the source register.
Select a semicolon-delimited structure inventory (UTF-8 or Windows-1252, up to 2 MiB), inspect
the searchable table/field preview and choose your responsible modeling organization. **Importieren**
saves all declared tables in one transaction and immediately opens their physical-model explorer.
The uploaded Gebäude inventory yields 31 tables across SAP, ImmoGIS and BIM, with 267 unique fields
from 270 declarations. The duplicate BIM `Name` field retains both descriptions; two fieldless
records remain table notes. Exact names, raw types, multiline descriptions, value lists and source
classifications remain inspectable under **CSV-Originalangaben**. No data rows, credentials or
live database connections are imported. Repeating identical content in the same scope reopens the
existing snapshot. Different inventories create separate sources and never overwrite existing ones.

The register distinguishes **Angebundene Datenquelle** (a configured technical connection) from
**Strukturinventar** (imported structural metadata without an endpoint). Individual tables remain
physical models, with origin **Aus Strukturinventar**. **Inventar öffnen** opens their structure.
Authorized owners, deputies and stewards can archive, restore or delete inventories after confirmation.
Archiving preserves snapshots and existing mappings; **Archivierte Inventare anzeigen** makes them
available for inspection and restoration. Deletion removes imported structures only when no model
binding or mapping history references them. **Inventarprotokoll** records imports, archival,
restoration and deletion with actor and time, and remains readable after deletion.

An active structure inventory can also represent a logical model in another organization when
the user can edit that model and has a scoped modeling assignment for the inventory. The picker
obtains eligibility and disabled reasons from the API for the selected model. Saving checks both
permissions again; inventory ownership and snapshot identity stay unchanged. Connected sources
continue to require the same organization as the logical model.

## Projects

| Project | Purpose | Local URL |
|---|---|---|
| Catalog UI | Metadata, lineage, provenance, endpoints, policy authoring | http://localhost:8080 |
| Catalog API | Central catalog and PAP/PIP | http://localhost:8080/catalog-api/docs |
| Control-plane UI | Administrative status and historical PoC configuration | http://localhost:8081 |
| Control-plane API | Control-plane REST and SSE | http://localhost:8002/docs |
| Sample data product | Protected synthetic ESTV aggregates | http://localhost:8080/sample-api/docs |
| OPA PDP | Bundle status and local policy decisions | http://localhost:8181 |
| PostgreSQL 18.4 | Catalog, Control Plane, Sample-Daten und direkter Produktzugriff | localhost:55432 |
| pgAdmin | Nur lokale Verwaltung der drei PostgreSQL-Datenbanken | http://localhost:5051 |

The Control-plane API host port is configurable with `DACA_CONTROL_API_PORT` (default `8002`).
Use e.g. `18002` in the local `.env` when the DAAIF MCP server already occupies `8002`.
The Control-plane UI continues to use the internal Docker service address.

The only supported protocols are HTTP and PostgreSQL wire protocol. Catalog metadata and
governance are managed centrally. The older trust/sync configuration prototype does not
transfer catalog resources.

## Stack

- Angular 22, Angular PWA/service worker, signals and RxJS
- Python 3.14, FastAPI, SQLAlchemy, Psycopg and Alembic
- PostgreSQL 18.4 for all local persistence contexts and OPA 1.18.2 for policy decisions
- npm and uv workspaces, pytest and browser-based visual verification

Python is intentional: future metadata extraction, data profiling, normalization, lineage
analysis, and wrangling can reuse the Python data ecosystem without replacing the service layer.

Both PWAs consume `packages/design-system`, a focused Angular port of the reference application's
federal authority strip, Confederation/BIT header, Swiss-red/blue tokens, sharp surfaces,
typography, focus behavior, and responsive breakpoints. The Confederation logo and favicon are
byte-identical copies of the supplied reference assets; its monolithic stylesheet is not imported.
The shared version card credits `V, armasuisse, ESTV und BIT` above the update status.

The catalog header's information icon opens `/documentation`, which contains the existing User
Journeys, static catalog guidance and a PostgreSQL-backed DaCa application glossary.
The DaCa glossary is stored separately from governed business terminology. It contains curated
system terms, including Data Owner and Data Steward with tasks, authority and accountability;
Catalog users can read these entries but cannot edit or enrich them.
Glossary words use a light-gray wavy underline in both DaCa and DAAIF; the explanation and detail link remain available by pointer, keyboard and touch.
The thirteen DaCa journeys at `/documentation/journeys` have their own topic tags and can be filtered by free text (title, summary, outcome, roles and tags) together with a selected tag. The filter shows a result count and an empty state; existing journey deep links remain stable.

Settings include `/settings/responsibilities` with category, person and domain perspectives on persisted
responsibility relationships. Glossary-backed role help loads on first interaction and links to
the full entry. The popup stays open while the pointer moves down to its link. The data and
authorization boundaries are described in
[`docs/catalog-documentation-and-responsibilities.md`](docs/catalog-documentation-and-responsibilities.md).
Physical tables can be linked directly to domains before a logical model mapping exists.
The settings submenu also exposes `/settings/role-changes`: a PostgreSQL-backed, append-only
protocol of role assignments, changes and removals. The User Journey **Zugriff und Verantwortung
im Überblick behalten** shows how to use all three perspectives and the protocol. The role
change scenario is specified in [`docs/use-cases/role-changes.md`](docs/use-cases/role-changes.md).

## Start locally

1. Start Docker Desktop and select its Linux engine.
2. Copy `.env.example` to `.env` if you want to change development credentials. All checked-in
   defaults and both `X-DaCa-*` headers are local-demo mechanisms, never production identity.
3. Build and start everything:

   ```powershell
   docker compose up --build -d
   docker compose ps
   ```

4. Open the UI and pgAdmin URLs above. Stop without deleting database state with
   `docker compose down`; add `-v` only when intentionally discarding the local PostgreSQL and
   pgAdmin volumes.

PostgreSQL 18.4 stores the separate `daca_catalog`, `daca_control_plane` and `daca_sample`
databases on the named `daca-postgres` volume. pgAdmin is a local-only convenience and uses the
development credentials from `.env.example`; no pgAdmin or PostgreSQL workload is deployed by
the production manifests.

The PoC supports PostgreSQL 18.4 only. Catalog tests require a dedicated database whose name ends
in `_test`; destructive test preparation refuses every other database name.

Each API container runs its own Alembic migration before startup. To rerun migrations explicitly:

```powershell
docker compose run --rm catalog-api uv run --no-sync alembic upgrade head
docker compose run --rm control-plane-api uv run --no-sync alembic upgrade head
docker compose run --rm sample-data-product uv run --no-sync alembic upgrade head
```

## Edit catalog metadata

The seeded product UUID is `11111111-1111-4111-8111-111111111111`. Read its current ETag, then
send that revision as `If-Match`:

```powershell
curl.exe -i http://localhost:8001/api/v1/data-products/11111111-1111-4111-8111-111111111111
curl.exe -X PATCH `
  -H 'Content-Type: application/json' `
  -H 'If-Match: "1"' `
  -H 'X-DaCa-User: daca-demo-editor' `
  -d '{"description":"Updated synthetic aggregate metadata"}' `
  http://localhost:8001/api/v1/data-products/11111111-1111-4111-8111-111111111111
```

A missing precondition returns `428`; a stale ETag returns `412`. Errors use
`application/problem+json` and include a request ID.

## Exercise the DAAIF → DaCa Golden Path

Open `http://localhost:8080/poc-simulation/product-submitted`. The PoC Simulation area exposes three already-created
DAAIF REST fixtures for each PostgreSQL-backed demo identity. Submitting a fixture calls the open
metadata-only endpoint `POST /api/v1/metadata-publications`; it creates an owner-scoped product,
a quality task, and an access-governance task without granting product-data access.

The endpoint is disabled by default outside the local Compose profile and is enabled there with
`DACA_OPEN_METADATA_PUBLICATION=true`. It accepts only HTTP(S) REST descriptions without URL
credentials, query strings, fragments, or secret fields. `sourceSystem + sourceProductId` is
idempotent; a changed replay returns `409`.

DAAIF can integrate against the versioned focused contract
[`docs/openapi/daca-metadata-publication.openapi.yaml`](docs/openapi/daca-metadata-publication.openapi.yaml).
With the local stack running, the complete interactive specification is available in
[Swagger UI](http://localhost:8080/catalog-api/docs) and as
[OpenAPI JSON](http://localhost:8080/catalog-api/openapi.json).
Keep the focused contract in sync with the running FastAPI application using:

```powershell
npm run docs:openapi
npm run docs:openapi:check
```

The checked contract is also served by the Catalog UI at
`http://localhost:8080/openapi/daca-metadata-publication.openapi.yaml` so a DAAIF developer can
download the exact integration subset without cloning the repository.

The five-step quality wizard keeps DCAT-AP-CH catalog mappings separate from the local
`DaCa Canonical Tax Ontology · PoC`. Platinum is calculated server-side only when all six stored
proofs are present: published access governance, confirmed discoverability, technical metadata,
business metadata, confirmed KOBY Graphify context, and confirmed mappings for the product class
and every key field. The semantic profile is available as DCAT-oriented JSON-LD at
`GET /api/v1/data-products/{id}/semantic-profile`; no SPARQL endpoint is exposed.

The catalog also maintains governed subject domains and versioned multilingual terminology. Products
can belong to several domains and can reference only accepted terms governed by at least one of
those domains. Domain-register requests, unanimous multi-domain term review, requester
notifications, deterministic PoC suggestions, and the JSON-LD knowledge graph are described in
[`docs/domains-and-glossary.md`](docs/domains-and-glossary.md). Free-form product keywords remain
separate and unchanged. The deterministic suggestion provider uses a minimum score of `70` by
default; set `DACA_SEMANTIC_SUGGESTION_THRESHOLD` to a value from `0` through `100` to tune it.
The terminology seed retains 38 bilingual reference concepts and adds three controlled business
objects for Immobilienmanagement VBS. Users can
start a term proposal centrally, from a domain or search result, or directly from product metadata;
accepted terms use the same governed proposal route for edits. Metadata Studio can derive up to
three editable candidates locally from the current title and keywords, but never applies one
automatically. Abbreviations remain searchable alternative labels of their concepts and are
exported as `skos:altLabel` in JSON-LD.
Journeys 08 and 09 can be prepared or reset from `/poc-simulation/domain-glossary` when demo auth
is enabled.

The catalog list shows this canonical score as a compact Bronze, Silver, Gold, or Platinum medal.
The read-only `Daten & Nutzung` product tab turns the same stored schema and semantic mappings into
a searchable data dictionary and safe REST/PostgreSQL quickstarts. It never renders credentials or
secret references and does not execute product-data requests from the catalog UI.

On pointer-based desktop devices, revision, quality medal and catalog creation date stay visually
reserved but appear only when a product row is hovered, focused or has its context menu open. They
remain permanently visible on touch devices and in forced-colors mode. The product menu links to the
versioned `SLA & Nutzungsbedingungen` page, where the Data Owner and a separate stored control person
use four-eyes approval: the owner maintains time-valid PoC service targets and the control person
reviews the exact revision. Publishing an SLA never changes
access grants, OPA/PostgreSQL policies, I14Y evidence or BAR evidence.

Access decisions are deliberately two-phase: approval creates a timed PBAC/Rego draft and sets
the request to `approved_policy_pending`; only successful publication to OPA and PostgreSQL sets
it to `granted_original` or `granted_modified`. The DAAIF reference fixture can then be exercised
at `GET http://localhost:8080/sample-api/api/v1/daaif/estv.direct-tax-assessments.v1` with exactly one local
demo identity header (`X-DaCa-User` or `X-DaCa-Machine`).

Expiring grants expose their exact end date and a linked renewal action. A renewal preserves the
existing subject, protocols, data variant and weekly window; the Data Owner reviews the old/new
evidence and the stored control person approves the immutable policy revision. The previous grant
continues unchanged until OPA and PostgreSQL confirm the replacement revision. Journey 07 uses an
isolated, owner-controlled fixture to demonstrate this path and resets only its own artifacts.

The full browser-driven customer journey across a transient DAAIF and DaCa stack lives in
[`journeys/`](journeys/README.md). It records screenshots, video, Playwright trace, JUnit output,
container logs and a SHA-qualified result summary, then removes every journey container and
volume. Run it locally with `npm run journey:data-analyst`; the official GitHub workflow is a
manual `workflow_dispatch` on `main` only.

## DAAIF physical objects and DaCa logical models

DAAIF remains the technical workbench for acquired sources and exposes only metadata that is safe
to browse. DaCa remains the system of record for logical models, field revisions, physical
snapshots, mappings, drift and their governance. The shared Data Analyst journey therefore passes
only a version-pinned reference: DAAIF physical object ID/path, DaCa logical-model URN, model and
mapping revision, status, and a UI deep link. No cross-database foreign key, source credential,
table row, object content or view definition crosses the boundary. A `draft`, `broken` or
`superseded` mapping must not establish analytical business context.

The existing DaCa Journey 02 links to DAAIF's closed-by-default source explorer; DAAIF's
**Education & Documentation → User Journeys** links back to the DaCa model and mapping workspace.

## Work with logical models and I14Y Concepts

`Datenmodelle` is independent of `Meine Datenprodukte`. `Neues logisches Modell` asks whether to
start with an empty logical form or from an existing data source; the adjacent action is therefore
named **Sichtbare Datenquellen**. The DAAIF-aligned first level presents active connection cards.
The page now uses **Sichtbare Datenquellen** with a direct expert-search link that carries the
current filter text as `q`; the expert search applies it to visible physical sources as well as
data products. Its labelled clear button is the only search-clear cross; the browser-native
decoration is suppressed. The synthetic SAP VIBDBU real-estate source is readable across
modeling scopes; import and changes remain limited to its owning scope. The catalog header
offers a local sign-in view backed by a revocable, HttpOnly demo session, profile avatar and
sign-out, language selection and a light/dark switch. Header actions and the language selector
have no surrounding boxes; the opened language list has readable option colors in both themes,
and keyboard focus uses an underline instead of a frame. In dark mode the federal logo keeps its
transparent background and red shield while its lettering appears white. A language change updates the visible interface immediately, then
asks whether to keep it in this browser or the demo user's server profile; cancelling restores
the previous language. Theme and language storage each require that explicit choice. This local preview
shows the active person in the header instead of repeating an Arbeitskontext panel in workspaces.
The translation dictionary covers the shared shell, sign-in, source register, expert search,
welcome page, product overview, model overview, task overview and main domain view in DE/FR/IT/EN.
Specialized editors and some workflow details still contain German text. The local preview retains
`X-DaCa-User` for PoC/CLI flows under `DACA_DEMO_AUTH=true`; it is not production IAM.
One card represents one technical system instance: active registrations with the same catalog path
are consolidated, while distinct PostgreSQL, S3, or future Oracle instances remain separate.
The register can be narrowed by free text across instance name, catalog path and owner, or by
source type and owner. Its federal administration level selector shows Bund, Kantone, Gemeinde,
Bundesnahe Betriebe and Kantonalbanken; only Bund is currently available and selected. A tooltip
explains this PoC scope. The VIBDBU PostgreSQL demo source is seeded active and can be imported
again whenever a fresh structural snapshot is required.
Opening a source reveals its database/schema/table tree, complete field metadata and a table
context menu. `Logisches Modell ableiten` creates the technical draft and its pinned exact 1:1
mappings atomically and opens the mapping workspace directly. When a table is already referenced,
`Referenziertes logisches Modell öffnen` is enabled and opens that model's mapping workspace with
the precise snapshot and table selected. Product publication and DAAIF investigation remain visibly
disabled.
Tables with an existing logical-model mapping show a dedicated model icon before the compact `…`
action control. Its rear square is gray and its front square blue. The icon links directly to the
logical model; a second tooltip line explains the click action. If several models are linked, the
most recently updated one opens. The tooltip confirms the link independently of mapping status
and closes immediately when the pointer leaves the icon.
The model overview displays each change timestamp with both date and local time.
The physical snapshot card in the mapping graph identifies the scope's Data Owner, displays its
data-source-type icon, and shows the full canonical catalog path alongside its pinned revision.
Mapping edges are measured from the rendered connector centres, so they remain attached when the
snapshot card grows with additional metadata.
`Datenquellen` is a first-level navigation item between `Meine Datenprodukte` and
`Domäne und Terminology`; the explorer uses the same server, PostgreSQL, database, schema, table
and view icons as the DAAIF source tree.

The direct physical-first action uses an unambiguous, already governed domain in the source scope;
it never infers a domain from technical names. Its fields record an explicit provisional no-match
for I14Y and remain editable before review. A model can subsequently link any number of versioned physical representations from
the mapping workspace. Its canvas context menu opens a source/object picker with
structure inspection. All representations appear together; unique case-insensitive exact names
create local draft links even when types conflict. Ambiguous names remain manual.
**Entwurf speichern** atomically persists memberships and mapping drafts; a representation with
no links survives reload. Type conflicts remain visible and cannot pass strict validation. A physical model is
a mapping-capable table/view or Parquet structure imported from a data source. The deterministic fixture source contains
`logistics.vehicle_inventory` and `hr_core.public.org_unit`; a real connector reads only
`information_schema` and `pg_catalog` when its server-side secret is configured. No database
credentials or data rows are accepted by the browser or modelling APIs.

The conventional editor and the mapping workspace share one Angular field-characteristics
component. Logical-first presents the fields as a compact selectable table with add/remove actions;
the alternative `Relation` view contrasts each logical field with its physical binding. Selecting
a row opens every field characteristic in the persistent editor on the right. The mapping workspace
uses the same editor beside its graph or mapping table, so editing type, length, cardinality,
classification, descriptions and I14Y links no longer interrupts mapping work. Physical-first
prefills every technically justified value from the pinned snapshot while business semantics remain
explicit user decisions. The model-level section remains `Model Merkmale` on `Modellebene`. Context help has no separate information icon:
hovering or focusing the field title opens the tooltip above it and repeats the covered title; it
closes as soon as the pointer leaves that title. Opening another field help first closes the
previous tooltip, so contextual explanations never accumulate over the mapping workspace.

The logical-model detail page keeps its title above three tabs: `Status & Klassifikation`
contains the saved metadata summary, publication readiness, version history and exports;
`Model Merkmale` contains the DCAT-AP-CH and organization form; `Logische Entitäten und Felder`
contains the field table and editor. The same form instance retains unsaved changes when tabs
change. New models open on model characteristics; existing models open on status.

The mapping graph now uses compact cards and an initially 570 px canvas beside the persistent field editor.
Selecting a graph field places the text cursor in the editor's first input, `Entität`, once the field is shown.
Connections can be removed while older mapping revisions stay in history; logical fields can also
be removed from the editor. On a graph field, right click or Shift+F10 opens actions for editing
field characteristics, adding a connection, removing an individual physical link, or removing the
logical field. These mutations require a Data Owner or Data Steward assignment in the model's
organization scope; the API enforces the same restriction. Saved removals create versioned
successors, while removing a local draft link stays local. A model that has ever been linked to a physical representation may be
saved with an unbound logical field, but DaCa rates that field as an **Inkonsistenzfehler**. A
PostgreSQL issue record creates a personal Data Owner task. The owner must accept the error with a
reason or assign investigation to an eligible Data Steward. Adding a physical mapping or removing
the field resolves the issue and completes open tasks. A model created purely logically, without
any physical binding, remains valid. Journey 13 and the dated, tagged static documentation article
show this workflow with interface images.

The sample PostgreSQL database contains quoted table `VIBDBU`: all 47 fields from
`tests/VIBDBU.csv`, column comments, and exactly 1'000 deterministic, semantically plausible Swiss
building records. Its released migration creates those rows in every environment. The catalog seed
also persists the matching credential-free structural snapshot, so `SAP VIBDBU Gebäudebestand` is
immediately browseable after a deployment: open it as Mirjam Keller, select
`daca_sample.public.VIBDBU`, open the table context menu and derive the logical model directly into
the mapping workspace. Only structure and comments are copied into the catalog snapshot; rows
remain in the sample database.

The S3 adapter lists configured objects and reads only embedded Parquet schemas. It can point at
the same S3-compatible store as DAAIF without making DAAIF a runtime dependency. Configure
`DACA_PHYSICAL_S3_ENDPOINT_URL`, `DACA_PHYSICAL_S3_BUCKET`, `DACA_PHYSICAL_S3_PREFIX`,
`DACA_PHYSICAL_S3_ACCESS_KEY_ID`, and `DACA_PHYSICAL_S3_SECRET_ACCESS_KEY` on the Catalog API.
For the local MinIO fixture, write the deterministic Parquet object with
`uv run --project services/catalog-api daca-s3-fixture-seed`. Searches under **Bestehende Datenquellen**
run solely against the already imported catalog metadata in PostgreSQL.

The federal modeling scope is imported from a checked, hashed Staatskalender snapshot. The
validated hierarchy contains the Federal Chancellery and seven departments, including
`VBS → Bundesamt für Rüstung armasuisse (20005536) → armasuisse Immobilien (20053180)`.
At runtime the UI reads this hierarchy exclusively from PostgreSQL. Run the offline validation or
explicit import with:

```powershell
uv run --project services/catalog-api daca-federal-org-import --check
uv run --project services/catalog-api daca-federal-org-import --apply
```

TERMDAT search uses its official public API in two phases: summary search followed by targeted,
parallel language-detail requests for the returned entry IDs. Website-only, in-progress entries
are not represented as public API results. DeepL Free is optional and server-side only. Set
`DACA_DEEPL_API_KEY` to enable translation. Only `unclassified` text may leave DaCa, existing
translations are never overwritten, and accepted machine/TERMDAT suggestions store version-bound
hash and source provenance. TERMDAT reuse licensing is not stated unambiguously enough for a
production decision; production use requires confirmation from the Federal Chancellery.

Journey 10 uses Mirjam Keller (Data Steward, armasuisse Immobilien), Daniel Wenger (primary owner
of the `Immobilienmanagement VBS` domain) and Eliane Rossi (delegated deputy). Submission creates
an immutable review snapshot and owner task; acceptance publishes immediately, while rejection
requires a comment and creates a `changes_requested` successor for the submitting steward.
The guide calls this journey **Logisches Datenmodell erfassen**: Mirjam enters exactly one logical
model in `/models/new`, adds entities and fields manually, and publishes it through domain review
without a physical source or mapping. Journey 11, **Logisches Modell von physischer Repräsentation
ableiten**, immediately follows it in the guide. Christian Man (or Christiano Stadello) opens the
seeded VIBDBU source, checks its 47 structure fields, derives a technical draft from the table
menu, reviews the pinned direct mappings, and completes the domain semantics. Repeating the same
table/snapshot derivation returns the same model. Journey links that specify a demo person now
perform a full local-session sign-in before the target page loads.
The demo-user selector also includes Giuseppe Starwars (Data Owner) and Thomas Wikinger (Data
Steward) in the parent organization armasuisse.

### Logical-model form, identifiers, and save errors

Every field label has a compact semantic-help icon. The icon appears only while the field or its
description has pointer or keyboard focus; its tooltip opens from the icon and follows the primary
browser language (`de`, `fr`, `it`, otherwise German). The DaCa-domain link opens the domain
register in a new tab. Department is mandatory; office, division, application name, and creator
type are optional. `Geheim` stays visible but disabled for new top-level classifications, so older
`secret` records remain readable.

An identifier is exactly one whitespace-free string and is reserved case-insensitively across the
catalog in PostgreSQL. The optional organisation-derived mode exposes a fixed organisation prefix
and an editable suffix; turning it off restores the manual value. A live availability check gives
early feedback, while the database reservation remains the atomic authority. A changed identifier
releases the previous value; active and retired roots retain their current reservation. Physical
derivations use their immutable source snapshot in the generated identifier so repeatable
derivations do not collide.

Saving shows actionable German feedback directly under **Als Entwurf speichern**. Invalid controls
are transparent red and every linked error entry focuses its control. A real ETag conflict alone
asks for a reload. Database-integrity errors contain a safe RFC-7807 code, suggested action,
field paths, request ID, SQLSTATE category/constraint, timestamp, and **Copy Error Message**;
they never expose SQL, values, or stack traces. I14Y links, primary Concept, and CodeList are
initially empty, optional, and each has its own **Zurücksetzen** action.

I14Y Concepts are a read-only cached reference source. A full refresh is never triggered on UI
startup; run it explicitly as a scoped modelling persona:

```powershell
curl.exe -X POST `
  -H "X-DaCa-User: cinthya.thor" `
  http://localhost:8001/api/v1/i14y/concepts/sync
curl.exe -H "X-DaCa-User: cinthya.thor" `
  http://localhost:8001/api/v1/i14y/sync-status
```

The sync verifies the current official OpenAPI document, uses its `PROD` server, pages Concepts
with bounded concurrency, and retains the previous complete cache on failure. Automated tests use
the checked, sanitized real-response fixtures and do not call the live service. DCAT-AP-CH and
SHACL exports are available from each logical-model version in Turtle and JSON-LD.

The architecture, roles, three demo journeys, namespace bindings, fixture provenance (including
retrieval timestamps plus original and sanitized-file hashes), targeted Concept/CodeList sync
commands, and mapping/drift semantics are documented in
[`docs/logical-models-i14y-mapping.md`](docs/logical-models-i14y-mapping.md). Because DAAIF is a
separate repository, add Christiano Stadello there through the validated external helper:

```powershell
uv run python scripts/seed_daaif_christian_spider.py --repo <daaif-repository> --check
uv run python scripts/seed_daaif_christian_spider.py --repo <daaif-repository> --apply
```

With the Catalog API and UI running locally, the three modeling journeys can be repeated in a
real Microsoft Edge instance. The harness exercises logical-first, physical-first, and
existing-to-existing workflows, including role switching, keyboard-only drift resolution,
reload persistence, the 390×844 matrix layout, and optional evidence captures:

```powershell
npm run test:ui-regression -- `
  --base-url http://127.0.0.1:8080 `
  --screenshot-dir output/ui-regression
```

`npm install` configures the versioned `.githooks/pre-commit` hook; run `npm run setup:git-hooks`
to configure it again explicitly. The hook runs `npm run test:ui-regression` before every commit.
The GitHub **UI regression** pull-request check runs the same command against Compose. It uploads
screenshots only on failure and retains them for three days.

### Personal profile and cross-organization modeling

The signed-in name in the header opens `/profile`. The page shows the person's portrait (or
initials), primary organization, email, active server-backed modeling assignments and other
application roles. It maps each modeling role to the actions available in its organization scope.
The profile is absent from the main navigation; the header name is its only entry. Sign-out is
available on the profile page only. A visitor without a local session sees the demo-person picker
before any DaCa page is rendered.
Christiano Stadello and Christian Man retain their Verteidigung roles and also have Data Steward
assignments in `VBS / armasuisse Immobilien`. They can create and derive VIBDBU logical drafts and
edit their mappings. Their additional role also permits structural metadata management there;
publishing still requires the named owner or delegated deputy of the specific model.

## Exercise the control plane

Historical PoC catalog registrations, directed grants, sync intent, deployment observations, health history,
and audit events are available under `http://localhost:8002/api/v1`. Mutations require the local
`X-DaCa-Actor: demo-control-admin` header. A sync configuration can be enabled only when an
approved matching directed grant exists; the configuration does not transfer resources.

## Test the protected REST product

Allowed:

```powershell
curl.exe -H "X-DaCa-User: kanton-st-gallen" http://localhost:8080/sample-api/api/v1/estv/tax-statistics
```

Denied (`403`):

```powershell
curl.exe -H "X-DaCa-User: kanton-bern" http://localhost:8080/sample-api/api/v1/estv/tax-statistics
```

Missing identity returns `401`; an unavailable or undefined OPA decision returns `503` without
reading the data table.

## Test direct PostgreSQL enforcement

The seed credentials are development-only and can be changed through `.env` before the first
volume initialization.

```powershell
$env:PGPASSWORD="daca_sg_dev"
psql -h localhost -p 55432 -U "kanton-st-gallen" -d daca_sample -c "select * from tax_statistics;"
```

The denied user receives no rows:

```powershell
$env:PGPASSWORD="daca_bern_dev"
psql -h localhost -p 55432 -U "kanton-bern" -d daca_sample -c "select * from tax_statistics;"
```

Forced RLS finds no matching PostgreSQL entitlement. Neither consumer is a table owner,
superuser, or `BYPASSRLS` role.

## Development checks

```powershell
uv sync --all-packages
npm ci
npm run build
npm test
npm run lint
```

## Release version management

The root [`VERSION`](VERSION) file is the sole DaCa release-version source. The version command
keeps the first-party Node and Python package metadata and lockfiles, service runtime constants,
the shared UI version constant, focused OpenAPI documents, and OpenShift image pins synchronized.
Do not edit those derived release surfaces individually.
Release 0.3.2 lists domain exploration, Views, Mapping, Lineage and ROHS CPS improvements in the catalog feature
history; previous release notes remain searchable there. The control plane shares the version
without presenting catalog-only changes as its own features.

Validate the repository before CI/CD builds or publishing images:

```powershell
npm run version:check
```

Prepare a release with a strict `X.Y.Z` version. The command first refuses an inconsistent
repository, then updates all managed surfaces and validates the result:

```powershell
npm run version:bump -- 0.3.4
```

The footer version information in both web applications opens a
short, plain-language summary of the newest release. The link in that popup opens
`/settings/features`, where users can search the tagged release history by feature or topic.
When a new Angular PWA build is ready, Catalog and Control Plane automatically open the DAAIF-style
update dialog once per build. It shows the current and target versions, warns that unsaved page
content will be lost, offers the target release notes and links to the feature list. Users can
apply the update with a full reload or leave their current work open and update later from the
footer version controls.
The settings icon beside the theme control opens `/settings` and its DAAIF-style submenu with
personal language settings, appearance, and the feature list. Tenant language settings are absent
because DaCa has no tenancy. Both the settings and day/night icons show translated hover/focus
tooltips. Language and appearance choices on these pages use the same browser-or-profile
confirmation as the header controls. The archive contains the published versions verified in
the `VERSION` history from 0.1.1 onward; numbers that were never released are omitted. Simulated
behavior is identified on the page. The displayed version is bound to the shared release constant and
covered by `version:check`.

After the complete GitHub test suite and the PostgreSQL 17/18 compatibility jobs pass, CI builds
all five first-party Linux images and publishes each component to its own Docker Hub repository:

```text
svabra/tib-daca-catalog-ui
svabra/tib-daca-catalog-api
svabra/tib-daca-control-plane-ui
svabra/tib-daca-control-plane-api
svabra/tib-daca-sample-data-product
```

Each repository receives `sha-<commit>` on every successful non-PR run and the exact release
version, for example `0.1.1`, only when `VERSION` changes on `main` or a matching `v<version>` Git
tag is built. No mutable `latest` tag is published. The repository secret `DOCKERHUB_TOKEN` must
contain one Docker Hub personal access token with read/write permission. The optional repository
variable `DOCKERHUB_USERNAME` defaults to `svabra`; account passwords and email addresses are
never stored in the workflow.

The persistent data model for the catalog, control plane, and protected sample product is in
[`docs/data-model/`](docs/data-model/README.md). DAAIF is treated as an external source; the
documentation covers only the publication and workflow evidence stored by DaCa. After changing
SQLAlchemy models, Alembic migrations, persisted JSON structures, PostgreSQL roles, functions, or
RLS policies, regenerate and verify the model documentation:

```powershell
npm run docs:data-model
npm run docs:data-model:check
```

The second command is part of the root `npm test` pipeline and fails when generated tables,
columns, relationships, constraints, migration heads, or protected PostgreSQL objects drift.

These root commands build/test both Angular workspaces and all Python services; `npm test` also
runs both reviewed Rego suites with the pinned OPA image. `npm audit --omit=dev` reports no
production dependency vulnerabilities at the time of this implementation.

Architecture and PBAC details are in `docs/architecture.md` and `docs/security/pbac.md`. The
combined component, PBAC, WSO2, PostgreSQL projection, and request-activity diagrams are in
`docs/architecture-pbac-diagrams.md`. The root `AGENTS.md` is the AI capability harness and records
the central-catalog boundary and security invariants.

## OpenShift presentation deployment

The RHOS presentation profile uses the existing PostgreSQL service and credentials in
`daai-brs-d`. It isolates Catalog and policy-projection data in the `daca_catalog` and
`daca_sample` schemas of `evo1_oltp`; DaCa deploys no PostgreSQL, pgAdmin, PVC or database
service. The dedicated-database and role model remains the default outside this explicit PoC
profile. Apply the four application-only workloads as described in [`k8s/README.md`](k8s/README.md).
DAAIF publishes metadata internally to
`http://daca-catalog-api:8001/api/v1/metadata-publications`.

### Additional representations and S3 demo object

On a mapping canvas, right-click the blank canvas or
logical model header, or press Shift+F10. Select a visible source and imported table/view/Parquet
object. The dialog and source explorer share metadata-only inspection. Adding remains local until
**Entwurf speichern**. Reopening the picker preserves local changes; leaving the workspace asks
before discarding them. Each mapping retains its own immutable snapshot; the drift tab uses the
selected representation. Existing organizational write boundaries apply to the picker and API.

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
**Darstellung dieser Physischen Repräsentation/Deklaration löschen**; this hides its drawing and connections
without deleting bindings or mappings or creating an unsaved draft. Selecting it in the
representation list restores the card. Layout and visibility survive Graph/Table/Drift switches
within the workspace; they reset when the workspace is reloaded. New representations are added
through the blank-canvas or logical-header context menu (also Shift+F10).

`daca-s3-fixture-seed` writes only `vehicle_inventory_mapping_demo.parquet` below the configured
S3 prefix (creating the configured bucket if absent), with three synthetic vehicles and five uppercase fields. It leaves the original
`vehicle_inventory.parquet` and other objects untouched. Repeat the command to reset this demo
object, then reimport the S3 source's structure through **Sichtbare Datenquellen**. Footer row
count, size, types, precision/scale and nullability are inspectable without loading data rows.
Fresh offline seeds derive this demo object's metadata from the same Parquet generator.

For an already running S3 store on another Docker network, the optional overlay connects only
DaCa to that existing network (no new S3 service):

```powershell
docker compose -f compose.yaml -f compose.s3-existing.yaml up -d --build catalog-api catalog-ui
docker compose exec -T catalog-api uv run --no-sync daca-s3-fixture-seed
```

The overlay defaults to network `daaif_default` and endpoint `http://minio:9000`.
Override `DACA_EXISTING_S3_NETWORK` and the existing server-side `DACA_PHYSICAL_S3_*` settings
for another store. Credentials never enter the browser or catalog API payloads.


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
