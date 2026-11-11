# Catalog documentation and responsibilities

The catalog entry is named **Datenprodukte** (French: Produits de données; Italian: Prodotti
di dati; English: Data products). Shell navigation, route/browser titles, page headings,
breadcrumbs and entry links use the same label. Relationship filters remain personal: the
initial selection is **Von mir angeboten** only if `matchesProduct(..., 'offered', actor)`
finds at least one product, otherwise **Alle Datenprodukte**. This uses the existing offered
relationship and does not expand ownership or authorization. Defaults follow asynchronous
catalog loading; supported `relationship` URL values and explicit user selections override
them. A manual selection is scoped to the identity and survives catalog refresh/search edits.

The [authorization audit](authorization-consistency-audit.md) distinguishes implemented object
checks from remaining legacy scope authorization. Product metadata edits require an active
concrete assignment. Owner/deputy decisions, private product visibility, lists, SLA and audit
use common ownership checks. Assigned stewards/deputy stewards can maintain operational text
metadata, not classifications or governance settings; four-eyes product workflows remain.
Publication decisions recheck current approver role, control-person assignment and independence
from all object owners. LDSD/ALDS mandates are now separately persisted for office domain-metadata editing, including
named deputies and confirmed people/scopes. Appointment UI and general office configuration
remain future work; see the updated governance information.

The static Information section now includes the supplied 19-activity RACI matrix and the
object-role/LDS/ALDS model in [object-governance-and-raci.md](object-governance-and-raci.md).
Its text search covers rendered article content and the matrix, normalizes case/diacritics and
offers reset/no-results feedback. Terms are also an object category in the responsibility views.
Migration `0042_object_governance` makes term ownership explicit and independent of domain
classification. Domain/term owner and deputy assignments govern those objects; the former
global register role is removed. This supersedes earlier descriptive-only wording for these
specific owner assignments. Other module authorization remains subject to its established checks.

## Navigation

The [expert search](expert-search.md) opens in context navigation and provides an alternative
focus list through large heading tiles. Both share the same search/filter state and an optional
hover/focus preview that can be pinned. Field results retain their source/table context; details
open the existing catalog routes. Search visibility follows the existing service read scopes.

Expert search retains the semantic search input and one translated, keyboard-accessible clear
button. Its browser-native cancel decoration is hidden to avoid duplicate clear controls.

Application glossary words use a light-gray wavy underline in the catalog UI, matching DAAIF's separate application glossary. Popup descriptions and detail links remain keyboard and pointer accessible.

The header information icon opens `/documentation`. Its four sections are User Journeys,
Static Documentation, DaCa Glossary and Animated Documentation. The former PoC guide journeys remain available at
their old deep links, while the main navigation points to the documentation hub.
Journey overview search matches title, summary, outcome, roles and tags; a selected topic tag further narrows the result. Tags belong to the DaCa journeys, while DAAIF presents its own separate stories. Existing deep links remain usable.

The DaCa glossary list and detail pages read only active terms from the dedicated
`site_glossary_terms` and `site_glossary_localizations` tables. They show ID, abbreviation,
localized term, short and detailed descriptions, and the explicit TERMDAT flag. The governed
business terminology stays in `glossary_terms` and its own localization, assignment and proposal
tables. Equal labels can exist independently in both stores; no terminology entry is imported
into the DaCa glossary merely because its label matches. The Catalog exposes the site glossary
read-only. Future editing and TERMDAT enrichment belong to the Control Plane, not to catalog
users; neither workflow is implemented yet.

The current application vocabulary is seeded with DaCa, role, domain, model, source, product and
role-protocol descriptions. Data Owner and Data Steward detail texts state tasks, authority and
accountability (AKV) within assigned scopes. The migration removes only known old UI seed rows
from business terminology when no governed relationship references them.

## Perspectives

`/settings/responsibilities` offers three views of the same read-only projection:

1. **Categories:** domains, logical models, physical representations and data products, with
   an object search, assigned people and related objects.
2. **People:** a role and object-count matrix with each person's assigned objects.
3. **Domains:** domain responsibilities plus related objects, their responsible people and roles.

The API combines existing persisted ownership and organization-scoped modeling roles with
additional rows in `catalog_object_responsibilities`. A physical table is identified by its
source and stable key, so a snapshot refresh does not change the assignment target. Direct
`physical_domain_assignments` connect a table to a domain before any logical model exists;
model-to-column mappings can add further table/domain links. The
projection filters products through the existing product visibility check and uses the same
catalog-readable source scope as the physical explorer. An additional responsibility row is
descriptive; it never changes API write permissions by itself. Authorization remains in the
existing domain, model, product and source workflows.

## Role-change protocol

`/settings/role-changes` displays the append-only `role_change_events` sequence. Migration
`0028_role_change_protocol` takes a clearly marked baseline of active assignments. PostgreSQL
triggers then capture changes to organization modeling roles, direct object responsibilities,
and owner/deputy fields on domains, dataset versions and data products. An advisory transaction
lock serializes writers before assigning sequence numbers. A separate trigger rejects update,
delete and truncate operations on the protocol itself. The API binds a validated local demo
actor to the database transaction; system and migration work are labelled explicitly.
The local fixture seed consults removal events before inserting a previously deleted seeded
modeling role or direct responsibility, and does not reactivate an inactive assignment.
Product fixture seeding likewise preserves owner/deputy changes recorded after the baseline.

The history endpoint reuses the responsibility projection's visible objects and the public
organization register before listing events, so an organization's last role removal remains
discoverable. It pages newest first with a sequence cursor. An event is descriptive evidence of a
change; it never grants a role or data access. The complete scenario and acceptance criteria
are in [UC: Änderung der Rollen](use-cases/role-changes.md). The accompanying User Journey is
`/documentation/journeys/overview-access-responsibility`.

## Glossary terms in the interface

`daca-glossary-word` is the reusable presentation component. A caller supplies a canonical
term and visible label. On first hover or keyboard focus, it requests the localized entry from
`/api/v1/documentation/glossary/lookup`; subsequent opens use the API service cache. A wavy
underline signals help, the popup shows only the short description, and its link opens the
complete glossary entry. `daca-role-term` maps stored role codes to canonical glossary terms,
so all three perspective views share the same tooltip and detail-link behavior. New interface
terms need a glossary row and a component placement, without copying tooltip text or URLs.
The popup remains open while the pointer crosses the small gap below its trigger (250 ms) and
while focus moves from the trigger to the glossary link. Leaving both closes it; Escape and an
outside click close it immediately. The component test covers the pointer transition and link.

Both APIs require a local session in the PoC. Demo identity and local sessions are not
production IAM.

## Animated platform overview

`/documentation/animated` is linked from the fourth hub tile. Both introductions describe
data becoming information, information becoming knowledge, and knowledge providing the
foundation for informed decisions. Six tall vertical layers are arranged horizontally:
sources -> raw data -> refinement (Veredelung) -> product -> data protection -> consumers.
Narrow screens retain that order in a focusable horizontal scroll region with visible scroll
guidance. HTML buttons provide localized headings, summaries and selectable explanations;
an overlaid native SVG contains the bucket, gears, routes, particles and consumers.

This is an illustrative platform flow, not live traffic or evidence of deployed access.
The platform processes and delivers data; DaCa centrally records metadata, responsibility,
lineage and policy. Product delivery remains HTTP/REST or PostgreSQL. The protection explanation
retains default deny and matching OPA/PostgreSQL revision confirmation. This view fetches no
protected data, changes no policies and introduces no persisted records or database migration.
S3 is an illustrative platform input, not an added product-delivery protocol.

### Collection, welding and protected distribution

`documentation-pipeline-animation.ts` defines one deterministic 26-second batch timeline.
Six differently colored particles originate at S3, files, databases and REST API, enter the
raw bucket, swirl briefly and follow distinct curved routes through refinement. Each makes
1.5 turns around the gear before changing to gold at its exit. Colors describe this
illustrative transformation rather than catalog classification values.

| Time | Product formation and delivery |
| --- | --- |
| 11.4-14.3 s | Gold points reach the product center `(840, 320)` serially, 0.58 seconds apart. |
| Arrival to 15.4 s | Each point expands over 0.25 seconds onto a 24-unit-radius orbit. The six positions are spaced by 60 degrees and share a 1.8-second period. No large product is visible. |
| 15.4-16.8 s | The ring rotates 360 degrees and contracts from radius 48 to 31. All points spiral inward together while the product underneath grows from radius zero to 29. |
| 16.8-17.6 s | A gold outward completion wave marks the finished product while it remains centered. |
| 17.6-19.6 s | The finished product travels to Datenschutz. |
| 19.8-20.45 s | The contrasting dark shield is attached. |
| 20.8-24.4 s | Three full-size shielded copies leave together, follow separate consumer routes and fade together. |
| 26 s | The next pass starts empty. |

Individual points stay visible after arrival and fade only during the final 0.35 seconds of
welding. SVG draw order places the growing product below the points so it cannot hide them
prematurely. Product growth begins at the common welding time, not at each individual arrival.
The ring joins its dotted stroke into a solid gold outline during the final 0.3 seconds of
welding; the completion wave begins only after the merged product is complete.

The product remains centered until 17.6 seconds. Its three consumer branches retain the full
29-unit product radius and completed shield, illustrating reuse of one protected product.
Secondary copies fade in over 0.25 seconds after departure; the curves separate visibly near
the origin. Source and consumer plates cover motion endpoints for natural entry and exit.
`sampleProduct` receives a consumer index independently of batch phase. Shared consumer
coordinates align route guides, destination plates and motion. The copies create no catalog
products, grants, records or live deliveries.

### Shared clock, empty start and deterministic replay

`DocumentationPipelineSceneComponent` manages one requestAnimationFrame clock outside Angular.
`sampleParticle`, `sampleProduct` and `sampleProductUnion` derive arrival, orbit, welding,
product growth, ring and wave state from absolute batch phase. The arrival stagger affects
collection but does not delay the common welding start. There is no independent CSS motion
or timer. The animator updates decorative SVG attributes rather than application data.

`PIPELINE_BATCHES` schedules one complete pass within the 26-second cycle. Future input phases
remain negative instead of wrapping into completed products. Initial load, seek to zero,
Restart and loop replay use the same empty start. No large product body is visible before
15.4 seconds, even though gold particles are already gathering. The target ring and static
source/consumer icons remain visible as context.

Pause and hidden tabs cancel the frame callback and freeze the complete scene. Resume
continues from the retained time; cleanup cancels callbacks on navigation. Reduced motion
renders the static zero-second frame, starts no frame loop and permits manual seeking.
Media changes are honored immediately. The selected explanation follows sources (0 s), raw
data (2.4 s), refinement (3.8 s), product (11.4 s), Datenschutz (17.6 s) and consumers (20.8 s).
Selecting Datenquellen pauses the overview and opens the Data Sourcing explanation below.
Selecting Datenkonsumenten or its detail action opens the consumer access-management
explanation. Other layer selections and Next pause for reading. Automatic explanation
changes are not an ARIA live region. Theme and localization use the shell.

### Layer emphasis and playback controls

Every layer reserves 4 px vertical and 9 px horizontal outer spacing. The active layer has
a 4 px outer frame at 55 percent theme-blue opacity and a blue title. Its interior uses the
same regular card surface as the other layers. Selection does not change layer geometry or
move the SVG. The frame transition takes 160 ms; reduced motion disables it. Keyboard focus
remains distinct.

The overview's source (01) and consumer (06) layer links show plain titles without decorative
entry arrows. Their anchors have no text decoration in normal, hover or focus states; the
two related overview detail-action links also omit decorative arrows. Native anchor
activation and the visible keyboard focus outline remain. This is local overview styling.

Restart resets moving objects, selected explanation and time display to zero and starts
playback; reduced motion retains a static frame. A labeled native range input exposes the
complete 0-26 second cycle in 0.1-second steps, with native pointer, touch and keyboard behavior.
The adjacent output shows localized current and total seconds. Desktop places label, slider
and time in one compact row without a surrounding card. The track is 3 px high, the thumb is
12 px and the inactive track uses the muted theme color for contrast. The fill follows the
reported scene position. The input keeps a 32 px target, increasing to 44 px for coarse
pointers. Below 560 px, label and time sit above the full-width track and wrap independently
when enlarged text needs more room. Theme tokens, visible
focus and system colors in high-contrast mode preserve orientation.

ARIA value text includes both values and the translated seconds unit. The clock output has
`aria-live="off"` to avoid repeated announcements during playback. Moving the slider seeks
the complete scene immediately and pauses; Play resumes from that exact time. Seeking to
26 preserves the endpoint display until Play starts at zero. Normal playback wraps at 26.
The animator reports time at most ten times per second; explicit seeks report immediately.
The component updates text and range value without feeding reports back as seek input.

Deterministic tests cover center arrival, continuous orbit entry, retained gold points,
common welding, delayed product growth, the completion wave, three protected consumer routes
and finite positions throughout a pass. Component checks cover phase boundaries, reverse
seeks, pause/resume, restart, the empty start and loop, reduced motion, cleanup and localization.
Browser acceptance includes active-layer geometry, mobile scrolling, dark mode, native
keyboard behavior, coarse pointers, high contrast and long localized text. Current acceptance
results are recorded in `docs/current-status.md`; prior 24-second screenshots are historical.

### Animation directory, shared stations and icons

Release 0.3.10 introduces this collection; the version overlay summarizes its four scenes
and common controls in German and English, with the previous 0.3.9 notes retained separately.

German animation labels use **Zugriffsrichtlinie** (plural **Zugriffsrichtlinien**) throughout
steps, diagrams, legends, status, audit reasons and explanations. Prefer natural phrases such
as **Zugriffsrichtlinie prüfen** and **Prüfung der Zugriffsrichtlinie**. Only the established
technical expansions Policy Administration Point (PAP), Policy Enforcement Point (PEP) and
Policy Decision Point (PDP) keep the English word. Other UI languages retain their translations.

The `/documentation/animated` start page lists all four runnable explanations **above**
the first large pipeline panel. Each row has a shared icon, localized title, short description
and total duration. Entries link to Data Pipeline (26 s, `#pipeline-title` on the same page),
Data Sourcing (24 s), Find data and request access (24 s), and Data Access Management (32 s).
Opening an entry pauses the overview. The source hub, metadata article and compatibility
redirect are navigation aids rather than additional animations and are not listed.
Rows retain visible keyboard focus without arrows or underlining; they wrap on narrow screens.

`DocumentationAnimationStationsComponent` (`ol[daca-animation-stations]`) renders station
controls for all three detailed use cases. Compact chevrons interlock with 14 px tips and
6 px gaps. Each row starts with a flat left edge. Each control has a 26 px circular two-digit
number (1.625 rem, scaling with enlarged text without wrapping), the same .72 rem title,
.62 rem time range, 8 px vertical padding and 56 px minimum
height; long localized titles can increase the height. The active station uses
`aria-current="step"` and a 3 px frame at 55 percent theme-blue opacity following the complete
chevron outline. Separate CSS silhouettes preserve the normal surface. The button's hit area
follows the shape, so a notch never intercepts the preceding tip; reserved padding protects
text and the wrapper displays keyboard focus outside the clipped button. Forced-colors mode retains the shape and active
frame with system colors. All lists share one layout: equal columns by station count,
two columns at 1100 px and below, one at 700 px and below. Time ranges derive from each scene's
existing start times and duration. Selection still seeks and pauses the complete scene.
Page styles must not override this component's typography, spacing or selection treatment.
`documentation-stations.css` now contains only the sourcing caption and Policy-help layout.

`public/assets/documentation/animation-icons.svg` supplies the canonical SVG symbols for
people, databases, buckets, files, task/policy documents, personalized applications, permission
documents, tables, gears, shields, locks, checks, search, door/conveyor legends and controls.
Native SVG `use` references scale those same outlines in scenes, legends and the directory.
Ordinary symbols share a centered 40-unit view box, rounded joins and 1.7 px strokes using
`vector-effect="non-scaling-stroke"`, so large database icons retain the same fine outline;
playback controls retain their 24-unit view box. Color follows the containing theme, with
the product shield retaining its dark contrast on gold. Specialized animated geometry such
as the matched refinement gears, moving door, telescoping conveyor, form fields and storage
containers keeps its existing clock-driven geometry. Shared static symbols must not replace
the moving parent groups or their selectors.

### Refinement gear geometry

The centered large and small outlines are rotationally symmetric 12/8-tooth profiles with
matching tooth pitch (module 6). Pitch radii are 36 and 24; centers `(600, 320)` and
`(636, 368)` are 60 units apart. Tooth tips and roots are uniformly spaced, with hub circles
at each local origin. SVG fills follow the profile rather than a circular backdrop.

The starting phase puts a large tooth opposite a small-gear gap along the contact line.
Both gears use the shared clock at +40 and -60 degrees per second, matching the 12:8 tooth
ratio. Seek and restart retain this phase relationship.

### Source metadata and consumer access management

The SDAL use case belongs to **06 Data Consumers**. The sixth overview layer and its detail
action pause the 26-second scene and open the canonical consumer explanation. Breadcrumbs
and back links identify it as a consumer topic, with links to the pipeline and source metadata.
The first Datenquellen layer opens Data Sourcing directly. The optional source hub retains
its two cards; its Data Access Management card explicitly cross-links to section 06.
This navigation is local to the documentation
and does not replace the main navigation's Datenquellen destination at physical models.

| Route | Purpose |
| --- | --- |
| `/documentation/animated/data-sources/sourcing` | Direct destination of overview layer 01: one PostgreSQL Sourcing Task, four stations, 24 seconds. |
| `/documentation/animated/data-sources` | Optional hub with exactly two cards: localized Meta Daten and a Data Access Management cross-link to section 06. |
| `/documentation/animated/data-sources/metadata` | Read-only explanation of source name, schema, provenance, Data Owner, classification and endpoint descriptions in the central catalog; its access-management link targets the consumer route. |
| `/documentation/animated/data-consumers/access-management` | Canonical independent 32-second consumer access-management explanation with five stations. |
| `/documentation/animated/data-sources/access-management` | Compatibility redirect to the canonical consumer route. |

The role remains Data Owner in every UI language. The metadata page does not submit records,
issue permissions or fetch protected source data. DE/FR/IT/EN copy uses the existing helper
with the RM fallback.

### Policy scope, central PAP and per-persistence enforcement

The diagram groups three associated persistent resources under **Logical model A**: object
storage/S3, files and a database. Each resource has its own SDAL before the store; requests
and returning data traverse that branch's gate. This is an illustrative logical-to-physical
association, not a new persisted catalog mapping.

Two selectable policy scopes explain the distinction between model-wide access and a
resource subset:

| Scope | Coverage |
| --- | --- |
| Logical model (default) | All three associated physical models/representations and their persistences. |
| Persistences | The selected checkbox subset; files (index 1) is selected initially. An empty subset covers nothing and denies all requests. |

Unselected branches stay visible, remain blocked after the other gates activate and return
no gold data. The received-data count reflects the covered resources, including subsets of
one or two. Changing either scope or the checkbox subset pauses the clock at its current
position. Policy coverage, enforcement state, receipt count and simulated audit are then
recomputed for that scenario without resetting time or making a backend request.

After the initial denial, Consumer A submits an access application through DaCa. A document
with a person symbol travels from the consumer to DaCa (6.6-9.2 s), then from DaCa to the
Data Owner (10.4-12.2 s). The Data Owner reviews it until 14 s. The application and review
are separate numbered stations; neutral cards gain a thick translucent active frame.
The legend distinguishes the access application from a read request and a policy projection.
Submitting or forwarding an application grants nothing: policy state stays absent and
all gates remain blocked throughout both steps. Owner approval begins only at 14 s.

After approval, the Data Owner authors the Consumer A / Read policy in DaCa's **Policy
Administration Point (PAP)**. From 16.4 seconds the policy is stored centrally for the remainder
of that pass. Assignment distributes a projection to the selected SDAL gates; the centrally
stored policy does not move into or disappear behind the enforcement layer. Authoring or
assignment alone does not enable access. Initially all three gates reject requests and
expose no data; only an activated policy covering the consumer, action and resource allows
its request.

| Time | Access-management narrative |
| --- | --- |
| 0-6 s | Consumer A requests Read at all three gates. The three initial requests are denied. |
| 6-10 s | Consumer A applies for access through DaCa; the application arrives at 9.2 s. |
| 10-14 s | DaCa forwards the application to the Data Owner, who reviews it from 12.2 s. No permission yet. |
| 14-16.4 s | The Data Owner approves the application and authors the policy in the central DaCa PAP. |
| From 16.4 s | The PAP retains the stored policy until the cycle resets. |
| 16.4-19.2 s | Policy projections are assigned to covered SDAL gates. |
| 20 s | Covered gates activate; uncovered resources continue to deny access. |
| 20.8-28.4 s | Renewed requests reach covered stores and gold data returns through their SDAL gates. |
| 28.4-32 s | The result holds, then the next pass restores deny and clears the illustrative application and policy state. |

### Illustrative request audit and deterministic controls

Every scripted access attempt produces an audit decision, including denied requests.
The initial decision times are `2.2 + 0.18 * lane` seconds and the later decision times are
`22.4 + 0.18 * lane`, for lanes 0-2. All six events are visible by 22.76 seconds. Logical-model
scope therefore yields three deny and three allow events; the default files-only persistence
scope yields five deny and one allow event. Selecting no resources yields six denials.

Each audit row contains identity, scene time, resource, action, result and reason. No secret,
credential or protected payload is included. The view is a pure reconstruction of the
current clock and selected policy scope: reverse seeking removes future illustrative events,
and scope changes recompute outcomes. It is not a persisted audit log, real authorization
request or production logging service. The actual append-only audit invariants are unchanged.

Native SVG motion, application/review status, policy state, gate decisions, receipt count
and audit view use the same 32-second scene clock. Compact current/total seconds, range
seeking, restart and pause/play mirror the overview controls. Five story buttons seek to
0, 6, 10, 14 and 20 seconds; on narrow screens
they stack for readable labels. Seeking pauses the complete scene. Restart and looping return
to the initial denied state. Hidden tabs freeze motion, cleanup cancels callbacks, and reduced
motion starts at static zero while allowing manual seeking.

### Explanatory security boundary

PAP retention and SDAL projections are conceptual state in this explanation; no catalog
policy write, live PDP request, protected data transfer or audit persistence is performed.
Actual PoC enforcement remains the FastAPI HTTP PEP with OPA PDP, and PostgreSQL ACLs with
forced RLS. Real policy publication is complete only after OPA and PostgreSQL projections
confirm the same revision; the animation is not publication evidence. The central catalog
remains authoritative. Illustrated object storage and files are persistence sources, not
new delivery protocols or registered S3 product endpoints. No backend, persisted structure
or schema changes are introduced.

The overview bucket keeps its open-container outline and colored raw-data points; the
former faint U-shaped grip path inside the bucket remains removed.

### Data Sourcing: one PostgreSQL task in four stations

Overview layer **01 Datenquellen** and its detail action open
`/documentation/animated/data-sources/sourcing`. The source hub and metadata page retain
their direct links. This 24-second explanation focuses on one task and exactly one
PostgreSQL source, SDAL PG and SC PG. There is no source-merging stage or repetition of
One-time/Batch/Real-time modes in this simplified scene.
UI labels spell out **Secure Data Access Layer PostgreSQL** and **Source Connector
PostgreSQL**, with two-line headings inside the cards. DAAIF is centered at the connector's
x-coordinate (650); its task travels vertically from the wizard's lower edge to the
connector's upper edge. The policy-check arc runs below the wizard without crossing it.
The Data Analyst has the same person glyph as the personalized-permission actor. The wizard
shows three equal columns instead of form lines and a task badge: a database above Source,
a symmetric eight-tooth cogwheel above Transformation and an S3 bucket above Target.
The source glyph contains a small 7-unit **PG** label between its cylinder lines. The Data
Lake's unstructured bucket carries **S3** below the stored dots and inside its base, matching
the wizard target. Labels use theme blue; PG shares the source icon's reveal and the large
S3 label shares the target's selected/dimmed state.
Each icon and its localized label fade in together with a 6 px upward movement: Source
at 0.4-1.2 s, Transformation at 1.6-2.4 s, Target at 2.8-3.6 s. Previous icons remain visible;
all three are present before task handover at 5 s. Opacity and position derive from the
scene clock, including partial poses on reverse seek, pause, restart and reduced motion.
The S3 glyph illustrates task configuration; it does not register a new product endpoint.

| Role | Responsibility |
| --- | --- |
| Data Analyst / DAAIF | Describe the Sourcing Task in the UI-guided wizard and submit it to SC PG. |
| SC PG | Execute the task using personalized permission, extract PostgreSQL data, and store it in the chosen target. |
| SDAL PG | PEP (Policy Enforcement Point) enforces access; PDP (Policy Decision Point) decides. Supplies permitted introspection metadata. |
| Data Lake | Receive sourced data in the selected structured container or unstructured bucket. |

The task path is **DAAIF -> SC PG**. The personalized policy-check/response path is
**SC PG <-> SDAL PG**. The payload path is **PostgreSQL -> SDAL PG -> SC PG -> target**.
Source, SDAL and connector sit side by side along the same horizontal payload path.
One SDAL PG box contains both PEP and PDP; security is not duplicated elsewhere in the diagram.
The task token and personalized permission token are distinct from the six raw-data points.

| Station | Scene time | Illustration |
| --- | --- | --- |
| 1 | 0-5 s | The Data Analyst defines Source, Transformation and Target; their icons appear in order and are all visible by 3.6 s. |
| 2 | 5-9 s | One task travels from DAAIF to SC PG at 5-8 s. |
| 3 | 9-14 s | Personalized policy check travels SC PG -> SDAL PG at 9-11.5 s. Decision is made at 12 s; permission/introspection returns at 12-13.5 s. |
| 4 | 14-24 s | Six PG records are extracted and arrive in the selected Data Lake target. |

The first payload starts at 14 s; following records start every 0.7 seconds. Each passes
SDAL PG at age 1.2 s, reaches SC PG at age 2.4 s and arrives in storage at age 4 s.
All six records have arrived by 21.5 s. No data appears before permission, and the sampler's
denied case emits or stores no payload. Counts only include completed arrivals.

The access layer contains a hinged SVG door aligned with the payload path at (390, 330).
It is closed initially and while policy is checked. The successful decision starts opening
at 12 s, completing at 12.9 s. It stays open for every packet including its halo, then
closes at 19.1-19.8 s. Closure signifies the end of this transfer, not revocation of the
centrally stored policy. PEP/PDP and introspection labels remain inside the same card.
The connector contains a hinged, telescopic conveyor with a continuous dashed tread,
rotating rollers and a stationary support. Its pivot is (692, 349), landing at (440, 349)
just below the payload route. Initially it stands at 90 degrees with 32 px between end
rollers. At 12-12.9 s it lowers with exactly the door's opening progress and extends to
252 px, forming a bridge that stops just before the doorway before any payload appears.
Its 11 px rounded end reaches x=429, leaving a visible gap beyond the door sill at x=422;
the belt never overlaps the frame or door opening, including during folding.
This shortened span passed all 18 sourcing tests, the production build and a fresh Edge
check of visible clearance, lowering, reverse seek, pause, restart and repeat.
Telescoping keeps its upper edge below y=306 throughout folding, clear of card headings
and the wizard. Intermediate rollers appear only when the belt is long enough to fit them.
The belt runs at 14-21.5 s. It remains deployed after the door closes until all six records
have cleared; at 21.6-22.5 s it retracts and folds upright. This avoids lifting data still
on the bridge. An unauthorized sample leaves the bridge raised, keeps the door closed,
stops the belt and emits no permission token.
Door perspective, handle position, bridge angle/extension, belt travel and roller rotation are deterministic
projections of the shared scene clock. No independent CSS animation or timer is used;
pause, backward seeking, reduced motion, restart and looping reconstruct the same poses.

A native radio group chooses the task's structured or unstructured target. Selection pauses
at the retained time and recomputes the same task for comparison; it never accumulates data
in both targets. The structured box has six inner cells; the unstructured bucket has no grip.
Both alternatives remain visible, with the unused store subdued and empty.

The compact timeline shows current/total seconds and the current station. Four numbered
buttons seek directly to 0, 5, 9 and 14 s and pause. A single deterministic scene clock drives
task drafting, transfer, policy checks, raw packets and counts. Pause, reverse seeking,
endpoint play, restart, repeat, hidden-tab freezing and cleanup preserve consistent state.
Reduced motion starts at zero and permits manual seeking and target choice. Mobile screens
scroll only the diagram horizontally. Active actors use a thick translucent border and a
neutral surface; theme tokens cover light and dark rendering.

Policy help remains a native question-mark link with an accessible name and a hover/focus
tooltip, dismissible with Escape: "Möchtest du wissen wie man Daten freigeben kann?".
It links to the access-request scene below and is also available in Data Access Management.
Links have visible keyboard focus without decorative arrows or underlines.

A compact legend beneath the sourcing diagram replaces the former four generic markers.
It uses the scene's recognizable SVG symbols and short, localized name/meaning pairs:
Data Analyst (describes the task), database (PostgreSQL source), cogwheel (planned
transformation), S3 bucket (unstructured storage), table (structured storage), door
(opens after policy approval), conveyor (extraction and transfer), document (submitted
task), identity card (personalized policy check), checked document (permission and
introspection metadata), and blue dot (transferred data). A labeled section and semantic
list expose the explanations to assistive technology; the SVGs are decorative and not
focusable. The compact grid wraps independently of the horizontally scrolling scene and
uses existing light/dark theme tokens. No animation timing or control behavior changes.
Verified with the 18 sourcing tests and production build, plus Edge screenshots and layout
checks in light/dark desktop, 390 px mobile and 320 px French with enlarged text. All eleven
explanations remain available without legend overflow or browser runtime errors.

This frontend illustration creates no actual tasks, credentials, protected data access,
Data Lake writes, policies, persisted DAAIF structures or new protocols. DAAIF remains
external; DaCa retains central policy authority. Actual HTTP/REST and PostgreSQL enforcement
and publication invariants remain authoritative.

### Animated access requests: discovery, introspection, payload

Route `/documentation/animated/data-consumers/access-request` is a complete, independently
seekable 24-second explanation under consumer section 06. It uses three neutral vertical
cards with a thick translucent active border, a compact timeline and numbered station links.
Cards sit side by side on desktop and stack on narrow screens. Copy supports DE/FR/IT/EN
with the existing English fallback for RM.

| Time | Illustration |
| --- | --- |
| 0-7 s | A search lens scans prose descriptions in DaCa. A matching catalog entry is selected at 4 s. |
| 7-15 s | An introspection request reaches the Data Owner at 9.5 s; illustrated approval occurs at 10.5 s. Metadata returns at 11-13 s, revealing schema, fields and data types. |
| 15-24 s | A separate payload request is filled and submitted to DaCa at 18-20 s. The final state is submitted, awaiting a Data Owner decision, with payload still locked. |

Metadata approval is never reused as payload permission. The explanation names queries and
Data Sourcing Tasks as payload uses, and connects to the existing Data Owner policy scene.
The explanatory footer retains central DaCa/PAP policy ownership, SDAL enforcement and
automatic access logging; it creates no real requests, policies, grants, data calls or audit
records. No persistence or protocol changes accompany this UI.

All movement and visibility come from one deterministic sampler and cancellable RAF clock.
Pause, seek, reverse seek, endpoint play, restart, repeat, hidden-tab freezing and navigation
cleanup retain consistent state. Reduced motion starts at zero with manual exploration.

Acceptance updated for the single-PG scene (2026-11-11): all 70 focused documentation tests
pass, including the overview, access-management and access-request scenes. The production
catalog UI build, data-model/OpenAPI documentation checks and whitespace check pass. Fresh
Edge checks verify all four sourcing station selections, policy-before-payload ordering,
protected transit through SDAL PG and SC PG, exclusive target selection, arrival counts,
Policy navigation, deterministic reverse seek, pause/restart/repeat, reduced motion and
keyboard controls. No unexpected API writes or runtime errors occur. Visual checks cover
the expanded headings fitting their cards, DAAIF aligned above the connector, the door
opening only after approval and closing behind all packet halos, and conveyor motion and
stopping. Bridge acceptance covers lowering in sync with the door, stopping outside its frame,
clearance below card headings, deployment throughout payload transit, and folding only
after the last record arrives. Partial door/bridge poses and conveyor positions survive
pause and reverse seeking; restart and the loop boundary restore a closed door and raised,
idle belt. Wizard checks confirm
the person glyph, correctly ordered icon reveals, non-overlapping localized labels, stable
partial poses when paused or rewound, and reset on restart/repeat. Visual checks cover
desktop, dark mode, 390 px touch and 320 px French layouts, including contained scene content
at 200% root font size. The unrelated shared header retains its existing overflow at that
extreme enlarged size. Active frames preserve neutral surfaces; the new styles remain
within budget. Prior access-request browser acceptance remains applicable to its unchanged
three-stage sequence.
