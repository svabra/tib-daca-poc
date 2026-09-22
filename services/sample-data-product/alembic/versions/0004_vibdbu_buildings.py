"""Create a synthetic SAP VIBDBU building master for metadata exploration.

Revision ID: 0004_vibdbu_buildings
Revises: 0003_weekly_availability
Create Date: 2026-09-22
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from app.migration_context import sample_schema, shared_postgres_enabled

revision: str = "0004_vibdbu_buildings"
down_revision: str | None = "0003_weekly_availability"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    schema = sample_schema()
    shared_postgres = shared_postgres_enabled()
    op.create_table(
        "VIBDBU",
        sa.Column("SGENR", sa.String(8), primary_key=True, comment="Gebäude"),
        sa.Column("SWENR", sa.String(8), nullable=False, comment="Wirtschaftseinheit"),
        sa.Column("AUTHGRP", sa.String(40), comment="Berechtigungsgruppe"),
        sa.Column("BUKRS", sa.String(4), nullable=False, comment="Buchungskreis"),
        sa.Column("GEMEINDE", sa.String(8), nullable=False, comment="Gemeindeschlüssel"),
        sa.Column("RGEBART", sa.String(2), nullable=False, comment="Gebäudeart"),
        sa.Column("RGEBZUST", sa.String(2), nullable=False, comment="Gebäudezustand"),
        sa.Column("VALIDFROM", sa.Date(), nullable=False, comment="Gültig ab"),
        sa.Column("VALIDTO", sa.Date(), comment="Gültig bis"),
        sa.Column("XGETXT", sa.String(60), nullable=False, comment="Bezeichnung des GE"),
        sa.Column("YBAUJAHR", sa.Date(), comment="Baujahr"),
        sa.Column("ZZACTANOVA_ID", sa.String(36), comment="ID Acta Nova"),
        sa.Column("ZZAGFA_NR", sa.String(25), comment="AGFA Nummer"),
        sa.Column("ZZBASISJAHR", sa.Numeric(4, 0), comment="Basisjahr"),
        sa.Column("ZZBAUWERKSICH", sa.String(1), comment="Bauwerksicherheit"),
        sa.Column("ZZBIC_NUMMER", sa.String(20), comment="BIC-Nummer (alt)"),
        sa.Column("ZZBRANDSCHUTZ_AUDIT_DAT", sa.Date(), comment="Datum Brandschutzaudit"),
        sa.Column("ZZBRANDSCHUTZ_KATEGORIE", sa.String(2), comment="Brandschutzkategorie"),
        sa.Column("ZZBRANDSCHUTZ_ZUSTAND", sa.String(1), comment="Brandschutzzustand"),
        sa.Column("ZZDATENBANK", sa.String(1), comment="Datenbank"),
        sa.Column("ZZDB_MUTIERT_AM", sa.Date(), comment="mutiert am"),
        sa.Column("ZZEGID", sa.String(100), comment="EGID"),
        sa.Column("ZZEIGENTUMSART", sa.String(1), comment="Eigentumsart"),
        sa.Column("ZZGEBZUST_ERFASST_AM", sa.Date(), comment="Erfasst am"),
        sa.Column("ZZINDEXREIHE", sa.String(5), comment="Indexreihe"),
        sa.Column("ZZKOMZ", sa.String(1), comment="Fachd. KOMZ Wasser"),
        sa.Column("ZZKOORDX", sa.Numeric(7, 0), comment="Koordinate X (Nord)"),
        sa.Column("ZZKOORDX_ZUSATZ", sa.Numeric(7, 0), comment="Zusatz-Koordinate X (Nord)"),
        sa.Column("ZZKOORDY", sa.Numeric(7, 0), comment="Koordinate Y (Ost)"),
        sa.Column("ZZKOORDY_ZUSATZ", sa.Numeric(7, 0), comment="Zusatz-Koordinate Y (Ost)"),
        sa.Column("ZZKOORDZ", sa.Numeric(4, 0), comment="Koordinate Z (Höhe)"),
        sa.Column("ZZKOORDZ_ZUSATZ", sa.Numeric(4, 0), comment="Zusatz-Koordinate Z (Höhe)"),
        sa.Column("ZZKUEND_AKZEPT_DATUM", sa.Date(), comment="Akzeptiert am"),
        sa.Column("ZZKUEND_DATUM", sa.Date(), comment="Kündigung per"),
        sa.Column("ZZKUEND_PROZESS_JAHR", sa.Numeric(4, 0), comment="Kündigungsprozess Jahr"),
        sa.Column("ZZKUEND_REFERENZ_ID", sa.String(10), comment="Referenz Identifikation"),
        sa.Column("ZZKUEND_RUECKN_DATUM", sa.Date(), comment="Rücknahme am"),
        sa.Column("ZZLANDERWERB", sa.String(50), comment="Landerwerbsnummer"),
        sa.Column("ZZLUFTREIN", sa.String(1), comment="Luftreinhaltung"),
        sa.Column("ZZMULTIEGID", sa.String(1), comment="mehrere EGID-Nr. vorhanden"),
        sa.Column("ZZOBJ_ART", sa.String(10), comment="Objektart"),
        sa.Column("ZZOBJ_SUBART", sa.String(8), comment="Objektsubart"),
        sa.Column("ZZSCHUTZRAUMTECH", sa.String(1), comment="Schutzraumtechnik"),
        sa.Column("ZZSCHUTZRAUMTECHDAT", sa.Date(), comment="geprüft am"),
        sa.Column("ZZSCHUTZZONE", sa.String(2), comment="Schutzzone"),
        sa.Column("ZZZERTIFIKAT", sa.String(2), comment="Zertifikat / Label / Energie-Standard"),
        sa.Column("ZZZERTIFIKATDAT", sa.Date(), comment="Datum Zertifizierung"),
        comment=(
            "Synthetischer SAP-Gebäudebestand nach der VIBDBU-Struktur; "
            "ausschliesslich für den DaCa-Modellierungs-Use-Case."
        ),
    )
    op.execute(
        sa.text(
            '''
            INSERT INTO "VIBDBU" (
                "SGENR", "SWENR", "AUTHGRP", "BUKRS", "GEMEINDE", "RGEBART",
                "RGEBZUST", "VALIDFROM", "VALIDTO", "XGETXT", "YBAUJAHR",
                "ZZACTANOVA_ID", "ZZAGFA_NR", "ZZBASISJAHR", "ZZBAUWERKSICH",
                "ZZBIC_NUMMER", "ZZBRANDSCHUTZ_AUDIT_DAT",
                "ZZBRANDSCHUTZ_KATEGORIE", "ZZBRANDSCHUTZ_ZUSTAND", "ZZDATENBANK",
                "ZZDB_MUTIERT_AM", "ZZEGID", "ZZEIGENTUMSART",
                "ZZGEBZUST_ERFASST_AM", "ZZINDEXREIHE", "ZZKOMZ", "ZZKOORDX",
                "ZZKOORDX_ZUSATZ", "ZZKOORDY", "ZZKOORDY_ZUSATZ", "ZZKOORDZ",
                "ZZKOORDZ_ZUSATZ", "ZZKUEND_AKZEPT_DATUM", "ZZKUEND_DATUM",
                "ZZKUEND_PROZESS_JAHR", "ZZKUEND_REFERENZ_ID",
                "ZZKUEND_RUECKN_DATUM", "ZZLANDERWERB", "ZZLUFTREIN",
                "ZZMULTIEGID", "ZZOBJ_ART", "ZZOBJ_SUBART", "ZZSCHUTZRAUMTECH",
                "ZZSCHUTZRAUMTECHDAT", "ZZSCHUTZZONE", "ZZZERTIFIKAT",
                "ZZZERTIFIKATDAT"
            )
            SELECT
                'G' || lpad(gs::text, 7, '0'),
                'WE' || lpad((((gs - 1) % 180) + 1)::text, 6, '0'),
                (ARRAY['IMMO_NORD', 'IMMO_MITTE', 'IMMO_WEST', 'IMMO_SUED'])[1 + gs % 4],
                (ARRAY['VBS1', 'VBS2', 'VBS3'])[1 + gs % 3],
                lpad((1000 + (gs * 37) % 7999)::text, 8, '0'),
                lpad((1 + gs % 7)::text, 2, '0'),
                lpad((1 + gs % 4)::text, 2, '0'),
                make_date(2000 + gs % 24, 1 + gs % 12, 1 + gs % 27),
                CASE WHEN gs % 17 = 0 THEN make_date(2027 + gs % 8, 12, 31) END,
                (ARRAY['Kaserne', 'Verwaltungsgebäude', 'Werkstatt', 'Lagerhalle',
                       'Ausbildungszentrum', 'Technikgebäude', 'Sportanlage'])[1 + gs % 7]
                    || ' ' || (ARRAY['Bern', 'Thun', 'Bülach', 'Payerne', 'Emmen',
                                            'Frauenfeld', 'Andermatt', 'Bière'])[1 + gs % 8]
                    || ' ' || lpad(gs::text, 4, '0'),
                make_date(1945 + gs % 79, 1 + gs % 12, 1),
                substr(md5('vibdbu-' || gs), 1, 8) || '-' ||
                    substr(md5('vibdbu-' || gs), 9, 4) || '-' ||
                    substr(md5('vibdbu-' || gs), 13, 4) || '-' ||
                    substr(md5('vibdbu-' || gs), 17, 4) || '-' ||
                    substr(md5('vibdbu-' || gs), 21, 12),
                'AGFA-' || lpad(gs::text, 8, '0'),
                2015 + gs % 11,
                CASE WHEN gs % 19 = 0 THEN 'P' ELSE 'J' END,
                'BIC-' || lpad(gs::text, 10, '0'),
                make_date(2020 + gs % 6, 1 + gs % 12, 1 + gs % 27),
                lpad((1 + gs % 4)::text, 2, '0'),
                (ARRAY['A', 'B', 'C'])[1 + gs % 3],
                'J',
                make_date(2025 + gs % 2, 1 + gs % 12, 1 + gs % 27),
                (100000000 + gs)::text,
                (ARRAY['B', 'M', 'P'])[1 + gs % 3],
                make_date(2021 + gs % 5, 1 + gs % 12, 1 + gs % 27),
                (ARRAY['ZH20', 'BFS21', 'BKP22', 'LIK23'])[1 + gs % 4],
                CASE WHEN gs % 9 = 0 THEN 'J' ELSE 'N' END,
                1075000 + (gs * 137) % 210000,
                CASE WHEN gs % 10 = 0 THEN 1075000 + (gs * 137 + 12) % 210000 END,
                2485000 + (gs * 173) % 350000,
                CASE WHEN gs % 10 = 0 THEN 2485000 + (gs * 173 + 12) % 350000 END,
                350 + (gs * 11) % 1750,
                CASE WHEN gs % 10 = 0 THEN 350 + (gs * 11 + 2) % 1750 END,
                CASE WHEN gs % 17 = 0 THEN make_date(2026, 1 + gs % 12, 1 + gs % 27) END,
                CASE WHEN gs % 17 = 0 THEN make_date(2027 + gs % 8, 12, 31) END,
                CASE WHEN gs % 17 = 0 THEN 2026 + gs % 8 END,
                CASE WHEN gs % 17 = 0 THEN 'K-' || lpad(gs::text, 7, '0') END,
                CASE WHEN gs % 101 = 0 THEN make_date(2026, 6, 30) END,
                'LE-' || lpad((((gs - 1) % 240) + 1)::text, 8, '0'),
                CASE WHEN gs % 7 = 0 THEN 'J' ELSE 'N' END,
                CASE WHEN gs % 13 = 0 THEN 'J' ELSE 'N' END,
                (ARRAY['KASERNE', 'BUERO', 'LAGER', 'WERKSTATT', 'TECHNIK'])[1 + gs % 5],
                (ARRAY['HAUPT', 'NEBEN', 'BETRIEB', 'AUSSEN'])[1 + gs % 4],
                CASE WHEN gs % 5 = 0 THEN 'J' ELSE 'N' END,
                CASE WHEN gs % 5 = 0 THEN make_date(2022 + gs % 4, 1 + gs % 12, 1) END,
                (ARRAY['Z1', 'Z2', 'Z3', 'Z4'])[1 + gs % 4],
                CASE WHEN gs % 6 = 0 THEN (ARRAY['MI', 'SN', 'LE'])[1 + gs % 3] END,
                CASE WHEN gs % 6 = 0 THEN make_date(2018 + gs % 8, 1 + gs % 12, 1) END
            FROM generate_series(1, 1000) AS series(gs)
            '''
        )
    )
    op.execute(f'REVOKE ALL ON TABLE "{schema}"."VIBDBU" FROM PUBLIC')
    if not shared_postgres:
        op.execute(f'GRANT USAGE ON SCHEMA "{schema}" TO daca_sample_api')
        op.execute(f'GRANT SELECT ON TABLE "{schema}"."VIBDBU" TO daca_sample_api')


def downgrade() -> None:
    op.drop_table("VIBDBU")
