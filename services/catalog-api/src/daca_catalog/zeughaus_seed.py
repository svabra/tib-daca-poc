"""Additive, one-time SG → armasuisse catalog example using existing personas."""

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import AuditEvent, DataProduct, DemoUser, ProvenanceEvent, SeedMarker, utc_now

MARKER = "poc-zeughaeuser-st-gallen-armasuisse-v1"
PRODUCT_ID = UUID("18888888-8888-4888-8888-888888888888")
PRODUCT_URN = "urn:daca:ch:sg:zeughaeuser"


def seed_zeughaus_product(session: Session) -> bool:
    """Do not reset existing identities, edited products, retirement or access policy."""
    if session.get(SeedMarker, MARKER):
        return False
    people = {identity: session.get(DemoUser, identity) for identity in (
        "beat.stalder", "sarah.brunner", "giuseppe.starwars",
    )}
    if any(person is None or not person.active for person in people.values()):
        return False  # Foundational/workflow/modeling seeds provision these personas first.
    if session.get(DataProduct, PRODUCT_ID) or session.scalar(select(DataProduct).where(DataProduct.urn == PRODUCT_URN)):
        session.add(SeedMarker(name=MARKER))
        session.flush()
        return False
    owner = people["beat.stalder"]
    now = utc_now()
    product = DataProduct(
        id=PRODUCT_ID, urn=PRODUCT_URN, origin_catalog="urn:daca:catalog:bit-poc",
        revision=1, active_policy_revision=None, discoverable=True,
        owner_user_id=owner.id, deputy_owner_user_id="sarah.brunner",
        title="Zeughäuser Kanton St. Gallen",
        description=("Synthetisches PoC-Datenprodukt des Kantons St. Gallen für die armasuisse: "
                     "fiktive Zeughauskennungen, Gebäudekategorien und aggregierter Unterhaltsbedarf. "
                     "Keine realen Standorte, Bestände oder operativen Angaben."),
        owner="Kanton St. Gallen", domain="Immobilien und Infrastruktur",
        lifecycle="active", classification="internal",
        keywords=["Zeughäuser", "St. Gallen", "armasuisse", "Infrastruktur", "synthetisch"],
        contact={"name": owner.display_name, "email": owner.email},
        license="Interadministrative Nutzung – PoC", update_frequency="quarterly",
        quality={"aggregationLevel": "Fiktives Zeughaus; keine realen Standortdaten"},
        extra_metadata={
            "language": ["de"], "spatial": "Kanton St. Gallen", "containsPersonalData": False,
            "dataOwner": {"name": owner.display_name, "organization": "Kanton St. Gallen",
                          "avatarUrl": owner.avatar_url},
            "catalogUsage": {"consumerUserIds": ["giuseppe.starwars"], "consumerMachineIds": [],
                             "responsibleUserIds": ["beat.stalder", "sarah.brunner"],
                             "sharedByUserIds": ["beat.stalder"], "sharedWithUserIds": ["giuseppe.starwars"],
                             "requestedByUserIds": []},
        },
        created_at=now, updated_at=now,
    )
    session.add(product)
    session.flush()
    details = {"fixture": MARKER, "synthetic": True, "consumerOrganization": "VBS armasuisse"}
    session.add(ProvenanceEvent(id=uuid4(), data_product_id=product.id, product_urn=product.urn,
                                sequence=1, event_type="created", actor="seed:zeughaus",
                                details=details, occurred_at=now))
    session.add(AuditEvent(id=uuid4(), resource_type="data-product", resource_id=str(product.id),
                          action="created", actor="seed:zeughaus", revision=1, details=details))
    session.add(SeedMarker(name=MARKER))
    session.flush()
    return True


if __name__ == "__main__":
    from .database import default_session_factory
    from .settings import get_settings

    with default_session_factory(get_settings())() as session:
        added = seed_zeughaus_product(session)
        session.commit()
    print("Zeughaus PoC product created." if added else "No change: fixture exists or prerequisites unavailable.")
