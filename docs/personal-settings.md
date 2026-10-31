# Personal settings in DaCa

The domain canvas aligns its blue connection buttons exactly with the relationship endpoints at the card's 60px center line. Selecting an edge reuses these buttons for endpoint dragging/editing; the duplicate white SVG handles are removed. Product cards support pointer/touch dragging and arrow keys while retaining ordinary new-tab links. Their `product:<UUID>` anchors share the existing personal view Save / Discard / Auto-arrange flow, remain when the layer is hidden, and update dashed membership lines without changing metadata or shared relationships. Escape/pointer cancel restores a drag; a completed drag suppresses link navigation.

Domain bubbles in the data landscape can be positioned with pointer/touch dragging or arrow keys, including fullscreen. Movement creates a personal draft, pauses drift while dragging and follows the existing explicit Save / Discard / Auto-arrange actions. Toggling the domain layer retains anchors; dropping a moved link does not open domain details. Normal clicks and context actions remain available.

Language selection now includes **Rumantsch Grischun (RM)** alongside DE/FR/IT/EN in both the header and Settings / Language. Browser-only save, profile-wide save, cancel/restore and `html[lang]` use the same five validated codes. Existing theme and personal layout JSON remain intact. Translation coverage, explicit fallbacks and shared data-landscape cardinal forms are documented in [localization](localization.md).

The home-page data landscape stores personal organization-card positions in the profile via its own **Anordnung speichern** action. Positions are independent for the overview and each organization level, and are shared between normal and fullscreen display. **Automatisch anordnen** resets the current level as a draft; **Entwurf verwerfen** restores the last saved profile layout. This configuration is separate from theme, language and the browser-local welcome-introduction preference.

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

## Sibilla display name

**Sibilla Di Ciesa** replaces the former display name for identity `sibilla.micheli`. The
portrait path and stable ID remain stable. Current organization/contact assignments are described above. Existing
installations can apply the one-time name update with
`docker compose exec -T catalog-api uv run --no-sync python -m daca_catalog.poc_identity_updates`.
The normal modeling seed applies it as well. The marker preserves later editorial changes.

The welcome close control uses the shared catalog tooltip and explains restoration under
Settings / Home page. This dedicated settings section replaces the former Appearance placement.
Organization containers/cards are rounded rectangles; offices are scattered freely with spacing
and drift calmly, just like the outer context cards. Reduced motion stops both layers.

## Start-page introduction

The compact welcome introduction can be hidden only after confirmation on the start page.
The organization canvas and search stay visible. Settings / Home page can restore it. The
per-person browser key `daca.preference.<user>.welcome-intro` stores `shown` or `hidden`;
blocked browser storage produces a session-only notice. No server profile JSON changes.
See [organization explorer](organization-explorer.md).

## PoC portraits and organization display

All 26 selectable PoC people have different local portraits, including Publication Approver
Fausto Marzo. Fourteen portraits were
created with the built-in image generator as synthetic demo illustrations; the exact prompts
and file mapping are recorded in
[`portraits.provenance.json`](../apps/catalog-ui/public/assets/data-owners/portraits.provenance.json).
The idempotent `seed_poc_portraits` backfill runs after the modeling/CPS seeds in both the CLI
and optional API startup path. An already assigned photo is retained. Hidden technical/test
identities do not receive a person's photo. Offline persona fallback includes all 26 identities.

Federal labels follow `Department Office Organizational unit` with spaces, e.g. `VBS V`,
`VBS armasuisse Immobilien`, `EFD ESTV` and `EFD BIT PS CPS`. `organization_display` derives
them from valid primary federal membership and the existing organization hierarchy, using the
federal directory when no primary membership history exists. It does not infer a unit from
groups or authorization roles: a person known only at office level stays at that level.
Official registry names/IDs, memberships, permissions and persisted product policy attributes
are preserved. Cantonal, municipal and external organization names are not prefixed with a
federal department. Older frontend payloads use a display-only compatibility formatter; import
selectors avoid repeating the department when a complete label is already supplied.

## Personal mapping context

The mapping entry page shows **Letzte Mapping-Arbeiten** from PostgreSQL-backed personal
workspace history. Successfully opened workspaces, explicit context changes and saved edits
update the entry automatically. One context per model/user is kept, with ten entries maximum
and five initially displayed. Resume rechecks current permissions. This is navigation context,
not recovery of unsaved drafts, and is separate from the explicit language/theme storage choice
described below. It survives local login expiry and is not browser local storage.

DaCa follows the DAAIF settings layout: one page heading and a persistent context navigation beside
the active panel. The header gear opens `/settings`, which redirects to `/settings/features`. The
context navigation contains `/settings/language-personal`, `/settings/appearance`, `/settings/home`, and
`/settings/features`, plus `/settings/responsibilities` for the catalog's three responsibility
perspectives. There is no tenant language setting because DaCa does not use tenants.

The header gear and day/night control expose visible, translated tooltips on hover and keyboard
focus. Their accessible names convey the same action. The header language selector and the
personal language settings page both call `UserPreferencesService.requestLanguage`; the interface
changes immediately and the dialog then asks whether to save only in this browser or in the user
profile. Cancelling restores the previous language. The appearance page offers explicit light and
dark choices through `requestTheme`; the same dialog confirms the storage scope before the theme
changes. The header day/night control uses the same service.

The feature list keeps the existing searchable, versioned release history inside the settings
layout. Both applications place the version number, Co-Design credit (V, armasuisse, ASTRA, ESTV
and BIT) and feature-list button in the page footer, beside its text on desktop and below it on
mobile. This area scrolls with the
page and has no floating card background or shadow. There is no current-version status message;
an available PWA update still shows its ready status and the existing confirmation flow.
The feature popup link still opens `/settings/features` directly. These routes require an active
local user session, as does every other DaCa page.

The current guide illustrations for Journeys 08 and 09 were recaptured from the local browser
with the confirmed names. Journey 09 illustrates Sibilla's home organization and separate LDSD
mandate; review authority remains the explicit domain responsibility described by the guide.
