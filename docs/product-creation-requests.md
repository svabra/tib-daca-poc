# General derived-product requests

The form at `/product-creation-requests/new` preselects only the source product when opened
from its overview. The proposed title stays empty. New requests have no canton or tax-year
fields and never acquire SG/2026 defaults. Required fields are the proposed title, inclusive
data-basis window, purpose, legal mandate, selected delivery formats and requested update
frequency. The window selector offers **Fixes Zeitfenster** (inclusive start/end dates) or
**Rollierendes Zeitfenster** (a positive whole-number duration in days, weeks, months or years).
Fixed mode is the initial choice; dates and duration start empty. Rolling mode initially
offers months as its unit. Changing mode clears the other window's fields.

A rolling window is relative to the dataset's data-as-of point for each update, for example
the last 12 calendar months. It does not change access-grant validity. Update frequency is
selected independently, and the Data Owner implements the requested window in the query.
The request does not automatically install a scheduler or a date filter on arbitrary data.

The native format dropdown offers Parquet, HTTP REST API, CSV and Excel. Multiple selections
are collected beneath it and can be removed; duplicate choices are disabled. Formats are
stored as `parquet`, `http-rest`, `csv` and `xlsx`. The frequency dropdown separates
**Einmalig** from recurring updates with a disabled divider. Supported codes/labels:

| Code | Display |
| --- | --- |
| once | Einmalig |
| realtime | Real-time < 5 seconds |
| hourly | Stündlich |
| daily | Täglich |
| weekly | Wöchentlich |
| annually | Jährlich |

These are requested delivery requirements, not an automatic SLA or scheduler change. The
assigned Data Owner reviews them through the existing task and accept/reject workflow.
The owner and requester see all saved requirements in the request detail. Identity changes
discard all draft fields, selections and stale responses.

## API and compatibility

`POST /api/v1/product-creation-requests` accepts:

```json
{
  "sourceProductIds": ["11111111-1111-4111-8111-111111111111"],
  "proposedTitle": "Finanzplanung – historische Jahreswerte",
  "basisWindowType": "fixed",
  "basisFrom": "2016-01-01",
  "basisUntil": "2025-12-31",
  "purpose": "Analyse der historischen Jahreswerte für die Finanzplanung.",
  "legalBasis": "Gesetzlicher Statistikauftrag (synthetisches Testbeispiel).",
  "formats": ["parquet", "http-rest", "csv", "xlsx"],
  "updateFrequency": "once"
}
```

For a rolling request, replace `basisFrom` and `basisUntil` with
`"basisWindowType":"rolling", "rollingWindowSize":12, "rollingWindowUnit":"months"`.
Unit codes are `days`, `weeks`, `months`, `years`; size is an integer from 1 through 10,000.
The inactive window fields must be omitted or null; fixed dates and rolling duration cannot
be combined. Older fixed-period clients may omit `basisWindowType`, which defaults to `fixed`.

Fixed dates must form a complete ordered interval. Legal mandate and frequency are required;
unknown frequencies/formats, duplicate formats and mixed general/legacy scope are rejected
with 422. Owner identity still comes from trusted source records. No source-data access is
granted by creating a request, and only its requester/assigned owner can read it.

Migration `0051_creation_requirements` adds nullable date, legal-mandate and frequency
columns and makes the old `tax_year`/`canton_code` compatibility fields nullable. It preserves
existing requests and audit records. A database constraint requires either the complete old
scope or complete new requirements; date order and supported frequency are also checked.
The API still accepts explicitly scoped old canton/year requests for existing journey clients;
omitting general requirements does not silently select legacy defaults. Downgrade refuses
to discard stored general requests.

Additive migration `0052_creation_windows` adds the window discriminator, duration and unit.
Existing fixed-date and legacy canton/year requests retain all their data and receive the
fixed discriminator. Database checks enforce mutually exclusive windows and complete general
requirements. Downgrade refuses to discard rolling requests, including closed requests.

DAAIF receives the same context through its existing read-only bridge. General requests link
to its workspace rather than selecting an unrelated MWST notebook. The publication dialog
can propose the requested title/frequency and writes `creationRequestId` plus the fixed dates
or rolling discriminator/duration/unit as owner-reviewed product scope. Generic scope does not inject a canton/year SQL
filter. Existing MWST-scoped products retain their exact row validation and export behavior.
Fulfillment requires matching published scope, requested file/REST deliveries, an approved
SLA and effective requester access. No general row-permission mechanism is added.

## Verification

Fixed/rolling selection passed the form tests, API validation/persistence and fulfillment
tests, and DAAIF context/export tests. Migration 0052 preserved the contents of all existing
requests (checksum compared before/after). Real browser acceptance saved a 12-month rolling
request, reopened it for requester/owner, verified the DAAIF bridge and checked 390/320 px
layouts. The synthetic request was rejected by its owner after the check; no source access
was granted. Mixed fixed/rolling fields, missing units and nonpositive/fractional sizes fail
validation; fixed-period and legacy request tests remain compatible.

On 12 November 2026 the real browser submitted a general request with all four formats,
an inclusive date period, legal mandate and one-off frequency, and verified the same fields
in the requester/owner detail and DAAIF bridge. Another reader was denied. The synthetic
request was then rejected by its assigned owner to close its task. Empty-name behavior,
format removal/reselection, all frequency options and the disabled divider were checked.
Mobile checks at 390 and 320 pixels showed no horizontal overflow. Local screenshots are
`output/playwright/derived-request-*.png`.

All 852 frontend tests and 21 creation-request API tests passed. DAAIF's tabular exports,
publication context, notebook and journey checks passed; generic period metadata does not
introduce a canton/year filter. The migration ran on the local catalog with existing request
IDs preserved. Data-model/OpenAPI documentation checks passed; both applications run locally.
