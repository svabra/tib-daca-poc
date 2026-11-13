# Product feedback and management actions

The product overview has two compact actions at the bottom of its summary card:
**Abgeleitetes Datenprodukt beantragen** and **Kommentar zum Datenprodukt erfassen**.
The request preserves its source product. The comment action opens a labeled dialog with
a text field and explicit public/private radio options; private is the default.
The public option explains: **Sie können Ihren öffentlichen Kommentar später wieder löschen.**

Full management actions are shown for current object-scoped Data Owners and their assigned
deputies. The server calculates `DataProductResponse.canManage` from active trusted
responsibility records. An unrelated global Data Owner or publication approver receives
false. Readers see neither **Freigaben verwalten** nor **Metadaten bearbeiten** on the
overview. The metadata route is read-only for them and cannot submit a new revision.
Existing server authorization still protects metadata and permission mutations. The public
permission evidence and descriptive metadata remain readable according to catalog visibility.

## Comment visibility

| Reader | Public comments | Private comments |
| --- | --- | --- |
| A reader of this product | Yes | No, including their own private submissions |
| The current assigned Data Owner/deputy | Yes | Yes |
| Another product's Data Owner or this product's publication approver | Yes, when the product is readable | No |
| Unknown/inactive identity or inaccessible product | Denied | Denied |

After a private submission, the author receives a receipt and confirmation, while the text
is cleared from the composer. Owner/deputy users see private and public entries in the same
comment list, each marked with its visibility, author, organization and time. The current
assignments are checked afresh after ownership changes. Client state and unsent drafts are
cleared on identity changes; late responses from the previous context are ignored.

## API and persistence

`GET /api/v1/data-products/{id}/comments` returns `items`, `canViewPrivate` and `nextOffset`.
`limit` defaults to 50 (maximum 100); `offset` defaults to zero. The SQL visibility filter is
applied before ordering and pagination. No private counts or hidden item identifiers are
included for ordinary readers. Both product readability and an active local demo identity
are required.

`POST /api/v1/data-products/{id}/comments` accepts:

```json
{"text":"Bitte den fachlichen Datenstand bestätigen.","visibility":"private"}
```

The API derives the immutable author from authentication and rejects supplied author fields,
unknown visibility, blank/oversized text, markup and credential-like content. The 201 response
contains only `id`, `visibility` and `createdAt`; it does not echo private text. Comments are
separate from product metadata revisions. The existing demo headers are local PoC identity,
not production authentication.

Additive migration `0050_product_comments` persists comments and indexes product, visibility
and chronology. Audit events record comment ID, product ID, author and visibility without
comment text. No comment content is copied into product metadata, provenance or search.
Responses use `Cache-Control: private, no-store` and `Vary: X-DaCa-User`.

`DELETE /api/v1/data-products/{id}/comments/{commentId}` lets the authenticated author delete
their own public comment after an explicit UI confirmation. It returns 204 and removes the
comment text from the comment store and subsequent listings. Another reader, Data Owner or
deputy cannot delete someone else's comment. Private comments cannot be deleted through this
route. Product scope and readability are checked; unknown/mismatched comment IDs return 404.
The append-only creation/deletion audit records remain and contain no comment text. Delete
controls, pending confirmations and late responses are also scoped to the active identity.

Validation covers reader/owner/deputy/approver visibility, author spoofing, ownership changes,
private-product denial, pagination, audit payloads, direct unauthorized metadata/permission
mutations, stale responses and draft clearing when switching identities. Browser acceptance
also checks the small footer actions, public/private submission and desktop/mobile layout.

## Verified acceptance (12 November 2026)

The local Compose build was checked in a real browser. Jan submitted one public and one
private comment on the separate MWST SG **Prüflauf** product. Kassandra and Joel could read
both; Jan, Thomas and the unrelated Data Owner Noémie could read only the public entry.
Management actions followed the same owner/deputy boundary. Direct metadata navigation was
read-only for Jan and editable for Kassandra. The small derived-product action opened the
request form with the original product still selected.

Mobile checks at 390 and 320 pixels covered the overview, private-by-default dialog,
viewport fit and clearing an unsent draft on Escape. Screenshots are stored locally under
`output/playwright/product-comments-*.png`, `product-overview-jan-*.png` and
`product-comment-dialog-*.png`. The initial comment implementation passed the full UI
regression. The later personal-permission display and public-deletion extension passed all
850 frontend tests and 18 focused comment/personal-access API tests. Existing permission and
renewal API tests also passed. Data-model and OpenAPI documentation checks passed; API and UI
production images were rebuilt and started.

The deletion extension was exercised in the browser with a new public test comment on the
separate Prüflauf product: notice, creation, cancellation, confirmed author deletion, API
absence afterwards and no deletion control for Noémie. Evidence is in
`output/playwright/public-comment-deletion-notice.png` and `public-comment-deleted.png`.
The latest broad UI-regression run passed product request/permission scenarios, then stopped
with a `Runtime.evaluate` timeout while navigating the existing model hold-connection flow
(`scripts/edge_modeling_e2e.mjs`, `holdConnectionFlow`). That full run is not recorded as passed.
