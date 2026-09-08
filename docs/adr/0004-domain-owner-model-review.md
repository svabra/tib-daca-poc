# ADR 0004: Domain-owner review publishes logical models

## Status

Accepted for the PoC.

## Decision

A Data Steward submits an immutable logical-model version against one DaCa domain. Submission
captures an immutable review snapshot and creates a task for that domain's primary Data Owner.
Acceptance creates the published successor and sets `dct:issued` transactionally; there is no
separate direct-publish endpoint. Rejection requires a comment and creates a
`changes_requested` successor plus a task for the submitting steward.

Federal scope is taken from the imported organization hierarchy. The reference journey correctly
places armasuisse under VBS and uses the chain `VBS → armasuisse → armasuisse Immobilien`.

## Consequences

Data Stewards cannot self-publish. Each write remains protected by actor scope, row locking and
`If-Match`; missing and stale preconditions remain `428` and `412`. Review history and task evidence
are retained instead of being deleted or rewritten.
