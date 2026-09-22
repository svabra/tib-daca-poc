from __future__ import annotations

from app.models import VibdbuBuilding
from sqlalchemy import Date, Numeric, String


def test_vibdbu_model_matches_the_csv_structure() -> None:
    table = VibdbuBuilding.__table__
    expected_columns = [
        "SGENR", "SWENR", "AUTHGRP", "BUKRS", "GEMEINDE", "RGEBART",
        "RGEBZUST", "VALIDFROM", "VALIDTO", "XGETXT", "YBAUJAHR",
        "ZZACTANOVA_ID", "ZZAGFA_NR", "ZZBASISJAHR", "ZZBAUWERKSICH",
        "ZZBIC_NUMMER", "ZZBRANDSCHUTZ_AUDIT_DAT", "ZZBRANDSCHUTZ_KATEGORIE",
        "ZZBRANDSCHUTZ_ZUSTAND", "ZZDATENBANK", "ZZDB_MUTIERT_AM", "ZZEGID",
        "ZZEIGENTUMSART", "ZZGEBZUST_ERFASST_AM", "ZZINDEXREIHE", "ZZKOMZ",
        "ZZKOORDX", "ZZKOORDX_ZUSATZ", "ZZKOORDY", "ZZKOORDY_ZUSATZ",
        "ZZKOORDZ", "ZZKOORDZ_ZUSATZ", "ZZKUEND_AKZEPT_DATUM",
        "ZZKUEND_DATUM", "ZZKUEND_PROZESS_JAHR", "ZZKUEND_REFERENZ_ID",
        "ZZKUEND_RUECKN_DATUM", "ZZLANDERWERB", "ZZLUFTREIN", "ZZMULTIEGID",
        "ZZOBJ_ART", "ZZOBJ_SUBART", "ZZSCHUTZRAUMTECH", "ZZSCHUTZRAUMTECHDAT",
        "ZZSCHUTZZONE", "ZZZERTIFIKAT", "ZZZERTIFIKATDAT",
    ]

    assert table.name == "VIBDBU"
    assert [column.name for column in table.columns] == expected_columns
    assert len(table.columns) == 47
    assert isinstance(table.c.SGENR.type, String) and table.c.SGENR.type.length == 8
    assert isinstance(table.c.VALIDFROM.type, Date)
    assert isinstance(table.c.ZZKOORDX.type, Numeric)
    assert (table.c.ZZKOORDX.type.precision, table.c.ZZKOORDX.type.scale) == (7, 0)
