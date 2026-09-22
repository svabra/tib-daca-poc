from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Integer, Numeric, String, Text, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TaxStatistic(Base):
    __tablename__ = "tax_statistics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    canton_code: Mapped[str] = mapped_column(String(2))
    tax_year: Mapped[int] = mapped_column(Integer)
    taxpayers: Mapped[int] = mapped_column(Integer)
    taxable_income_million_chf: Mapped[float] = mapped_column(Numeric(14, 2))
    source_note: Mapped[str] = mapped_column(Text)


class PolicyEntitlement(Base):
    __tablename__ = "policy_entitlements"

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    subject_id: Mapped[str] = mapped_column(String(200), primary_key=True)
    subject_type: Mapped[str] = mapped_column(String(32), primary_key=True, default="person")
    action: Mapped[str] = mapped_column(String(100), primary_key=True)
    protocol: Mapped[str] = mapped_column(String(32), primary_key=True)
    valid_from: Mapped[dt.date] = mapped_column(Date, default=dt.date.min)
    valid_until: Mapped[dt.date] = mapped_column(Date, default=dt.date.max)
    data_variant: Mapped[str] = mapped_column(String(32), default="original")
    weekly_days: Mapped[str | None] = mapped_column(String(32))
    weekly_start_time: Mapped[dt.time | None] = mapped_column(Time)
    weekly_end_time: Mapped[dt.time | None] = mapped_column(Time)
    weekly_time_zone: Mapped[str | None] = mapped_column(String(100))
    policy_revision: Mapped[int] = mapped_column(BigInteger)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PolicyDeployment(Base):
    __tablename__ = "policy_deployments"

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    revision: Mapped[int] = mapped_column(BigInteger)
    deployed_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: dt.datetime.now(dt.UTC)
    )


class VibdbuBuilding(Base):
    """Synthetic SAP VIBDBU building master used by the physical-model explorer."""

    __tablename__ = "VIBDBU"

    sgenr: Mapped[str] = mapped_column("SGENR", String(8), primary_key=True)
    swenr: Mapped[str] = mapped_column("SWENR", String(8))
    authgrp: Mapped[str | None] = mapped_column("AUTHGRP", String(40))
    bukrs: Mapped[str] = mapped_column("BUKRS", String(4))
    gemeinde: Mapped[str] = mapped_column("GEMEINDE", String(8))
    rgebart: Mapped[str] = mapped_column("RGEBART", String(2))
    rgebzust: Mapped[str] = mapped_column("RGEBZUST", String(2))
    validfrom: Mapped[dt.date] = mapped_column("VALIDFROM", Date)
    validto: Mapped[dt.date | None] = mapped_column("VALIDTO", Date)
    xgetxt: Mapped[str] = mapped_column("XGETXT", String(60))
    ybaujahr: Mapped[dt.date | None] = mapped_column("YBAUJAHR", Date)
    zzactanova_id: Mapped[str | None] = mapped_column("ZZACTANOVA_ID", String(36))
    zzagfa_nr: Mapped[str | None] = mapped_column("ZZAGFA_NR", String(25))
    zzbasisjahr: Mapped[int | None] = mapped_column("ZZBASISJAHR", Numeric(4, 0))
    zzbauwerksich: Mapped[str | None] = mapped_column("ZZBAUWERKSICH", String(1))
    zzbic_nummer: Mapped[str | None] = mapped_column("ZZBIC_NUMMER", String(20))
    zzbrandschutz_audit_dat: Mapped[dt.date | None] = mapped_column(
        "ZZBRANDSCHUTZ_AUDIT_DAT", Date
    )
    zzbrandschutz_kategorie: Mapped[str | None] = mapped_column(
        "ZZBRANDSCHUTZ_KATEGORIE", String(2)
    )
    zzbrandschutz_zustand: Mapped[str | None] = mapped_column(
        "ZZBRANDSCHUTZ_ZUSTAND", String(1)
    )
    zzdatenbank: Mapped[str | None] = mapped_column("ZZDATENBANK", String(1))
    zzdb_mutiert_am: Mapped[dt.date | None] = mapped_column("ZZDB_MUTIERT_AM", Date)
    zzegid: Mapped[str | None] = mapped_column("ZZEGID", String(100))
    zzeigentumsart: Mapped[str | None] = mapped_column("ZZEIGENTUMSART", String(1))
    zzgebzust_erfasst_am: Mapped[dt.date | None] = mapped_column(
        "ZZGEBZUST_ERFASST_AM", Date
    )
    zzindexreihe: Mapped[str | None] = mapped_column("ZZINDEXREIHE", String(5))
    zzkomz: Mapped[str | None] = mapped_column("ZZKOMZ", String(1))
    zzkoordx: Mapped[int | None] = mapped_column("ZZKOORDX", Numeric(7, 0))
    zzkoordx_zusatz: Mapped[int | None] = mapped_column(
        "ZZKOORDX_ZUSATZ", Numeric(7, 0)
    )
    zzkoordy: Mapped[int | None] = mapped_column("ZZKOORDY", Numeric(7, 0))
    zzkoordy_zusatz: Mapped[int | None] = mapped_column(
        "ZZKOORDY_ZUSATZ", Numeric(7, 0)
    )
    zzkoordz: Mapped[int | None] = mapped_column("ZZKOORDZ", Numeric(4, 0))
    zzkoordz_zusatz: Mapped[int | None] = mapped_column(
        "ZZKOORDZ_ZUSATZ", Numeric(4, 0)
    )
    zzkuend_akzept_datum: Mapped[dt.date | None] = mapped_column(
        "ZZKUEND_AKZEPT_DATUM", Date
    )
    zzkuend_datum: Mapped[dt.date | None] = mapped_column("ZZKUEND_DATUM", Date)
    zzkuend_prozess_jahr: Mapped[int | None] = mapped_column(
        "ZZKUEND_PROZESS_JAHR", Numeric(4, 0)
    )
    zzkuend_referenz_id: Mapped[str | None] = mapped_column(
        "ZZKUEND_REFERENZ_ID", String(10)
    )
    zzkuend_rueckn_datum: Mapped[dt.date | None] = mapped_column(
        "ZZKUEND_RUECKN_DATUM", Date
    )
    zzlanderwerb: Mapped[str | None] = mapped_column("ZZLANDERWERB", String(50))
    zzluftrein: Mapped[str | None] = mapped_column("ZZLUFTREIN", String(1))
    zzmultiegid: Mapped[str | None] = mapped_column("ZZMULTIEGID", String(1))
    zzobj_art: Mapped[str | None] = mapped_column("ZZOBJ_ART", String(10))
    zzobj_subart: Mapped[str | None] = mapped_column("ZZOBJ_SUBART", String(8))
    zzschutzraumtech: Mapped[str | None] = mapped_column("ZZSCHUTZRAUMTECH", String(1))
    zzschutzraumtechdat: Mapped[dt.date | None] = mapped_column(
        "ZZSCHUTZRAUMTECHDAT", Date
    )
    zzschutzzone: Mapped[str | None] = mapped_column("ZZSCHUTZZONE", String(2))
    zzzertifikat: Mapped[str | None] = mapped_column("ZZZERTIFIKAT", String(2))
    zzzertifikatdat: Mapped[dt.date | None] = mapped_column("ZZZERTIFIKATDAT", Date)
