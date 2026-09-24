# Catalog documentation and responsibilities

## Navigation

Application glossary words use a light-gray wavy underline in the catalog UI, matching DAAIF's separate application glossary. Popup descriptions and detail links remain keyboard and pointer accessible.

The header information icon opens `/documentation`. Its three sections are User Journeys,
Static Documentation and DaCa Glossary. The former PoC guide journeys remain available at
their old deep links, while the main navigation points to the documentation hub.
Journey overview search matches title, summary, outcome, roles and tags; a selected topic tag further narrows the result. Tags belong to the DaCa journeys, while DAAIF presents its own separate stories. Existing deep links remain usable.

The DaCa glossary list and detail pages read only active terms from the dedicated
`site_glossary_terms` and `site_glossary_localizations` tables. They show ID, abbreviation,
localized term, short and detailed descriptions, and the explicit TERMDAT flag. The governed
business terminology stays in `glossary_terms` and its own localization, assignment and proposal
tables. Equal labels can exist independently in both stores; no terminology entry is imported
into the DaCa glossary merely because its label matches. The Catalog exposes the site glossary
read-only. Future editing and TERMDAT enrichment belong to the Control Plane, not to catalog
users; neither workflow is implemented yet.

The current application vocabulary is seeded with DaCa, role, domain, model, source, product and
role-protocol descriptions. Data Owner and Data Steward detail texts state tasks, authority and
accountability (AKV) within assigned scopes. The migration removes only known old UI seed rows
from business terminology when no governed relationship references them.

## Perspectives

`/settings/responsibilities` offers three views of the same read-only projection:

1. **Categories:** domains, logical models, physical representations and data products, with
   an object search, assigned people and related objects.
2. **People:** a role and object-count matrix with each person's assigned objects.
3. **Domains:** domain responsibilities plus related objects, their responsible people and roles.

The API combines existing persisted ownership and organization-scoped modeling roles with
additional rows in `catalog_object_responsibilities`. A physical table is identified by its
source and stable key, so a snapshot refresh does not change the assignment target. Direct
`physical_domain_assignments` connect a table to a domain before any logical model exists;
model-to-column mappings can add further table/domain links. The
projection filters products through the existing product visibility check and uses the same
catalog-readable source scope as the physical explorer. An additional responsibility row is
descriptive; it never changes API write permissions by itself. Authorization remains in the
existing domain, model, product and source workflows.

## Role-change protocol

`/settings/role-changes` displays the append-only `role_change_events` sequence. Migration
`0028_role_change_protocol` takes a clearly marked baseline of active assignments. PostgreSQL
triggers then capture changes to organization modeling roles, direct object responsibilities,
and owner/deputy fields on domains, dataset versions and data products. An advisory transaction
lock serializes writers before assigning sequence numbers. A separate trigger rejects update,
delete and truncate operations on the protocol itself. The API binds a validated local demo
actor to the database transaction; system and migration work are labelled explicitly.
The local fixture seed consults removal events before inserting a previously deleted seeded
modeling role or direct responsibility, and does not reactivate an inactive assignment.
Product fixture seeding likewise preserves owner/deputy changes recorded after the baseline.

The history endpoint reuses the responsibility projection's visible objects and the public
organization register before listing events, so an organization's last role removal remains
discoverable. It pages newest first with a sequence cursor. An event is descriptive evidence of a
change; it never grants a role or data access. The complete scenario and acceptance criteria
are in [UC: Änderung der Rollen](use-cases/role-changes.md). The accompanying User Journey is
`/documentation/journeys/overview-access-responsibility`.

## Glossary terms in the interface

`daca-glossary-word` is the reusable presentation component. A caller supplies a canonical
term and visible label. On first hover or keyboard focus, it requests the localized entry from
`/api/v1/documentation/glossary/lookup`; subsequent opens use the API service cache. A wavy
underline signals help, the popup shows only the short description, and its link opens the
complete glossary entry. `daca-role-term` maps stored role codes to canonical glossary terms,
so all three perspective views share the same tooltip and detail-link behavior. New interface
terms need a glossary row and a component placement, without copying tooltip text or URLs.
The popup remains open while the pointer crosses the small gap below its trigger (250 ms) and
while focus moves from the trigger to the glossary link. Leaving both closes it; Escape and an
outside click close it immediately. The component test covers the pointer transition and link.

Both APIs require a local session in the PoC. Demo identity and local sessions are not
production IAM.
