from __future__ import annotations

import uuid
from functools import lru_cache

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models import TaxStatistic
from app.settings import get_settings


def _engine(database_url: str, schema: str) -> Engine:
    options: dict[str, object] = {"pool_pre_ping": True}
    if database_url.startswith("postgresql") and schema != "public":
        options["connect_args"] = {
            "options": f"-csearch_path={schema},public",
        }
    return create_engine(database_url, **options)


@lru_cache
def sample_engine() -> Engine:
    settings = get_settings()
    return _engine(settings.resolved_sample_database_url, settings.daca_sample_schema)


@lru_cache
def projector_engine() -> Engine:
    settings = get_settings()
    return _engine(
        settings.resolved_policy_projector_database_url,
        settings.daca_sample_schema,
    )


def fetch_statistics(
    subject_id: str,
    product_id: uuid.UUID,
    subject_type: str = "person",
) -> list[dict[str, object]]:
    with Session(sample_engine()) as session, session.begin():
        session.execute(
            text("SELECT set_config('daca.subject_id', :subject_id, true)"),
            {"subject_id": subject_id},
        )
        session.execute(text("SELECT set_config('daca.protocol', 'http-rest', true)"))
        session.execute(
            text("SELECT set_config('daca.subject_type', :subject_type, true)"),
            {"subject_type": subject_type},
        )
        records = session.scalars(
            select(TaxStatistic)
            .where(TaxStatistic.product_id == product_id)
            .order_by(TaxStatistic.canton_code)
        ).all()
        return [
            {
                "cantonCode": record.canton_code,
                "taxYear": record.tax_year,
                "taxpayers": record.taxpayers,
                "taxableIncomeMillionChf": float(record.taxable_income_million_chf),
                "sourceNote": record.source_note,
            }
            for record in records
        ]


def database_ready() -> bool:
    with sample_engine().connect() as connection:
        return connection.scalar(text("SELECT 1")) == 1
