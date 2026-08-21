from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from .database import default_session_factory
from .models import (
    AccessRequest,
    AuditEvent,
    DataProduct,
    Endpoint,
    LineageEdge,
    PolicyDeployment,
    PolicyRevision,
    ProvenanceEvent,
    SeedMarker,
)
from .policy import generate_rego
from .settings import get_settings
from .workflow_seed import seed_workflow_reference_data

SEED_NAME = "daca-estv-portfolio-v2"
OWNER_SEED_NAME = "daca-estv-owner-profiles-v3"
RELATIONSHIP_SEED_NAME = "daca-estv-access-relationships-v1"
NEUCHATEL_SEED_NAME = "daca-neuchatel-request-products-v1"
OWNER_INBOX_SEED_NAME = "daca-owner-inbox-request-v1"
ACCESS_CONSUMER_SEED_NAME = "daca-active-access-consumers-v1"
ESTV_PRODUCT_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
ESTV_PRODUCT_URN = "urn:daca:ch:estv:tax-statistics-by-canton"
NEUCHATEL_CORPORATE_PRODUCT_ID = uuid.UUID("17777777-7777-4777-8777-777777777777")
KASSANDRA_USER_ID = "kassandra.valdata"

DATA_OWNER_PROFILES = {
    uuid.UUID("11111111-1111-4111-8111-111111111111"): {
        "name": "Kassandra Valdata",
        "organization": "ESTV",
        "avatarUrl": "/assets/kassandra-valdata.webp",
    },
    uuid.UUID("12222222-2222-4222-8222-222222222222"): {
        "name": "Kassandra Valdata",
        "organization": "ESTV",
        "avatarUrl": "/assets/kassandra-valdata.webp",
    },
    uuid.UUID("13333333-3333-4333-8333-333333333333"): {
        "name": "Ariane Keller",
        "organization": "ESTV",
        "avatarUrl": "/assets/data-owners/ariane-keller.webp",
    },
    uuid.UUID("14444444-4444-4444-8444-444444444444"): {
        "name": "Noémie Rochat",
        "organization": "Kanton Neuchâtel",
        "avatarUrl": "/assets/data-owners/noemie-rochat.webp",
        "phone": "+41 58 000 00 42",
        "teamsUrl": "https://teams.microsoft.com/l/chat/0/0?users=noemie.rochat%40example.admin.ch",
    },
    uuid.UUID("15555555-5555-4555-8555-555555555555"): {
        "name": "Daniel Aebischer",
        "organization": "EFV",
        "avatarUrl": "/assets/data-owners/daniel-aebischer.webp",
    },
    uuid.UUID("16666666-6666-4666-8666-666666666666"): {
        "name": "Kassandra Valdata",
        "organization": "ESTV",
        "avatarUrl": "/assets/kassandra-valdata.webp",
    },
    NEUCHATEL_CORPORATE_PRODUCT_ID: {
        "name": "Noémie Rochat",
        "organization": "Kanton Neuchâtel",
        "avatarUrl": "/assets/data-owners/noemie-rochat.webp",
        "phone": "+41 58 000 00 42",
        "teamsUrl": "https://teams.microsoft.com/l/chat/0/0?users=noemie.rochat%40example.admin.ch",
    },
}

ACCESS_RELATIONSHIPS = {
    uuid.UUID("11111111-1111-4111-8111-111111111111"): {
        "sharedByUserIds": [KASSANDRA_USER_ID],
        "requestedByUserIds": [],
        "sharedWithUserIds": [],
    },
    uuid.UUID("12222222-2222-4222-8222-222222222222"): {
        "sharedByUserIds": [],
        "requestedByUserIds": [],
        "sharedWithUserIds": [],
    },
    uuid.UUID("13333333-3333-4333-8333-333333333333"): {
        "sharedByUserIds": [],
        "requestedByUserIds": [],
        "sharedWithUserIds": [KASSANDRA_USER_ID],
    },
    uuid.UUID("14444444-4444-4444-8444-444444444444"): {
        "sharedByUserIds": [],
        "requestedByUserIds": [KASSANDRA_USER_ID],
        "sharedWithUserIds": [],
    },
    uuid.UUID("15555555-5555-4555-8555-555555555555"): {
        "sharedByUserIds": [],
        "requestedByUserIds": [],
        "sharedWithUserIds": [KASSANDRA_USER_ID],
    },
    uuid.UUID("16666666-6666-4666-8666-666666666666"): {
        "sharedByUserIds": [KASSANDRA_USER_ID],
        "requestedByUserIds": [],
        "sharedWithUserIds": [],
    },
    NEUCHATEL_CORPORATE_PRODUCT_ID: {
        "sharedByUserIds": [],
        "requestedByUserIds": [KASSANDRA_USER_ID],
        "sharedWithUserIds": [KASSANDRA_USER_ID],
    },
}


def seeded_policy_definition() -> dict:
    return {
        "effect": "allow",
        "subjects": {"userIds": ["kanton-st-gallen"]},
        "resources": {"productUrns": [ESTV_PRODUCT_URN], "owners": ["ESTV"]},
        "actions": ["data.read"],
        "protocols": ["http", "postgresql"],
    }


def build_neuchatel_corporate_product(created: datetime) -> DataProduct:
    return DataProduct(
        id=NEUCHATEL_CORPORATE_PRODUCT_ID,
        urn="urn:daca:ch:ne:corporate-federal-tax-factors",
        origin_catalog="urn:daca:catalog:neuchatel",
        revision=6,
        active_policy_revision=None,
        title="Juristische Personen Neuchâtel – Steuerfaktoren für die direkte Bundessteuer",
        description=(
            "Synthetische aggregierte Steuerfaktoren juristischer Personen aus dem Kanton "
            "Neuchâtel für den Abgleich der direkten Bundessteuer; keine Einzel- oder Personendaten."
        ),
        owner="Kanton Neuchâtel",
        domain="Direkte Bundessteuer",
        lifecycle="active",
        classification="restricted",
        keywords=["Juristische Personen", "Bundessteuer", "Neuchâtel", "Gemeinden"],
        contact={
            "name": "Noémie Rochat",
            "email": "noemie.rochat@example.admin.ch",
            "phone": "+41 58 000 00 42",
        },
        license="Interadministrative Nutzung – POC",
        quality={"completenessPercent": 96, "aggregationLevel": "Gemeinde und Branche"},
        update_frequency="quarterly",
        extra_metadata={
            "language": ["fr", "de"],
            "spatial": "Kanton Neuchâtel und Gemeinden",
            "temporalCoverage": "2025/2026",
            "containsPersonalData": False,
            "connectedAuthorities": [
                "Kanton Neuchâtel",
                "Gemeinden des Kantons Neuchâtel",
                "ESTV",
            ],
            "deliveryProtocols": ["REST"],
            "dataOwner": DATA_OWNER_PROFILES[NEUCHATEL_CORPORATE_PRODUCT_ID],
            "catalogUsage": {
                "consumerUserIds": [KASSANDRA_USER_ID],
                "consumerMachineIds": [
                    {
                        "id": "svc-estv-corporate-tax-reconciliation",
                        "label": "Unternehmenssteuer-Abgleich",
                    }
                ],
                "responsibleUserIds": [],
                **ACCESS_RELATIONSHIPS[NEUCHATEL_CORPORATE_PRODUCT_ID],
            },
            "accessRequest": {
                "requestId": "AR-NE-2026-0148",
                "status": "granted_modified",
                "updatedAt": "2026-08-09T10:10:00Z",
                "detail": (
                    "Freigegeben mit Aggregation auf Gemeinde- und Branchenebene; "
                    "Einzelwerte bleiben ausgeschlossen."
                ),
            },
        },
        created_at=created,
        updated_at=datetime(2026, 8, 9, 10, 10, tzinfo=UTC),
    )


def seed_catalog(session: Session) -> bool:
    """Insert deterministic, aggregate-only POC records once. Returns whether data was added."""
    if session.get(SeedMarker, SEED_NAME) is not None:
        owner_profiles_added = seed_owner_profiles(session)
        relationships_added = seed_access_relationships(session)
        neuchatel_products_added = seed_neuchatel_products(session)
        owner_inbox_added = seed_owner_inbox_access_request(session)
        access_consumers_added = seed_active_access_consumers(session)
        workflow_added = seed_workflow_reference_data(session)
        return (
            owner_profiles_added
            or relationships_added
            or neuchatel_products_added
            or owner_inbox_added
            or access_consumers_added
            or workflow_added
        )

    created = datetime(2026, 8, 1, 8, 0, tzinfo=UTC)
    product = DataProduct(
        id=ESTV_PRODUCT_ID,
        urn=ESTV_PRODUCT_URN,
        origin_catalog="urn:daca:catalog:bit-poc",
        revision=1,
        active_policy_revision=1,
        title="ESTV-Steuerstatistik nach Kanton",
        description="Synthetische aggregierte Steuerstatistik nach Kanton für den DaCa-Proof-of-Concept; enthält keine Personendaten.",
        owner="ESTV",
        domain="Direkte Bundessteuer",
        lifecycle="active",
        classification="restricted",
        keywords=["Bundessteuer", "Kantone", "Steuerstatistik", "synthetisch"],
        contact={"name": "ESTV Data Office", "email": "data-products@estv.admin.ch"},
        license="Nutzungsbedingungen Bund – POC",
        quality={"completenessPercent": 100, "validatedAt": "2026-08-01T07:30:00Z"},
        update_frequency="annual",
        extra_metadata={
            "language": ["de", "fr", "it"],
            "spatial": "Switzerland",
            "temporalCoverage": "2022/2025",
            "containsPersonalData": False,
            "connectedAuthorities": ["26 Kantone"],
            "deliveryProtocols": ["REST", "PostgreSQL"],
            "dataOwner": {
                "name": "Kassandra Valdata",
                "organization": "ESTV",
                "avatarUrl": "/assets/kassandra-valdata.webp",
            },
            "catalogUsage": {
                "consumerUserIds": [],
                "consumerMachineIds": [
                    {"id": "svc-estv-cantonal-tax-dashboard", "label": "Kantonales Steuerdashboard"}
                ],
                "responsibleUserIds": [KASSANDRA_USER_ID],
                "sharedByUserIds": [KASSANDRA_USER_ID],
                "requestedByUserIds": [],
                "sharedWithUserIds": [],
            },
        },
        created_at=created,
        updated_at=created,
    )
    session.add(product)
    session.add_all(
        [
            DataProduct(
                id=uuid.UUID("12222222-2222-4222-8222-222222222222"),
                urn="urn:daca:ch:estv:direct-federal-tax-assessments",
                origin_catalog="urn:daca:catalog:bit-poc",
                revision=3,
                active_policy_revision=None,
                title="Direkte Bundessteuer – Veranlagungen nach Kanton und Gemeinde",
                description="Aggregierte Veranlagungen und Erträge der direkten Bundessteuer mit Kantons- und Gemeindebezug; ausschliesslich synthetische POC-Werte.",
                owner="ESTV",
                domain="Direkte Bundessteuer",
                lifecycle="active",
                classification="internal",
                keywords=["Bundessteuer", "Veranlagung", "Kantone", "Gemeinden"],
                contact={"name": "ESTV Data Office", "email": "data-products@estv.admin.ch"},
                license="Nutzungsbedingungen Bund – POC",
                quality={"completenessPercent": 98, "aggregationLevel": "Gemeinde"},
                update_frequency="quarterly",
                extra_metadata={
                    "language": ["de", "fr", "it"],
                    "spatial": "Schweiz, Kantone und Gemeinden",
                    "temporalCoverage": "2024/2026",
                    "containsPersonalData": False,
                    "connectedAuthorities": ["26 Kantone", "Schweizer Gemeinden"],
                    "deliveryProtocols": ["REST"],
                    "dataOwner": {
                        "name": "Kassandra Valdata",
                        "organization": "ESTV",
                        "avatarUrl": "/assets/kassandra-valdata.webp",
                    },
                    "catalogUsage": {
                        "consumerUserIds": [],
                        "consumerMachineIds": [],
                        "responsibleUserIds": [KASSANDRA_USER_ID],
                        "sharedByUserIds": [],
                        "requestedByUserIds": [],
                        "sharedWithUserIds": [],
                    },
                },
                created_at=created,
                updated_at=datetime(2026, 8, 8, 9, 15, tzinfo=UTC),
            ),
            DataProduct(
                id=uuid.UUID("13333333-3333-4333-8333-333333333333"),
                urn="urn:daca:ch:estv:vat-sector-indicators",
                origin_catalog="urn:daca:catalog:bit-poc",
                revision=5,
                active_policy_revision=None,
                title="Mehrwertsteuer – Branchenindikatoren",
                description="Synthetische, aggregierte Umsatz- und Abrechnungsindikatoren zur Mehrwertsteuer nach Branche und Wirtschaftsregion.",
                owner="ESTV",
                domain="Mehrwertsteuer",
                lifecycle="active",
                classification="internal",
                keywords=["Mehrwertsteuer", "MWST", "Branchen", "Umsatz"],
                contact={"name": "ESTV MWST Analytics", "email": "mwst-data@estv.admin.ch"},
                license="Nutzungsbedingungen Bund – POC",
                quality={"completenessPercent": 97, "aggregationLevel": "Branche"},
                update_frequency="monthly",
                extra_metadata={
                    "language": ["de", "fr", "it"],
                    "spatial": "Schweiz",
                    "temporalCoverage": "2025/2026",
                    "containsPersonalData": False,
                    "connectedAuthorities": ["BFS", "Kantonale Wirtschaftsämter"],
                    "deliveryProtocols": ["REST", "PostgreSQL"],
                    "dataOwner": {
                        "name": "Ariane Keller",
                        "organization": "ESTV",
                        "avatarUrl": "/assets/data-owners/ariane-keller.webp",
                    },
                    "catalogUsage": {
                        "consumerUserIds": [KASSANDRA_USER_ID],
                        "consumerMachineIds": [],
                        "responsibleUserIds": [],
                        "sharedByUserIds": [],
                        "requestedByUserIds": [],
                        "sharedWithUserIds": [KASSANDRA_USER_ID],
                    },
                },
                created_at=created,
                updated_at=datetime(2026, 8, 9, 7, 30, tzinfo=UTC),
            ),
            DataProduct(
                id=uuid.UUID("14444444-4444-4444-8444-444444444444"),
                urn="urn:daca:ch:cantons:withholding-tax-tariffs",
                origin_catalog="urn:daca:catalog:cantonal-tax-authorities",
                revision=12,
                active_policy_revision=None,
                title="Quellensteuer – Tarife, Kantons- und Gemeindecodes",
                description="Harmonisierte synthetische Tarifparameter sowie Kantons- und Gemeindecodes für die Quellensteuerprüfung der ESTV.",
                owner="Kanton Neuchâtel",
                domain="Quellensteuer",
                lifecycle="active",
                classification="internal",
                keywords=["Quellensteuer", "Tarife", "Kantone", "Gemeindecodes"],
                contact={
                    "name": "Noémie Rochat",
                    "email": "noemie.rochat@example.admin.ch",
                    "phone": "+41 58 000 00 42",
                },
                license="Interadministrative Nutzung – POC",
                quality={"completenessPercent": 100, "cantons": 26},
                update_frequency="monthly",
                extra_metadata={
                    "language": ["de", "fr", "it"],
                    "spatial": "26 Kantone und Schweizer Gemeinden",
                    "temporalCoverage": "2026",
                    "containsPersonalData": False,
                    "connectedAuthorities": ["26 Kantone", "Schweizer Gemeinden", "ESTV"],
                    "deliveryProtocols": ["REST"],
                    "dataOwner": {
                        "name": "Noémie Rochat",
                        "organization": "Kanton Neuchâtel",
                        "avatarUrl": "/assets/data-owners/noemie-rochat.webp",
                        "phone": "+41 58 000 00 42",
                        "teamsUrl": "https://teams.microsoft.com/l/chat/0/0?users=noemie.rochat%40example.admin.ch",
                    },
                    "catalogUsage": {
                        "consumerUserIds": [],
                        "consumerMachineIds": [
                            {"id": "svc-estv-withholding-tax-validation", "label": "Quellensteuer-Prüfservice"}
                        ],
                        "responsibleUserIds": [],
                        "sharedByUserIds": [],
                        "requestedByUserIds": [KASSANDRA_USER_ID],
                        "sharedWithUserIds": [],
                    },
                    "accessRequest": {
                        "requestId": "AR-NE-2026-0142",
                        "status": "legal_review",
                        "updatedAt": "2026-08-08T14:20:00Z",
                        "detail": (
                            "Der Kanton Neuchâtel prüft die Rechtsgrundlage für die Nutzung "
                            "durch den ESTV-Prüfservice."
                        ),
                    },
                },
                created_at=created,
                updated_at=datetime(2026, 8, 7, 16, 45, tzinfo=UTC),
            ),
            build_neuchatel_corporate_product(created),
            DataProduct(
                id=uuid.UUID("15555555-5555-4555-8555-555555555555"),
                urn="urn:daca:ch:efv:nfa-tax-potential",
                origin_catalog="urn:daca:catalog:efv",
                revision=4,
                active_policy_revision=None,
                title="Ressourcenpotenzial NFA – Steuerbasis",
                description="Aggregierte synthetische Steuerbasis für das Ressourcenpotenzial im nationalen Finanzausgleich mit Datenbeiträgen der Kantone.",
                owner="EFV und Kantone",
                domain="Finanzausgleich",
                lifecycle="active",
                classification="restricted",
                keywords=["NFA", "Ressourcenpotenzial", "Steuerbasis", "Kantone"],
                contact={"name": "EFV Finanzausgleich", "email": "nfa-data@efv.admin.ch"},
                license="Interadministrative Nutzung – POC",
                quality={"completenessPercent": 99, "cantons": 26},
                update_frequency="annual",
                extra_metadata={
                    "language": ["de", "fr", "it"],
                    "spatial": "26 Kantone",
                    "temporalCoverage": "2023/2026",
                    "containsPersonalData": False,
                    "connectedAuthorities": ["EFV", "ESTV", "26 Kantone"],
                    "deliveryProtocols": ["PostgreSQL"],
                    "dataOwner": {
                        "name": "Daniel Aebischer",
                        "organization": "EFV",
                        "avatarUrl": "/assets/data-owners/daniel-aebischer.webp",
                    },
                    "catalogUsage": {
                        "consumerUserIds": [KASSANDRA_USER_ID],
                        "consumerMachineIds": [
                            {"id": "svc-estv-federal-tax-forecast", "label": "Bundessteuer-Prognoseservice"}
                        ],
                        "responsibleUserIds": [],
                        "sharedByUserIds": [],
                        "requestedByUserIds": [],
                        "sharedWithUserIds": [KASSANDRA_USER_ID],
                    },
                },
                created_at=created,
                updated_at=datetime(2026, 8, 6, 11, 0, tzinfo=UTC),
            ),
            DataProduct(
                id=uuid.UUID("16666666-6666-4666-8666-666666666666"),
                urn="urn:daca:ch:estv:withholding-tax-refunds-by-canton",
                origin_catalog="urn:daca:catalog:bit-poc",
                revision=2,
                active_policy_revision=None,
                title="Verrechnungssteuer – Rückerstattungen nach Kanton",
                description="Synthetische aggregierte Rückerstattungsvolumen der Verrechnungssteuer nach Kanton und Bearbeitungsperiode.",
                owner="ESTV",
                domain="Verrechnungssteuer",
                lifecycle="draft",
                classification="restricted",
                keywords=["Verrechnungssteuer", "Rückerstattung", "Kantone", "Volumen"],
                contact={"name": "ESTV Verrechnungssteuer", "email": "vst-data@estv.admin.ch"},
                license="Nutzungsbedingungen Bund – POC",
                quality={"completenessPercent": 94, "aggregationLevel": "Kanton"},
                update_frequency="quarterly",
                extra_metadata={
                    "language": ["de", "fr", "it"],
                    "spatial": "26 Kantone",
                    "temporalCoverage": "2025/2026",
                    "containsPersonalData": False,
                    "connectedAuthorities": ["ESTV", "Kantonale Steuerverwaltungen"],
                    "deliveryProtocols": ["REST"],
                    "dataOwner": {
                        "name": "Kassandra Valdata",
                        "organization": "ESTV",
                        "avatarUrl": "/assets/kassandra-valdata.webp",
                    },
                    "catalogUsage": {
                        "consumerUserIds": [],
                        "consumerMachineIds": [
                            {"id": "svc-estv-refund-monitoring", "label": "Rückerstattungsmonitor"}
                        ],
                        "responsibleUserIds": [KASSANDRA_USER_ID],
                        "sharedByUserIds": [KASSANDRA_USER_ID],
                        "requestedByUserIds": [],
                        "sharedWithUserIds": [],
                    },
                },
                created_at=created,
                updated_at=datetime(2026, 8, 5, 13, 20, tzinfo=UTC),
            ),
        ]
    )
    session.add_all(
        [
            Endpoint(
                id=uuid.UUID("21111111-1111-4111-8111-111111111111"),
                data_product_id=ESTV_PRODUCT_ID,
                name="ESTV statistics REST API",
                description="Policy-protected aggregate statistics endpoint",
                protocol="http-rest",
                connection={
                    "baseUrl": "http://localhost:8003",
                    "path": "/api/v1/estv/tax-statistics",
                    "method": "GET",
                },
                secret_ref=None,
                created_at=created,
            ),
            Endpoint(
                id=uuid.UUID("21111111-1111-4111-8111-222222222222"),
                data_product_id=ESTV_PRODUCT_ID,
                name="ESTV statistics PostgreSQL",
                description="Direct PostgreSQL access protected by ACL and forced RLS",
                protocol="postgresql",
                connection={
                    "host": "localhost",
                    "port": 55432,
                    "database": "daca_sample",
                    "schema": "public",
                    "relation": "tax_statistics",
                    "sslMode": "prefer",
                },
                secret_ref="env://ESTV_POSTGRES_CREDENTIALS",
                created_at=created,
            ),
        ]
    )
    session.add_all(
        [
            LineageEdge(
                id=uuid.UUID("31111111-1111-4111-8111-111111111111"),
                source_urn="urn:daca:ch:estv:synthetic-tax-source",
                target_urn=ESTV_PRODUCT_URN,
                relation_type="derived-from",
                transformation="Aggregate synthetic declarations by canton and tax year",
                state="active",
                created_at=created,
            ),
            LineageEdge(
                id=uuid.UUID("31111111-1111-4111-8111-222222222222"),
                source_urn=ESTV_PRODUCT_URN,
                target_urn="urn:daca:ch:sg:finance-dashboard",
                relation_type="consumed-by",
                transformation=None,
                state="inferred",
                created_at=created,
            ),
        ]
    )
    session.add_all(
        [
            ProvenanceEvent(
                id=uuid.UUID("41111111-1111-4111-8111-111111111111"),
                data_product_id=ESTV_PRODUCT_ID,
                product_urn=ESTV_PRODUCT_URN,
                sequence=1,
                event_type="created",
                actor="estv-data-owner",
                details={"source": "synthetic POC generator", "recordCount": 104},
                occurred_at=created,
            ),
            ProvenanceEvent(
                id=uuid.UUID("41111111-1111-4111-8111-222222222222"),
                data_product_id=ESTV_PRODUCT_ID,
                product_urn=ESTV_PRODUCT_URN,
                sequence=2,
                event_type="quality-validated",
                actor="estv-quality-gate",
                details={"rulesPassed": 12, "rulesFailed": 0},
                occurred_at=datetime(2026, 8, 1, 8, 15, tzinfo=UTC),
            ),
        ]
    )
    policy = PolicyRevision(
        id=uuid.UUID("51111111-1111-4111-8111-111111111111"),
        data_product_id=ESTV_PRODUCT_ID,
        revision=1,
        status="published",
        definition=seeded_policy_definition(),
        generated_rego=generate_rego(),
        created_by="estv-data-owner",
        created_at=created,
        published_at=created,
    )
    session.add(policy)
    session.add_all(
        [
            PolicyDeployment(
                id=uuid.UUID("61111111-1111-4111-8111-111111111111"),
                policy_revision_id=policy.id,
                target="opa",
                desired_revision=1,
                observed_revision=None,
                state="pending",
                updated_at=created,
            ),
            PolicyDeployment(
                id=uuid.UUID("61111111-1111-4111-8111-222222222222"),
                policy_revision_id=policy.id,
                target="postgresql",
                desired_revision=1,
                observed_revision=None,
                state="pending",
                updated_at=created,
            ),
        ]
    )
    session.add(
        AuditEvent(
            id=uuid.UUID("71111111-1111-4111-8111-111111111111"),
            resource_type="data-product",
            resource_id=str(ESTV_PRODUCT_ID),
            action="seeded",
            actor="daca-bootstrap",
            revision=1,
            details={"synthetic": True},
            occurred_at=created,
        )
    )
    session.add(build_owner_inbox_access_request())
    session.add_all(build_active_access_consumer_requests())
    session.add_all(
        [
            SeedMarker(name=SEED_NAME, applied_at=created),
            SeedMarker(name=OWNER_SEED_NAME, applied_at=created),
            SeedMarker(name=RELATIONSHIP_SEED_NAME, applied_at=created),
            SeedMarker(name=NEUCHATEL_SEED_NAME, applied_at=created),
            SeedMarker(name=OWNER_INBOX_SEED_NAME, applied_at=created),
            SeedMarker(name=ACCESS_CONSUMER_SEED_NAME, applied_at=created),
        ]
    )
    session.commit()
    seed_workflow_reference_data(session)
    return True


def build_owner_inbox_access_request() -> AccessRequest:
    submitted_at = datetime(2026, 8, 11, 7, 45, tzinfo=UTC)
    return AccessRequest(
        id=uuid.UUID("81111111-1111-4111-8111-111111111111"),
        request_number="ZA-2026-ESTV-0001",
        data_product_id=ESTV_PRODUCT_ID,
        requester_id="beat.stalder",
        requester_name="Beat Stalder",
        requester_organization="Kanton St. Gallen",
        contact_email="beat.stalder@sg.ch",
        consumer_type="person",
        machine_id=None,
        purpose="Kantonale Finanzanalyse und Plausibilisierung der aggregierten Bundessteuerstatistik.",
        legal_basis="Amtshilfe zwischen Behörden",
        requested_protocol="http",
        requested_variant="modified",
        valid_from=date(2026, 9, 1),
        valid_until=date(2027, 8, 31),
        notes="Benötigt werden ausschliesslich aggregierte Daten ohne Personenbezug.",
        status="submitted",
        created_at=submitted_at,
        updated_at=submitted_at,
    )


def build_active_access_consumer_requests() -> list[AccessRequest]:
    """Build active grants plus excluded examples for the owner workspace."""
    created = datetime(2026, 8, 5, 9, 0, tzinfo=UTC)
    valid_from = date(2026, 1, 1)
    valid_until = date(2027, 12, 31)

    def request(
        suffix: int,
        product_id: uuid.UUID,
        requester_id: str,
        requester_name: str,
        organization: str,
        consumer_type: str,
        machine_id: str | None,
        protocol: str,
        status: str,
        *,
        starts: date = valid_from,
        ends: date = valid_until,
    ) -> AccessRequest:
        return AccessRequest(
            id=uuid.UUID(f"82222222-2222-4222-8222-{suffix:012d}"),
            request_number=f"ZA-2026-CONS-{suffix:04d}",
            data_product_id=product_id,
            requester_id=requester_id,
            requester_name=requester_name,
            requester_organization=organization,
            contact_email=f"{requester_id.replace('.', '-')}@example.admin.ch",
            consumer_type=consumer_type,
            machine_id=machine_id,
            purpose="Nutzung aggregierter Steuerdaten für einen behördlichen Fachprozess.",
            legal_basis="Gesetzlicher Auftrag und behördenübergreifende Zusammenarbeit",
            requested_protocol=protocol,
            requested_variant="original" if status == "granted_original" else "modified",
            valid_from=starts,
            valid_until=ends,
            notes="Synthetische Demofreigabe ohne Zugangsdaten.",
            status=status,
            created_at=created,
            updated_at=created,
        )

    refund_product_id = uuid.UUID("16666666-6666-4666-8666-666666666666")
    return [
        request(1, ESTV_PRODUCT_ID, "lea.meier", "Lea Meier", "Kanton Bern", "person", None, "http", "granted_original"),
        request(2, ESTV_PRODUCT_ID, "lea.meier", "Lea Meier", "Kanton Bern", "person", None, "postgresql", "granted_modified"),
        request(3, ESTV_PRODUCT_ID, "marco.galli", "Marco Galli", "Kanton Tessin", "person", None, "http", "granted_modified"),
        request(4, ESTV_PRODUCT_ID, "nadine.favre", "Nadine Favre", "Kanton Waadt", "person", None, "both", "granted_original"),
        request(5, ESTV_PRODUCT_ID, "service.owner.sg", "Service Owner SG", "Kanton St. Gallen", "machine", "svc-estv-cantonal-tax-dashboard", "http", "granted_modified"),
        request(6, ESTV_PRODUCT_ID, "service.owner.zh", "Service Owner ZH", "Kanton Zürich", "machine", "svc-zrh-tax-analysis", "postgresql", "granted_original"),
        request(7, refund_product_id, "service.owner.estv", "Service Owner ESTV", "ESTV", "machine", "svc-estv-refund-monitoring", "http", "granted_modified"),
        request(8, ESTV_PRODUCT_ID, "expired.consumer", "Abgelaufene Freigabe", "Kanton Aargau", "person", None, "http", "granted_original", starts=date(2025, 1, 1), ends=date(2025, 12, 31)),
        request(9, ESTV_PRODUCT_ID, "rejected.consumer", "Abgelehnte Anfrage", "Kanton Luzern", "person", None, "http", "rejected"),
    ]


def seed_owner_profiles(session: Session) -> bool:
    """Add owner display profiles to an already seeded portfolio without replacing user edits."""
    if session.get(SeedMarker, OWNER_SEED_NAME) is not None:
        return False

    for product_id, profile in DATA_OWNER_PROFILES.items():
        product = session.get(DataProduct, product_id)
        if product is not None:
            product.extra_metadata = {**product.extra_metadata, "dataOwner": profile}

    session.add(
        SeedMarker(
            name=OWNER_SEED_NAME,
            applied_at=datetime(2026, 8, 10, 20, 0, tzinfo=UTC),
        )
    )
    session.commit()
    return True


def seed_access_relationships(session: Session) -> bool:
    """Add the owner-workspace access states to an already seeded portfolio."""
    if session.get(SeedMarker, RELATIONSHIP_SEED_NAME) is not None:
        return False

    for product_id, relationships in ACCESS_RELATIONSHIPS.items():
        product = session.get(DataProduct, product_id)
        if product is None:
            continue
        metadata = {**product.extra_metadata}
        usage = {**metadata.get("catalogUsage", {}), **relationships}
        product.extra_metadata = {**metadata, "catalogUsage": usage}

    session.add(
        SeedMarker(
            name=RELATIONSHIP_SEED_NAME,
            applied_at=datetime(2026, 8, 10, 21, 0, tzinfo=UTC),
        )
    )
    session.commit()
    return True


def seed_neuchatel_products(session: Session) -> bool:
    """Add the two Noémie Rochat request examples to an existing catalog portfolio."""
    if session.get(SeedMarker, NEUCHATEL_SEED_NAME) is not None:
        return False

    source_product_id = uuid.UUID("14444444-4444-4444-8444-444444444444")
    source_product = session.get(DataProduct, source_product_id)
    if source_product is not None:
        source_product.owner = "Kanton Neuchâtel"
        source_product.contact = {
            "name": "Noémie Rochat",
            "email": "noemie.rochat@example.admin.ch",
            "phone": "+41 58 000 00 42",
        }
        source_product.extra_metadata = {
            **source_product.extra_metadata,
            "dataOwner": DATA_OWNER_PROFILES[source_product_id],
            "accessRequest": {
                "requestId": "AR-NE-2026-0142",
                "status": "legal_review",
                "updatedAt": "2026-08-08T14:20:00Z",
                "detail": (
                    "Der Kanton Neuchâtel prüft die Rechtsgrundlage für die Nutzung "
                    "durch den ESTV-Prüfservice."
                ),
            },
        }

    if session.get(DataProduct, NEUCHATEL_CORPORATE_PRODUCT_ID) is None:
        session.add(build_neuchatel_corporate_product(datetime(2026, 8, 1, 8, 0, tzinfo=UTC)))

    session.add(
        SeedMarker(
            name=NEUCHATEL_SEED_NAME,
            applied_at=datetime(2026, 8, 10, 22, 0, tzinfo=UTC),
        )
    )
    session.commit()
    return True


def seed_owner_inbox_access_request(session: Session) -> bool:
    """Add one deterministic incoming request to an existing owner workspace."""
    if session.get(SeedMarker, OWNER_INBOX_SEED_NAME) is not None:
        return False

    request_id = uuid.UUID("81111111-1111-4111-8111-111111111111")
    if session.get(AccessRequest, request_id) is None:
        session.add(build_owner_inbox_access_request())
    session.add(
        SeedMarker(
            name=OWNER_INBOX_SEED_NAME,
            applied_at=datetime(2026, 8, 11, 7, 45, tzinfo=UTC),
        )
    )
    session.commit()
    return True


def seed_active_access_consumers(session: Session) -> bool:
    """Add deterministic active person and machine grants to an existing catalog."""
    if session.get(SeedMarker, ACCESS_CONSUMER_SEED_NAME) is not None:
        return False

    for access_request in build_active_access_consumer_requests():
        if session.get(AccessRequest, access_request.id) is None:
            session.add(access_request)
    session.add(
        SeedMarker(
            name=ACCESS_CONSUMER_SEED_NAME,
            applied_at=datetime(2026, 8, 11, 8, 15, tzinfo=UTC),
        )
    )
    session.commit()
    return True


def main() -> None:
    settings = get_settings()
    session_factory = default_session_factory(settings)
    with session_factory() as session:
        created = seed_catalog(session)
    print("catalog seed applied" if created else "catalog seed already present")


if __name__ == "__main__":
    main()
