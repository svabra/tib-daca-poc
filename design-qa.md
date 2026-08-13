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
