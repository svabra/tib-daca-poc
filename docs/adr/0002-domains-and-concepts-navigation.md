# ADR 0002: Separate DaCa domains, glossary concepts, and I14Y Concepts in navigation

- Status: Accepted
- Date: 2026-09-07

## Context

The I14Y Public API has Concepts and themes but no Domain resource.  DaCa domains are governed
subject areas, the existing glossary is locally governed business terminology, and I14Y Concepts
are externally published reference definitions.  Labelling them as one resource would obscure
ownership and synchronization state.

## Decision

Rename the existing top-level navigation item to **Domäne und Terminology** while retaining the
`/domains` compatibility route.  Present separate route-backed areas for DaCa domains, the DaCa
glossary, synchronized I14Y Concepts, and I14Y/DCAT themes.  Add one top-level
**Datenmodelle** entry whose secondary navigation contains logical models, physical assets, and
the mapping workspace.

## Consequences

Users can distinguish local governance from external reference metadata, and the primary
navigation remains usable without adding several long top-level labels.
