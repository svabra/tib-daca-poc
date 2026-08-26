from __future__ import annotations

import hashlib
import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    DataProduct,
    DataProductDomain,
    Domain,
    DomainChangeRequest,
    DomainLocalization,
    GlossaryTermProposal,
    GlossaryTermProposalReview,
    SeedMarker,
    WorkflowTask,
)

POC_NAMESPACE = uuid.UUID("a5c07ada-69a1-4b34-a13d-ea738b5daca0")
ORIGIN_CATALOG_ID = "urn:daca:catalog:bit-poc"
DOMAIN_GLOSSARY_SEED_NAME = "domain-glossary-v1"

DEFENCE_DOMAIN_ID = uuid.uuid5(POC_NAMESPACE, "domain:verteidigung")
MOBILITY_DOMAIN_ID = uuid.uuid5(POC_NAMESPACE, "domain:mobilitaet-logistik")
VEHICLE_PRODUCT_ID = uuid.uuid5(POC_NAMESPACE, "product:armoured-vehicle-fleet")
DEFENCE_REQUEST_ID = uuid.uuid5(POC_NAMESPACE, "domain-request:verteidigung:create")
ARMOURED_VEHICLE_PROPOSAL_ID = uuid.uuid5(
    POC_NAMESPACE, "glossary-proposal:gepanzertes-fahrzeug"
)


def stable_id(value: str) -> uuid.UUID:
    return uuid.uuid5(POC_NAMESPACE, value)


def canonical_hash(payload: dict[str, object]) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


DOMAIN_SPECS: tuple[
    tuple[str, str, str, str, tuple[tuple[str, str, str], ...]], ...
] = (
    (
        "verteidigung",
        "sibilla.micheli",
        "sandro.wenger",
        "Verteidigung",
        (
            (
                "de",
                "Verteidigung",
                "Fachliche Domain für Fähigkeiten, Mittel und Daten zur Verteidigung.",
            ),
            (
                "en",
                "Defence",
                "Subject domain for defence capabilities, assets, and data.",
            ),
        ),
    ),
    (
        "mobilitaet-logistik",
        "kassandra.valdata",
        "ariane.keller",
        "Mobilität & Logistik",
        (
            (
                "de",
                "Mobilität & Logistik",
                "Fachliche Domain für Transport, Flotten, Güterbewegung und Logistikprozesse.",
            ),
            (
                "en",
                "Mobility & Logistics",
                "Subject domain for transport, fleets, movement of goods, and logistics.",
            ),
        ),
    ),
    (
        "direkte-bundessteuer",
        "kassandra.valdata",
        "ariane.keller",
        "Direkte Bundessteuer",
        (("de", "Direkte Bundessteuer", "Fachliche Domain der direkten Bundessteuer."),),
    ),
    (
        "mehrwertsteuer",
        "ariane.keller",
        "kassandra.valdata",
        "Mehrwertsteuer",
        (("de", "Mehrwertsteuer", "Fachliche Domain der Mehrwertsteuer."),),
    ),
    (
        "quellensteuer",
        "noemie.rochat",
        "lucien.morel",
        "Quellensteuer",
        (("de", "Quellensteuer", "Fachliche Domain der Quellenbesteuerung."),),
    ),
    (
        "finanzausgleich",
        "daniel.aebischer",
        "simone.wyss",
        "Finanzausgleich",
        (("de", "Finanzausgleich", "Fachliche Domain des nationalen Finanzausgleichs."),),
    ),
    (
        "verrechnungssteuer",
        "kassandra.valdata",
        "ariane.keller",
        "Verrechnungssteuer",
        (("de", "Verrechnungssteuer", "Fachliche Domain der Verrechnungssteuer."),),
    ),
)


def _domain_id(slug: str) -> uuid.UUID:
    return uuid.uuid5(POC_NAMESPACE, f"domain:{slug}")


def _domain_payload(
    owner_user_id: str,
    deputy_owner_user_id: str,
    labels: tuple[tuple[str, str, str], ...],
) -> dict[str, object]:
    return {
        "ownerUserId": owner_user_id,
        "deputyOwnerUserId": deputy_owner_user_id,
        "localizations": [
            {
                "language": language,
                "preferredLabel": preferred_label,
                "definition": definition,
            }
            for language, preferred_label, definition in labels
        ],
    }


def _seed_domains(session: Session, created_at: datetime) -> dict[str, Domain]:
    domains: dict[str, Domain] = {}
    for slug, owner_id, deputy_id, legacy_label, labels in DOMAIN_SPECS:
        domain_id = _domain_id(slug)
        domain = session.get(Domain, domain_id)
        if domain is None:
            payload = _domain_payload(owner_id, deputy_id, labels)
            domain = Domain(
                id=domain_id,
                urn=f"urn:daca:domain:{domain_id}",
                origin_catalog_id=ORIGIN_CATALOG_ID,
                revision=1,
                content_hash=canonical_hash(payload),
                lifecycle="active",
                owner_user_id=owner_id,
                deputy_owner_user_id=deputy_id,
                created_at=created_at,
                updated_at=created_at,
            )
            session.add(domain)
            session.flush()
            for language, preferred_label, definition in labels:
                session.add(
                    DomainLocalization(
                        domain_id=domain.id,
                        language=language,
                        preferred_label=preferred_label,
                        definition=definition,
                        normalized_label=" ".join(preferred_label.casefold().split()),
                    )
                )
        domains[legacy_label] = domain
    session.flush()
    return domains


def _seed_vehicle_product(session: Session, created_at: datetime) -> DataProduct:
    product = session.get(DataProduct, VEHICLE_PRODUCT_ID)
    if product is not None:
        return product
    product = DataProduct(
        id=VEHICLE_PRODUCT_ID,
        urn="urn:daca:ch:bazg:armoured-vehicle-fleet",
        origin_catalog=ORIGIN_CATALOG_ID,
        revision=1,
        active_policy_revision=None,
        owner_user_id="sandro.wenger",
        deputy_owner_user_id="lea.hofmann",
        control_person_user_id="thomas.kriegli",
        discoverable=True,
        title="Flottenbestand gepanzerte Fahrzeuge",
        description=(
            "Synthetischer Bestand gepanzerter Fahrzeuge mit Angaben zu Fahrzeugklasse, "
            "Einsatzbereitschaft und logistischem Standort; enthält keine operativen Echtdaten."
        ),
        owner="BAZG",
        domain="Mobilität & Logistik",
        lifecycle="draft",
        classification="internal",
        keywords=["Fahrzeugflotte", "Einsatzmittel", "Logistik", "synthetisch"],
        contact={"name": "Sandro Wenger", "email": "sandro.wenger@bazg.admin.ch"},
        license="Interadministrative Nutzung – POC",
        quality={},
        update_frequency="monthly",
        extra_metadata={
            "language": ["de", "en"],
            "spatial": "Schweiz",
            "containsPersonalData": False,
            "journeyFixture": "domain-glossary",
            "catalogUsage": {
                "consumerUserIds": [],
                "consumerMachineIds": [],
                "responsibleUserIds": ["sandro.wenger"],
                "sharedByUserIds": [],
                "requestedByUserIds": [],
                "sharedWithUserIds": [],
            },
        },
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(product)
    session.flush()
    return product


def _assign_legacy_domains(
    session: Session,
    domains: dict[str, Domain],
    created_at: datetime,
) -> None:
    products = list(session.scalars(select(DataProduct).order_by(DataProduct.id)))
    for product in products:
        domain = domains.get(product.domain)
        if domain is None:
            continue
        assignment = session.get(
            DataProductDomain,
            {"data_product_id": product.id, "domain_id": domain.id},
        )
        if assignment is None:
            session.add(
                DataProductDomain(
                    data_product_id=product.id,
                    domain_id=domain.id,
                    position=0,
                    assigned_by_user_id=product.owner_user_id or "sibilla.micheli",
                    assigned_at=created_at,
                )
            )
    # The generic legacy-value pass assigns Mobility to the journey product. Defence is left
    # unassigned so Journey 08 can demonstrate the deliberate second-domain selection.


def _seed_governance_journey(
    session: Session,
    domains: dict[str, Domain],
    product: DataProduct,
    created_at: datetime,
) -> None:
    defence = domains["Verteidigung"]
    mobility = domains["Mobilität & Logistik"]
    domain_payload = _domain_payload(
        defence.owner_user_id,
        defence.deputy_owner_user_id,
        tuple(
            (item.language, item.preferred_label, item.definition)
            for item in session.scalars(
                select(DomainLocalization)
                .where(DomainLocalization.domain_id == defence.id)
                .order_by(DomainLocalization.language)
            )
        ),
    )
    if session.get(DomainChangeRequest, DEFENCE_REQUEST_ID) is None:
        request = DomainChangeRequest(
            id=DEFENCE_REQUEST_ID,
            request_number="DOM-2026-0001",
            operation="create",
            target_domain_id=defence.id,
            base_revision=None,
            requester_user_id="sandro.wenger",
            status="approved",
            requested_payload=domain_payload,
            review_payload=domain_payload,
            revision=1,
            reviewer_user_id="sibilla.micheli",
            decision_comment="Fachliche Domain für die PoC-Journey freigegeben.",
            decided_at=created_at,
            created_at=created_at,
            updated_at=created_at,
        )
        session.add(request)
        session.flush()
        session.add_all(
            [
                WorkflowTask(
                    id=stable_id("task:domain-request:verteidigung:review"),
                    task_type="domain_change_review",
                    task_kind="action",
                    status="completed",
                    assignee_user_id="sibilla.micheli",
                    domain_change_request_id=request.id,
                    title="Domain-Antrag Verteidigung prüfen",
                    detail="Owner, Stellvertretung und Definition des Domain-Antrags prüfen.",
                    created_at=created_at,
                    updated_at=created_at,
                    completed_at=created_at,
                ),
                WorkflowTask(
                    id=stable_id("task:domain-request:verteidigung:decision"),
                    task_type="domain_change_decision",
                    task_kind="information",
                    status="open",
                    assignee_user_id="sandro.wenger",
                    domain_change_request_id=request.id,
                    title="Domain Verteidigung wurde angenommen",
                    detail="Sibilla Micheli hat den Domain-Antrag freigegeben.",
                    created_at=created_at,
                    updated_at=created_at,
                ),
            ]
        )

    term_payload: dict[str, object] = {
        "domainIds": [str(defence.id), str(mobility.id)],
        "localizations": [
            {
                "language": "de",
                "preferredLabel": "Gepanzertes Fahrzeug",
                "alternativeLabels": ["Panzerfahrzeug"],
                "definition": "Fahrzeug mit konstruktivem Schutz gegen äussere Einwirkungen.",
            },
            {
                "language": "en",
                "preferredLabel": "Armored Vehicle",
                "alternativeLabels": ["Armoured Vehicle"],
                "definition": "A vehicle designed with structural protection against external threats.",
            },
        ],
        "relations": [],
    }
    if session.get(GlossaryTermProposal, ARMOURED_VEHICLE_PROPOSAL_ID) is not None:
        return
    proposal = GlossaryTermProposal(
        id=ARMOURED_VEHICLE_PROPOSAL_ID,
        request_number="TERM-2026-0001",
        operation="create",
        target_term_id=None,
        requester_user_id="sandro.wenger",
        source_product_id=product.id,
        source_product_revision=product.revision,
        auto_attach=True,
        status="submitted",
        requested_payload=term_payload,
        review_payload=term_payload,
        revision=1,
        created_at=created_at,
        updated_at=created_at,
    )
    session.add(proposal)
    session.flush()
    for domain in (defence, mobility):
        session.add(
            GlossaryTermProposalReview(
                proposal_id=proposal.id,
                domain_id=domain.id,
                proposal_revision=1,
                owner_user_id=domain.owner_user_id,
                status="pending",
                updated_at=created_at,
            )
        )
        session.add(
            WorkflowTask(
                id=stable_id(f"task:glossary-proposal:{proposal.id}:review:{domain.id}"),
                task_type="glossary_term_review",
                task_kind="action",
                status="open",
                assignee_user_id=domain.owner_user_id,
                data_product_id=product.id,
                glossary_term_proposal_id=proposal.id,
                title="Glossarterm Gepanzertes Fahrzeug prüfen",
                detail="Mehrsprachige Definition und gemeinsame Domain-Zuständigkeit prüfen.",
                created_at=created_at,
                updated_at=created_at,
            )
        )
        session.add(
            WorkflowTask(
                id=stable_id(f"task:glossary-proposal:{proposal.id}:collaboration:{domain.id}"),
                task_type="glossary_term_collaboration",
                task_kind="action",
                status="open",
                assignee_user_id=domain.deputy_owner_user_id,
                data_product_id=product.id,
                glossary_term_proposal_id=proposal.id,
                title="Glossarterm redaktionell mitprüfen",
                detail="Als Stellvertretung darfst du den Review-Entwurf bearbeiten, aber nicht entscheiden.",
                created_at=created_at,
                updated_at=created_at,
            )
        )


def seed_domain_glossary_reference_data(session: Session) -> bool:
    """Create the deterministic domain/glossary PoC once without overwriting later governance."""

    if session.get(SeedMarker, DOMAIN_GLOSSARY_SEED_NAME) is not None:
        return False
    created_at = datetime(2026, 8, 25, 9, 0, tzinfo=UTC)
    domains = _seed_domains(session, created_at)
    product = _seed_vehicle_product(session, created_at)
    _assign_legacy_domains(session, domains, created_at)
    _seed_governance_journey(session, domains, product, created_at)
    session.add(SeedMarker(name=DOMAIN_GLOSSARY_SEED_NAME, applied_at=created_at))
    session.commit()
    return True
