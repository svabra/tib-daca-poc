# Design QA — Data-product exposure and KOBY MCP consent

## Comparison target

- Source visual truth: `docs/mockups/01-product-360-desktop.png`.
- Rendered implementation: `output/playwright/daca-exposure/.playwright-cli/page-2026-08-10T10-46-02-639Z.png`.
- Canonical implementation capture: `docs/mockups/04-data-product-exposure-desktop.png`.
- Mobile implementation capture: `docs/mockups/04-data-product-exposure-mobile.png`.
- Desktop comparison viewport: 1440 × 1000 CSS pixels. Source and implementation are both 1440 × 1000 PNGs, captured at CSS scale / device density 1, so no density normalization was required.
- Canonical desktop viewport: 1440 × 1200 CSS pixels, captured at CSS scale / device density 1 so the complete three-step flow is visible.
- Mobile viewport: 390 × 844 CSS pixels, captured at CSS scale / device density 1.
- Compared state: draft; `kanton-st-gallen` selected; 10.08.2026–31.12.2026; KOBY metadata consent enabled.
- Scope note: the source is the existing product screen and therefore establishes the visual system rather than identical page content. The new exposure workflow intentionally has different information architecture.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The German authority strip, application title, navigation, and page copy are an intentional localization of the English source because the requested mockup is German. Layout, typography hierarchy, federal red rule, cards, badges, controls, shadows, and token usage remain faithful to the source.

## Required fidelity surfaces

- Fonts and typography: the implementation uses the same shared Frutiger/Segoe UI/Arial stack, heading weights, uppercase red eyebrows, compact labels, and body line-height as the source. Desktop and mobile wrapping remain readable without truncation.
- Spacing and layout rhythm: the shared 36 px desktop page frame, header proportions, square cards, narrow radii, borders, and elevation match the reference. The 1.65fr / 0.7fr workflow-and-review grid preserves the reference's main-plus-sidebar composition. At 390 px it collapses to one column with no horizontal overflow.
- Colors and visual tokens: federal red, BIT blue, semantic green/orange/red states, canvas, borders, and muted text all use the existing design-system tokens. No ungrounded palette or decorative gradient was introduced.
- Image and asset fidelity: the implementation reuses the supplied Swiss Confederation raster logo at its existing crop and scale. No visible source asset was replaced with CSS art, an inline SVG, an emoji, or a placeholder.
- Copy and content: the German labels explain group scope, validity, KOBY opt-in, MCP boundaries, default deny, and simulated publication without claiming a backend capability. MCP is explicitly described as catalog-metadata access rather than a data-product delivery protocol.
- Controls and icons: native checkboxes/date inputs are aligned and retain browser affordances. The only navigation icon is the existing shared-shell menu asset; no new icon family was needed.
- Accessibility: semantic headings, labelled inputs, group and switch roles, status/alert regions, focus styles, alt text, and a skip link are present. Mobile tap targets and text wrapping remain usable.

## Full-view and focused evidence

- Full-view comparison: source and implementation were opened together at 1440 × 1000. Header geometry, federal identity, navigation treatment, page heading hierarchy, content grid, card surfaces, and form density align.
- Additional lower-page evidence: `docs/mockups/04-data-product-exposure-desktop.png` at 1440 × 1200 makes the complete KOBY scope and review actions visible. A separate crop was unnecessary because the original-size captures keep header, controls, labels, and status badges readable.
- Responsive evidence: the 390 × 844 mobile capture shows the shared compact federal header, readable title, stacked product context, and first audience card. Browser measurement reported `clientWidth = 390` and `scrollWidth = 390`.

## Comparison history

1. Initial interaction pass found a P1 content-state issue: an invalid end date switched the preview to `DENY` but the sentence still used permissive wording and displayed the reversed dates.
2. The preview conditional was changed so an invalid range explicitly says that selected groups remain blocked until valid dates are provided.
3. Post-fix evidence: `output/playwright/daca-exposure/.playwright-cli/page-2026-08-10T10-46-50-731Z.png` shows the error alert, `DENY` explanation, `Ungültig` summary, and disabled publication button together. The final default-state captures were then regenerated.

## Primary interactions and runtime checks

- Selected and deselected audience groups; readable policy and count updated.
- Disabled and re-enabled KOBY consent; the MCP scope and summary updated independently of REST/PostgreSQL delivery.
- Published a valid draft; the simulated success status appeared.
- Entered an invalid date range; fail-closed preview and disabled CTA appeared.
- Reset the draft; all deterministic defaults returned.
- Console check: 0 errors and 0 warnings; only Angular development-mode log entries.
- Automated checks: production build passed; 5 unit tests passed.

## Open questions

- None for the mockup. Backend policy fields for groups, validity, and KOBY consent remain deliberately out of scope.

## Implementation checklist

- [x] Use the shared federal shell and official logo.
- [x] Keep MCP separate from HTTP/PostgreSQL product-delivery protocols.
- [x] Make default-deny, invalid, success, and opt-in states explicit.
- [x] Verify desktop and mobile layout, primary interactions, tests, build, and console.

## Follow-up polish

- P3: when backend support is designed, replace the simulated publish success with desired/observed revision progress while preserving the current fail-closed copy.

final result: passed

---

# Design QA — TERMDAT action inside the title input

## Comparison target

- Source visual truth: the user-supplied annotated model-editor screenshot, which places `In TERMDAT suchen` at the right edge inside the German title input.
- Rendered implementation: live Microsoft Edge capture of `http://localhost:8080/models/new` after rebuilding the Compose service.
- State: desktop editor with `mwst` entered, title focus lost, and nine automatic TERMDAT hits visible.

## Findings and verification

- Input and action now share one border and one row; the button is vertically aligned, bold, and separated by a single internal divider.
- The title input remains the flexible region while the action keeps a stable width, matching the annotated target without changing the result banner below.
- `focus-within` presents one focus treatment around the complete input/action group. On narrow screens the action stacks inside the same group with a horizontal divider.
- Automatic blur search still returns the visible TERMDAT hit banner, and the explicit button remains keyboard-accessible.
- The focused Angular suite passed all 9 tests, the production build passed, and the Edge console reported no errors.

final result: passed

---

# Design QA — TERMDAT action alignment

## Comparison target

- Source visual truth: user-provided Edge screenshot in the current conversation (2395 × 1435 source pixels, rendered here at 2048 × 1227).
- Rendered implementation: live Edge capture emitted during this implementation session from `http://localhost:8080/models/new`.
- Viewport: 1680 × 891 browser pixels for the implementation capture; desktop TERMDAT modal with ten results for `Mehrwertsteuer`.
- State: automatic search completed, modal open, followed by the in-modal overwrite preview.

## Findings

- No actionable P0, P1, or P2 differences remain for the requested button treatment.
- The previous uneven wrapping and variable action widths are resolved. The combined action spans the full action column; both individual actions occupy equal columns below it.

## Required fidelity surfaces

- Fonts and typography: all result and confirmation buttons use the shared application font at weight 800, centered with a consistent line height and controlled multiline wrapping.
- Spacing and layout rhythm: the modal is widened to 1040 px, result cards use stable content/action columns, and each action uses a 48 px minimum height with a uniform 0.55 rem gap.
- Colors and visual tokens: the existing federal-red primary and neutral secondary/disabled tokens are unchanged.
- Image quality and asset fidelity: this dialog contains no image assets; the existing federal shell and wordmark remain unchanged behind the modal.
- Copy and content: the combined and individual adoption labels remain complete and readable, including disabled `Keine Beschreibung verfügbar` states.
- Responsive behavior: below 820 px cards stack; below 560 px all three actions become one full-width column.

## Full-view and focused evidence

- Full view: the live Edge modal shows aligned actions across description-present and description-missing results without horizontal overflow.
- Focused state: the overwrite preview shows aligned `Abbrechen` and `Bestehende Werte überschreiben` actions and preserves the explicit replacement warning.

## Comparison history

1. The supplied screenshot showed primary and secondary actions wrapping into inconsistent widths and rows.
2. The result-action area was changed from wrapping flex layout to a fixed two-column grid with a full-width primary row.
3. The post-fix Edge capture shows consistent button geometry, typography, and alignment across all visible result cards.

## Runtime checks

- Live TERMDAT search and result modal exercised in Microsoft Edge.
- Combined adoption opened the explicit overwrite preview.
- Browser console: zero errors.
- Focused Angular tests: 9 passed. Production build passed.

final result: passed

---

# Design QA — Expanding landing-page search widget

## Comparison target

- Source visual truth: the two user-provided landing-page screenshots in the current conversation. The selected expanded-state reference is the second attachment (1885 × 1341 px); the first attachment (1797 × 1393 px) establishes the compact state.
- Rendered implementation: `output/playwright/welcome-search-expanded-three-results.png`.
- Additional implementation evidence: `output/playwright/welcome-search-collapsed.png`, `output/playwright/welcome-search-expanded-empty.png`, `output/playwright/welcome-search-expanded-one-result.png`, and `output/playwright/welcome-search-expanded-mobile.png`.
- Desktop viewport: 1797 × 1393 CSS pixels at device density 1. Source and implementation use browser-chrome screenshots at effectively the same desktop scale; comparison focused on the app-owned hero region.
- Mobile viewport: 390 × 844 CSS pixels at device density 1; document client width is 375 px because of the visible scrollbar.
- Compared state: German landing page with Kassandra Valdata, search focused, and three live-result previews for `st`.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The expanded widget matches the reference's right-side placement and occupies about four fifths of the hero's inner height. It expands toward the left without crossing the hero boundary.
- A fixed 540 px expanded widget and 318 px feedback region keep the hero at exactly 661.33 px for both one and seven matching products, removing result-count layout shifts.

## Required fidelity surfaces

- Fonts and typography: the existing shared federal type stack, heading weights, red eyebrow, compact labels, and result hierarchy were preserved. No typography was redesigned.
- Spacing and layout rhythm: the compact widget measures 488.47 × 286 px; the expanded widget measures 560.47 × 540 px. The hero changes height once from 607.71 to 661.33 px on focus, then remains fixed while results change.
- Colors and visual tokens: the implementation preserves federal red, BIT blue, white translucent search surface, existing border tokens, and the reference's restrained shadow.
- Image quality and asset fidelity: the active responsive hero image remains the existing optimized AVIF/WebP asset with its established crop and loading behavior. No asset was replaced or approximated.
- Copy and content: the search title, input, live-result count, product labels, and Expertensuche link are unchanged from the approved flow.
- Motion and accessibility: the 240 ms expansion uses a short easing curve, `aria-expanded`, keyboard focus, focus-within behavior, Escape-to-collapse, and a no-animation `prefers-reduced-motion` variant.

## Full-view and focused evidence

- Full-view desktop comparison: `output/playwright/welcome-search-expanded-three-results.png` shows the expanded panel, complete hero, and stable following `Handlungsbedarf` section at the reference viewport.
- Focused state comparison: the compact, focused-empty, one-result, and three-result captures verify the intended animation endpoints and fixed result surface. A separate crop was unnecessary because the search labels and all three rows are legible at original resolution.
- Responsive evidence: `output/playwright/welcome-search-expanded-mobile.png` shows the full-width stacked input/button treatment and three results. Browser measurement reported `scrollWidth = 375` and `clientWidth = 375`, so no horizontal overflow exists.

## Comparison history

1. The previous implementation let live-result content determine the search widget's height, making the content below the hero move when the result count changed.
2. The widget received explicit compact and expanded dimensions, a focus-driven state, and a fixed feedback area sized for three preview results.
3. Post-fix browser measurements show identical hero and search dimensions for seven matches and one match: hero 661.33 px, search widget 540 px.

## Primary interactions and runtime checks

- Clicked the empty search input and verified immediate expansion before typing.
- Entered `st` and verified three preview cards plus the Expertensuche link.
- Replaced it with `mehrwertsteuer` and verified one preview card without any hero-height change.
- Verified the 390 px mobile layout and absence of horizontal overflow.
- Browser console: 0 errors and 0 warnings.
- Automated checks: 24 unit tests passed; production build passed.

## Follow-up polish

- P3: the reserved whitespace below a single result is intentional because it prevents layout movement; it can later host recent searches or suggested topics if desired.

final result: passed

---

# Design QA — Federal top bar

## Comparison target

- Source visual truth: user-provided admin.ch header screenshot in the current conversation (2048 × 265 px).
- Implementation: catalog landing page at the local root route.
- Intended comparison viewport: 1440 × 1000 CSS pixels, density 1.
- State: German catalog landing page with Kassandra Valdata visible.

## Findings

- The shared federal top strip now uses the reference dark blue (`#2f4356`), a 42 px desktop height, white authority text, a compact user context, and only the active locale.
- Catalog and control-plane unit tests and production builds pass.
- Browser-rendered comparison evidence is unavailable because the in-app preview connection is blocked before a local screenshot can be captured.

## Required fidelity surfaces

- Fonts and typography: implementation values are code-reviewed but not visually compared.
- Spacing and layout rhythm: implementation values are code-reviewed but not visually compared.
- Colors and visual tokens: the top-bar color is grounded in the supplied reference and the federal design token.
- Image quality and asset fidelity: the existing Swiss Confederation wordmark remains unchanged.
- Copy and content: “Alle Schweizer Bundesbehörden”, “Kassandra Valdata”, and the active locale remain visible.

## Comparison evidence

- Full-view implementation screenshot: blocked.
- Focused header-region comparison: blocked.
- Primary interactions and console errors: not browser-tested in this pass.

## Implementation checklist

- [x] Replace the grey authority strip with the dark-blue federal top bar.
- [x] Preserve the demo user and active locale.
- [x] Keep the treatment responsive in the shared shell.
- [x] Run both consumer test suites and production builds.
- [ ] Capture desktop and mobile implementation screenshots and compare them with the supplied reference.

final result: blocked

---

# Design QA — Alpine image inside the welcome card

## Comparison target

- Source visual truth: `output/playwright/welcome-alps-desktop.png` and `output/playwright/welcome-alps-mobile.png`.
- Rendered implementation: `output/playwright/welcome-alps-card-revert-desktop-final.png` and `output/playwright/welcome-alps-card-revert-mobile-final.png`.
- Normalized comparison evidence: `output/playwright/welcome-alps-card-comparison-final.png` and `output/playwright/welcome-alps-card-comparison-mobile-final.png`.
- Desktop viewport: 1440 × 1000 CSS pixels at density 1. The source content width is 1425 px; the 15 px scrollbar was removed from the implementation capture for a 1425 × 1000 comparison.
- Mobile viewport: 390 × 844 CSS pixels at density 1. The source content width is 375 px; the 15 px scrollbar was removed from the implementation capture for a 375 × 844 comparison.
- State: German landing page, default search state, alpine image loaded.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The alpine image is again confined to the welcome card. The surrounding `main` canvas uses the standard neutral catalog background.
- The image starts loading with the visible card and fades in immediately after its native `load` event; the former three-second scheduling delay was removed.

## Required fidelity surfaces

- Fonts and typography: the shared Noto Sans hierarchy, federal eyebrow, title weight, line height, and desktop/mobile wrapping match the reference. `Bundesverwaltung` remains intact on both viewports.
- Spacing and layout rhythm: the standard 1500 px page container and shared desktop/mobile padding are restored. Card borders, red top rule, internal grid, buttons, and following section spacing align with the source.
- Colors and visual tokens: the neutral canvas, white card, federal red, BIT blue, and the white image wash use the established catalog tokens and reference balance.
- Image quality and asset fidelity: the supplied responsive AVIF/WebP glacier assets are used directly with the same right-side crop and a soft white overlay. No placeholder or CSS-drawn replacement is present.
- Copy and content: title, lead, search labels, actions, PoC note, and task preview match the selected reference state.

## Full-view and focused evidence

- Desktop: the combined comparison shows the source on the left and implementation on the right at the same normalized content width. Header, hero geometry, image crop, title wrap, controls, and beginning of `Handlungsbedarf` align.
- Mobile: the combined comparison verifies the same card-only image treatment, intact `Bundesverwaltung`, stacked actions, and absence of horizontal overflow.
- A separate focused crop was unnecessary because the complete welcome card and all relevant controls are legible in the normalized comparisons.

## Comparison history

1. The preceding iteration placed the image across the entire `main` canvas, which contradicted the selected card-only reference.
2. The image was moved back inside `.welcome-hero`; full-width main overrides were removed and the neutral page canvas restored.
3. The first post-revert comparison exposed a P2 title-wrap mismatch caused by a discretionary hyphen. The title now breaks before `Bundesverwaltung`, matching both desktop and mobile references.
4. Final desktop and mobile comparisons show no remaining P0/P1/P2 differences.

## Runtime checks

- Browser-rendered desktop and mobile captures completed successfully.
- Responsive resize retained the layout without horizontal overflow.
- Browser console: 0 errors and 0 warnings.
- Automated checks: 19 unit tests passed; production build passed.

## Follow-up polish

- None required for this revert.

final result: passed

---

# Design QA — Full-width quick-search results beside the expert CTA

## Comparison target

- Source visual truth: the user-supplied DAAIF wrapping finding, applied consistently to the shared DaCa quick-search pattern.
- Rendered implementation: `C:/Users/braya/apps/BIT/tib-daail-evo1-poc-query-engine-alias-fix/output/playwright/expert-search-result-width/daca-after.png`.
- Combined DAAIF/DaCa comparison: `C:/Users/braya/apps/BIT/tib-daail-evo1-poc-query-engine-alias-fix/output/playwright/expert-search-result-width/comparison.png`.
- Viewport: 1440 × 1000 CSS pixels, device scale factor 1; DaCa query `st` with 11 catalog matches and three preview cards.

## Findings and verification

- Expanded DaCa results now use the complete 467 px feedback width instead of reserving 264 px beside the CTA across the whole result stack.
- The compact hover/focus state retains its right-side reservation, so the expert action cannot cover short guidance or validation text.
- Browser geometry found zero overlap between preview cards, the all-results link, and the expert CTA. The list has no inner scrollbar.
- At 430 px, all three results remain visible with no inner or page-level horizontal scrollbar and no browser page errors.
- The focused welcome-search suite passed all 7 tests. The production Angular build completed successfully.

final result: passed

---

# Design QA — Quick-search preview without an inner scrollbar

## Comparison target

- Source visual truth: the supplied DAAIF scrollbar finding, applied to the shared DaCa quick-search pattern.
- Rendered implementation: `C:/Users/braya/apps/BIT/tib-daail-evo1-poc-query-engine-alias-fix/output/playwright/expert-search-hover/daca-scrollbar-fixed.png`.
- Viewport: 1600 × 1000 CSS pixels, device scale factor 1; search query `st` with 11 catalog matches and three preview cards.

## Findings and verification

- The redundant 218 px result-list cap and nested vertical scrolling were removed while the three-result preview limit remains unchanged.
- DaCa's longer product titles require 253 px. The expanded feedback area and widget were therefore sized to contain all three cards plus the all-results link without clipping.
- Browser measurements reported `clientHeight == scrollHeight`, computed `overflow-y: visible`, and both the feedback and form bounds containing the all-results link.
- The focused seven-test welcome-search suite and the production Angular build passed.

final result: passed

---

# Design QA — Expertensuche CTA refinement and one-click navigation

## Comparison target

- Source visual truth: the user-rejected first implementation in `output/playwright/expert-search-hover/daca-desktop-hover.png`, together with the supplied federal landing-page reference.
- Rendered implementation: `output/playwright/expert-search-hover/daca-desktop-hover-refined-final.png`.
- Combined DAAIF/DaCa before-and-after evidence: `C:/Users/braya/apps/BIT/tib-daail-evo1-poc-query-engine-alias-fix/output/playwright/expert-search-hover/refinement-comparison.png`.
- Viewport: 1440 × 1000 CSS pixels, device scale factor 1; source and implementation are both 1440 × 1000 pixels, so no density normalization was required.
- State: blank quick-search widget, pointer hovering over the widget.

## Findings

- The earlier P1 visual finding is resolved: the generic white secondary button is now a deliberate BIT-blue action surface with federal-red top rule, supporting microcopy, stronger label hierarchy, and controlled elevation.
- The earlier P0 interaction finding is resolved: the expert action is excluded from the form's focus-driven expansion, so the target remains stationary from pointer-down to pointer-up and the first click opens `/search`.
- A P2 feedback collision found in the first refinement was resolved by reserving a left feedback column while the hover action occupies the lower-right action area.

## Required fidelity surfaces

- Fonts and typography: shared Noto Sans typography is retained; the small uppercase context line and high-emphasis action label match DAAIF exactly.
- Spacing and layout rhythm: the action uses the established 22 px/18 px card insets; feedback reflows beside it without moving the hero, input, or search action.
- Colors and visual tokens: existing DaCa blue and federal red are used with white text and the catalog's neutral shadow language.
- Image quality and asset fidelity: responsive AVIF/WebP hero imagery, crop, and wash remain untouched; the action needs no new image or icon.
- Copy and content: `Alle Produkte · Erweiterte Filter` is domain-specific while `Expertensuche öffnen` remains identical to DAAIF.

## Interaction and runtime evidence

- Resting state hidden, hover reveal, current-query propagation, first pointer-down stability, first-click navigation to `/search?q=ESTV`, expert-page rendering, and zero horizontal layout drift were exercised in Chromium.
- Browser console and page-error checks reported zero errors.
- Production build passed. The welcome-search regression test passed within the catalog test run; unrelated concurrent service-level tests remain outside this patch.

## Comparison history

1. The initial implementation was visually too generic and expanded the search widget during the first click.
2. The CTA became a branded two-level action surface and its focus no longer mutates widget geometry.
3. The first CSS pass revealed a design-system specificity conflict and feedback overlap; both were corrected.
4. Final browser evidence shows the same visual language and one-click behavior in DaCa and DAAIF with no remaining P0/P1/P2 issue.

final result: passed
