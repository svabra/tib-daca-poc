from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import Any

from sqlalchemy import CheckConstraint, MetaData, UniqueConstraint

GENERATED_START = "<!-- BEGIN GENERATED: data-model. DO NOT EDIT. -->"
GENERATED_END = "<!-- END GENERATED: data-model. -->"


class DataModelDocumentationError(RuntimeError):
    pass


@dataclass(frozen=True)
class ContextSpec:
    key: str
    title: str
    model_path: str
    migrations_path: str
    database: str
    boundary: str
    table_descriptions: dict[str, str]
    json_notes: tuple[str, ...] = ()
    status_notes: tuple[str, ...] = ()


CATALOG_TABLES = {
    "access_requests": (
        "Requests by people or machines for time-bounded access, including renewals linked "
        "to immutable source-grant evidence."
    ),
    "administrative_organizations": "Ordered federal organization hierarchy covering the Federal Council, Chancellery, departments, offices and affiliated units.",
    "audit_events": "Append-only catalog audit trail keyed by stable resource type and identifier.",
    "canonical_ontology_terms": "Classes and properties belonging to one canonical ontology version.",
    "canonical_ontology_versions": "Versioned canonical DaCa ontologies; one version can be active.",
    "data_product_fields": "Technical schema fields and their business descriptions.",
    "data_products": "Catalog aggregate root for metadata, ownership, lifecycle and discoverability.",
    "demo_users": "PoC identities available to the demo identity switcher.",
    "endpoints": "Credential-free HTTP/REST or PostgreSQL endpoint descriptions.",
    "identity_directory_entries": "Synthetic trusted people searchable across federal, cantonal, municipal and federally affiliated sources.",
    "identity_group_memberships": "Time-bounded links from trusted groups to personal directory identities.",
    "identity_groups": "Versioned system or owner-managed identity groups that can be captured as immutable policy snapshots.",
    "governance_submissions": "Four-eyes publication evidence linking one immutable review snapshot to its exact policy revision, owner, approver and deployment state.",
    "lineage_edges": "URN-based lineage relations that may refer to products outside this catalog.",
    "metadata_publications": "Idempotent metadata submissions received from external source systems such as DAAIF.",
    "metadata_delivery_outbox": "Deduplicated local PoC evidence for simulated I14Y metadata deliveries.",
    "ontology_term_alignments": "Optional links from local canonical terms to verified external concepts.",
    "poc_product_fixtures": "Deterministic external-product fixtures used by the PoC submission flow.",
    "poc_simulation_events": "Append-only evidence for synthetic PoC event triggers, resets and fixture deletion.",
    "policy_deployments": "Observed deployment state of one policy revision in OPA or PostgreSQL.",
    "policy_revisions": "Versioned PBAC definitions and generated Rego for a data product.",
    "product_context_graphs": "KOBY Graphify PoC graph and its confirmation state.",
    "product_quality_assessments": "Server-computed evidence and medal for the six quality conditions.",
    "product_semantic_mappings": "Confirmed or proposed product/field mappings to canonical ontology terms.",
    "provenance_events": "Ordered, append-only history for a data product.",
    "seed_markers": "Idempotency markers for deterministic PoC seed operations.",
    "service_level_revisions": "Versioned, four-eyes-reviewed best-effort service-level definitions for a data product.",
    "workflow_tasks": "Owner and approver work items for quality, access governance, SLA review and request processing.",
}

CONTROL_PLANE_TABLES = {
    "audit_events": "Append-only control-plane audit trail for configuration aggregates.",
    "catalog_instances": "Registered standalone catalogs and their desired/observed state.",
    "deployment_observations": "Append-only observations of catalog configuration deployment state.",
    "health_observations": "Append-only catalog health checks used for status and SSE updates.",
    "sync_configurations": "Desired, currently non-executing metadata synchronization routes.",
    "trust_grants": "Directed trust from a provider catalog to a consumer catalog.",
}

SAMPLE_PRODUCT_TABLES = {
    "policy_deployments": "Latest policy revision projected into the protected PostgreSQL database.",
    "policy_entitlements": "Time-bounded person or machine grants used by forced RLS.",
    "tax_statistics": "Synthetic aggregate ESTV records protected by the HTTP PEP and PostgreSQL RLS.",
}

CONTEXTS = (
    ContextSpec(
        key="catalog",
        title="Catalog data model",
        model_path="services/catalog-api/src/daca_catalog/models.py",
        migrations_path="services/catalog-api/alembic/versions",
        database="PostgreSQL (`daca_catalog`; 18.4 local, 17 production)",
        boundary="The standalone catalog owns product metadata, workflows, access governance and semantic evidence.",
        table_descriptions=CATALOG_TABLES,
        json_notes=(
            "`data_products.keywords` is a string array; `contact`, `quality` and physical `metadata` hold DCAT-friendly extension objects.",
            "`endpoints.connection` describes only HTTP/REST or PostgreSQL connectivity and never contains credentials.",
            "`policy_revisions.definition` is the constrained PBAC document. Each grant targets one person, machine or group, carries its validity period, optional IANA-zone weekly availability and independent KOBY/MCP and I14Y flags; group grants contain a server-generated membership snapshot. Generated Rego is stored separately and is not editable.",
            "`governance_submissions.review_snapshot` preserves the exact product, grants, group memberships, office hours and policy revision reviewed by the assigned approver. `archive_evidence` records the BAR 20-year PoC choice without creating an archive job or network call.",
            "`metadata_delivery_outbox.payload` is a DCAT-oriented metadata snapshot for the local I14Y simulation. It contains no product data and no external delivery URL.",
            "`metadata_publications.normalized_payload` and `poc_product_fixtures.payload` retain normalized PoC metadata, never secrets.",
            "`product_context_graphs.graph` stores deterministic nodes and edges; flexible provenance/audit `details` contain metadata only.",
            "`service_level_revisions.definition` stores typed best-effort usage, freshness, support-window, maintenance and review-date commitments. Draft and rejection text remains private; published definitions are immutable and supersession is recorded explicitly.",
        ),
        status_notes=(
            "Product lifecycle is `draft`, `active`, `deprecated` or `retired`; classification is `public`, `internal`, `confidential` or `restricted`.",
            "Access requests progress through `submitted`, `identity_review`, `legal_review`, `conditions_review`, `approved_policy_pending`, a granted state, `rejected` or `withdrawn`. Granted states distinguish `granted_original` and `granted_modified`.",
            "Workflow task types include `metadata_quality`, `access_governance`, `publication_approval`, `service_level_approval`, `governance_correction`, `access_request_review`, simulation alerts and `group_membership_changed`; task states are `open`, `in_progress` and `completed`.",
            "Governance submissions progress through `pending_approval`, `approved_deploying`, `approved`, `rejected` or `deployment_failed`. Discoverability and metadata publication become active only after both PostgreSQL and OPA confirm the reviewed revision.",
            "Service-level revisions progress through `draft`, `pending_approval`, `published`, `rejected` or `withdrawn`. At most one draft or pending review exists per product, and a later publication records the effective end of the superseded revision.",
            "Identity sources are `federal`, `cantonal`, `municipal` and `federal_related`. Federal organizations are ordered by department and office and displayed as, for example, `EFD - BIT`. System groups are globally visible; custom groups are owner-isolated. Group membership revisions increase monotonically; existing policy snapshots never expand automatically.",
            "I14Y outbox entries use channel `i14y` and status `scheduled` or `simulated_delivered`; the PoC performs no external network request.",
            "Metadata publication modes are `governance_review` and `automatic`; stored states are `pending_review`, `published_incomplete` and `published`.",
            "Semantic mappings are `suggested`, `confirmed` or `unresolved`; mapping types are `product_class` and `field_property`. Ontology terms are `class`, `property` or `concept` and external alignments use `exactMatch` or `closeMatch`.",
            "Quality is derived from six persisted criteria: score 6 is `platinum`, 5 is `gold`, 4 is `silver`, and 0–3 is `bronze`. Fixture maturity uses `bronze`, `silver` and `gold` only.",
        ),
    ),
    ContextSpec(
        key="control-plane",
        title="Control-plane data model",
        model_path="services/control-plane-api/src/daca_control_plane/models.py",
        migrations_path="services/control-plane-api/alembic/versions",
        database="PostgreSQL (`daca_control_plane`)",
        boundary="The optional control plane observes catalogs and records desired federation configuration without becoming their runtime dependency.",
        table_descriptions=CONTROL_PLANE_TABLES,
        json_notes=(
            "`catalog_instances.capabilities` and all resource/owner/domain/product filters are string arrays.",
            "`audit_events.details` is an extensible metadata object and must not contain secrets or protected payloads.",
            "Sync configuration is desired state only: no federation traffic is implemented in this PoC.",
        ),
        status_notes=(
            "Catalog lifecycle is `active`, `suspended` or `retired`; health is `unknown`, `healthy`, `degraded` or `unreachable`.",
            "Trust grants are `pending`, `approved`, `revoked` or `expired` and are always directed from provider to consumer.",
            "Sync direction is `push` or `pull`; the only accepted conflict policy is `origin-wins`.",
            "Deployment observations are `pending`, `in-sync`, `drifted` or `failed`.",
        ),
    ),
    ContextSpec(
        key="sample-data-product",
        title="Sample data-product model",
        model_path="services/sample-data-product/app/models.py",
        migrations_path="services/sample-data-product/alembic/versions",
        database="PostgreSQL (`daca_sample`)",
        boundary="The sample ESTV product owns synthetic product rows and the local PostgreSQL authorization projection.",
        table_descriptions=SAMPLE_PRODUCT_TABLES,
        json_notes=(
            "The sample database contains no JSON columns. Policy grants arrive as catalog projections and are normalized into relational entitlement rows.",
        ),
        status_notes=(
            "Entitlement subject type is `person` or `machine`; action is currently `data.read`.",
            "Protocols are `http-rest` and `postgresql`; variants are `original` and `modified`.",
            "An entitlement is effective only when `active` is true, the current date is between `valid_from` and `valid_until` inclusive, and any optional weekday/time window matches in its IANA time zone. Window end time is exclusive.",
        ),
    ),
)


ROLE_DESCRIPTIONS = {
    "daca_catalog": "Owns and runs the standalone catalog schema.",
    "daca_control": "Owns and runs the control-plane schema.",
    "daca_sample_owner": "Migration/schema owner for the sample product; never used by consumers.",
    "daca_sample_api": "HTTP PEP database role; subject and protocol are set in the transaction.",
    "daca_policy_projector": "Writes projected entitlements and deployment revisions only.",
    "kanton-st-gallen": "Synthetic direct PostgreSQL consumer used for an allowed PoC path.",
    "kanton-bern": "Synthetic direct PostgreSQL consumer used for a denied PoC path.",
}

DATABASE_DESCRIPTIONS = {
    "daca_catalog": "Standalone product metadata, workflow, policy and semantic evidence.",
    "daca_control_plane": "Control-plane registry, trust, desired sync state and observations.",
    "daca_sample": "Protected sample product data and the policy projection used by RLS.",
}


def load_module(root: Path, relative_path: str, key: str) -> ModuleType:
    path = root / relative_path
    module_name = f"_daca_data_model_{key.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, path)
    if spec is None or spec.loader is None:
        raise DataModelDocumentationError(f"Cannot load SQLAlchemy models from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def load_metadata(root: Path, spec: ContextSpec) -> MetaData:
    module = load_module(root, spec.model_path, spec.key)
    base = getattr(module, "Base", None)
    if base is None or not isinstance(base.metadata, MetaData):
        raise DataModelDocumentationError(f"{spec.model_path} does not expose Base.metadata")
    return base.metadata


def discover_persistence_models(root: Path) -> set[str]:
    discovered: set[str] = set()
    for path in (root / "services").rglob("models.py"):
        relative = path.relative_to(root)
        if any(part.startswith(".") for part in relative.parts):
            continue
        source = path.read_text(encoding="utf-8")
        if "DeclarativeBase" in source and "__tablename__" in source:
            discovered.add(relative.as_posix())
    return discovered


def validate_context_inventory(root: Path, contexts: tuple[ContextSpec, ...] = CONTEXTS) -> None:
    discovered = discover_persistence_models(root)
    documented = {Path(spec.model_path).as_posix() for spec in contexts}
    unknown = sorted(discovered - documented)
    missing = sorted(documented - discovered)
    problems = []
    if unknown:
        problems.append(f"unknown persistence contexts: {', '.join(unknown)}")
    if missing:
        problems.append(f"documented model sources not found: {', '.join(missing)}")
    if problems:
        raise DataModelDocumentationError("; ".join(problems))


def validate_descriptions(metadata: MetaData, spec: ContextSpec) -> None:
    actual = set(metadata.tables)
    described = set(spec.table_descriptions)
    missing = sorted(actual - described)
    extra = sorted(described - actual)
    problems = []
    if missing:
        problems.append(f"missing descriptions: {', '.join(missing)}")
    if extra:
        problems.append(f"descriptions without tables: {', '.join(extra)}")
    if problems:
        raise DataModelDocumentationError(f"{spec.key}: {'; '.join(problems)}")


def normalized_source_bytes(path: Path) -> bytes:
    """Return source bytes with platform line endings normalized for stable hashes."""

    return path.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")


def migration_state(root: Path, spec: ContextSpec) -> tuple[list[str], str]:
    path = root / spec.migrations_path
    revisions: dict[str, str | None] = {}
    digest = hashlib.sha256()
    for migration in sorted(path.glob("*.py")):
        content = normalized_source_bytes(migration)
        digest.update(migration.name.encode())
        digest.update(b"\0")
        digest.update(content)
        tree = ast.parse(content.decode("utf-8"), filename=str(migration))
        values: dict[str, Any] = {}
        for node in tree.body:
            if isinstance(node, ast.Assign):
                targets = [target.id for target in node.targets if isinstance(target, ast.Name)]
                for target in targets:
                    if target in {"revision", "down_revision"}:
                        values[target] = ast.literal_eval(node.value)
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                if node.target.id in {"revision", "down_revision"} and node.value is not None:
                    values[node.target.id] = ast.literal_eval(node.value)
        revision = values.get("revision")
        if not isinstance(revision, str):
            raise DataModelDocumentationError(f"Cannot read revision from {migration}")
        down = values.get("down_revision")
        if down is not None and not isinstance(down, str):
            raise DataModelDocumentationError(
                f"Branching migrations are not supported by the documentation generator: {migration}"
            )
        revisions[revision] = down
    referenced = {down for down in revisions.values() if down is not None}
    heads = sorted(set(revisions) - referenced)
    if not heads:
        raise DataModelDocumentationError(f"No Alembic head found in {path}")
    return heads, digest.hexdigest()[:16]


def type_name(column: Any) -> str:
    return str(column.type).replace(" | ", "/")


def mermaid_type(column: Any) -> str:
    name = column.type.__class__.__name__.lower()
    aliases = {
        "biginteger": "bigint",
        "boolean": "boolean",
        "date": "date",
        "datetime": "datetime",
        "float": "float",
        "integer": "integer",
        "json": "json",
        "numeric": "numeric",
        "string": "string",
        "text": "text",
        "uuid": "uuid",
    }
    return aliases.get(name, re.sub(r"[^a-z0-9_]", "_", name))


def default_text(column: Any) -> str:
    default = column.default
    if default is None:
        default = column.server_default
        if default is None:
            return "—"
        value = getattr(default, "arg", default)
        return f"server: `{value}`"
    value = getattr(default, "arg", default)
    if callable(value):
        value = getattr(value, "__name__", value.__class__.__name__)
    elif isinstance(value, (dict, list)):
        value = json.dumps(value, sort_keys=True)
    return f"`{value}`"


def column_flags(table: Any, column: Any) -> list[str]:
    flags: list[str] = []
    if column.primary_key:
        flags.append("PK")
    if column.foreign_keys:
        flags.append("FK")
    unique_sets = {
        tuple(item.name for item in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }
    if column.unique or (column.name,) in unique_sets:
        flags.append("UK")
    return flags


def schema_signature(metadata: MetaData) -> str:
    signature: list[dict[str, Any]] = []
    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        signature.append(
            {
                "table": table.name,
                "columns": [
                    {
                        "name": column.name,
                        "type": type_name(column),
                        "nullable": column.nullable,
                        "flags": column_flags(table, column),
                        "default": default_text(column),
                        "foreign_keys": sorted(
                            f"{fk.target_fullname}:{fk.ondelete or ''}"
                            for fk in column.foreign_keys
                        ),
                    }
                    for column in table.columns
                ],
                "checks": sorted(
                    str(constraint.sqltext)
                    for constraint in table.constraints
                    if isinstance(constraint, CheckConstraint)
                ),
                "uniques": sorted(
                    tuple(column.name for column in constraint.columns)
                    for constraint in table.constraints
                    if isinstance(constraint, UniqueConstraint)
                ),
                "indexes": sorted(
                    (index.name or "", tuple(column.name for column in index.columns), index.unique)
                    for index in table.indexes
                ),
            }
        )
    encoded = json.dumps(signature, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()[:16]


def render_mermaid(metadata: MetaData) -> str:
    lines = ["```mermaid", "erDiagram"]
    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        lines.append(f"    {table.name} {{")
        for column in table.columns:
            flags = ",".join(column_flags(table, column))
            suffix = f" {flags}" if flags else ""
            lines.append(f"        {mermaid_type(column)} {column.name}{suffix}")
        lines.append("    }")
    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        for column in table.columns:
            for foreign_key in sorted(column.foreign_keys, key=lambda item: item.target_fullname):
                parent = foreign_key.column.table.name
                parent_cardinality = "o|" if column.nullable else "||"
                child_cardinality = "o|" if column.primary_key or column.unique else "o{"
                lines.append(
                    f"    {parent} {parent_cardinality}--{child_cardinality} "
                    f'{table.name} : "{column.name}"'
                )
    lines.append("```")
    return "\n".join(lines)


def render_constraints(table: Any) -> list[str]:
    rows: list[str] = []
    for constraint in sorted(
        table.constraints, key=lambda item: item.name or item.__class__.__name__
    ):
        if isinstance(constraint, CheckConstraint):
            rows.append(f"- Check `{constraint.name or 'unnamed'}`: `{constraint.sqltext}`")
        elif isinstance(constraint, UniqueConstraint):
            columns = ", ".join(column.name for column in constraint.columns)
            rows.append(f"- Unique `{constraint.name or 'unnamed'}`: `{columns}`")
    for column in table.columns:
        for foreign_key in sorted(column.foreign_keys, key=lambda item: item.target_fullname):
            delete = f"; on delete `{foreign_key.ondelete}`" if foreign_key.ondelete else ""
            rows.append(f"- Foreign key `{column.name}` → `{foreign_key.target_fullname}`{delete}")
    for index in sorted(table.indexes, key=lambda item: item.name or ""):
        columns = ", ".join(column.name for column in index.columns)
        unique = " unique" if index.unique else ""
        rows.append(f"- Index `{index.name}` on `{columns}`{unique}")
    return rows or ["- No additional constraints or explicit indexes."]


def render_table(table: Any, description: str) -> str:
    lines = [
        f"### `{table.name}`",
        "",
        description,
        "",
        "| Column | Type | Null | Keys | Default |",
        "|---|---|:---:|---|---|",
    ]
    for column in table.columns:
        nullable = "yes" if column.nullable else "no"
        keys = ", ".join(column_flags(table, column)) or "—"
        lines.append(
            f"| `{column.name}` | `{type_name(column)}` | {nullable} | {keys} | {default_text(column)} |"
        )
    lines.extend(["", "Constraints and indexes:", "", *render_constraints(table)])
    return "\n".join(lines)


def render_context_region(root: Path, spec: ContextSpec) -> str:
    metadata = load_metadata(root, spec)
    validate_descriptions(metadata, spec)
    heads, migration_fingerprint = migration_state(root, spec)
    lines = [
        f"- SQLAlchemy source: [`{spec.model_path}`](../../{spec.model_path})",
        f"- Alembic head: `{', '.join(heads)}`",
        f"- Schema fingerprint: `{schema_signature(metadata)}`",
        f"- Migration fingerprint: `{migration_fingerprint}`",
        f"- Tables: `{len(metadata.tables)}`",
        "",
        "## Domain status vocabulary",
        "",
        *(f"- {note}" for note in spec.status_notes),
        "",
        "## Persisted structured values",
        "",
        *(f"- {note}" for note in spec.json_notes),
        "",
        "## Entity relationships",
        "",
        render_mermaid(metadata),
        "",
        "Relationships in this diagram are physical foreign keys inside this database only.",
        "",
        "## Table reference",
        "",
    ]
    for table in sorted(metadata.tables.values(), key=lambda item: item.name):
        lines.extend([render_table(table, spec.table_descriptions[table.name]), ""])
    return "\n".join(lines).rstrip()


def context_template(spec: ContextSpec) -> str:
    external_note = ""
    if spec.key == "catalog":
        external_note = (
            "\n## DAAIF boundary\n\n"
            "DAAIF is an external source system and its internal data model is outside this repository. "
            "DaCa persists only the submitted publication envelope, normalized metadata, product fields and "
            "the resulting workflow evidence documented below. No DAAIF credentials or source records are stored.\n"
        )
    if spec.key == "sample-data-product":
        external_note = (
            "\n## Authorization boundary\n\n"
            "The catalog policy revision is projected into this database by product ID and revision. This is "
            "an application-level projection, not a cross-database foreign key. OPA protects HTTP access; forced "
            "PostgreSQL RLS independently evaluates the local entitlement projection.\n"
        )
    return (
        f"# {spec.title}\n\n"
        f"{spec.boundary}\n\n"
        f"**Storage:** {spec.database}.\n"
        f"{external_note}\n"
        f"{GENERATED_START}\n{GENERATED_END}\n"
    )


def parse_security_objects(root: Path) -> dict[str, list[str]]:
    init_path = root / "infra/postgres/init/00-create-databases.sh"
    init_text = init_path.read_text(encoding="utf-8")
    roles = sorted(
        {
            match.group(1) or match.group(2)
            for match in re.finditer(r'CREATE ROLE\s+(?:"([^"]+)"|([\w-]+))', init_text)
        }
    )
    databases = sorted(set(re.findall(r"CREATE DATABASE\s+([\w-]+)", init_text)))
    migration_text = "\n".join(
        path.read_text(encoding="utf-8")
        for path in sorted((root / "services/sample-data-product/alembic/versions").glob("*.py"))
    )
    functions = sorted(
        {
            f"{name}({args.strip()})"
            for name, args in re.findall(
                r"CREATE(?: OR REPLACE)? FUNCTION\s+([\w-]+)\(([^)]*)\)", migration_text
            )
        }
    )
    rls = sorted(
        {
            f"{table}: {mode.lower()}"
            for table, mode in re.findall(
                r"ALTER TABLE\s+([\w-]+)\s+(ENABLE|FORCE) ROW LEVEL SECURITY", migration_text
            )
        }
    )
    policies = sorted(
        {
            f"{policy} on {table}"
            for policy, table in re.findall(
                r"CREATE POLICY\s+([\w-]+)\s+ON\s+([\w-]+)", migration_text
            )
        }
    )
    return {
        "roles": roles,
        "databases": databases,
        "functions": functions,
        "rls": rls,
        "policies": policies,
    }


def validate_security_descriptions(objects: dict[str, list[str]]) -> None:
    for label, actual, described in (
        ("roles", set(objects["roles"]), set(ROLE_DESCRIPTIONS)),
        ("databases", set(objects["databases"]), set(DATABASE_DESCRIPTIONS)),
    ):
        if actual != described:
            raise DataModelDocumentationError(
                f"PostgreSQL {label} changed; update descriptions (actual={sorted(actual)}, described={sorted(described)})"
            )


def render_overview_region(root: Path) -> str:
    rows = []
    qualified_tables: list[str] = []
    for spec in CONTEXTS:
        metadata = load_metadata(root, spec)
        validate_descriptions(metadata, spec)
        heads, migration_fingerprint = migration_state(root, spec)
        rows.append(
            f"| [{spec.title}]({spec.key}.md) | {spec.database} | {len(metadata.tables)} | "
            f"`{', '.join(heads)}` | `{migration_fingerprint}` |"
        )
        qualified_tables.extend(f"{spec.key}.{name}" for name in sorted(metadata.tables))
    objects = parse_security_objects(root)
    validate_security_descriptions(objects)
    bootstrap_path = root / "infra/postgres/init/00-create-databases.sh"
    bootstrap_fingerprint = hashlib.sha256(normalized_source_bytes(bootstrap_path)).hexdigest()[:16]
    lines = [
        "| Persistence context | Storage | Tables | Alembic head | Migration fingerprint |",
        "|---|---|---:|---|---|",
        *rows,
        "",
        "## Cross-service data flow",
        "",
        "```mermaid",
        "flowchart LR",
        '    DAAIF["DAAIF (external)"] -->|metadata publication| CATALOG["Standalone DaCa catalog\\nPostgreSQL"]',
        '    CATALOG -->|published PBAC projection| OPA["OPA bundle"]',
        '    CATALOG -->|entitlements + revision| SAMPLE["Sample data product\\nPostgreSQL"]',
        '    CONTROL["Optional control plane\\nPostgreSQL"] -.->|health and desired configuration| CATALOG',
        '    CONSUMER["Person or machine"] -->|HTTP via PEP| SAMPLE',
        "    CONSUMER -->|PostgreSQL wire + RLS| SAMPLE",
        "```",
        "",
        "Arrows are API calls or projections, never cross-database foreign keys. The control plane is not a runtime dependency of a standalone catalog.",
        "",
        "## Qualified table inventory",
        "",
        "The context prefix disambiguates names such as the two independent `audit_events` tables.",
        "",
        *(f"- `{name}`" for name in qualified_tables),
        "",
        "## PostgreSQL roles and protected objects",
        "",
        f"Bootstrap fingerprint: `{bootstrap_fingerprint}` from [`infra/postgres/init/00-create-databases.sh`](../../infra/postgres/init/00-create-databases.sh).",
        "",
        "Roles declared by the local Compose bootstrap:",
        "",
        "| Role | Purpose |",
        "|---|---|",
        *(f"| `{role}` | {ROLE_DESCRIPTIONS[role]} |" for role in objects["roles"]),
        "",
        "Databases:",
        "",
        "| Database | Purpose |",
        "|---|---|",
        *(
            f"| `{database}` | {DATABASE_DESCRIPTIONS[database]} |"
            for database in objects["databases"]
        ),
        "",
        "Sample-product security objects:",
        "",
        *(f"- Function `{item}`" for item in objects["functions"]),
        *(f"- RLS `{item}`" for item in objects["rls"]),
        *(f"- Policy `{item}`" for item in objects["policies"]),
    ]
    return "\n".join(lines)


def overview_template() -> str:
    return f"""# DaCa persistent data model

This documentation is the durable reference for every persistence context owned by the DaCa
monorepo. Request and response DTOs remain documented by each service's OpenAPI document.

## Boundaries and sources of truth

- SQLAlchemy `Base.metadata` is the source for tables, columns, keys, constraints and indexes.
- Alembic is the immutable migration history; every current head and a migration fingerprint are recorded.
- PostgreSQL bootstrap and sample-product migrations are the source for roles, functions and RLS objects.
- DAAIF is external. Only the metadata publication and workflow evidence stored by DaCa are in scope.
- IDs passed between services are projections or references, not cross-database foreign keys.

Update generated sections with `npm run docs:data-model`. Validate them with
`npm run docs:data-model:check`; the root test command runs the same drift check.

{GENERATED_START}
{GENERATED_END}
"""


def replace_generated(document: str, generated: str) -> str:
    pattern = re.compile(re.escape(GENERATED_START) + r".*?" + re.escape(GENERATED_END), re.DOTALL)
    replacement = f"{GENERATED_START}\n\n{generated.rstrip()}\n\n{GENERATED_END}"
    updated, count = pattern.subn(lambda _match: replacement, document)
    if count != 1:
        raise DataModelDocumentationError(
            "Document must contain exactly one generated data-model region"
        )
    return updated.rstrip() + "\n"


def expected_documents(root: Path) -> dict[Path, str]:
    validate_context_inventory(root)
    docs_dir = root / "docs/data-model"
    expected: dict[Path, str] = {}
    index_path = docs_dir / "README.md"
    index_current = (
        index_path.read_text(encoding="utf-8") if index_path.exists() else overview_template()
    )
    expected[index_path] = replace_generated(index_current, render_overview_region(root))
    for spec in CONTEXTS:
        path = docs_dir / f"{spec.key}.md"
        current = path.read_text(encoding="utf-8") if path.exists() else context_template(spec)
        expected[path] = replace_generated(current, render_context_region(root, spec))
    return expected


def validate_rendered_document(path: Path, content: str) -> None:
    fence_count = len(re.findall(r"^```(?:mermaid)?$", content, re.MULTILINE))
    if fence_count != content.count("```mermaid") * 2:
        raise DataModelDocumentationError(f"Unbalanced Markdown fences in {path}")
    for target in re.findall(r"\[[^]]+\]\(([^)]+\.md)\)", content):
        linked = (path.parent / target).resolve()
        if not linked.exists() and linked.name not in {
            "README.md",
            "catalog.md",
            "control-plane.md",
            "sample-data-product.md",
        }:
            raise DataModelDocumentationError(f"Broken Markdown link in {path}: {target}")


def validate_document_set(expected: dict[Path, str]) -> None:
    data_model_dir = next(iter(expected)).parent
    known = {path.resolve() for path in expected}
    extra = sorted(
        path.name
        for path in data_model_dir.glob("*.md")
        if path.resolve() not in known and GENERATED_START in path.read_text(encoding="utf-8")
    )
    if extra:
        raise DataModelDocumentationError(
            "Generated data-model documents without a configured context: " + ", ".join(extra)
        )


def update_documents(root: Path, check: bool) -> list[str]:
    expected = expected_documents(root)
    validate_document_set(expected)
    drift: list[str] = []
    for path, content in expected.items():
        validate_rendered_document(path, content)
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current != content:
            drift.append(str(path.relative_to(root)))
            if not check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content, encoding="utf-8", newline="\n")
    return drift


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render or verify the DaCa persistent data-model documentation."
    )
    parser.add_argument(
        "--check", action="store_true", help="Fail if generated documentation is stale."
    )
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = args.root.resolve()
    try:
        drift = update_documents(root, check=args.check)
    except DataModelDocumentationError as error:
        print(f"Data-model documentation error: {error}", file=sys.stderr)
        return 1
    if args.check and drift:
        print("Data-model documentation is stale:", file=sys.stderr)
        for path in drift:
            print(f"  - {path}", file=sys.stderr)
        print("Run `npm run docs:data-model` and commit the updated files.", file=sys.stderr)
        return 1
    if drift:
        print("Updated data-model documentation:")
        for path in drift:
            print(f"  - {path}")
    else:
        print("Data-model documentation is current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
