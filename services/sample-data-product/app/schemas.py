from __future__ import annotations

import datetime as dt
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, model_validator


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
    weekly_availability: WeeklyAvailability | None = None


class WeeklyAvailability(CamelModel):
    weekdays: list[
        Literal["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    ] = Field(min_length=1, max_length=7)
    start_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    end_time: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    time_zone: str = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def valid_window(self) -> WeeklyAvailability:
        if len(set(self.weekdays)) != len(self.weekdays):
            raise ValueError("weekdays must not contain duplicates")
        if self.end_time <= self.start_time:
            raise ValueError("overnight availability windows are not supported")
        try:
            ZoneInfo(self.time_zone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("timeZone must be a valid IANA time zone") from exc
        return self


class PolicyProjection(CamelModel):
    revision: int = Field(ge=1)
    entitlements: list[Entitlement]
