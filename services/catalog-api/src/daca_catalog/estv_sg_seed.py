"""Additive second ESTV → St. Gallen consumption example; no access grant."""

from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import (
    AuditEvent,
    DataProduct,
    DataProductDomain,
    DemoUser,
    ProvenanceEvent,
    SeedMarker,
    utc_now,
)

MARKER = "poc-second-estv-st-gallen-product-v1"
PRODUCT_ID = UUID("19999999-9999-4999-8999-999999999999")
PRODUCT_URN = "urn:daca:ch:estv:municipal-federal-tax-indicators"
BASE_PRODUCT_ID = UUID("11111111-1111-4111-8111-111111111111")


def seed_estv_sg_product(session: Session) -> bool:
    """Reuse existing people and domain; preserve all later edits and retirement."""
    if session.get(SeedMarker, MARKER):
        return False
    people = {identity: session.get(DemoUser, identity) for identity in (
        "kassandra.valdata", "ariane.keller", "beat.stalder", "sarah.brunner",
    )}
    if any(person is None or not person.active for person in people.values()):
        return False
    base = session.get(DataProduct, BASE_PRODUCT_ID)
    if base is None:
        return False
    if session.get(DataProduct, PRODUCT_ID) or session.scalar(select(DataProduct).where(DataProduct.urn == PRODUCT_URN)):
        session.add(SeedMarker(name=MARKER))
        session.flush()
        return False
    owner = people["kassandra.valdata"]
    now = utc_now()
    product = DataProduct(
        id=PRODUCT_ID, urn=PRODUCT_URN, origin_catalog="urn:daca:catalog:bit-poc",
        revision=1, active_policy_revision=None, discoverable=True,
        owner_user_id=owner.id, deputy_owner_user_id="ariane.keller",
        title="ESTV – Gemeindekennzahlen zur direkten Bundessteuer",
        description=("Synthetische aggregierte Kennzahlen der direkten Bundessteuer nach Gemeinde "
                     "für kantonale Analysen in St. Gallen. Fiktive Fallzahlen und Steuererträge; "
                     "keine Personen-, Unternehmens- oder Echtdaten."),
        owner="ESTV", domain="Direkte Bundessteuer", lifecycle="active", classification="internal",
        keywords=["Bundessteuer", "Gemeinden", "St. Gallen", "Kennzahlen", "synthetisch"],
        contact={"name": owner.display_name, "email": owner.email},
        license="Interadministrative Nutzung – PoC", update_frequency="annual",
        quality={"aggregationLevel": "Gemeinde; ausschliesslich synthetische Werte"},
        extra_metadata={
            "language": ["de"], "spatial": "Kanton St. Gallen", "containsPersonalData": False,
            "dataOwner": {"name": owner.display_name, "organization": "ESTV", "avatarUrl": owner.avatar_url},
            "catalogUsage": {"consumerUserIds": ["beat.stalder", "sarah.brunner"], "consumerMachineIds": [],
                             "responsibleUserIds": [owner.id, "ariane.keller"],
                             "sharedByUserIds": [owner.id], "sharedWithUserIds": ["beat.stalder"],
                             "requestedByUserIds": []},
        }, created_at=now, updated_at=now,
    )
    session.add(product)
    session.flush()
    for assignment in base.domain_assignments:
        session.add(DataProductDomain(data_product_id=product.id, domain_id=assignment.domain_id,
                                      position=assignment.position, assigned_by_user_id=owner.id, assigned_at=now))
    details = {"fixture": MARKER, "synthetic": True, "consumerOrganization": "Kanton St. Gallen",
               "catalogConsumptionOnly": True}
    session.add(ProvenanceEvent(id=uuid4(), data_product_id=product.id, product_urn=product.urn,
                                sequence=1, event_type="created", actor="seed:estv-sg",
                                details=details, occurred_at=now))
    session.add(AuditEvent(id=uuid4(), resource_type="data-product", resource_id=str(product.id),
                          action="created", actor="seed:estv-sg", revision=1, details=details))
    session.add(SeedMarker(name=MARKER))
    session.flush()
    return True
