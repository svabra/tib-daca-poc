from typing import Any


def include_autogenerate_object(
    _object: Any,
    name: str | None,
    type_: str,
    reflected: bool,
    _compare_to: Any | None,
) -> bool:
    """Hide only Alembic's reflected bookkeeping table from autogenerate."""
    return not (type_ == "table" and reflected and name == "alembic_version")
