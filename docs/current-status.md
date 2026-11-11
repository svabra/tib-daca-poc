# Current status

Release **0.3.11** (2026-11-11) packages the connected access-request component scene,
left-side source/SDAL orientation, consistent scene/legend icons, Data Sourcing Task Wizard
terminology and shorter conveyor. Canonical package, runtime, OpenAPI, PWA and OpenShift
image-pin versions are synchronized. New DE/EN release notes archive 0.3.10. Publication
runs through the existing main-branch workflow; the operator handles the OpenShift rollout.
Release validation: 830 frontend tests pass (824 Catalog UI, 6 Control Plane UI), both
production web builds and their PWA release metadata checks pass, and canonical-version,
runtime-version and generated data-model/OpenAPI checks pass. The required UI regression
gate runs through the versioned pre-commit hook before creating the release commit.

Animation icon consistency (2026-11-11): audited all four scenes and their legends, plus the
source hub and metadata explanation. All standalone people already referenced the canonical
`person` symbol. Remaining inline check/cross, catalog, REST, analytics and application glyphs
now use the shared sprite. Access-rule authoring/projection and its legend use `shield-check`,
matching the access-request scene; owner approval uses the common permission document.
Scene and legend share the circled rejection symbol, and the overview legend uses the same
gold product/shield combination. Legend icons explicitly inherit theme blue rather than muted
text color. Shared outlines retain 1.7 px non-scaling strokes at different display sizes.
Custom moving door, conveyor, meshing gears and data-storage containers retain their geometry.
Validation: all 75 documentation tests, production Catalog UI build and data-model check pass.
Fresh Edge checks confirm all 28 shared symbols resolve, preserve non-scaling strokes and use
square viewports across all four scenes and both source-topic pages. Scene/legend colors match;
390 px layouts stay contained, and light/dark checks confirm readable composite symbols.
Evidence: `output/playwright/verify-animation-icons.cjs` and `output/playwright/icons-*.png`.

Access-request component scene (2026-11-11): **Vom Finden zum Antrag** now connects Data
Analyst, DaCa, Data Owner, Secure Data Access Layer and Data Source in one diagram. Animated
message icons follow visible routes; thick translucent frames identify sender and recipient.
The diagram preserves the established orientation: Data Source and SDAL on the left,
DaCa and Data Owner above, and Data Analyst on the right. All message paths and captions
follow those positions.
Browser geometry checks confirm all nine paths meet their component edges, avoid crossing
component interiors and keep route labels outside the cards.
Applications pass through DaCa, introspection approval returns from the Data Owner, and its
access rule stays in DaCa/PAP while the SDAL receives the projection. Only then does the
analyst retrieve schema/fields/types through the SDAL. The separate payload application is
forwarded to the Data Owner and remains pending. Three shared chevrons, a 24-second clock,
message caption, icon legend and four UI languages remain; narrow screens scroll the scene.
No backend, persistence, permissions or protocol behavior changes.
Validation: seven focused tests, the production Catalog UI Docker build and data-model
documentation check pass. Fresh Edge checks cover all twelve message paths, exact reverse
seeking, delayed metadata visibility, pending payload, pause/restart/repeat and reduced motion.
DE/FR/IT/EN labels fit their components; 320/390 px mobile and 900 px tablet views contain
horizontal scrolling within the diagram. Light/dark evidence and browser scripts are in
`output/playwright/request-components-*` and `output/playwright/verify-request-components*.cjs`.

Sourcing conveyor spacing (2026-11-11): the deployed belt is one roller interval shorter
(224 rather than 252 SVG units). Its end roller lands at x=468; the rounded cap at x=457
leaves 35 units before the door sill. The connector pivot and existing motion timing remain.

Sourcing terminology (2026-11-11): the DAAIF box and its explanations now use
**Data Sourcing Task Wizard**, including the source-layer description and feature list.

Release **0.3.10** (2026-11-11) packages the animated documentation: 26-second Data Pipeline,
24-second PostgreSQL sourcing, 24-second metadata/access request and 32-second access management.
It includes the shared animation index, chevron stations, icons, legends, seekable clocks,
PG/S3 labels and German Zugriffsrichtlinie vocabulary. Canonical package/runtime/PWA/OpenAPI
versions and the three OpenShift image pins are synchronized; DE/EN release notes archive 0.3.9.
Validation: all 828 frontend tests, version/runtime contract checks and generated documentation
checks pass; all five production images build locally. The release commit must pass the
required pre-commit UI regression gate before push. Publication runs through the existing
GitHub workflow; the OpenShift rollout is performed manually by the operator.

Sourcing icon labels (2026-11-11): the DAAIF wizard's database glyph now includes a small
**PG**, revealed together with the source icon. The unstructured Data Lake bucket contains
**S3**, matching the wizard target, with its label below stored data points. Both labels use
the existing theme colors and follow their containing icon/target states.
Production build and browser checks pass: PG fits between the cylinder lines; S3 remains
clear of all six stored dots and the bucket base. Light/dark evidence is in
`output/playwright/sourcing-wizard-pg*.png` and `output/playwright/sourcing-lake-s3*.png`.

Animation terminology (2026-11-11): German steps, diagrams, legends, status, audit reasons and
explanations now use **Zugriffsrichtlinie** / **Zugriffsrichtlinien** consistently. This includes
the pipeline overview, sourcing, access requests, access management and the source-topic hub.
The standard PAP, PEP and PDP expansions keep their established English names; animation
timing and permissions are unchanged. The version-overlay descriptions use the same vocabulary.
Validation: the four source-topic tests and production UI build pass. Browser checks cover
all five documentation routes, the authoring/active access phases, PAP label widths and
390 px mobile step wrapping; no standalone German Policy/Policies labels remain outside
the standard technical expansions. Evidence: `output/playwright/verify-access-vocabulary.cjs`.

Animation navigation and visual consistency (2026-11-11): `/documentation/animated` now lists
all four animations above the large overview: Data Pipeline (26 s), Data Sourcing (24 s),
Find data and request access (24 s), and Data Access Management (32 s). The overview link
scrolls to its own pipeline heading; the remaining rows open their canonical use cases.
Localized descriptions, durations and icons accompany the links without decorative arrows
or underlining. Selecting a link pauses the overview.

The three detailed use cases use one `DocumentationAnimationStationsComponent` for numbered
task boxes. Circular two-digit numbers, title/time typography, start/end seconds, padding,
56 px minimum height, keyboard focus and the translucent active frame now match everywhere.
The compact controls are chevrons with interlocking 14 px tips, 6 px gaps and 8 px vertical
padding. Each row starts with a flat edge. The 3 px active frame follows the chevron outline
without changing the surface color or shifting content; forced colors retain the frame.
One responsive rule switches from equal columns to two columns at 1100 px and a single column
at 700 px. All controls use `aria-current="step"` and retain each scene's seek/pause behavior.
One SVG sprite supplies repeated people, databases, buckets, files, documents, identity cards,
tables, shields, locks, checks and playback controls across all four animations and legends.
Specialized moving geometry retains its existing animation clock. Shared outlines use
non-scaling strokes so large icons keep the same line weight as their legend counterparts.

Validation: 73 documentation tests across nine files pass, including directory order,
destinations, localized titles and the existing station/clock behavior. Edge browser QA
confirms identical computed number, title, time, padding, gap and radius styles in all three
station lists. All four directory links work, including the local overview anchor. Native
Enter selects a station; its range matches the scene clock. Desktop, 900 px tablet, 390 px
mobile and 320 px French layouts pass without page overflow. Dark mode, reduced motion and
sprite rendering pass without browser runtime errors. The production Compose UI build and
data-model/OpenAPI documentation checks pass. Evidence and the repeatable script are local
in `output/playwright/verify-animation-consistency.cjs`.

Chevron follow-up validation: the production UI build and data-model documentation check
pass. Browser QA confirms matching 56 px controls across all three detailed use cases,
responsive wrapping, French mobile text and dark mode. Each arrow tip selects its own
station; selection does not shift the layout. Keyboard focus and Windows forced-colors
selection remain visible. At 200 percent text size, number circles scale with their labels
and all content fits the mobile layout. Additional evidence is in
`output/playwright/verify-chevron-stations.cjs` and the `chevron-steps-*.png` captures.

Single PostgreSQL Sourcing Task (2026-11-11): **01 Datenquellen** opens
`/documentation/animated/data-sources/sourcing`. The explanation now focuses on one
PostgreSQL source, one SDAL PG and one SC PG. Other source types, merge animation and the
three repeated acquisition-mode episodes have been removed from this scene.

Sourcing illustration update (2026-11-11): the UI now spells out **Secure Data Access Layer
PostgreSQL** and **Source Connector PostgreSQL**. DAAIF is centered directly above the
connector and passes its task straight down. A hinged door in the access layer stays closed
until the successful policy decision, opens at 12-12.9 s, lets all six records pass, and closes
at 19.1-19.8 s after the last packet halo clears the opening. The conveyor starts upright,
then lowers and telescopes left at 12-12.9 s in sync with the door. Its deployed belt forms
a bridge ending just before the door frame with a small visible gap; its rounded end never
enters the opening. Moving treads and rollers run at
14-21.5 s. It stays down while data is still crossing, even after the door closes, then
retracts and folds upright at 21.6-22.5 s. Every pose derives from the seekable scene clock;
denial leaves the door closed and the conveyor raised and idle. Neutral cards and existing
active borders are preserved.

Door-clearance adjustment: the end roller now lands at x=468 (224 px deployed span),
leaving a 35 px gap from the rounded belt cap to the door sill. All 18 sourcing tests, a fresh production
build and Edge checks pass, including visible frame clearance, synchronized lowering,
reverse seek, pause, restart, reduced motion and repeat.

The Data Analyst above DAAIF now has the same person icon as the personalized-permission
actor below. Three labeled icons replace the wizard's lines and task badge: a database
(Source), cogwheel (Transformation) and S3 bucket (Target). They fade/slide into place
successively at 0.4-1.2, 1.6-2.4 and 2.8-3.6 s, then stay visible. The same scene clock
reconstructs their visibility on pause, reverse seek, restart and reduced-motion exploration.

The sourcing scene now includes a compact, labeled legend directly beneath the diagram.
Eleven actual SVG symbols explain the Data Analyst, PostgreSQL source, transformation,
unstructured and structured storage, policy-controlled door, extraction conveyor, submitted
task, personalized policy check, permission/introspection and transferred data. Short labels
and descriptions support DE/FR/IT/EN with RM fallback; the grid wraps outside the horizontal
scene scroll area, using theme colors and decorative, non-focusable icons.
Legend validation passes: 18 sourcing tests, production build and Edge checks of all eleven
explanations, desktop/dark presentation, 390 px mobile, 320 px French and enlarged text.
The legend has no horizontal overflow or browser runtime errors; existing unrelated build
budget warnings remain.

Four numbered stations have clear intervals within one 24-second task:
1. 0-5 s: Data Analyst describes source, transformation and target in DAAIF; icons appear sequentially.
2. 5-9 s: DAAIF hands one task to SC PG.
3. 9-14 s: SC PG uses the Data Analyst's personalized permission for an SDAL PG policy check.
   SDAL PG decides at 12 s and returns permission/introspection by 13.5 s.
4. 14-24 s: data flows PostgreSQL -> SDAL PG -> SC PG -> selected target in the Data Lake.

Six illustrative PG records start at 14 + 0.7 * index seconds. Each passes SDAL PG after
1.2 seconds, SC PG after 2.4 and arrives after 4 seconds. Storage counts increase only on
arrival. Select either a structured container with six cells or an unstructured bucket;
one task has one target and the alternative remains empty. Target changes pause at the
retained time. Restart and looping clear the scene. The active actor keeps its neutral
background with a thick translucent frame.

The Policy question mark and its separate 24-second access-request animation remain:
prose-metadata discovery, introspection request/approval, then a distinct electronic payload
request pending a Data Owner decision. The main 26-second overview and consumer/PAP/audit
scene keep their routes and roles. No actual tasks, credentials, data access, policies,
persisted DAAIF structures or protocols are introduced.

Validation passed: 70 focused documentation tests across nine files, production catalog-UI
build, data-model/OpenAPI documentation checks and whitespace check. Fresh Edge checks verify
one PG source/SDAL/SC, all four station jumps, policy-before-payload ordering, transit through
SDAL PG and SC PG, both exclusive targets, arrival-only counts, deterministic reverse seek,
pause/restart/repeat, reduced motion, keyboard controls and the Policy cross-link. No unexpected
API writes or browser runtime errors occur. New checks cover centered DAAIF placement,
full-name heading containment, closed/open/closing door poses, clear passage for all packet
halos, conveyor motion/stop and identical poses on pause and reverse seek. Bridge checks
confirm synchronized lowering, stopping outside the doorway, heading clearance throughout
folding, remaining deployed while data crosses, folding only after completion, and reset
on restart/repeat. No unexpected
motion occurs in reduced-motion mode. The wizard's person icon, Source / Transformation /
Target reveal order, label spacing, partial-pose pause/reverse seek, empty restart and loop
reset are verified in Edge. Desktop/dark, 390 px touch, French 320 px and
enlarged-font content checks pass. The existing shared header overflow at extreme enlarged
sizes is outside this scene; the scene content stays contained. Existing unrelated build
budget warnings remain. The local catalog UI is running at port 8080. Previous multi-source
timing/count evidence has been superseded by this single-task explanation.

Overview layer-link styling (2026-11-10): linked titles in Datenquellen (01) and
Datenkonsumenten (06), plus their overview detail actions, use plain text without decorative
entry arrows or underlining in normal, hover and focus states. Native pointer/keyboard link
activation and a visible focus outline remain available. This styling is scoped to the
animated overview.
The production build, data-model documentation check and focused browser QA pass. Both
layer links render without arrows or underlining on hover; keyboard focus stays visible
and Enter still opens their respective topics. Local evidence is in `output/playwright/`.

Consumer access-management explanation (updated 2026-11-11): the **06 Datenkonsumenten** layer
and its detail action open the canonical route
`/documentation/animated/data-consumers/access-management`. Breadcrumbs classify this
32-second SDAL use case under Data Consumers. The old
`/documentation/animated/data-sources/access-management` route redirects there for existing
links. The optional source hub remains at `/documentation/animated/data-sources`
with exactly two cards: Meta Daten and a retained Data Access Management cross-link explicitly
pointing to section 06. The metadata page at `/documentation/animated/data-sources/metadata`
keeps its read-only central-catalog explanation and links to the new consumer route. The
main navigation's Datenquellen destination remains physical models.

The diagram groups object storage/S3, files and a database under Logical model A. Each
associated persistence has its own SDAL. Policy scope is selectable: logical model is the
default and covers all three associated physical representations/persistences; persistence
scope uses a checkbox subset and initially selects files only. Unselected resources remain
visible and blocked even after policy activation. Selecting none denies every request.
Changing scope or the subset pauses at the current scene time, retaining that position and
recomputing the illustrative policy, gate states, data return and audit view.

Consumer A initially receives three denials. At 6-10 seconds the consumer applies for access
through DaCa; a person/document token reaches DaCa at 9.2 seconds. DaCa forwards the application
to the Data Owner during 10.4-12.2 seconds; review lasts until 14 seconds. Both steps keep all
gates denied and the policy absent. Only then does the Data Owner approve and author the
Consumer A / Read policy centrally in DaCa's **Policy Administration Point (PAP)** at 14-16.4
seconds. From 16.4 seconds the policy remains stored in the PAP, while assignment
to the selected SDAL projections runs at 16.4-19.2. At 20 seconds matching access becomes
active only for covered resources. Requests and gold data traverse those SDAL gates during
20.8-28.4 seconds; unselected branches remain denied and return no data. Receipt counts
reflect only covered resources. The final state holds before the 32-second loop resets to
deny and clears the simulated application and stored-policy state.

An illustrative audit records the outcome of every scripted request, including denials.
The first three decisions occur at 2.2, 2.38 and 2.56 seconds; the later three occur at
22.4, 22.58 and 22.76. By 22.76 seconds logical-model scope shows three denials and three
allows; the default files-only persistence example shows five denials and one allow. Each
row shows identity, time, resource, action, result and reason without credentials, secrets
or protected payloads. This is a clock-derived explanatory view, recomputed on reverse seek
and scope changes, not a real persisted audit log or production logging service.

The native compact timeline, restart, pause/play and five 0/6/10/14/20 story buttons use the same scene
clock. Hidden tabs freeze playback, cleanup stops callbacks, and reduced motion starts at
static zero while allowing manual seeking. Localized DE/FR/IT/EN copy and RM fallback retain
the English role name Data Owner. Back links lead to the pipeline and source metadata.
The overview bucket retains its clean outline without the former faint U-shaped grip path.

The PAP and SDAL states are illustrative: no actual policy writes, decisions, protected data
requests or audit records are created. Real enforcement remains HTTP PEP plus OPA and
PostgreSQL ACLs plus forced RLS. Publication is complete only when OPA and PostgreSQL
projections confirm the same revision. S3 remains illustrative persistence, not a new product
delivery endpoint. There are no backend, persistence-schema or protocol changes.
Validation (2026-11-11): all 72 documentation tests across nine files pass, including 25
access-management model/animator/component tests. The first run exposed one stale time-label
expectation (corrected) and four 5-second timeouts under parallel machine load. The repeat
used one worker and a local 30-second timeout; all assertions passed in 23.88 seconds overall.
The production Compose UI build and data-model/OpenAPI documentation checks pass. Existing
bundle-size warnings remain outside this scene. The rebuilt catalog UI is running on port 8080.

Edge browser QA verifies all five stations and 13 sampled times: consumer-to-DaCa application,
DaCa-to-owner forwarding, pending review with no permission, approval at 14 s, stored policy
at 16.4 s, and activation at 20 s. At 26.4 s model scope returns three gold points; files-only
scope retains that time with one point, one allowed audit event and five denials. An empty
scope returns nothing and shows six denials. Three receipts are visible at 31 s. Pause and
reverse seeking reproduce packet positions and remove future approval state; restart clears
the illustrative application, policy and audit. Reduced motion keeps the start still and
allows manual review. Dark desktop, 390 px mobile and 320 px French layout pass without page
overflow or browser runtime errors. Data Owner and the expanded PAP name remain intact.
The earlier route/redirect and touch-target checks remain applicable. Screenshots and the
`verify-access-approval.cjs` QA script are local in `output/playwright/`.
The completed 26-second overview validation below retains its original scope.

Animated documentation (2026-11-10): the fourth documentation tile opens
`/documentation/animated`. The tile and introduction explain data becoming information and
knowledge as the foundation for informed decisions, with DE/FR/IT/EN copy and the RM fallback.
Six vertical layers remain side by side in source-to-consumer order. Six colored particles
flow from S3, files, databases and REST API into a bucket, swirl inside and follow distinct
curved routes into Veredelung. Each makes 1.5 turns through the gear and emerges gold.
The 12/8-tooth gears have symmetric profiles, concentric bores, matched pitch and correctly
phased opposite rotation. The stage titles remain Veredelung and Datenschutz.

A pass now lasts 26 seconds. The small gold points arrive at the product center from
11.4 to 14.3 seconds, then expand over 0.25 seconds onto a 24-unit-radius circular orbit.
Six positions are spaced by 60 degrees and share a 1.8-second rotation period. The points
remain individually visible while gathering; no large product appears before 15.4 seconds.
From 15.4 to 16.8 seconds the processing ring contracts from radius 48 to 31 and rotates
360 degrees while all points spiral inward together. The product grows underneath them
from radius zero to 29; the individual points fade only during the final 0.35 seconds.
The ring becomes solid during the final 0.3 seconds of welding. A gold completion wave runs
from 16.8 to 17.6 seconds while the finished product stays centered.

Departure is at 17.6 seconds, arrival at Datenschutz at 19.6, and shield attachment at
19.8-20.45. At 20.8 seconds the same protected product branches simultaneously to specialist,
analytics and application consumers. All three copies retain the full product size and
contrasting dark shield; they follow separate curves and fade together by 24.4 seconds.
Initial load, seek to zero, restart and the 26-second loop boundary all start empty.

The active layer uses a 4 px outer frame at 55 percent theme-blue opacity and a blue title,
with the same regular card surface as the other layers. All layers reserve 4 px vertical and
9 px horizontal spacing, so selection changes do not resize or shift the diagram. The frame
transition takes 160 ms; reduced motion removes it and the keyboard focus remains visible.
The compact timeline has a 3 px track, 12 px thumb, adjacent current/total seconds and no
surrounding card. The inactive track uses the muted theme color for visibility. Desktop is
one row; below 560 px the label and time sit above the full-width track and wrap independently
for enlarged text. The input retains
a 32 px pointer target, increasing to 44 px for coarse pointers, and system colors in
high-contrast mode. Native keyboard behavior, localized time and visible focus remain.

One requestAnimationFrame clock updates decorative SVG attributes outside Angular, including
points, products, ring, wave and both gears. Clock reports are limited to ten per second;
seeks report immediately. The 0-26 second slider uses 0.1-second steps and pauses on seeking.
Play resumes there; Play at the endpoint starts at zero. Restart resets the entire scene and
selected explanation to zero. Pause and hidden tabs stop the clock. Reduced motion starts
at the static zero-second frame and permits manual seeking without automatic playback.
Narrow screens preserve one horizontal layer row in a keyboard-accessible scroll region.

DaCa remains the central catalog. This explanatory page fetches no product records, changes
no persistence or policies and represents no live traffic or access confirmation. S3 is an
illustrative platform input; product delivery remains HTTP/REST or PostgreSQL.
Validation: all sixteen targeted component/timeline tests, the production Compose UI build
and the data-model documentation check pass. Browser QA confirms six separate gold points on
the 24-unit orbit at 14.6 s, no formed product at 15.3 s, simultaneous inward motion and a
growing product at 16.1 s, then the completion wave at 17.2 s. One shielded product at 20.6 s
becomes three full-size protected copies at 22.6 s. Reverse seeking, freeze/resume, native
Home/End/0.1-second arrow steps, empty 26-second looping and manual reduced-motion seeking pass.
All six active states keep identical layer geometry. The active card uses the same surface
as its neighbors in both themes, with a 4 px frame at 55 percent opacity and distinct keyboard
focus. A 390 px coarse-pointer viewport has a 44 px slider target and no page overflow.
High-contrast mode uses system track colors and a visible selected-layer outline. French text
at 320 px and 200 percent root text size wraps above the track without overlapping the time.
Browser screenshots and QA scripts remain local artifacts under `output/playwright/`.

Release **0.3.9** (2026-11-04) fixes external organization card height in the data landscape.
The German/English version overlay describes the correction; the five 0.3.8 notes remain
archived. All managed package, API, PWA and OpenShift image versions are synchronized.

Data-landscape organization card correction (2026-11-04): external organization cards now use
the same content-driven height as inner cards. The obsolete 52-unit inline height compressed
the name and product-count rows into the border; removing it preserves the existing 6px
vertical padding across languages, fullscreen and narrow viewports. Reserved placement
footprints, measured connection ports and saved anchors retain their existing behavior.
Verified by the production Compose build and `npm run test:ui-regression -- --flow canvas-card-styles`:
all five UI languages, fullscreen content fit, dark theme and mobile scrolling pass. Browser
measurements show 14px of combined vertical padding/borders on external cards, matching inner cards.

Release **0.3.8** (2026-11-03) groups permission search/revocation/audit, inline request history,
Mapping warning-save correction, the renamed product catalog/adaptive filter and the expanded
organization canvas. The current German/English version overlay contains these five changes;
0.3.7 retains its seven release notes in the archive. Managed package/API/PWA/OpenShift version
surfaces are synchronized. The BIT Easter egg remains excluded from feature lists.

Data-landscape bottom clearance (2026-11-03): the organization canvas is now 960 × 740 world
units, extending its lower perimeter from 650 while retaining the blue boundary and existing
anchor origins. The 182-unit bottom strip fits a complete 120 × 84 card plus drift clearance.
SVG/HTML positioning, drag/selection bounds, measurements and fullscreen sizing use the same
height. Existing saved coordinates are not rescaled; lower external anchors save/reload using
the unchanged per-user layout structure. Boundary exclusion remains enforced.
Verified with 49 focused UI tests and the `organization-layout` browser flow: St. Gallen
is dragged below EFD in normal/fullscreen views, moved by keyboard, saved and restored after
reload; mouse/touch boundary protection and profile isolation also pass.

Product catalog entry (2026-11-03): **Datenprodukte** replaces **Meine Datenprodukte** in
navigation, titles, breadcrumbs and entry actions, with corresponding French/Italian/English
labels. Default filtering is identity-aware: offered products when any exist for the current
identity, otherwise all catalog products. Defaults react to asynchronously loaded catalog
data; explicit relationship URL parameters and manual choices remain authoritative during
refresh. A prior identity's manual choice does not apply to another identity.
Verified with 27 focused UI tests and the `product-catalog-default` browser flow for an
offering identity, a non-provider, manual selection/search and explicit URL filters.

Product access requests (2026-11-03) are listed inline under **Freigaben → Zugriffsanfragen**,
including answered requests. Navigation and the request KPI target the local section instead
of `/tasks`. The private product-scoped read endpoint returns every request status with its
original arrival and last-update timestamps, ordered by arrival descending. The UI offers
ascending order and inline expandable details without leaving the product; it retains the
selected order during polling. Pending activation remains distinct from effective grants.
Reads clear/cancel on product or actor changes. Current owner/deputy and existing responsible
users retain access; other readers cannot see private request details. The global inbox stays
open-only. No persistence or approval semantics change.
Verified with eight UI tests, three PostgreSQL API cases and the
`product-access-request-history` browser flow using synthetic requests and real policy
activation. Browser evidence covers same-product navigation, inline details, all three
open/rejected/granted outcomes, both sort directions, refresh and desktop/mobile layouts.

Mapping warning/save correction (2026-11-03): the inspector now exposes draft saving and a
combined save/submit action for local edits. Semantic validation issues never gate draft storage.
Submission waits for the atomic workspace save and uses the persisted mapping ID/version/lock,
including rebases from logical-model edits. Failed saves retain local drafts without submitting;
failed submissions report that the draft is already stored. Type warnings remain visible and
the existing validation lifecycle, scope checks and optimistic concurrency remain in force.
Verified with 88 Mapping UI tests, two PostgreSQL API cases (warning and error severity),
and the `mapping-warning-save` Edge flow covering inspector save, persisted warning evidence,
editing, save-before-submit and successful warning-only validation.

Product access management now has a product-scoped, searchable permissions registry and public
permission history for all existing catalog readers of that product. Person, machine and group
grants include frozen group members, protocol, data variant, validity and weekly restrictions.
The Data Owner/deputy can revoke a single revision-bound grant after explicit confirmation;
other grants and memberships are retained. Optimistic revision checks reject stale actions.
Governed products stage `access_revocation` through independent control-person approval and the
existing OPA-first/PostgreSQL-second transition, preserving product visibility and the previous
confirmed policy on rejection/failure. Append-only, deterministic `access-permission` audit
checkpoints record effective grants, changes and revocations only after both targets confirm
the exact revision. Requests and rejections are distinct log events; confirmed historical
policy snapshots remain available without rewriting old evidence. The registry and history
clear/cancel on product or identity changes and show explicit unavailable/activation states.

Release **0.3.7** (2026-11-03) groups the access-request and notification improvements,
Control-click context navigation and all three customer modelling fixes in its archived
German/English release notes. Release 0.3.6 retains its own historical notes. Package/API
versions, PWA metadata and presentation image pins are synchronized. The BIT Easter
egg remains absent from the user-facing feature lists. Publishing images and applying the
OpenShift manifests are separate steps; a Git push does not apply a PoC deployment.

Customer modelling corrections (2026-11-03): missing CSV field types default to `string` with
an explicit preview warning and preserved blank source declarations. Legacy CSV `unknown`
placeholders are interpreted as `string` only when every retained original declaration proves
the type was missing; explicitly declared unknown types remain unchanged. Snapshot IDs, hashes
and audit evidence are retained. Snapshot reads, logical derivation and mapping validation use
the same interpretation. Relations in the logical editor resolve persisted field mappings for
the current model version, including multiple physical targets, and distinguish load failures
from unmapped fields. Expert search now indexes authorized logical model fields as well as
physical columns, preserving model/entity context, organization/domain filters, partial-load
reporting and cancellation on identity changes. Search links open the selected logical field.

New-tab indicators now occupy a permanent 16px column on eligible navigation links, including
object-search results. Control changes visibility only; link-label widths, wrapping and row
heights remain stable. Local actions and downloads still have no indicator column.

All context menus use normal native links with a Control-only new-tab indicator from the shared shell/design system. Captured keyboard/pointer events track Control, with cleanup on release, blur and visibility loss. Router links retain Angular navigation/unsaved-change guards for normal clicks and native browser new tabs for Control-click. Local commands, checkboxes, disabled actions and downloads have no new-tab indicator. Organization drill-down/home/overview and physical referenced-model actions now expose real URLs; search dialogs keep explicit selection local and use ordinary navigation links for results.

Verified with 722 Catalog UI and six Control Plane UI tests, a static audit of 100 menu items,
and the `context-menu-navigation` browser flow. The browser checks actual new tabs with exact
URLs, unchanged source pages, normal in-tab routing without document reload, and Control-click
on the local data-landscape visibility filter without opening a tab. Browser screenshots cover
the same menu with and without Control.

BIT’s display-only Easter egg now releases six staggered pink/red SVG hearts on Control + hover. They float upward, drift gently sideways, grow slightly and fade in a 2.2-second cycle. Office, satellite, focused BIT and fullscreen views share the effect. Key release, pointer leave, window blur and hidden documents hide it; reduced motion shows static hearts. It changes no layout anchors or catalog state and remains excluded from feature lists. The local preview was accepted. A focused browser check verified Control-hover, floating motion, removal on key release and reduced motion.

Requester decision notifications close the previous gap where only the owner received a request task. Persistent information tasks distinguish approval pending technical activation, effective grant (original/modified), and rejection. The bell links to the exact personal request under Data & Usage, which reloads on decision changes and supports acknowledgement. Old decisions are reconciled recipient-privately; final grant backfill additionally requires current published policy coverage and confirmed deployments. Acknowledged messages do not return.

Verified with requester-isolation/idempotency tests, existing renewal/governance checks and the real-browser `requester-decision` flow against local OPA and PostgreSQL. The browser keeps the requester page and message panel open through approval and activation, opens the exact request, checks mobile layout and confirms acknowledgement survives reload. Its isolated synthetic policy is revoked and its product retired afterwards; ordinary catalog policies are untouched.

Access-request confirmations include a responsive Data Owner contact card with portrait, name, organization and Teams link. The shared owner resolver uses the assigned owner's directory email for Teams, including after an ownership change; missing contact data remains explicit.

Initial product-access requests support an explicit indefinite end-date option. API clients send `validUntil: null`; omission, malformed dates and bounded end dates before the start remain invalid. Migration `0048_open_ended_access_requests` makes the request column nullable and preserves finite renewal requirements. Receipts, history, Owner review and grant displays label indefinite validity without exposing the existing technical policy ceiling. Approval/fulfillment matching and request evidence map null to the same ceiling used by OPA/PostgreSQL projections; publication and revocation keep their existing rules.

Verified locally with the complete frontend suite, three additional request-review context tests, PostgreSQL request/owner/approval cases and the production Catalog UI build. The real-browser `product-access-request` flow passes with live arrival of a second request in an already-open notification panel, deduplication, visible mobile header controls, contained mobile panel, owner review/decision and requester history. Synthetic requests are closed after the check; their audit evidence is retained.

On signed-in screens up to 480px wide, the external federal-authorities link is hidden and long profile names truncate so the bell, language, theme, documentation and settings controls remain inside the viewport. The mobile notification panel uses the available layout width, including scrollbar space.

The header notification bell is always visible for signed-in users and opens a DAAIF-style panel of individual workflow messages. Request/task entries are deduplicated, ordered newest first and linked to the matching request in Tasks. Empty/loading/error states, five UI languages, mobile layout, Escape/outside closing and actor-change closing are supported. Both inbox and workflow reads refresh in the background every 15 seconds and on focus/visibility changes. Opening a normal product request now shows its number/context and resolves the requester through the trusted identity directory; dates, requested protocol and modified variant are preserved. Missing/mismatched request context or unknown identities cannot activate a grant.

Product overview access requests now have a visible heading action above the status badge, including narrow screens and a 44px minimum target. It reuses `/products/:id/access-request` and the same trusted responsibility projection as the context menu/form; responsible users and a not-yet-loaded product have no request action. The dedicated `product-access-request` browser flow checks form submission, persisted request, owner-only task notification, bell/inbox navigation, access-setting review, rejection and requester history. No persistence schema or policy-publication behavior changes are introduced.

Release **0.3.6** prepares the external-organization placement fix and verified ROHS CPS fixture delivery for publication. Canonical package/runtime versions, service-worker metadata, focused OpenAPI documents and the three OpenShift image pins use 0.3.6. Latest DE/EN release notes cover the boundary fix and PoC backfill, while 0.3.5 remains in the searchable archive. The external PoC runtime has not been changed from this workstation.

ROHS CPS delivery is verified against the published Catalog API 0.3.5 image in isolated PostgreSQL 18.4 with the PoC's `daca_catalog` schema and a non-superuser role: startup creates both synthetic draft products and the scoped backfill is idempotent. These use cases are independent of the hosting container platform. [The PoC runbook](../k8s/README.md#rohs-cps-example-metadata-in-the-poc) documents the Catalog API pod Terminal command and search verification without active-only filtering. The remote PoC's actual image and data state have not been inspected from this workstation.

External organization cards in the data landscape stay outside the focused organization's boundary, including pointer/touch dragging, arrow keys, group movement and fullscreen. Card edges retain floating clearance. Older overlapping personal anchors are projected outside for display without an automatic profile write; explicit Save retains the existing revision workflow.

Release 0.3.5 fixes the PostgreSQL compatibility failures that blocked the 0.3.4 image pipeline. Automatic deputy eligibility uses the trusted nearest-office hierarchy rather than matching profile strings: Joel Ruod in ESTV BI remains eligible for Kassandra's ESTV products; other EFD offices and expired memberships remain excluded. The seed no longer alternates between Joel and a fallback deputy. Regression fixtures reflect current organization labels, Sibilla's GS-VBS profile, Christiano's armasuisse membership, explicitly scoped term ownership and complete domain handovers. The external PoC/OpenShift rollout remains deferred.

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

Release validation: 710 frontend tests, 34 isolated Catalog API regressions, 18 version/seed contracts and 18 OPA checks pass. All web/Python artifacts build, generated documentation is current, and the unchanged pre-commit hook enforces the complete browser regression before a release commit can be created.

For reciprocal flows beside personal anchors, automatic placement first repairs a connected card overlapping a saved position, then minimizes relationship lengths. Saved anchors remain fixed; visible travelling points are checked against real card hit areas in the browser.

Verteidigung and armasuisse now exchange two distinct synthetic catalog products: armasuisse supplies **Schützenswerte Gebäude – armasuisse** to Verteidigung; Verteidigung supplies **Gebäudenutzungsbedarf der Verteidigung** (`urn:daca:ch:verteidigung:building-use-demand`) to armasuisse. The demand product reuses Data Owner Lawrence Hill, deputy Hong An Captain, consumer Giuseppe Starwars and the Verteidigung domain. One point travels in each direction on the same connection, with a small lane offset for visibility. A separate additive marker includes the reverse fixture in the Catalog API image startup seed, including upgrades of already seeded PoC databases, without overwriting either product or creating access grants.

Organization context menus in the data landscape offer **Alle Datenprodukte der Organisation anzeigen**. The action opens expert search with canonical `organization=<id>&kind=product`, without a name query or an active-only restriction. Existing centralized scope matching includes readable offered/consumed products and subordinate units; an organization without readable product references has a disabled action. Domains start hidden and can be enabled explicitly with the standard toggle or the assigned-domains context action; personal domain anchors are retained.

The PoC catalog includes **Schützenswerte Gebäude – armasuisse** (`urn:daca:ch:armasuisse:protected-buildings`). Existing Data Owner Giuseppe Starwars and deputy Thomas Wikinger provide the synthetic product in Immobilienmanagement VBS; existing Christian Man in Verteidigung consumes it. This creates the directed armasuisse → Verteidigung organization connection and one travelling point. The additive seed is part of `daca-catalog-seed`, which the Catalog API Docker image runs after migrations and before serving on every rollout, including existing databases. Its one-time marker preserves later edits and retirement. Catalog consumption metadata creates no endpoint, access policy or live access receipt.

The domain canvas keeps object-layer toggles and the filter/zoom toolbar directly adjacent: no bottom fieldset padding or top toolbar margin, tighter wrapped-row spacing and no empty hidden-domain placeholder. Existing 44px toggle-label targets and responsive wrapping remain.

The domain canvas aligns its blue connection buttons exactly with the relationship endpoints at the card's 60px center line. Selecting an edge reuses these buttons for endpoint dragging/editing; the duplicate white SVG handles are removed. Product cards support pointer/touch dragging and arrow keys while retaining ordinary new-tab links. Their `product:<UUID>` anchors share the existing personal view Save / Discard / Auto-arrange flow, remain when the layer is hidden, and update dashed membership lines without changing metadata or shared relationships. Escape/pointer cancel restores a drag; a completed drag suppresses link navigation.

The data landscape shows one strongly pulsing point per distinct consumed data product, with successive points travelling together from producer to consumer at a constant speed. Connections have no arrows; reciprocal exchange uses opposing lanes, and reduced motion retains static points. Shared tooltips explain the product count in DE/FR/IT/RM/EN, without claiming live requests or access receipts. A second synthetic ESTV product, **ESTV – Gemeindekennzahlen zur direkten Bundessteuer**, is consumed by existing St. Gallen personas: the ESTV → St. Gallen connection therefore carries exactly two points. The additive fixture preserves later edits and creates no new access policy or endpoint.

Domain bubbles in the data landscape can be positioned with pointer/touch dragging or arrow keys, including fullscreen. Movement creates a personal draft, pauses drift while dragging and follows the existing explicit Save / Discard / Auto-arrange actions. Toggling the domain layer retains anchors; dropping a moved link does not open domain details. Normal clicks and context actions remain available.

The data-landscape organization and domain context menus open the expert search with canonical `organization` or `domain` URL filters. Empty scopes have disabled menu actions. The expert search owns filtering, supports filter-only deep links, shows the domain selector directly, includes organization results, and loads every readable product page. Actor-readable object references use explicit office assignments, subordinate units and catalog consumption; display names never determine scoped membership. See [expert search](expert-search.md).

The domain canvas omits the standalone relationship-type enumeration above the graph in every UI language.

The catalog now offers Rumantsch Grischun (`rm`) in both language selectors and accepts it in per-user browser/profile preferences. Every central translation key has a Romansh entry with preserved parameters; the shell, settings, data landscape and recent work are localized too. Untranslated inline details retain English fallback; recorded business metadata and German-only legacy editors are not automatically translated. Data-landscape offered/consumed product counts and catalog relationships share locale cardinal singular/plural rules for DE/FR/IT/RM/EN, including domain tooltips and accessible labels. Canonical organization IDs, graph reads, layout drafts and count semantics remain unchanged. See [localization](localization.md).

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

The existing Sibilla persona is now displayed as **Sibilla Di Ciesa** in profiles, selectors,
guidance and current responsibility projections. Its stable `sibilla.micheli` ID and assignments
are retained. A separate scoped, marker-protected update now also corrects current home organizations and contacts;
immutable historical snapshots and audit evidence are preserved.

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

The [start-page organization canvas](organization-explorer.md) replaces the large left-hand hero
content with a trusted organization hierarchy and keeps search at the right. It supports department /
office / unit drill-down, contextual satellites, quiet reduced-motion-aware animation, offer counts,
hover details, grouped keyboard context actions, and optional domains. Existing Neuchatel/ESTV catalog
usage evidence yields a thin thread. The welcome introduction is independently dismissible after
confirmation, browser-local per person, and restorable under Settings / Home page. One PoC badge
and the current V, armasuisse, ASTRA, ESTV and BIT credit replace the duplicated wording.

UI wording now consistently names the role **Data Owner** in all four languages, including
profiles, product overviews, search filters, domain handovers, model reviews and guidance.
German business-term headings use **Terminologie** and individual entries use
**Terminologiebegriff**. Task copy from older stored fixtures is normalized for display;
stored task evidence and catalog identifiers are preserved.

Fausto Marzo is the independent Publication Approver/control person for all Marcello Hebeisa
products, with the same default for new products. The scoped CPS operator seed backfills existing
products once, records revisioned audit evidence and refuses changes during active approvals.
Later editorial assignments and revoked reviewer roles remain intact on rerun. Fausto is selectable
with an individual synthetic WebP portrait, like the other 25 PoC personas.
Existing installations receive missing synthetic portraits without replacing an existing photo.
User/profile, product owner, responsibility and organization-selection projections use the
federal `Department Office Unit` path; CPS now appears as `EFD BIT PS CPS`, not a dash-separated
organization code. Cantonal/municipal labels retain their names. The API display projection
does not rewrite product-owner policy attributes or any organizational membership/grant.

Release **0.3.2** synchronizes the UIs, API/runtime packages, PWA metadata, lockfiles, focused
OpenAPI documents and OpenShift image pins. The current release notes cover all changes since
0.2.1: domain exploration and ROHS CPS fixtures, private search Views, physical-first Mapping,
physical instance terminology/menus, governed domain proposals, Lineage and owner access logs.
The 0.2.1 notes remain archived; unissued intermediate versions are not invented.

The domain network now separates personal presentation (`domain_network_views`, migration 0047)
from shared governed relationships. Every active user may add existing domains across department
boundaries. Owner labels and trusted department/office codes identify responsibility; foreign
department cards are gray and read-only. Related products are enabled initially; terms, logical
models and physical representations/declarations can be switched on immediately after the
authorized object metadata loads. Private products and inaccessible physical sources are omitted.
ROHS CPS operator fixtures add two domains, six terms, two draft data products, four logical
drafts and four synthetic physical structures with field mappings. The selectable Owner Marcello
Hebeisa and deputy Matteo Duca belong to the PoC unit EFD–BIT–PS–CPS. Restart preserves subsequent
edits and retirements. The glossary now defines a data product by consumption beyond its Owner
and deputy. See [domain network design](domains-and-glossary.md#personal-domain-network-exploration).
Browser verification exposed nested connection borrowing in demo identity checks under concurrent
tab loading. Catalog/modeling identity checks now finish before route transactions borrow a connection;
transaction-local audit actors bind lazily, retaining the same demo-only/active-user guards. A single-connection pool regression exercises both actor paths.

The shared small spinner now renders an explicit 20 px SVG ring/arc rather than an empty span
whose visibility depends on borders. It follows the theme blue, keeps a fixed flex footprint and
remains visible when reduced motion disables rotation. Domain register/network loading is checked
with deliberately paused real reads, actual geometry/computed visibility and animation state.
All 592 frontend tests and the read-only `domain-loading-indicators` Edge flow pass, including
visible register/network spinners, rotation, dark theme, reduced motion and completion cleanup.

Physical representation/declaration menus now offer **Domänenzuordnung entfernen**, individually
labelled when multiple domains exist. The shared action works in the canvas, physical bindings and
physical-only Mapping entry; assignment can be restored explicitly. A scoped, source-locked DELETE
checks object/revision identity and domainVersion before removing only the requested current
membership and appending audit evidence. Other domains, logical domain, mappings and immutable
imports stay unchanged. UI labels update only after API success; failures retain the assignment.
The separator immediately following “Bindungen und Mappings bleiben erhalten” is removed.
Validated with all 592 frontend tests and eight domain-assignment API cases (seven in the broad
run plus the corrected preservation-fixture rerun), current data-model docs and the
`physical-domain-removal` browser flow. It checks unauthorized/stale writes, individual
membership preservation, binding/canvas updates, reload persistence and physical-only
remove/reassign without changing mappings; its original fixture membership is restored.

Lineage edge context menus now expose access receipts in a new tab for the current resource
Data Owner only. Other users see the disabled option; direct API URLs reauthorize the concrete
source/product owner and never inherit the displayed graph product owner for unknown sources.
The private page filters persons/machines, outcomes and time, paginates with a stable cursor,
clears receipts on identity/filter changes and uses the shared loader. Trusted reporters append
minimal, idempotent `lineage-access` audit events; read APIs return `Cache-Control: no-store`.
The sample HTTP PEP reports only server-configured subject/edge routes after completed reads,
with distinct denial/error events and retry-safe event IDs; reporting failures return no data.
No fictitious historical accesses or grant-derived receipts are added. External sources/direct
PostgreSQL require an execution-side reporter. No SQL schema migration is needed.
Validated with all 589 frontend tests, five isolated PostgreSQL authorization/receipt cases,
17 PEP/authorization tests, generated data-model checks and the `lineage-access` Edge flow.
The browser verifies actual PEP person/machine outcomes, the native new tab, filter isolation,
mobile bounds, loading spinner, disabled non-owner menu and denied direct URL. Real test reads
remain append-only evidence; no historical receipts or product-policy changes are fabricated.

Domain cards now group open/relationship/catalog actions, named term/domain searches and drawing
removal before general new-tab model searches, with icons/separators. The blank canvas starts with create, then
insert an existing domain and model searches; name-based semantic searches stay on actual cards.
Shared loading indicators cover the register, domain network and creation form.
Every new domain is a versioned request and a personal pending card, including for Data Owners.
Only the proposed owner's trusted office ALDS or mandated deputy may approve; no self-approval,
foreign office or profile-role fallback. Review scope is anchored to the submitted owner and
checked again on edit/decision. Current mandates drive pending tasks; direct active creation
returns 409. Update/retirement responsibilities are preserved. No SQL schema migration is needed.
Validated with all 584 frontend tests, 58 relevant PostgreSQL API cases (including the corrected
metadata-only fixture rerun), regenerated data-model documentation and the `domain-canvas-approval`
Edge flow. Browser evidence covers register/network/form spinners, grouped menus and keyboard/mobile
bounds, a personal proposal surviving reload without a shared write, denied Owner approval,
ALDS notification/UI approval and replacement with the active domain. Only its unique test domain
was retired afterwards; audit/decision history remains. The read-only `domain-canvas-mobile-layout`
flow additionally verifies locally scrolling tabs and bounded menus at 390px and 360px.

Visible-source informational notices can be dismissed individually using the small right-hand X.
Only mounted UI state changes: filtering/data refresh does not reopen them, while a page reload
restores them. No browser or PostgreSQL preference is persisted. The discovery notice now links
to expert search and business domains and suggests asking domain owners directly (DE/FR/IT/EN).
Verified by all 11 source-explorer component tests and the `source-info-notices` Edge flow,
including click/keyboard dismissal, refresh retention, reload reset, links and mobile bounds.

Expert search now has PostgreSQL-backed personal Views with create, edit, delete, a compact
selector/action menu and an explicit current-filter update. A searchable recipient modal sends
immutable filter copies and optional messages through recipient-private workflow tasks. Recipients
review, rename/adopt or dismiss; adoption is idempotent and independent of the source, including
after source deletion. Known View filters can be used without a phrase. Existing catalog visibility
still controls results. Notification counts refresh every 15 seconds while visible and on focus.
Migration 0046 adds private view/share tables and the workflow-task link; data-model documentation
has been regenerated. See [personal Views](expert-search.md#personal-search-views).
Verified by 579 frontend tests, seven isolated PostgreSQL API tests and the two-user
`personal-search-views` Edge flow, including immutable delivery after source deletion, independent
adoption, persisted filter-only searches, confirmed deletion and mobile dialogs.

Domains and terms now default to the own-office filter. In card views its toggle sits next to
the search input and below it on narrow screens; network views keep it below their view switch.
`ownOffice=0` preserves an explicit All choice across views, semantic tabs and refreshes, while
fresh links default to scoped results. Shared tooltip, loading/error handling and trusted office
scope resolution remain in place. See [own-office display filter](domains-and-glossary.md#own-office-display-filter).
Verified by all ten semantic-page component tests and the `semantic-own-office` Edge flow for two
identities, desktop/mobile placement, default activation, explicit All and tab/view retention.

Lineage cards are now compact (208 × 112 px) with 2 px corners. Hover/focus moves the existing
card by 2 px without an extra frame; staggered ice-blue light bands pulse along the directed edges.
Reduced motion disables both effects. The lineage explorer uses type-based colors (including green
consumers), contained multiline titles and label-aware routing. Shared tooltips explain
Verified/Declared and the other legend terms; interactive summaries
support pointer and keyboard access to owner, exact URN, optional description and a native new-tab
link. Known products open their overview; URN-only assets open their exact reference in the graph.
Missing owner information stays explicit. See [lineage explorer](lineage-explorer.md).
The compact/pulsing update passes all three lineage component tests and the read-only
`lineage-explorer` browser flow: exact card size/corners, no extra interaction outline, moving and
pulsing light bands, native tabs, summaries, mobile bounds and reduced-motion card behavior.

Physical-instance labels no longer use Snapshot: connected structures are physical representations,
CSV inventories are physical declarations. Loading/empty/error states, Mapping bindings and dialogs,
drift, object details, source history, domain membership and in-app guide use the same vocabulary.
Version numbers are labelled Revision. Newly generated derivation descriptions/comments use Revision;
existing authored metadata, internal API fields and immutable identifiers are preserved.

Physical context menus start with source navigation and drawing removal, followed by its hint
that bindings and mappings remain intact. Separators group domain actions, named term/domain
searches and the two general model searches, in that order. Empty domain groups are omitted.
The graph legend and toolbar counts explain valid, review (including drafts) and broken mappings
using shared hover/focus tooltips. Faint wavy underlines reveal these keyboard-accessible hints.
Focused hints now remain anchored through automatic scrolling while their trigger stays visible;
pointer-only hints still close on scroll. This uses the shared tooltip component throughout the app.
Verified by 47 component tests and the `mapping-status-tooltips` Edge flow: all six hints,
keyboard focus with automatic scrolling, Escape and pointer hover.
General logical/physical model searches show native new-tab result links by default with external-link icons; source/snapshot/table
parameters remain exact and the Mapping workspace stays open. Explicit counterpart selection
and derivation are current-object actions in physical-first Mapping, preserving the paired-workflow
path. Selection-mode browsers still emit selected objects instead of navigating.

The logical-model overview starts with the signed-in user's department selected. Reset filters
restores that department; All/other-department choices remain explicit and survive model refreshes
or same-department profile updates. Identity/department changes restore the appropriate default.
The dropdown includes the own department even when it has no models; user-directory loading
keeps the spinner visible instead of briefly showing another user's models. Legacy profiles without
a department fall back to All. This is a display filter, with API authorization unchanged.
Verified by six overview component tests (including delayed data/profile loading and a department
change) and the `model-department-default` browser flow on desktop/mobile: default, explicit All,
reset and fresh-page behavior.

**Datenquelle öffnen** in physical-object context menus opens a new tab with the exact source,
snapshot and object. An external-link icon and accessible new-tab hint make this explicit; the
Mapping workspace stays open. Canvas cards and physical bindings share this behavior.

Physical-first Mapping now offers an existing logical-model search and **Logisches Modell ableiten**
in the canvas placeholder, physical-object context menu and blank-canvas context menu. Choosing an existing counterpart retains the physical context and runs the existing compatibility check. Deriving
opens the complete `/models/new` editor with exact snapshot/table query parameters, without a
quick-create write. Users edit descriptions, owner/domain/classification and field/concept decisions
before explicit saving through the existing derivation API, then return to Mapping. Both choices
remain visible on mobile. Blank-canvas menus omit term/domain searches; actual model cards retain
their name-prefilled searches. CSV origins are labelled as physical declarations.
The focused `physical-derivation` browser flow passed for CSV and S3/Parquet: desktop/mobile
choices, both context menus, full editable metadata and field forms, and exact Save payloads
after renaming/removing fields. It intercepts the save with a synthetic rejection to verify retained
user input without adding catalog records; the existing editor contract test verifies successful
Save navigation back to Mapping. The `mapping-start` flow separately checks existing-model
selection, compatibility, pairing and recent-work history.

For an opened logical model, the canvas menu puts **Neue physische Repräsentation** first, followed by grouped
logical/physical model searches. Term/domain searches appear only on model cards. Small outline icons distinguish
creation, model types and semantics. The shared physical binding/canvas menu uses the same icon
vocabulary while placing drawing removal immediately after source navigation.

The data-model overview now uses the shared small loading indicator beside its localized loading
message. The indicator disappears on success or failure through the existing request lifecycle.

Physical results in the common catalog-object search display the object system/schema/name and
**Quelle: <name> · Physische Deklaration (CSV)** or the corresponding representation/provider.
An unobtrusive info button exposes owner, import timestamp/person, revision, catalog path and
source/object IDs through the existing hover/focus tooltip. Technical paths and IDs remain searchable,
while visible result text stays readable. The navigation still targets the exact snapshot and object.

Mapping now distinguishes logical models, physical representations and CSV physical declarations.
The incorrect ImmoGIS prefix for SAP.CSV.VIBDBU was a display bug: labels used the first database
of the inventory instead of the mapped table's database. Bindings, canvas, column choices, physical
object searches and derivation defaults now use the table identity; existing mapping IDs remain
unchanged. Physical binding cards and canvas share source/model/domain/semantic actions with
group separators and drawing removal immediately after source navigation. Semantic links carry the object name as q and open
new tabs with an external-link icon. Copying the logical domain uses the existing confirmation
and optimistic concurrency checks. CSV source cards offer open/archive/restore/delete through
the accessible three-dot menu; source headers distinguish declarations from representations.
Validation covers the Angular suite plus focused dialog, refresh-target stability and logical-menu
regressions. Browser flows `physical-object-actions` (the real SAP.CSV.VIBDBU case, without
persisting changes) and `csv-import` cover matching menus, new-tab queries, domain-copy
confirmation, mobile fit and confirmed inventory archive/restore/delete. Screenshots remain
under ignored `output/ui-regression/`; no catalog schema change is introduced. The focused
`mapping-live-refresh` browser check also passed: simulated deletion disappeared from both
views in 5,246 ms, with restoration and mobile visibility preserved.

The physical CSV importer uses a full-width drop area with a standard file-selection button;
the native file input remains hidden. Drag-and-drop and selection both load the existing preview,
and only **Importieren** persists metadata. Name and organization use aligned 44px controls rather
than stretching to the drop area's height. Advanced CSV format help is initially collapsed.
Intro, preview totals and selected-object heading clarify **Physische Repräsentation**.
Verified with the importer component tests and `--flow csv-import`: file selection and a real
browser drop, compact desktop fields, mobile dialog fit, preview, cancellation, confirmed import
and reusing identical content. Local screenshots stay under ignored `output/ui-regression/csv-import-modern`.

Release **0.2.1** synchronizes all managed package/runtime/image versions. Catalog release notes
in DE/EN describe the new expert search, direct Mapping entry and private recents, physical
binding refresh, own-office semantic filters and footer version controls; 0.2.0 remains archived.
The control-plane release lists its shared version and footer updates separately.
Local Control-plane API publishing supports `DACA_CONTROL_API_PORT` (default 8002); this
workspace uses 18002 alongside DAAIF MCP on 8002. Docker-internal service ports remain unchanged.
Browser regression readiness is bounded at 45 seconds: workspace bootstrap can combine the
existing 30-second collection budget with an 8-second detail read. Action and focus assertions
remain; the dedicated near-real-time binding refresh check still enforces its nine-second bound.
Its canvas regression restores hidden representations through **Ausgeblendete einblenden**,
asserts their absence from physical bindings while hidden, and checks preserved positions/mapping versions.
Headless regression pages emulate foreground focus across downloads and focus the CSV entry
before opening its dialog; Escape still must close it and restore the entry's DOM focus.
Hover checks wait for scrolling to settle before measuring the target and moving the mouse;
the disabled-save explanation, keyboard focus and Escape assertions remain unchanged.
Physical source imports use a separate 60-second request budget with the same identity and
revision checks. Delayed imports no longer report an unavailable API after eight seconds while
the server is still completing drift analysis. The regression waits for the visible import
confirmation before checking the appended immutable snapshot, avoiding repeated heavy list polling.
`npm run test:ui-regression -- --flow mapping-release-tail` isolates physical-first mapping,
drift/repair, the modeling journey, source access and field moves for focused diagnosis. The
pre-commit hook continues to run the complete regression rather than this subset.
Existing-to-existing regression models are isolated per run and reuse only the trusted seed's
organization/owner/publisher context. Repeated gates no longer append hundreds of historical
snapshot links to the shared organization demo model; existing demo records remain intact.

Domains and terminology provide an optional **Nur amtseigene anzeigen** toggle in both
card and network views. `ownOffice=1` retains it across view and domain/terminology tab changes.
The existing organization semantic-graph read supplies independent domain/term scope IDs from
trusted object responsibilities (office plus subordinate units); explicit object scope takes
precedence over the owner's home office. Term classification does not imply office ownership.
The current identity's resolved `office` follows the same organization context as the term
network. While enabled, that network follows this office and hides its foreign-office selector.
Hover/focus tooltips explain the scope. Loading uses the small spinner; failed reads expose
retry and an empty scope, and a missing office disables activation. No persistence contract or
authorization rule changed. Filters affect visible nodes/edges only; graph positions,
relationships, hidden/additional node IDs and local drafts remain intact.

The model workspace tab and browser title use **Mapping** for all languages. Related mapping
buttons, matrix/inspector/dialog labels and messages consistently use Mapping/Mappings;
French and Italian mapping-context translations retain this term. Generic domain, role and
ownership assignments keep their existing terminology. Routes and persisted mapping data retain
their existing contracts.

Expert search uses **Data Structures** instead of a table-only search context in both layouts.
Tables, views/materialized views and S3/Parquet objects share this filter and count, while result
rows, grouped headers and previews show their concrete type and icon. Field parent links use
the generic data-structure label. Every search-context control uses the existing catalog
tooltip on hover/focus, including explanations for physical fields, business terms/domains and
metadata-only sources. Existing `kind=table` links still work; new links use `kind=structure`.
There is no new persistence type, protocol, connector or search category without indexed data.

`/mappings` now offers separate logical-model and physical-representation selection. Choosing
a logical model opens its mapping immediately; choosing a physical object opens
`/mappings/physical/:snapshotId/:tableId` with that exact object in the canvas. The logical
counterpart can then be selected there and opens the paired mapping automatically after the
existing permission check. There is no additional **Mapping öffnen** confirmation. Search/pickers
open only when needed. Model, recent-history and physical-detail reads run independently with
small blue, accessible loading indicators. A slow history read does not delay model opening.
The selection-only physical picker opens an object on click; the normal attachment dialog
retains its explicit Add action. New representations remain local and editable, without
automatically generating field mappings. Existing deep links retain their context; unavailable
model-scoped URLs never silently substitute another model.

**Letzte Mapping-Arbeiten** initially shows five recent models and optionally up to ten.
Migration `0045_mapping_workspace_visits` stores private per-user model, physical snapshot/object,
view and visit time in PostgreSQL. Workspace opening/context changes record history; background
polling does not. Writes are serialized in the browser and per-user in PostgreSQL. Reads recheck
current model/source access and omit unavailable references. History stores no unsaved drafts,
credentials, access grants or catalog revisions.

Verification: six PostgreSQL history cases cover persistence, ordering/deduplication, bounded
storage, invalid physical references, actor isolation and revoked/inactive resources. All 542
web tests passed, including independent loading indicators, immediate logical/physical opening,
counterpart permission checks and queued history completion after route destruction. The dedicated
`mapping-start` browser flow delays a real model GET to verify the visible spinner, then passes
direct physical-canvas opening, immediate logical selection, paired mapping, persistent recent
work after a fresh load, graph/table view restoration and 390/320-px layouts. The existing
`mapping-live-refresh` flow still passes (remote removal detected in 2.8 seconds). Migration
0045 is applied locally; generated model documentation, production builds and Ruff checks pass.

Expert search now offers **Kontext-Navigator** by default and **Fokus-Suche** as the alternative,
selected through large tiles at the right of the heading. Both use the same URL-backed query,
filters, result set and optional pinnable preview. Existing read APIs supply products, model
summaries, sources, latest tables/physical fields, terms and domains. Identity changes cancel
stale reads; partial load failures are reported. No new search persistence or data endpoint is
introduced. [Design and current boundaries](expert-search.md) document the implementation.

Expert search keeps one labelled clear button for a non-empty query. The browser-native search
cancel decoration is suppressed so Chromium/Edge no longer display a second cross.

The mapping workspace now derives **Physische Bindungen** from the same visible representations
as its graph. Hidden cards disappear from both immediately and can be restored with
**Ausgeblendete einblenden**. No stored representation or mapping history is deleted by hiding.
Both views label source connection configuration separately from metadata-only structures;
the server supplies a boolean derived from the source adapter and configuration reference,
without exposing connection configuration or claiming endpoint health/product authorization.
Visible, idle workspaces refresh every five seconds and on focus/visibility return, without
overlapping requests. Refresh preserves field selection, local hidden cards and canvas view;
unsaved mapping/model/layout edits and open editors pause replacement. Stale identity/save
responses are ignored; temporary failures retry and never install fallback demo data.
The snapshot list now reads summaries without loading every table/column. Local read time
decreased from about 3.1s to 0.4s for the current catalog. Verified with all 501 frontend tests,
six backend connection/summary cases, production builds, Ruff and the data-model documentation
check. The dedicated read-only `mapping-live-refresh` UI-regression flow checks shared graph/list
visibility, restoration, connector labels, simulated remote removal (observed within five seconds),
focus refresh, mobile overflow and long-name wrapping. Remote changes are mocked GET responses in an isolated browser;
no live mappings or structures are modified. No commit was created.

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
its editor, save/discard behavior and navigation guard. `/domains` is the default network entry; `?view=network` remains supported;
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
reuses glossary proposals and domain requests; all new domains require the scoped office ALDS approval.
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
`/domains/network` adds the domain graph with private per-user presentation, shared governed relationship drafts, zoom,
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

Release CI exercises the historical reversible migration range before upgrading to the current
head. It explicitly checks the transactional downgrade rejection at object-governance migration
0042 and verifies that the seeded head remains consistent; ordinary rollouts stay forward-only.

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
**Darstellung dieser Physischen Repräsentation/Deklaration löschen**; this hides its drawing and connections
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

Catalog and Control Plane show version information in the page footer, in normal document flow.
It sits beside the footer text on desktop and below it on small screens, without covering page
content. The version, `Co-Designed by V, armasuisse, ASTRA, ESTV und BIT` credit and feature-list button
remain available. The redundant current-version status is removed; an available PWA update still
shows its ready status, reload action and confirmation dialog.
Within each footer, co-designers are credited once in the version area. The catalog footer
description omits its duplicate credit in DE/FR/IT/EN. The optional welcome introduction now
uses the same current participant list.
Verified with seven version/update component tests and both production UI builds. Read-only
catalog browser checks cover 1440px and 390px widths in light/dark themes, footer placement,
horizontal overflow, feature-popup opening and focus return. No commit was created.
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

Christiano Stadello and Christian Man now hold additional Data Steward assignments for
`VBS / armasuisse Immobilien`. They can create and derive VIBDBU logical drafts and edit mappings;
the scoped role also permits structural metadata management. Their primary memberships are armasuisse and Verteidigung respectively. Other Verteidigung users remain read-only for this source, and
publication still requires the model's named owner or delegated deputy.
The original modeling personas have explicit primary organization memberships; Sibilla belongs
to GS-VBS and Christiano to armasuisse, independently of their additional modeling scopes.

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
