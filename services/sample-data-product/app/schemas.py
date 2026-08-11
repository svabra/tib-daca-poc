from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=lambda value: _camel(value))


def _camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class Entitlement(CamelModel):
    subject_id: str = Field(min_length=1, max_length=200)
    action: Literal["data.read"]
    protocol: Literal["http-rest", "postgresql"]


class PolicyProjection(CamelModel):
    revision: int = Field(ge=1)
    entitlements: list[Entitlement]

