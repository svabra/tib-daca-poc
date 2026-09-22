# Current status

## Logical-model capture and review

Logical-model drafts persist independently in PostgreSQL. Saving and submission are deliberately
separate: saving creates no task, while submission produces one immutable review snapshot and one
task for the selected domain's primary owner. The deputy remains visible but cannot decide. Reads
are catalog-wide; writes follow the imported department, office, and division hierarchy.

The capture form has contextual DE/FR/IT help, optional I14Y fields with reset actions, and an
optional organisation-derived identifier. Identifiers are whitespace-free and case-insensitively
reserved per logical-model root by PostgreSQL. `Geheim` remains shown but disabled for new
classification selection. Department is required; office, division, application name, and creator
type are optional.

The demo-user selector includes Giuseppe Starwars as Data Owner and Thomas Wikinger as Data
Steward in armasuisse, so both personas can be used in the VBS modelling scope.

Save errors present an actionable German explanation and focusable field errors directly below the
save action. Safe technical support details include the error code, HTTP status, request ID,
normalised PostgreSQL category/constraint, and timestamp; the copy button never contains SQL,
record values, or a stack trace. Only a real ETag conflict advises reloading.

## Logical-first and physical-first modelling

`Neues logisches Modell` offers two keyboard-accessible choices: an empty logical form or a start
from `Bestehende Datenquellen`. `/models/new` remains the logical-first deep link. The physical
entry now follows DAAIF: active source cards first, then a database/schema/table explorer for one
opened source. Every table exposes an actions button on hover/focus. Its context menu enables
`Logisches Modell ableiten`. A referenced table enables `Referenziertes logisches Modell öffnen`,
which opens the linked model's mapping workspace with its exact snapshot and table selected;
product-publication and DAAIF-investigation actions remain deliberately disabled.

Each connection card represents one system instance, identified by its catalog path; duplicate
active registrations of the same instance are consolidated while multiple PostgreSQL, S3, or future
Oracle instances remain distinct. The register has free-text search across instance name, catalog
path and owner, together with type and owner filters. The `SAP VIBDBU Gebäudebestand` demo source
is seeded as active and remains available for a new metadata import.

`Datenquellen` is now its own primary navigation item between `Meine Datenprodukte` and
`Domäne und Terminology`. The hierarchy uses the DAAIF server/provider, database, schema, table and
view icons rather than generic substitutes.
Tables already connected to a logical model display a model icon before the compact `…` menu;
its tooltip describes the link regardless of draft, review, validated, broken, or historical status.
It closes immediately when the pointer leaves the icon.

Direct derivation resolves only a unique governed domain already established for the source scope,
marks the technical I14Y decision as provisional no-match, creates the logical draft plus all
pinned 1:1 mappings in one transaction, and routes straight to the mapping workspace. The graph
describes the forward edge as `1:1 · wird repräsentiert durch`; its reverse reading is
`abgeleitet aus`. One logical
model can list and switch among multiple versioned physical representations; exact type-compatible
name matches are reviewed before becoming ordinary local drafts, with M:N and transformation
mappings still available manually.
The physical snapshot card in the mapping graph names the scope's Data Owner, displays the
matching data-source-type icon, and shows the complete canonical catalog path and pinned revision.
Graph edges use the rendered connector centres, keeping their endpoints aligned after metadata
changes the height of the snapshot card.

Direct derivation opens the mapping workspace with the selected logical field immediately editable
in a persistent right-hand panel. The graph or mapping table remains visible while name, business
object, type, length, precision/scale, order, nullability, cardinality, classification, descriptions,
source and I14Y links are changed and saved. Conventional model entry uses the same extracted Angular
field-characteristics component: fields appear in a selectable table, `Feld hinzufügen` and
`Entfernen` change its rows, and `Tabelle`/`Relation` switch between logical structure and physical
binding. `Model Merkmale` remains on `Modellebene`. Snapshot metadata prefills all defensible
technical values while domain semantics remain deliberate choices. Field help is tied
to the title itself, appears above it on hover/focus, repeats the title, closes when the pointer
leaves the title, closes any previously open field help, and uses no separate icon.
The logical-model overview renders its `Geändert` value with the local time as well as the date.

The released sample database migration provides `daca_sample.public.VIBDBU` with the 47 CSV-defined
fields and 1'000 deterministic synthetic Swiss-building records in every deployed environment. Its
seeded, scope-restricted PostgreSQL source includes the matching credential-free structural snapshot,
so it is browsable as Mirjam Keller immediately after deployment. Catalog snapshots store only
structure metadata and comments, never those rows or a connector credential.

## DAAIF reference journey

Journey 02 now contains an explicit hand-off from the closed-by-default DAAIF source explorer to
DaCa physical models and mappings. DaCa remains the semantic system of record. The documented
cross-system reference pins a logical-model URN plus model and mapping revision; it never carries
source content, credentials, a shared database key or an unversioned “current model” assumption.

## Quality gates

Run `npm run test:ui-regression` before every commit. The versioned pre-commit hook is installed
with `npm install` or `npm run setup:git-hooks`; the PR workflow runs the same Compose-based
browser journey and keeps failure evidence for three days only. Persistence changes also require
`npm run docs:data-model` followed by `npm run docs:data-model:check`.

## Continuation notes

Keep this file, `README.md`, the relevant design document, and the feature list current whenever
a user-visible workflow changes. The catalogue's required model-level reference is generated under
`docs/data-model/`; do not edit generated sections by hand.
