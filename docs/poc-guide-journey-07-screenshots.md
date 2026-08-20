# Journey 07 screenshot contract

Journey 07, «Zugriff vor Ablauf verlängern», references five screenshots in the Catalog UI PoC guide. The files must be captured from the running implementation after the `access-renewal-expiring` fixture has been prepared. Generated mockups, composites, placeholder images, and screenshots containing unrelated personal or secret data are not acceptable.

## Deterministic setup

1. Open `/poc-simulation/access-renewal` as `kassandra.valdata` and prepare the fixture.
2. Confirm product ID `11111111-1111-4111-8111-111111111111`, title «ESTV-Steuerstatistik nach Kanton», state `ready`, and `daysUntilExpiry = 14`.
3. Capture at a consistent desktop viewport with the complete relevant card or comparison visible. Keep the selected demo identity visible where it establishes the role.
4. Follow the real workflow. Do not insert grant, request, submission, or revision IDs into the application solely for a screenshot.
5. Save the optimized WebP files below `apps/catalog-ui/public/assets/poc-guide/` with the exact names in this contract.
6. Return to `/poc-simulation/access-renewal` and perform the confirmed reset after capture.

## Required files

| File | Actor and fixture state | Required visible evidence |
| --- | --- | --- |
| `journey-07-expiry.webp` | Beat Stalder · `ready` | «Daten & Nutzung», active personal REST grant, expiry badge showing 14 days, end date, and the renewal CTA. |
| `journey-07-request.webp` | Beat Stalder · before submit | Prefilled renewal form with the previous grant reference, purpose, REST protocol, variant, current end date, and proposed new end date. Do not show tokens or credentials. |
| `journey-07-owner-review.webp` | Kassandra Valdata · `renewalPending` | Owner task with the structured old/new comparison and the deliberate decision controls. |
| `journey-07-four-eyes.webp` | Thomas Kriegli · `approvalPending` | Assigned governance review with renewal context, policy revision, target projections, and independent approve/reject controls. |
| `journey-07-runtime.webp` | Kassandra Valdata · `deployed` | Converged OPA and PostgreSQL revision plus Beat selected in the live decision test and the genuine protected-REST `HTTP 200` result. Verify the separate unauthorized `403` call during the journey; do not combine two UI states into a fabricated image. |

The guide metadata in `poc-guide.data.ts` is the source of truth for alternative text and captions. If the implemented wording or layout changes materially, update the metadata and this capture contract together before recording new files.
