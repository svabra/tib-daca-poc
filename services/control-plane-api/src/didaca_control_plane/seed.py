from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .database import create_database_engine, create_session_factory
from .models import AuditEvent, CatalogInstance, SyncConfiguration, TrustGrant

FEDERAL_CATALOG_ID = "11111111-1111-4111-8111-111111111111"
ST_GALLEN_CATALOG_ID = "22222222-2222-4222-8222-222222222222"
TRUST_GRANT_ID = "33333333-3333-4333-8333-333333333333"
SYNC_CONFIGURATION_ID = "44444444-4444-4444-8444-444444444444"


def seed_database(session_factory: sessionmaker[Session]) -> bool:
    """Create deterministic demo records; return True when anything was added."""
    created = False
    with session_factory() as session:
        federal = session.scalar(
            select(CatalogInstance).where(CatalogInstance.urn == "urn:didaca:catalog:bit-federal")
        )
        if federal is None:
            federal = CatalogInstance(
                id=FEDERAL_CATALOG_ID,
                urn="urn:didaca:catalog:bit-federal",
                name="BIT Federal Data Catalog",
                organization="Bundesamt für Informatik und Telekommunikation",
                environment="poc",
                endpoint="http://catalog-api:8001",
                api_version="v1",
                capabilities=[
                    "metadata",
                    "lineage",
                    "provenance",
                    "endpoints",
                    "policies",
                ],
                lifecycle="active",
            )
            session.add(federal)
            created = True

        st_gallen = session.scalar(
            select(CatalogInstance).where(
                CatalogInstance.urn == "urn:didaca:catalog:kanton-st-gallen"
            )
        )
        if st_gallen is None:
            st_gallen = CatalogInstance(
                id=ST_GALLEN_CATALOG_ID,
                urn="urn:didaca:catalog:kanton-st-gallen",
                name="Kanton St. Gallen Data Catalog",
                organization="Kanton St. Gallen",
                environment="poc",
                endpoint="http://catalog-st-gallen.invalid",
                api_version="v1",
                capabilities=["metadata", "lineage", "provenance"],
                lifecycle="active",
            )
            session.add(st_gallen)
            created = True

        session.flush()
        grant = session.get(TrustGrant, TRUST_GRANT_ID)
        if grant is None:
            grant = TrustGrant(
                id=TRUST_GRANT_ID,
                provider_id=federal.id,
                consumer_id=st_gallen.id,
                state="approved",
                allowed_resource_types=["metadata", "lineage", "provenance"],
                product_filters=[],
                owner_filters=[],
                domain_filters=[],
            )
            session.add(grant)
            created = True

        sync_configuration = session.get(SyncConfiguration, SYNC_CONFIGURATION_ID)
        if sync_configuration is None:
            session.add(
                SyncConfiguration(
                    id=SYNC_CONFIGURATION_ID,
                    name="Federal metadata to St. Gallen",
                    source_id=federal.id,
                    target_id=st_gallen.id,
                    trust_grant_id=grant.id,
                    direction="push",
                    resource_scopes=["metadata", "lineage", "provenance"],
                    schedule="0 */6 * * *",
                    enabled=False,
                    conflict_policy="origin-wins",
                )
            )
            created = True

        if created:
            session.add(
                AuditEvent(
                    aggregate_type="controlPlane",
                    aggregate_id=FEDERAL_CATALOG_ID,
                    action="demo.seeded",
                    actor="system:seed",
                    request_id="seed-2026-08-03",
                    details={
                        "note": "Configuration only; resource synchronization is not implemented."
                    },
                )
            )
        session.commit()
    return created


def main() -> None:
    settings = get_settings()
    engine = create_database_engine(settings)
    try:
        created = seed_database(create_session_factory(engine))
        print("Seed data created." if created else "Seed data already present.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
