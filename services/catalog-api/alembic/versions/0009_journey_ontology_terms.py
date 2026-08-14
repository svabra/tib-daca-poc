"""Backfill canonical ontology terms used by the DAAIF journey.

Revision ID: 0009_journey_terms
Revises: 0008_group_organization
Create Date: 2026-08-13
"""

import uuid
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_journey_terms"
down_revision: str | None = "0008_group_organization"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ONTOLOGY_VERSION_ID = "ac36e03f-c823-5693-ba42-5209b172e1a5"
TERMS = (
    (
        "bbaf25eb-6e51-5dd7-8769-e95a9fe9e2cf",
        "urn:daca:ontology:tax:CorporateTaxForecastDataset",
        "class",
        "Kantonale Gewerbesteuer – Soll/Ist und Hochrechnung",
        "Synthetische kantonale Gewerbesteuerwerte mit Jahresplan, Ist und Hochrechnung.",
    ),
    (
        "a578ee0a-ad65-5edd-bc5f-c18b1ab42577",
        "urn:daca:ontology:tax:PlannedAmount",
        "property",
        "Planbetrag",
        "Aggregierter synthetischer Planbetrag in CHF.",
    ),
    (
        "8eea95d0-d392-5fe9-9eb2-b729064ccbdb",
        "urn:daca:ontology:tax:ActualAmount",
        "property",
        "Istbetrag",
        "Aggregierter synthetischer Istbetrag in CHF.",
    ),
    (
        "622f0cb7-b185-53b6-9ba1-f95fa7782e1d",
        "urn:daca:ontology:tax:ForecastAmount",
        "property",
        "Hochrechnung",
        "Aggregierte synthetische Jahreshochrechnung in CHF.",
    ),
)


def upgrade() -> None:
    bind = op.get_bind()
    versions = sa.table(
        "canonical_ontology_versions",
        sa.column("id", sa.Uuid()),
    )
    terms = sa.table(
        "canonical_ontology_terms",
        sa.column("id", sa.Uuid()),
        sa.column("ontology_version_id", sa.Uuid()),
        sa.column("uri", sa.String(500)),
        sa.column("kind", sa.String(32)),
        sa.column("label", sa.String(255)),
        sa.column("definition", sa.Text()),
    )
    version_id = uuid.UUID(ONTOLOGY_VERSION_ID)
    version_exists = bind.execute(
        sa.select(versions.c.id).where(versions.c.id == version_id)
    ).first()
    if version_exists is None:
        # A fresh, unseeded database is completed later by the idempotent seed
        # reconciler; existing PoC databases are backfilled immediately here.
        return

    for term_id, uri, kind, label, definition in TERMS:
        existing = bind.execute(
            sa.select(terms.c.id).where(terms.c.uri == uri)
        ).first()
        if existing is None:
            bind.execute(
                terms.insert().values(
                    id=uuid.UUID(term_id),
                    ontology_version_id=version_id,
                    uri=uri,
                    kind=kind,
                    label=label,
                    definition=definition,
                )
            )


def downgrade() -> None:
    # Canonical terms may already be referenced by confirmed mappings. Preserve
    # that semantic evidence on downgrade; the change is additive data only.
    pass
