"""Operator-provisioned, synthetic CPS catalog metadata; no live connections or log payloads."""

from datetime import date

from sqlalchemy import select

from .modeling_core import canonical_hash, stable_uuid
from .modeling_schemas import AssetMappingWrite, LogicalModelWrite
from .modeling_service import (
    create_asset_mapping,
    create_logical_model,
    persist_physical_import,
    record_audit,
)
from .models import (
    AdministrativeOrganization,
    CatalogObjectResponsibility,
    DataModelRoleAssignment,
    DataProduct,
    DataProductDomain,
    DataProductGlossaryTerm,
    DemoUser,
    Domain,
    DomainLocalization,
    FederalPersonMembership,
    GlossaryTerm,
    GlossaryTermDomain,
    GlossaryTermLocalization,
    IdentityDirectoryEntry,
    LogicalEntityVersion,
    LogicalFieldVersion,
    PhysicalColumn,
    PhysicalDatabase,
    PhysicalDomainAssignment,
    PhysicalSchema,
    PhysicalSource,
    PhysicalTable,
    SeedMarker,
    SemanticGraphState,
)

ORG = "efd-bit-ps-cps"
OWNER = "marcello.hebeisa"
DEPUTY = "matteo.duca"
MARKER = "rohs-cps-catalog-v1"
CATALOG = "urn:daca:catalog:bit-poc"


def identity(key):
    return stable_uuid(f"rohs-cps:{key}")


DOMAIN_SPECS = (
    (
        "telemetry",
        "ROHS Plattform-Telemetrie",
        "Detaillierte technische Logs, Metriken und Ereignisse der ROHS Container-Plattform. Synthetische PoC-Metadaten ohne produktive Nutzdaten.",
    ),
    (
        "analytics",
        "ROHS Betriebsanalytik",
        "Aggregierte Zuverlässigkeits-, Kapazitäts- und SLO-Auswertungen für mehrere Plattformteams. Synthetische PoC-Metadaten.",
    ),
)
TERM_SPECS = (
    (
        "cluster",
        "ROHS Cluster",
        "Logische Gruppe von Container-Nodes als Betriebs- und Auswertungsgrenze.",
        "telemetry",
    ),
    (
        "namespace",
        "ROHS Namespace",
        "Mandantenbezogener Namensraum auf der Container-Plattform; keine Berechtigungsfreigabe durch den Katalog.",
        "telemetry",
    ),
    (
        "container-event",
        "Container-Ereignis",
        "Zeitgestempeltes technisches Ereignis mit Cluster, Namespace, Pod, Container und Schweregrad.",
        "telemetry",
    ),
    (
        "slo",
        "Service Level Objective",
        "Messbares Ziel für Zuverlässigkeit oder Latenz eines Plattformdienstes.",
        "analytics",
    ),
    (
        "error-budget",
        "Error Budget",
        "Im SLO-Zeitfenster zulässiger Anteil fehlerhafter Anfragen oder Ausfallzeit.",
        "analytics",
    ),
    (
        "cpu",
        "CPU-Auslastung",
        "Verbrauchte CPU-Zeit pro Container, für die Kapazitätsanalyse zeitlich aggregiert.",
        "analytics",
    ),
)
RAW_FIELDS = [
    ("occurred_at", "dateTime"),
    ("cluster_id", "string"),
    ("namespace", "string"),
    ("pod_id", "string"),
    ("container_id", "string"),
    ("severity", "string"),
    ("event_code", "string"),
    ("trace_id", "string"),
    ("duration_ms", "decimal"),
]
METRIC_FIELDS = [
    ("sampled_at", "dateTime"),
    ("cluster_id", "string"),
    ("namespace", "string"),
    ("metric_name", "string"),
    ("metric_value", "decimal"),
    ("unit", "string"),
]
ANALYTIC_FIELDS = [
    ("window_start", "dateTime"),
    ("cluster_id", "string"),
    ("namespace", "string"),
    ("request_count", "integer"),
    ("error_rate", "decimal"),
    ("p95_latency_ms", "decimal"),
    ("cpu_utilization", "decimal"),
    ("slo_attainment", "decimal"),
]


class SyntheticStructure:
    def __init__(self, database, schema, tables):
        self.raw = {
            "databases": [{"name": database, "schemas": [{"name": schema, "tables": tables}]}]
        }

    def inspect(self, *, variant=None):
        return self.raw


def responsibility(session, target, object_id):
    for user, role in ((OWNER, "data_owner"), (DEPUTY, "deputy_data_owner")):
        session.add(
            CatalogObjectResponsibility(
                id=identity(f"responsibility:{target}:{object_id}:{user}"),
                user_id=user,
                role=role,
                organization_id=ORG,
                **{target: object_id},
                provenance="explicit",
            )
        )


def seed_rohs_cps_catalog(session):
    # A committed marker makes restart non-destructive: never resurrect retired objects,
    # revoked roles, removed assignments, or overwrite later editorial/ownership changes.
    if session.get(SeedMarker, MARKER):
        return
    if session.get(AdministrativeOrganization, "efd-bit") is None:
        return
    for org_id, parent, code, name in (
        ("efd-bit-ps", "efd-bit", "BIT-PS", "BIT · Plattform Services (PS)"),
        (ORG, "efd-bit-ps", "BIT-PS-CPS", "BIT · PS · Container Platform Services (CPS)"),
    ):
        if session.get(AdministrativeOrganization, org_id) is None:
            session.add(
                AdministrativeOrganization(
                    id=org_id,
                    parent_id=parent,
                    department_code="EFD",
                    office_code=code,
                    display_name=name,
                    organization_type="affiliated",
                    department_order=5,
                    office_order=990,
                    active=True,
                )
            )
            session.flush()
    for user, name, role in (
        (OWNER, "Marcello Hebeisa", "data_owner"),
        (DEPUTY, "Matteo Duca", "deputy_data_owner"),
    ):
        if session.get(DemoUser, user) is None:
            session.add(
                DemoUser(
                    id=user,
                    display_name=name,
                    organization="EFD–BIT–PS–CPS",
                    email=f"{user}@example.invalid",
                    roles=[role],
                    preferences={},
                    active=True,
                    selectable=True,
                )
            )
            session.flush()
            session.add(
                IdentityDirectoryEntry(
                    id=user,
                    display_name=name,
                    organization="EFD–BIT–PS–CPS",
                    organization_id=ORG,
                    email=f"{user}@example.invalid",
                    source="federal",
                    source_system="rohs-cps-poc",
                    active=True,
                )
            )
            session.add(
                FederalPersonMembership(
                    id=identity(f"membership:{user}"),
                    user_id=user,
                    organization_id=ORG,
                    is_primary=True,
                    valid_from=date(2026, 10, 31),
                )
            )
            session.add(
                DataModelRoleAssignment(
                    id=identity(f"role:{user}"),
                    user_id=user,
                    department_code="EFD",
                    organization_id=ORG,
                    role=role,
                    delegated_owner_user_id=OWNER if user == DEPUTY else None,
                    active=True,
                )
            )
    session.flush()
    for key, label, definition in DOMAIN_SPECS:
        domain_id = identity(f"domain:{key}")
        session.add(
            Domain(
                id=domain_id,
                urn=f"urn:daca:domain:rohs-cps:{key}",
                origin_catalog_id=CATALOG,
                revision=1,
                content_hash=canonical_hash(
                    {"label": label, "definition": definition, "owner": OWNER, "deputy": DEPUTY}
                ),
                lifecycle="active",
                owner_user_id=OWNER,
                deputy_owner_user_id=DEPUTY,
            )
        )
        session.flush()
        session.add(
            DomainLocalization(
                domain_id=domain_id,
                language="de",
                preferred_label=label,
                definition=definition,
                normalized_label=label.casefold(),
            )
        )
        responsibility(session, "domain_id", domain_id)
    session.flush()
    for key, label, definition, domain in TERM_SPECS:
        term_id = identity(f"term:{key}")
        session.add(
            GlossaryTerm(
                id=term_id,
                urn=f"urn:daca:term:rohs-cps:{key}",
                origin_catalog_id=CATALOG,
                revision=1,
                lifecycle="active",
                content_hash=canonical_hash({"label": label, "definition": definition}),
            )
        )
        session.flush()
        session.add(
            GlossaryTermLocalization(
                term_id=term_id,
                language="de",
                preferred_label=label,
                definition=definition,
                normalized_label=label.casefold(),
                alternative_labels=[],
            )
        )
        session.add(GlossaryTermDomain(term_id=term_id, domain_id=identity(f"domain:{domain}")))
        responsibility(session, "glossary_term_id", term_id)
    for key, title, description in (
        (
            "telemetry",
            "ROHS Container-Ereignisse",
            "Synthetisches detailliertes Log-Datenprodukt für Plattformbetrieb, Incident-Analyse und mehrere Konsumenten. Keine echten Logs, Personenkennungen oder Geheimnisse.",
        ),
        (
            "analytics",
            "ROHS SLO & Kapazitätsanalyse",
            "Synthetische zeitlich aggregierte Plattformkennzahlen für Betriebsteams, Service-Verantwortliche und Kapazitätsplanung.",
        ),
    ):
        product_id = identity(f"product:{key}")
        session.add(
            DataProduct(
                id=product_id,
                urn=f"urn:daca:ch:bit:cps:rohs-{key}",
                origin_catalog=CATALOG,
                title=title,
                description=description,
                owner="Marcello Hebeisa · EFD–BIT–PS–CPS",
                owner_user_id=OWNER,
                deputy_owner_user_id=DEPUTY,
                domain=DOMAIN_SPECS[0 if key == "telemetry" else 1][1],
                lifecycle="draft",
                classification="internal",
                discoverable=True,
                keywords=["ROHS", "Container", "CPS", "synthetisch", "Observability"],
                contact={"email": f"{OWNER}@example.invalid"},
                quality={"synthetic": True},
                extra_metadata={"organizationId": ORG, "departmentCode": "EFD", "fixture": MARKER},
                update_frequency="PT1M",
            )
        )
        session.flush()
        session.add(
            DataProductDomain(
                data_product_id=product_id,
                domain_id=identity(f"domain:{key}"),
                assigned_by_user_id=OWNER,
            )
        )
        responsibility(session, "data_product_id", product_id)
        for term_key, _, _, domain in TERM_SPECS:
            if domain == key:
                session.add(
                    DataProductGlossaryTerm(
                        data_product_id=product_id,
                        glossary_term_id=identity(f"term:{term_key}"),
                        assigned_by_user_id=OWNER,
                    )
                )
    session.flush()
    specifications = (
        (
            "prometheus",
            "ROHS Prometheus · Metrik-Export",
            "csv",
            "ROHS",
            "PROMETHEUS",
            "metric_samples",
            METRIC_FIELDS,
            "telemetry",
        ),
        (
            "grafana",
            "ROHS Grafana · Dashboard-Ereignisse",
            "csv",
            "ROHS",
            "GRAFANA",
            "dashboard_events",
            RAW_FIELDS,
            "telemetry",
        ),
        (
            "postgresql",
            "ROHS PostgreSQL · Container-Logs",
            "postgresql",
            "rohs",
            "observability",
            "container_events",
            RAW_FIELDS,
            "telemetry",
        ),
        (
            "s3",
            "ROHS S3 · Analytics Parquet",
            "s3",
            "rohs-poc-analytics",
            "curated",
            "platform_metrics.parquet",
            ANALYTIC_FIELDS,
            "analytics",
        ),
    )
    for key, name, adapter, database, schema, table_name, fields, domain in specifications:
        source = PhysicalSource(
            id=identity(f"source:{key}"),
            urn=f"urn:daca:physical-source:rohs-cps:{key}",
            origin_catalog_id=CATALOG,
            name=name,
            description="Synthetische PoC-Strukturmetadaten. Keine Live-Anbindung, keine produktiven Logs und keine Zugangsdaten. Prometheus/Grafana sind deklarierte Exportstrukturen.",
            adapter_type=adapter,
            config_ref=None,
            department_code="EFD",
            organization_id=ORG,
            revision=1,
            content_hash=canonical_hash({"fixture": MARKER, "source": key}),
            lifecycle="active",
            created_by_user_id=OWNER,
        )
        session.add(source)
        session.flush()
        table_data = {
            "name": table_name,
            "kind": "parquet" if adapter == "s3" else "table",
            "comment": "Synthetische technische Struktur; keine Nutzdaten.",
            "columns": [
                {
                    "name": field,
                    "dataType": {
                        "dateTime": "timestamp with time zone",
                        "string": "text",
                        "integer": "bigint",
                        "decimal": "numeric",
                    }[data_type],
                    "nullable": index > 1,
                }
                for index, (field, data_type) in enumerate(fields)
            ],
        }
        if adapter == "s3":
            table_data.update(
                storageLocation="s3://rohs-poc-analytics/curated/platform_metrics.parquet",
                mediaType="application/vnd.apache.parquet",
                schemaConfidence="declared",
            )
        snapshot, _ = persist_physical_import(
            session, source, SyntheticStructure(database, schema, [table_data]), OWNER
        )
        table = session.scalar(
            select(PhysicalTable)
            .join(PhysicalSchema)
            .join(PhysicalDatabase)
            .where(PhysicalDatabase.snapshot_id == snapshot.id)
        )
        session.add(
            PhysicalDomainAssignment(
                id=identity(f"physical-domain:{key}"),
                physical_source_id=source.id,
                physical_table_key=table.stable_key,
                domain_id=identity(f"domain:{domain}"),
                provenance="explicit",
            )
        )
        responsibility(session, "physical_source_id", source.id)
        body = LogicalModelWrite.model_validate(
            {
                "identifiers": [f"ROHS-CPS-{key.upper()}-001"],
                "localizations": [
                    {
                        "language": "de",
                        "title": f"ROHS · {table_name}",
                        "description": f"Synthetisches fachliches Entwurfsmodell für {name}. Rohdaten und Analysen der Container-Plattform; vor Publikation fachlich prüfen.",
                    }
                ],
                "dataOwnerUserId": OWNER,
                "deputyOwnerUserId": DEPUTY,
                "creator": {
                    "type": "InternalOrganisation",
                    "organizationId": ORG,
                    "englishName": "Container Platform Services",
                },
                "dataDomainId": identity(f"domain:{domain}"),
                "departmentCode": "EFD",
                "organizationId": ORG,
                "dataClassification": "internal",
                "dateCreated": "2026-10-31",
                "contactPoints": [{"name": "CPS Data Owner", "email": f"{OWNER}@example.invalid"}],
                "publisher": {
                    "name": "BIT · PS · CPS",
                    "identifier": ORG,
                    "uri": f"urn:daca:organization:{ORG}",
                },
                "accessRights": "urn:daca:access-rights:internal",
                "entities": [
                    {
                        "name": table_name.replace(".parquet", ""),
                        "position": 0,
                        "fields": [
                            {
                                "name": field,
                                "dataType": data_type,
                                "position": index,
                                "nullable": index > 1,
                                "sourceSystem": name,
                                "classification": "internal",
                                "conceptMatchExplicitlyNone": True,
                            }
                            for index, (field, data_type) in enumerate(fields)
                        ],
                    }
                ],
            }
        )
        model, version = create_logical_model(
            session, body, OWNER, model_id=identity(f"model:{key}")
        )
        responsibility(session, "logical_model_id", model.id)
        entity = session.scalar(
            select(LogicalEntityVersion).where(
                LogicalEntityVersion.logical_model_version_id == version.id
            )
        )
        logical = list(
            session.scalars(
                select(LogicalFieldVersion)
                .where(LogicalFieldVersion.logical_entity_version_id == entity.id)
                .order_by(LogicalFieldVersion.position)
            )
        )
        physical = list(
            session.scalars(
                select(PhysicalColumn)
                .where(PhysicalColumn.physical_table_id == table.id)
                .order_by(PhysicalColumn.ordinal_position)
            )
        )
        for field, column in zip(logical, physical, strict=True):
            create_asset_mapping(
                session,
                AssetMappingWrite(
                    logical_model_version_id=version.id,
                    physical_snapshot_id=snapshot.id,
                    mapping_type="Direct",
                    classification="internal",
                    responsible_user_id=OWNER,
                    valid_from=date(2026, 10, 31),
                    logical_field_version_ids=[field.id],
                    physical_column_ids=[column.id],
                    comment="Synthetischer technischer Herkunftsentwurf; fachlich prüfen.",
                ),
                OWNER,
            )
    graph = session.get(SemanticGraphState, "domains")
    if graph is None:
        graph = SemanticGraphState(
            graph_key="domains",
            revision=0,
            positions={},
            relations=[],
            hidden_node_ids=[],
            additional_node_ids=[],
            updated_by_user_id=OWNER,
        )
        session.add(graph)
    graph.relations = [
        *graph.relations,
        {
            "sourceId": str(identity("domain:telemetry")),
            "targetId": str(identity("domain:analytics")),
            "relationType": "interfacesWith",
        },
    ]
    graph.revision += 1
    graph.updated_by_user_id = OWNER
    record_audit(
        session,
        "semantic-graph",
        "domains",
        "rohs-cps-fixture-added",
        OWNER,
        graph.revision,
        {"fixture": MARKER},
    )
    session.add(SeedMarker(name=MARKER))
    session.flush()


if __name__ == "__main__":
    from .database import default_session_factory
    from .settings import get_settings
    from .site_glossary_seed import seed_site_glossary_terms

    with default_session_factory(get_settings())() as session:
        seed_rohs_cps_catalog(session)
        seed_site_glossary_terms(session)
        session.commit()
    print("ROHS CPS metadata and system glossary are current; existing catalog edits preserved.")
