# One product with four HTTP formats

DAAIF tabular products are cataloged once. Four ordinary `Endpoint` records point to the
same `data_product_id`, each using `protocol=http-rest` with its actual media type:

| Format | DAAIF path | Media type |
| --- | --- | --- |
| REST / JSON | `/api/public/data-products/{slug}` | `application/json` |
| CSV | `/api/public/data-products/{slug}/download/csv` | `text/csv; charset=utf-8` |
| Excel | `/api/public/data-products/{slug}/download/xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| Parquet | `/api/public/data-products/{slug}/download/parquet` | `application/vnd.apache.parquet` |

CSV, Excel and Parquet are HTTP representations, not additional authorization protocols.
One individual or group grant for this product's HTTP delivery covers all four, including
the same validity dates and weekly availability. Each DAAIF route calls the same policy
enforcer with the trusted DaCa product identifier before reading records. Missing identity,
denial and unavailable policy enforcement remain fail-closed. File exports contain the full
authorized product; REST supports pagination with `limit` and `offset`.

DAAIF registers missing representations through the existing owner-scoped endpoint API.
Product revision / `If-Match` checks prevent concurrent duplicates; endpoint additions create
normal audit entries. Registration preserves existing endpoints, product identity, SLA and
active policy revision. Failed initial registration prevents local activation. Existing
managed products retry registration during product-list reconciliation; successful registration
is cached for the process lifetime. The original metadata-publication payload and replay
hash stay compatible. No schema migration or new product records are needed.

The catalog selector uses only registered, recognized GET descriptors and their media types.
It links to `/dataproducts/{slug}?demoUser=...&format=rest|csv|xlsx|parquet` on the same DAAIF
origin. DAAIF starts the selected request immediately; file formats trigger a browser download,
and REST displays JSON. This landing page lets the browser send the existing demo identity
header to DAAIF without cross-origin data reads in DaCa. It grants no access by itself.
Demo identities are PoC behavior, not production authentication.

For an existing local installation, opening the DAAIF Data Products workbench triggers
registration. Inspect `/api/v1/data-products/{id}/endpoints` to verify all four descriptors.

## Verified local behavior

On 12 November 2026, browser acceptance selected every format from the SG example in DaCa,
opened DAAIF and saved CSV, XLSX and Parquet. REST and all three files contained the same
60 SG/2026 firms and CHF 10,703,041.83. The company source was also retrieved as four formats:
2,860 identical company-year rows and CHF 485,860,821.75. Unauthorized source requests were
denied in every format, while the separately authorized SG example remained accessible.
Desktop and 390/320 px catalog layouts passed; existing policies were retained.
