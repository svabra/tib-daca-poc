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

Save errors present an actionable German explanation and focusable field errors directly below the
save action. Safe technical support details include the error code, HTTP status, request ID,
normalised PostgreSQL category/constraint, and timestamp; the copy button never contains SQL,
record values, or a stack trace. Only a real ETag conflict advises reloading.

## Quality gates

Run `npm run test:ui-regression` before every commit. The versioned pre-commit hook is installed
with `npm install` or `npm run setup:git-hooks`; the PR workflow runs the same Compose-based
browser journey and keeps failure evidence for three days only. Persistence changes also require
`npm run docs:data-model` followed by `npm run docs:data-model:check`.

## Continuation notes

Keep this file, `README.md`, the relevant design document, and the feature list current whenever
a user-visible workflow changes. The catalogue's required model-level reference is generated under
`docs/data-model/`; do not edit generated sections by hand.
