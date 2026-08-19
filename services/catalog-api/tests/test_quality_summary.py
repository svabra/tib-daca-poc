from __future__ import annotations

from collections.abc import Callable

import pytest
from daca_catalog.main import quality_medal, quality_responses
from daca_catalog.models import DataProduct, ProductQualityAssessment
from sqlalchemy import Engine, event, func, select
from sqlalchemy.orm import Session


@pytest.mark.parametrize(
    ("score", "medal"),
    [
        (0, "bronze"),
        (3, "bronze"),
        (4, "silver"),
        (5, "gold"),
        (6, "platinum"),
    ],
)
def test_quality_medal_uses_the_canonical_thresholds(score: int, medal: str) -> None:
    assert quality_medal(score) == medal


def select_count(engine: Engine, operation: Callable[[], object]) -> int:
    statements = 0

    def count_statement(*args: object) -> None:
        nonlocal statements
        statement = str(args[2]).lstrip().upper()
        if statement.startswith("SELECT"):
            statements += 1

    event.listen(engine, "before_cursor_execute", count_statement)
    try:
        operation()
    finally:
        event.remove(engine, "before_cursor_execute", count_statement)
    return statements


def calculate_query_count(session: Session, products: list[DataProduct]) -> int:
    engine = session.get_bind()
    assert isinstance(engine, Engine)
    return select_count(engine, lambda: quality_responses(session, products))


def test_legacy_products_receive_a_canonical_non_persisting_quality_summary(session_factory):
    with session_factory() as session:
        products = list(session.scalars(select(DataProduct).order_by(DataProduct.id)))
        assessment_count_before = session.scalar(
            select(func.count()).select_from(ProductQualityAssessment)
        )

        summaries = quality_responses(session, products)

        assert set(summaries) == {product.id for product in products}
        assert all(0 <= summary.score <= 6 for summary in summaries.values())
        assert all(
            summary.medal
            == (
                "platinum"
                if summary.score == 6
                else "gold"
                if summary.score == 5
                else "silver"
                if summary.score == 4
                else "bronze"
            )
            for summary in summaries.values()
        )
        assert session.scalar(select(func.count()).select_from(ProductQualityAssessment)) == (
            assessment_count_before
        )
        assert not session.new


def test_quality_summary_queries_do_not_grow_with_the_number_of_products(session_factory):
    with session_factory() as session:
        products = list(session.scalars(select(DataProduct).order_by(DataProduct.id)))
        one_product_queries = calculate_query_count(session, products[:1])

    with session_factory() as session:
        products = list(session.scalars(select(DataProduct).order_by(DataProduct.id)))
        all_product_queries = calculate_query_count(session, products)

    assert all_product_queries == one_product_queries
    assert all_product_queries <= 9
