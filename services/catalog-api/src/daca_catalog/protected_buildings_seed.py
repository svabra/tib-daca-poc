"""Additive armasuisse → Verteidigung protected-building catalog example."""

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .modeling_seed import REAL_ESTATE_DOMAIN_ID
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

MARKER = "poc-armasuisse-verteidigung-protected-buildings-v1"
PRODUCT_ID = UUID("1aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
PRODUCT_URN = "urn:daca:ch:armasuisse:protected-buildings"


def seed_protected_buildings_product(session: Session) -> bool:
    """Reuse existing people/domain and never reset later edits or retirement."""
    if session.get(SeedMarker, MARKER):
        return False
    people = {identity: session.get(DemoUser, identity) for identity in (
        "giuseppe.starwars", "thomas.wikinger", "christian.man",
    )}
    domain = session.get(Domain, REAL_ESTATE_DOMAIN_ID)
    if domain is None or domain.lifecycle != "active" or any(person is None or not person.active for person in people.values()):
        return False
    if session.get(DataProduct, PRODUCT_ID) or session.scalar(select(DataProduct).where(DataProduct.urn == PRODUCT_URN)):
        session.add(SeedMarker(name=MARKER))
        session.flush()
        return False
    owner = people["giuseppe.starwars"]
    now = utc_now()
    product = DataProduct(
        id=PRODUCT_ID, urn=PRODUCT_URN, origin_catalog="urn:daca:catalog:bit-poc",
        revision=1, active_policy_revision=None, discoverable=True,
        owner_user_id=owner.id, deputy_owner_user_id="thomas.wikinger",
        title="Schützenswerte Gebäude – armasuisse",
        description=("Synthetisches PoC-Datenprodukt der armasuisse für Verteidigung (V). "
                     "Fiktive Gebäudekennungen, Gebäudekategorien und Schutzkategorien "
                     "unterstützen die gemeinsame Immobilienplanung. Keine realen Standorte, "
                     "Sicherheitsmerkmale oder operativen Gebäudeangaben."),
        owner="armasuisse", domain="Immobilienmanagement VBS",
        lifecycle="active", classification="internal",
        keywords=["Gebäude", "schützenswert", "armasuisse", "Verteidigung", "Immobilien", "synthetisch"],
        contact={"name": owner.display_name, "email": owner.email},
        license="Interadministrative Nutzung – PoC", update_frequency="quarterly",
        quality={"aggregationLevel": "Fiktives Gebäude; ausschliesslich synthetische Schutzkategorien"},
        extra_metadata={
            "language": ["de"], "spatial": "Schweiz (synthetisch)", "containsPersonalData": False,
            "dataOwner": {"name": owner.display_name, "organization": "armasuisse", "avatarUrl": owner.avatar_url},
            "catalogUsage": {"consumerUserIds": ["christian.man"], "consumerMachineIds": [],
                             "responsibleUserIds": [owner.id, "thomas.wikinger"],
                             "sharedByUserIds": [owner.id], "sharedWithUserIds": ["christian.man"],
                             "requestedByUserIds": []},
        }, created_at=now, updated_at=now,
    )
    session.add(product)
    session.flush()
    session.add(DataProductDomain(data_product_id=product.id, domain_id=domain.id,
                                  position=0, assigned_by_user_id=owner.id, assigned_at=now))
    details = {"fixture": MARKER, "synthetic": True, "producerOrganization": "VBS armasuisse",
               "consumerOrganization": "VBS Verteidigung", "catalogConsumptionOnly": True}
    session.add(ProvenanceEvent(id=uuid4(), data_product_id=product.id, product_urn=product.urn,
                                sequence=1, event_type="created", actor="seed:protected-buildings",
                                details=details, occurred_at=now))
    session.add(AuditEvent(id=uuid4(), resource_type="data-product", resource_id=str(product.id),
                          action="created", actor="seed:protected-buildings", revision=1, details=details))
    session.add(SeedMarker(name=MARKER))
    session.flush()
    return True
