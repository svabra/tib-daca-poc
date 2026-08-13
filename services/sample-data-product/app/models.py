from __future__ import annotations

import datetime as dt
import uuid

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Integer, Numeric, String, Text
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
    policy_revision: Mapped[int] = mapped_column(BigInteger)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PolicyDeployment(Base):
    __tablename__ = "policy_deployments"

    product_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    revision: Mapped[int] = mapped_column(BigInteger)
    deployed_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: dt.datetime.now(dt.UTC)
    )
