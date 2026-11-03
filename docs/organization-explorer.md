# Start-page organization explorer

The canvas extends to **960 × 740 world units**, leaving 182 units below the unchanged focused
organization boundary (bottom y=558). This fits a full 120 × 84 external card footprint and
its eight-unit floating margins. Bottom anchors can be dragged, moved with arrow keys or in
groups, saved explicitly and restored after reload, including fullscreen. SVG viewBox, HTML
positions, drag/selection constraints, measurements and fullscreen aspect ratio share the new
height. Rendered card/heading sizes and their world positions remain stable; existing anchors
are not rescaled or migrated. The expanded strip does not allow external cards into the blue
boundary. The existing profile DTO already accepts these coordinates; no JSON key or schema
version changes.

Context-menu destinations open in the current view by default; their new-tab icon appears
only while Control is held. Organization drill-down, home and overview are native links:
normal clicks retain in-canvas navigation, while Control-click opens their exact scoped URL.
The separate permanently-new-tab entry is replaced by a normal current-view link for the
focused node. Organization/domain searches are ordinary router links. Domain visibility and
the hide-unrelated toggle remain local commands and never receive a new-tab affordance.

BIT has a display-only Easter egg keyed by stable organization ID `efd-bit`: Control + hover
reveals three to four fine yellow SVG bolts behind its card, protruding beyond the
edges in a compact 8% perimeter. Four staggered channels alternate eight short branching
shapes in a 0.48-second cycle; each bolt snaps off after about 0.2 seconds before its
replacement appears. The mask's inset matches that smaller perimeter, and its rear layer keeps the card
interior and text clear, including the bolt glow. Bolts use a 1.2-unit stroke and restrained
0.5px/1.5px glows for a fine line. It works for office/satellite cards, the
focused BIT heading and fullscreen. The decoration is pointer-transparent and hidden from
assistive technology. It follows the card without intercepting selection, dragging, tooltips
or shortcuts, and never modifies saved/draft positions. Key release and window blur/visibility
loss clear the modifier state; pointer movement resynchronizes it and hover exit hides the bolts.
Reduced-motion preferences show four static bolts instead of animated discharges.

External organization cards (for example St. Gallen while exploring EFD) must stay outside the focused organization's rectangle. The rendered boundary, automatic optimizer, single-card pointer/touch and keyboard constraints, and group-movement acceptance share the same geometry. The full 120×84 reserved card footprint plus eight world units of floating clearance must fit outside at least one side. A single-card move is projected to the nearest feasible perimeter position; a group move that would cross the boundary is rejected as a whole to preserve relative spacing. The bottom strip cannot fit the reserved footprint and clearance, so overlapping bottom positions use another feasible side. These rules apply at every focused hierarchy level and in fullscreen. Previously saved overlapping satellite anchors are corrected only in the rendered view; loading, navigation and discard do not write a profile or dirty the draft. Explicit layout Save continues to use the existing revision checks and scope keys.

Data-highway packet flights now start and finish beneath the opaque source and target cards, instead of stopping at or before their visible borders. A shared 36-unit overlap covers the packet head, halo and 28-unit trail before the animation loops; smaller organization cards use an inset rectangle near their center. Lineage retains its routed visible path, while the data landscape retains exact subcurves of its ribbon. Three-second flight duration, direction, packet counts, reciprocal lanes, title clearance and saved layouts are preserved.

The shared native-SVG data-highway skin (`shared/data-highway.css`) is also used by Lineage & provenance. Extracting the visual rules preserves organization curves, packet counts, spacing, reciprocal lanes and private layout anchors.


The placement exclusion below the focused organization heading now follows the measured title, description and count block instead of a fixed 160-unit rectangle. The free strip immediately below the visible text is available for organization cards and domains, individual drag/keyboard moves, group movement and automatic placement. ResizeObserver tracks heading wrapping and fullscreen changes; the active language/focus identifies each measurement. Existing anchor origins, saved scopes and product relationships are preserved.

Ribbon connections now use one continuous cubic beneath both organization cards, eliminating the joins visible with diagonally offset organizations. The packet flight is an exact subdivision of that whole curve, clipped to inset points beneath measured cards. The band is slimmer (12 SVG units, with a 14-unit edge and 18-unit soft glow); the accessible hit area, packet spacing and three-second transit are retained. The focused organization area has a pale-blue background. Decorative ribbons extend underneath organization cards with flat ends, while packet flights start and finish underneath the measured cards and title text stays clear. Each ribbon has a gentle blue-white-blue gradient, and packets carry a tapered 28-unit fading tail aligned to travel direction. These treatments also apply in fullscreen and reduced-motion mode; dark mode uses the existing theme surface for the gradient highlight. Organization-to-organization relationships now use the selected **Lichtband** data-highway treatment: a softly glowing, translucent blue ribbon, a fine center spine and smooth cubic bends. Bright circular packets with short fading tails follow the actual curve at uniform path speed, taking exactly three seconds end to end. Reciprocal streams share one ribbon with separate offset lanes, and each distinct consumed product still contributes one packet. Successive packet heads now use an 18% phase gap and aim for at least 32 world units of separation on short paths (capped at 45% of a cycle and by the number of products), giving halos and tails more room without changing the three-second transit. A curve clearance check falls back toward a straight spine when a bend would cross an unrelated card or title. Domain assignments remain thin and dashed. Existing catalog evidence, private anchors, tooltips, navigation and accessible counts are preserved; reduced motion displays stationary packets along the same curve.

The data-landscape visibility controls sit in the upper arrangement toolbar, before fullscreen: **Orgs ohne DP-Beziehungen ausblenden** precedes the standard **Domänen** toggle. The relationship filter starts on (Domains remains off) and hides inner cards, satellites and overview peers only when both aggregated offered and consumed product counts are zero. Captions are compact/localized without terminal punctuation. The redundant unsaved-arrangement label and top rectangle-selection instruction are omitted; Save/Discard state and all selection interactions remain available. Producer-only and consumer-only organizations remain visible. The shared tooltip explains this rule, and organization/domain context menus expose the same checked option with keyboard navigation. The focused organization, breadcrumbs and independent domain layer remain available. This display-only filter neither reloads catalog data nor changes saved/draft anchors, permissions or product counts; switching it off restores hidden cards. Controls wrap on narrow screens and remain available in fullscreen.

Organization cards now reuse the semantic-canvas visual language: 2px corners, a white/theme surface, subtle shadow, navy left stripe, type icon/caption, organization name and two labelled product-count rows. German count labels are abbreviated to **angebotene DP** and **konsumierende DP** across organization cards, while tooltips and accessible descriptions retain the full terminology. Inner and outer cards use the same `OrganizationCardContentComponent`; canton prefixes and count headings are localized in all five UI languages. The existing actor-visible offered and consumed counts remain distinct, and tooltip/accessible descriptions keep their locale-aware singular/plural forms. Empty organizations retain muted text/borders on the ordinary surface while the type stripe identifies the object kind.

Organization layout slots reserve a 120×84 world-unit footprint for clearance, while visible cards fit their content with 6px top/bottom padding rather than scaling a fixed height in fullscreen. Measured card sizes drive connection endpoints; a ResizeObserver follows card reflow and font/language changes. The stage scrolls locally below 960px. Automatic placement first tries irregular scatter, then obstacle/card-boundary slots around the heading, then a scrollable dense-layout fallback using both title-side wings. Domain grouping uses the actual scrollable content height, and relationship ports, selection bounds and satellite routing use the new card dimensions. Persisted anchors keep their existing coordinate frame and are not overwritten; users can explicitly auto-arrange older dense layouts. Domain bubbles remain round. Shared type colors are defined centrally in `packages/design-system/src/styles.css`, with brighter corresponding dark-theme tokens.

The local Compose Catalog UI/API now run 0.3.3 on localhost:8080 / localhost:8001. The organization-flow browser check reads the actual CSS animation period (3000 ms), checks playback rate 1 and compares animation progress to elapsed browser wall time. External PoC rollout/publication is still deferred.

Rectangle selection shares `CanvasSelectionDirective` with the domain, terminology and Mapping editors. Drag blank stage space around whole cards, then drag one selected card to move the group. Shift/Ctrl toggles individual cards or adds a rectangle; Ctrl/Cmd+A selects displayed objects, arrows move a group and Escape cancels a gesture or clears selection before exiting fullscreen. Office, satellite and domain anchors retain their coordinate frames; common-delta bounds and heading exclusion preserve group spacing. All visible anchors are pinned at the first actual group movement so automatic placement cannot move unselected cards. Selected organizations pause floating locally; Save/Discard/Auto-arrange use existing personal scope storage and revision checks. Selection itself is transient, cleared on actor/scope change and never saved. Read-only/busy layouts cannot be moved; menus, links and connection ports retain their ordinary behavior.

Organization tooltips show the localized office name once. A description equal to that name after Unicode, whitespace and case normalization is omitted; genuinely additional description text remains. This rule applies to all five UI languages.

For reciprocal flows beside personal anchors, automatic placement first repairs a connected card overlapping a saved position, then minimizes relationship lengths. Saved anchors remain fixed; visible travelling points are checked against real card hit areas in the browser.

Verteidigung and armasuisse now exchange two distinct synthetic catalog products: armasuisse supplies **Schützenswerte Gebäude – armasuisse** to Verteidigung; Verteidigung supplies **Gebäudenutzungsbedarf der Verteidigung** (`urn:daca:ch:verteidigung:building-use-demand`) to armasuisse. The demand product reuses Data Owner Lawrence Hill, deputy Hong An Captain, consumer Giuseppe Starwars and the Verteidigung domain. One point travels in each direction on the same connection, with a small lane offset for visibility. A separate additive marker includes the reverse fixture in the Catalog API image startup seed, including upgrades of already seeded PoC databases, without overwriting either product or creating access grants.

Organization context menus in the data landscape offer **Alle Datenprodukte der Organisation anzeigen**. The action opens expert search with canonical `organization=<id>&kind=product`, without a name query or an active-only restriction. Existing centralized scope matching includes readable offered/consumed products and subordinate units; an organization without readable product references has a disabled action. Domains start hidden and can be enabled explicitly with the standard toggle or the assigned-domains context action; personal domain anchors are retained.

The PoC catalog includes **Schützenswerte Gebäude – armasuisse** (`urn:daca:ch:armasuisse:protected-buildings`). Existing Data Owner Giuseppe Starwars and deputy Thomas Wikinger provide the synthetic product in Immobilienmanagement VBS; existing Christian Man in Verteidigung consumes it. This creates the directed armasuisse → Verteidigung organization connection and one travelling point. The additive seed is part of `daca-catalog-seed`, which the Catalog API Docker image runs after migrations and before serving on every rollout, including existing databases. Its one-time marker preserves later edits and retirement. Catalog consumption metadata creates no endpoint, access policy or live access receipt.

Organization relationships carry one electron-like point per distinct source data product from `sourceId` (producer) to `targetId` (consumer), including opposing lanes for reciprocal exchange. Connections have no arrowheads. Existing solid relationship lines and dashed domain assignments are preserved; domain assignments carry no packets. All streams use a constant 3-second transit, with successive points separated by 0.225 seconds (or evenly spaced when the train fills the entire connection). Thus two consumed products form a visible two-point train, not a faster one-point stream or an arbitrary density scale. CSS handles movement and halo/core pulsing without a JavaScript frame loop. Repositioning, drill-down and fullscreen reuse existing measured ports.

The transparent 16-unit connection hit area opens the shared tooltip on hover or keyboard focus. DE/FR/IT/RM/EN copy explains that one point represents one consumed product, not live requests, bytes or access proof. Inferred relationships retain dashed styling and an explicit inferred label. Empty office-field space allows pointer events through while cards remain draggable. Reduced motion disables travel and pulsing, retaining distinct static points and tooltips, without arrows. Flights start/end just outside card edges with drift clearance, so points do not spend part of their journey behind opaque organization cards; direct focused-organization relationships still attach to the title perimeter. Unit and `organization-flow` browser tests cover exact counts, successive spacing, constant speed, both directions, no arrows, shared tooltips, fullscreen and reduced motion.

The idempotent `estv_sg_seed` adds `urn:daca:ch:estv:municipal-federal-tax-indicators` (**ESTV – Gemeindekennzahlen zur direkten Bundessteuer**), with existing Data Owner Kassandra Valdata, deputy Ariane Keller and consumers Beat Stalder/Sarah Brunner in St. Gallen. It shares the existing ESTV tax-statistics domain assignments. Together with the original published-policy example, St. Gallen consumes two distinct ESTV products, despite multiple people/evidence. The graph deduplicates product URNs per directed organization pair across catalog usage, policies and lineage. No endpoint, policy publication or live access evidence is fabricated; provenance/audit records identify the synthetic one-time fixture. Restart/seed does not overwrite edits or retirement.

Domain bubbles in the data landscape can be positioned with pointer/touch dragging or arrow keys, including fullscreen. Movement creates a personal draft, pauses drift while dragging and follows the existing explicit Save / Discard / Auto-arrange actions. Toggling the domain layer retains anchors; dropping a moved link does not open domain details. Normal clicks and context actions remain available.

The data-landscape organization and domain context menus open the expert search with canonical `organization` or `domain` URL filters. Empty scopes have disabled menu actions. The expert search owns filtering, supports filter-only deep links, shows the domain selector directly, includes organization results, and loads every readable product page. Actor-readable object references use explicit office assignments, subordinate units and catalog consumption; display names never determine scoped membership. See [expert search](expert-search.md).

The catalog language picker now includes Rumantsch Grischun (`rm`). Central UI text and data-landscape actions/counts are localized; recorded object names and legacy editor copy retain their documented fallback. Organization supply/consumption, domain tooltips and accessible labels share locale-aware cardinal forms. See [localization](localization.md) for coverage, fallback and persistence semantics.

When an organization has no child offices, its explanatory notice appears below the graph, keeping long localized supply/consumption counts and domain bubbles clear.


Organization, Mapping, domain and terminology canvases share compact action styling (32px desktop, 44px touch), wrapping action groups and a fixed, labelled fullscreen exit at the top right with an Escape hint. Domain automatic arrangement now sits next to save/discard, and terminology automatic arrangement sits next to shared-layout save/discard. Mapping retains its draft-save action; terminology business submissions remain separate from shared layout publication. Domain and terminology fullscreen use the same native/full-viewport fallback behavior as Mapping: Escape, explicit close, browser fullscreen changes and destruction restore page scrolling and focus. Nested menus/dialogs consume Escape before the canvas exits, and Tab focus stays inside the fullscreen canvas. A denied native entry or failed exit cannot leave the page scroll-locked. No save, permission, proposal or persistence semantics are changed.

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

Connected organizations outside the focused area now use normal ink, a light surface and a blue border. Unconnected satellites remain gray. Connections in either direction, including subordinate units, count; individual canton cards show a small localized “Kanton” prefix.

When focused on a leaf organization such as St. Gallen, relation endpoints project to that
organization's center before considering any external ancestor-group satellite. This keeps
incoming/outgoing threads attached to the focused canton rather than the Kantone group.

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
authorization and directory membership still come from the existing read-only API. Navigation itself changes no organizational metadata or permissions; the independent private-view endpoint stores layout anchors only.


The Neuchâtel welcome motif now uses a bright daytime photograph with the castle, collegiate church, lake and green foliage. The former yellow sunrise horizon is replaced. New `swiss-neuchatel-summer-daylight-*` URLs provide responsive 960/1600 px AVIF/WebP images and avoid stale cached copies; theme rotation and welcome layout are unchanged. Source and attribution are recorded in `docs/image-credits.md`.


Enabled domains appear as round bubbles among the floating organizational rectangles. Both
types share collision-separated placement; domain bubbles retain their detail links, shared
tooltips and offer counts. The layer can be switched off again.

The welcome section retains its original typography, spacing and size above the explorer.
The explorer is titled **Datenraum der Schweizer Verwaltung und der bundesnahen Betriebe**.
Dismissal, shared tooltips, Settings / Home page and floating organization rectangles remain available.

The close control and organization cards use the shared `TooltipDirective`; the close tooltip
explicitly names Settings / Home page as the restoration path. Home-page configuration has its
own settings section, separate from theme selection. Department containers and all organization
cards are rounded rectangles. Inner offices use stable, collision-separated irregular anchors
with independent 14-22 second drift; outside cards float with their own phases. Hover/keyboard focus
pauses each card, and reduced motion stops both layers. No grid is used for office placement.

The start page keeps catalog search in a right-hand column and uses the left-hand area for
an organizational canvas with personal saved layout anchors. The photographic welcome introduction uses its original dimensions and
optional. Its close button opens a native confirmation dialog; cancel and Escape retain it.
Confirmation hides only that introduction. Search and canvas stay available.
Settings → Home page offers **Willkommensbereich wieder anzeigen**. This is a per-person,
browser-local preference (`daca.preference.<user>.welcome-intro`, `shown` / `hidden`), with a
visible session-only fallback when storage is blocked. It does not alter the profile JSON.

## Data and scope

`GET /api/v1/organization-network` requires the existing active demo/session identity and sends
`Cache-Control: no-store`. It derives a graph from active administrative organizations, valid
primary memberships (or federal directory scope when there is no primary-membership history),
and active external directory entries. No department is guessed for an unassigned person.
The home container is the person's department/chancellery; office cards use the stored parent
hierarchy; legacy office rows without a parent use their trusted registry department code.
Clicking a card dives into subordinate units. Breadcrumbs and Home navigate back.

The scoped operator fixture `organization-explorer-estv-bi-v1` adds `efd-estv-bi` as an
`affiliated` PoC unit under ESTV, named **Business Intelligence**. It grants no membership or
modeling/access role. The committed marker preserves later edits/removal/inactivation.
Existing installations can apply it with:

```powershell
docker compose exec -T catalog-api uv run --no-sync python -m daca_catalog.organization_network_seed
```

Small offer counts aggregate **active, discoverable-to-the-current-person products** through
their trusted Data Owner organization and ancestors. Draft/deprecated/retired products do not
count; private product authorization uses the existing product visibility guard. Counts do not
imply row access, a deployed policy or a request approval. A unit with no assigned offers shows 0.
Unconnected department/chancellery registry nodes orbit as gray context cards. External context
includes cantons, SBB, Post, the registered ETH area, cantonal banks and further public entities.
External entries come from the directory; category bubbles can have no registered children.
The context grouping is not an ownership register and makes no claim about ownership shares.

Thin threads are derived from visible active products' existing `catalogUsage` consumer/share
metadata, published-policy recipients and known product-to-product lineage. Unknown/private URNs are not parsed to invent
organization mappings. Inferred lineage is dashed. Threads are catalog relationship evidence,
not access receipts or proof of executed data exchange. In particular, the existing synthetic
Neuchâtel corporate-tax product records ESTV consumers and therefore yields the requested thread.
This read projection creates no data exchange, lineage record, consumer identity, grant or policy. The separate Zeughaus fixture adds catalog metadata only.

## Interactions

Domain overlays are off initially and can be toggled on/off without mutating shared catalog
objects. They derive from active domain responsibilities and open the existing detail in a
native new tab. Related cantons become individual satellites so a relationship is visible
without first drilling into the cantonal group.

Right-click or Shift+F10 on a node or blank canvas opens grouped actions: explore here; open the same organizational
view in a new tab; search active data products by its code; show its assigned domains;
toggle the domain layer; return to the home department. Search is a text search, not an
authorization or exact organization filter. Menu arrows/Home/End/Escape support the keyboard.
Organization changes remain in the established governed workspaces.

Satellite drift stays within a few pixels, pauses on hover/focus, and stops under reduced motion.
The page stacks canvas/search on narrow screens, confines canvas scrolling to its viewport and
offers a plain organization list. Loading, retry and absent-unit states are explicit. Identity
changes clear the old graph immediately and cancel obsolete requests.

The introduction has one **Proof of Concept** badge. The adjacent credit uses the same current
participants as the version area: **V, armasuisse, ASTRA, ESTV und BIT**.

## Verification

Offering/consumption coverage checks distinct products across people, grants, active
lineage and organizational ancestors, plus privacy, pending requests and inferred-only
links. Component tests cover separate counts on cards, the focus summary, tooltips and
the accessible list in German and French. The browser flow compares St. Gallen,
Neuchatel and ESTV against the API and checks the count legend. Its isolated Edge
instance disables machine-installed extensions, keeping the application runtime-error
gate strict without treating injected extension failures as catalog errors.

The `recent-work` browser flow checks the current actor's real response, direct links,
empty states, identity isolation and mobile layout. When that actor has no qualifying
edits, a browser-only response fixture exercises all twelve rows using existing readable
objects; it creates no catalog history. Active terminology entries whose domains are all
retired are omitted, matching the terminology register. The `organization-explorer` flow
intercepts only the personal placement read with an empty configuration to verify automatic
placement independently of saved user anchors; `organization-layout` verifies persistence.

620 frontend tests pass (614 catalog, 6 control plane), including overview navigation,
context-group drill-down and full-canvas card/domain placement. Three PostgreSQL API tests cover hierarchy/counts, the existing
Neuchatel relationship, private/inactive-product exclusion, expired primary scopes, auth
and idempotent unit provisioning. Production images build successfully.

`npm run test:ui-regression -- --flow organization-explorer --screenshot-dir output/ui-regression/organization-explorer`
passes against the local Compose runtime. It checks right-aligned search; confirmed
hide/cancel/reload/restore; EFD/ESTV/BI drill-down; domain toggles; keyboard/native new-tab
context actions; thin relationship threads; dark theme; reduced motion; and a centered,
locally scrollable 390px canvas with a visible context menu. Captures are ignored runtime
artifacts in the specified output directory, not new catalog evidence.

The current browser flow also checks original welcome typography/padding, the exact Swiss
administration/bundesnahe Betriebe heading, the shared close tooltip/restoration hint, matching
rounded rectangle shapes, real motion of inside/outside cards, non-overlapping irregular office
positions, and reduced motion for both layers. The VBS layout is captured separately.

The browser flow now also checks all top-level cards with no central card or department frame,
round overview domain bubbles, projected cross-organization threads, canton drill-down, return
to the own area, and the `organization=all` deep link at 390 px with local canvas scrolling.

ASTRA terminology references: [French OFROU](https://www.astra.admin.ch/fr/), [Italian USTRA](https://www.astra.admin.ch/it), [English FEDRO](https://www.astra.admin.ch/en/contact-address-map). These are display fallbacks; imported multilingual registry labels remain authoritative.


The selected data-highway source and comparison are retained in `docs/mockups/data-highway/`: `reference-option-2.png`, `implemented-canvas.png` and `comparison.png`. Root `design-qa.md` records the visual refinement and completed browser checks. Run `npm run test:ui-regression -- --flow organization-highway --base-url http://localhost:8080 --screenshot-dir output/ui-regression/organization-highway` for curve-following, packet separation, 3000ms playback, tooltip, fullscreen, reduced-motion, dark and mobile evidence. The companion `protected-buildings` flow verifies the real seeded reciprocal exchange.

The follow-up tint, hidden ribbon caps, tapered tails and blue-white gradient are captured in `docs/mockups/data-highway/implemented-canvas-v2.png` and `comparison-v2.png`; the highway browser check additionally confirms that both decorative endpoints lie underneath their organization cards.


The `organization-heading-space` browser flow drags a card into the formerly reserved strip under the actual heading in DE/FR/IT/RM/EN and fullscreen, checks visible text clearance, and exercises save/reload against an in-browser layout fixture. It never writes a real catalog or personal layout. Evidence is retained in `docs/mockups/organization-heading-space/`.

Smooth/slimmer connection verification is retained as `docs/mockups/data-highway/slimmer-smooth-offset.png` and `smooth-offset-comparison.png`. The offset-card browser fixture checks a single continuous cubic, and motion samples are compared against the rendered ribbon itself.
