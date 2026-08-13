from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=lambda value: _camel(value))


def _camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class Entitlement(CamelModel):
    subject_id: str = Field(min_length=1, max_length=200)
    subject_type: Literal["person", "machine"] = "person"
    action: Literal["data.read"]
    protocol: Literal["http-rest", "postgresql"]
    valid_from: dt.date = dt.date.min
    valid_until: dt.date = dt.date.max
    data_variant: Literal["original", "modified"] = "original"


class PolicyProjection(CamelModel):
    revision: int = Field(ge=1)
    entitlements: list[Entitlement]
