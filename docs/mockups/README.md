# Current visual references

This directory keeps the supplied design references and the latest selected implementation
captures. Historical initial-screen captures, the standalone modern HTML prototype deck,
unused role-view concepts and superseded intermediate comparisons were removed during the
13 November 2026 repository cleanup. Their history remains available in Git.

## Supplied references

| Purpose | Reference |
| --- | --- |
| Logical/physical split and field details | `logical-model-mapping-split.png` |
| Graphical mapping workspace | `logical-model-mapping-graph.png` |
| Accessible table/matrix workflow | `logical-model-mapping-matrix.png` |
| Organization highway visual source | `data-highway/reference-option-2.png` |
| Lineage domain-card visual source | `lineage-highway/domain-card-reference.png` |

The supplied images are design references. They are not claims about implemented routes.

## Selected implementation captures

- Mapping: `edge-qa/logical-model-field-table-1440x900.png`,
  `edge-qa/physical-derived-form-1440x900.png`,
  `edge-qa/mappings-workspace-1774x887.png` and
  `edge-qa/mappings-workspace-390x844.png`.
- Organization highway: `data-highway/slimmer-smooth-canvas.png`,
  `data-highway/slimmer-smooth-offset.png` and `data-highway/packets-under-boxes.png`.
- Lineage: `lineage-highway/canvas.png`, `dark.png`, `mobile.png`,
  `lineage-card-comparison.png`, `packets-under-boxes.png` and `product-owner.png`.
- Organization layout: `organization-heading-space/heading-space-de.png`,
  `heading-space-fr.png`, `heading-space-fullscreen.png`,
  `organization-toolbar/compact-toolbar.png` and `compact-toolbar-mobile.png`.
- Mobile canvas controls: `canvas-controls/mobile-mapping-actions.png`.

See [design QA](../../design-qa.md), [lineage behavior](../lineage-explorer.md) and
[organization behavior](../organization-explorer.md) for the verified invariants.

## Reproduce current browser evidence

Run `npm run test:ui-regression -- --screenshot-dir output/ui-regression` against a healthy
local catalog UI/API. The runner also supports focused `--flow` checks. New generated captures
belong in ignored `output/ui-regression/`; replace a retained baseline only when deliberately
updating that design reference.
