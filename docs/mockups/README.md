# Verified design mockups

These PNGs are browser captures of the running Angular applications, not generated concept art.
They use the shared BIT/Swiss federal design package and live/fallback-labelled POC data.

| Concept | Route | Desktop | Mobile |
|---|---|---|---|
| Product 360 / Metadata Studio | `http://localhost:8080/metadata` | `01-product-360-desktop.png` (1440×1000) | `01-product-360-mobile.png` (390×844) |
| Lineage & Provenance Explorer | `http://localhost:8080/lineage` | `02-lineage-provenance-desktop.png` (1440×1000) | `02-lineage-provenance-mobile.png` (390×844) |
| Security & Federation Control | `http://localhost:8081/federation` | `03-security-federation-desktop.png` (1440×1000) | `03-security-federation-mobile.png` (390×844) |
| Data-product exposure / KOBY MCP consent | `http://localhost:8080/exposure` | `04-data-product-exposure-desktop.png` (1440×1200) | `04-data-product-exposure-mobile.png` (390×844) |

The lineage canvas intentionally supports horizontal touch/trackpad exploration on narrow screens
so labels remain readable instead of shrinking the full graph to illegible text.

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
