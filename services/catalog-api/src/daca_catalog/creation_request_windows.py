"""Data-basis requirements, independent of access validity or delivery scheduling."""

from datetime import date
from typing import Literal

BasisWindowType = Literal["fixed", "rolling"]
RollingWindowUnit = Literal["days", "weeks", "months", "years"]


def validate_basis_window(window_type, start, end, size, unit):
    if window_type == "rolling":
        if start is not None or end is not None:
            raise ValueError("A rolling data-basis window cannot also contain fixed dates")
        if size is None or unit is None:
            raise ValueError("Provide the rolling window size and unit")
    else:
        if size is not None or unit is not None:
            raise ValueError("A fixed data-basis window cannot contain rolling parameters")
        if start is None or end is None:
            raise ValueError("Provide both fixed data-basis dates")
        if start > end:
            raise ValueError("The data-basis end date must be on or after its start date")


def published_window_matches(scope: dict, *, window_type: BasisWindowType,
                             start: date | None, end: date | None,
                             size: int | None, unit: str | None) -> bool:
    if window_type == "rolling":
        return (scope.get("basisWindowType") == "rolling"
                and type(scope.get("rollingWindowSize")) is int
                and scope.get("rollingWindowSize") == size
                and scope.get("rollingWindowUnit") == unit
                and scope.get("basisFrom") is None and scope.get("basisUntil") is None)
    # Older fixed-period publications did not include a window-type discriminator.
    return (scope.get("basisWindowType", "fixed") == "fixed"
            and start is not None and end is not None
            and scope.get("basisFrom") == start.isoformat()
            and scope.get("basisUntil") == end.isoformat()
            and scope.get("rollingWindowSize") is None and scope.get("rollingWindowUnit") is None)
