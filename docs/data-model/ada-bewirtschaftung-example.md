# AdA administration example model

The [AdA example](../../examples/ada-bewirtschaftung/README.md) defines a proposed physical
PostgreSQL source model with 11 tables and 62 columns. It is separate from DaCa application
persistence and is not installed by migrations or seeds. Its CSV inventory can be imported using
the existing physical-model CSV workflow; the proposed SQL and synthetic rows are never executed
by that workflow.

`examples/ada-bewirtschaftung/build.py` is the shared source for the versioned CSV and DDL.
`schema.sql` defines primary/foreign keys, unique constraints, date/status checks, supporting
indexes and comments. `beispieldaten.sql` supplies three fictional people and associated
administrative records. `validate.py` checks generation drift, compatibility with the catalog's
actual CSV parser and PostgreSQL constraints in an explicitly named isolated test database.

The model covers administrative person/status data, organization hierarchy, assignment and rank
history, service events, call-ups, participation and qualifications. See the example README for
the relationship diagram, boundaries and rules requiring business confirmation.

Import uses the existing `physical_sources` (`adapter_type=csv`) and immutable physical snapshot
storage described in [catalog.md](catalog.md). Original CSV records retain proposed PK/FK,
nullability, default and classification declarations in `importMetadata.records`. They do not
create database constraints, runtime authorization or a live database connection. The structured
CSV projection continues to mark nullability as unknown. No migration, new catalog table,
seeding policy or external-system data model is introduced.

## Download and scoped journey reset

`build.py` also generates the identical catalog-package CSV fixture used by the download and
reset APIs. The fixture is a versioned input, not a database seed. No extra persistence is added.
The server derives the stable scoped inventory ID from the fixture's canonical fingerprint.
Reset requires the same organization roles, row lock, revision and reference guards as ordinary
inventory deletion, plus the import's advisory transaction lock. It removes the example's source,
owned snapshots, structure and drift reports through the shared deletion service. Current or
historical logical/mapping references block removal; the transaction rolls back on conflicts.
The existing append-only `structure-inventory/deleted` event retains actor, time, name, scope,
revision and structure counts. Repeating a reset of an absent source creates no extra deletion
event. Reimport retains the stable source ID but advances its revision from durable audit history,
so an old reset confirmation cannot delete a later import. Other inventories are never selected
by the journey reset API.
