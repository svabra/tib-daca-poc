"""Additive Verteidigung → armasuisse counterpart to the building inventory."""

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .domain_glossary_seed import DEFENCE_DOMAIN_ID
from .models import (
    AuditEvent,
    DataProduct,
    DataProductDomain,
    DemoUser,
    Domain,
    ProvenanceEvent,
    SeedMarker,
    utc_now,
)

MARKER = "poc-verteidigung-armasuisse-building-demand-v1"
PRODUCT_ID = UUID("1bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")
PRODUCT_URN = "urn:daca:ch:verteidigung:building-use-demand"


def seed_building_demand_product(session: Session) -> bool:
    """Add the reverse flow on upgrades without rewriting the existing product."""
    if session.get(SeedMarker, MARKER):
        return False
    people = {identity: session.get(DemoUser, identity) for identity in (
        "lawrence.hill", "hong.an.captain", "giuseppe.starwars",
    )}
    domain = session.get(Domain, DEFENCE_DOMAIN_ID)
    if domain is None or domain.lifecycle != "active" or any(person is None or not person.active for person in people.values()):
        return False
    if session.get(DataProduct, PRODUCT_ID) or session.scalar(select(DataProduct).where(DataProduct.urn == PRODUCT_URN)):
        session.add(SeedMarker(name=MARKER))
        session.flush()
        return False
    owner = people["lawrence.hill"]
    now = utc_now()
    product = DataProduct(
        id=PRODUCT_ID, urn=PRODUCT_URN, origin_catalog="urn:daca:catalog:bit-poc",
        revision=1, active_policy_revision=None, discoverable=True,
        owner_user_id=owner.id, deputy_owner_user_id="hong.an.captain",
        title="Gebäudenutzungsbedarf der Verteidigung",
        description=("Synthetisches PoC-Datenprodukt der Verteidigung (V) für armasuisse. "
                     "Fiktive Nutzungskategorien, aggregierte Flächenbedarfe und Planungshorizonte "
                     "ergänzen die von armasuisse bereitgestellten Gebäudekategorien. "
                     "Keine realen Standorte, Truppenbelegungen oder operativen Bedarfsangaben."),
        owner="Verteidigung", domain="Verteidigung", lifecycle="active", classification="internal",
        keywords=["Gebäude", "Nutzungsbedarf", "Verteidigung", "armasuisse", "Planung", "synthetisch"],
        contact={"name": owner.display_name, "email": owner.email},
        license="Interadministrative Nutzung – PoC", update_frequency="quarterly",
        quality={"aggregationLevel": "Fiktive Gebäudekategorie; synthetische Bedarfsgruppen"},
        extra_metadata={
            "language": ["de"], "spatial": "Schweiz (synthetisch)", "containsPersonalData": False,
            "dataOwner": {"name": owner.display_name, "organization": "Verteidigung", "avatarUrl": owner.avatar_url},
            "catalogUsage": {"consumerUserIds": ["giuseppe.starwars"], "consumerMachineIds": [],
                             "responsibleUserIds": [owner.id, "hong.an.captain"],
                             "sharedByUserIds": [owner.id], "sharedWithUserIds": ["giuseppe.starwars"],
                             "requestedByUserIds": []},
        }, created_at=now, updated_at=now,
    )
    session.add(product)
    session.flush()
    session.add(DataProductDomain(data_product_id=product.id, domain_id=domain.id,
                                  position=0, assigned_by_user_id=owner.id, assigned_at=now))
    details = {"fixture": MARKER, "synthetic": True, "producerOrganization": "VBS Verteidigung",
               "consumerOrganization": "VBS armasuisse", "catalogConsumptionOnly": True}
    session.add(ProvenanceEvent(id=uuid4(), data_product_id=product.id, product_urn=product.urn,
                                sequence=1, event_type="created", actor="seed:building-demand",
                                details=details, occurred_at=now))
    session.add(AuditEvent(id=uuid4(), resource_type="data-product", resource_id=str(product.id),
                          action="created", actor="seed:building-demand", revision=1, details=details))
    session.add(SeedMarker(name=MARKER))
    session.flush()
    return True
