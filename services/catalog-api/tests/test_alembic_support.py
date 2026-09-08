from daca_catalog.alembic_support import include_autogenerate_object


def test_autogenerate_excludes_only_the_reflected_alembic_version_table() -> None:
    assert not include_autogenerate_object(
        object(), "alembic_version", "table", True, None
    )
    assert include_autogenerate_object(
        object(), "alembic_version", "table", False, None
    )
    assert include_autogenerate_object(
        object(), "logical_models", "table", True, None
    )
    assert include_autogenerate_object(
        object(), "alembic_version", "column", True, None
    )
