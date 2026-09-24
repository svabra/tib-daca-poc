# Verified design mockups

These PNGs are browser captures of the running Angular applications, not generated concept art.
They use the shared BIT/Swiss federal design package and live/fallback-labelled POC data.

| Concept | Route | Desktop | Mobile |
|---|---|---|---|
| Product 360 / Metadata Studio | `http://localhost:8080/metadata` | `01-product-360-desktop.png` (1440×1000) | `01-product-360-mobile.png` (390×844) |
| Lineage & Provenance Explorer | `http://localhost:8080/lineage` | `02-lineage-provenance-desktop.png` (1440×1000) | `02-lineage-provenance-mobile.png` (390×844) |
| Historical control-plane prototype | `http://localhost:8081/federation` | `03-security-federation-desktop.png` (1440×1000) | `03-security-federation-mobile.png` (390×844) |
| Data-product exposure / KOBY MCP consent | `http://localhost:8080/exposure` | `04-data-product-exposure-desktop.png` (1440×1200) | `04-data-product-exposure-mobile.png` (390×844) |

The lineage canvas intentionally supports horizontal touch/trackpad exploration on narrow screens
so labels remain readable instead of shrinking the full graph to illegible text.

## Logical-model and mapping references

The logical-model extension is grounded in the existing federal-CI capture and three supplied
desktop interaction references. The graph is the primary desktop mapping reference, the matrix is
the complete keyboard/screen-reader alternative, and the split view defines the separation of
dataset, field, physical-column, and mapping details.

| Purpose | Reference |
|---|---|
| Existing DaCa visual baseline | `daca-current-poc.png` |
| Logical/physical split and field details | `logical-model-mapping-split.png` (1774×887) |
| Primary graphical mapping workspace | `logical-model-mapping-graph.png` (1774×887) |
| Accessible table/matrix workflow | `logical-model-mapping-matrix.png` (1774×887) |

The three mapping files are design references rather than claims of already implemented browser
captures. Verified implementation captures are compared against them at matching viewports.

### Verified Microsoft Edge captures

The implementation was exercised in Microsoft Edge 152.0.4191.66 against a freshly migrated,
twice-seeded fixture database. Full-page captures preserve navigation and model context; focused
captures place the graph or matrix and inspector together for direct comparison with the supplied
references.

| State | Full page | Focused workspace |
|---|---|---|
| Graph at 1774×887 | `edge-qa/mappings-1774x887.png` | `edge-qa/mappings-workspace-1774x887.png` |
| Matrix at 1440×900 | `edge-qa/mappings-1440x900.png` | `edge-qa/mappings-workspace-1440x900.png` |
| Mobile matrix at 390×844 | `edge-qa/mappings-390x844.png` | `edge-qa/mappings-workspace-390x844.png` |
| Model inventory at 1774×887 | `edge-qa/models-1774x887.png` | — |

The reproducible flow and the measured responsive invariants are recorded in
`apps/catalog-ui/design-qa.md` and implemented by `scripts/edge_modeling_e2e.mjs`.

## Modern combined-workspace explorations

The `modern/` deck explores five denser desktop directions in which metadata editing, delivery
interfaces, lineage, and provenance remain visible together. These are browser-rendered design
concepts rather than implemented Angular routes.

| Direction | PNG | HTML variant |
|---|---|---|
| Swiss Grid Workspace | `modern/01-swiss-grid-workspace.png` (1600×900) | `modern/index.html?view=grid` |
| Alpine Control Canvas | `modern/02-alpine-control-canvas.png` (1600×900) | `modern/index.html?view=canvas` |
| Federal Evidence Dossier | `modern/03-federal-evidence-dossier.png` (1600×900) | `modern/index.html?view=dossier` |
| Glass Observatory | `modern/04-glass-observatory.png` (1600×900) | `modern/index.html?view=glass` |
| Red Glass Federal Workspace | `modern/05-red-glass-federal-workspace.png` (1600×900) | `modern/index.html?view=redglass` |
