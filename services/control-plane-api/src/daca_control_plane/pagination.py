from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any

from sqlalchemy import Select, and_, or_

from .problems import ApiProblem


def encode_cursor(timestamp: datetime, identifier: str) -> str:
    payload = json.dumps(
        {"timestamp": timestamp.isoformat(), "id": identifier}, separators=(",", ":")
    ).encode()
    return base64.urlsafe_b64encode(payload).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        return datetime.fromisoformat(payload["timestamp"]), str(payload["id"])
    except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
        raise ApiProblem(
            400,
            "Invalid cursor",
            "The pagination cursor is malformed or no longer usable.",
            problem_type="urn:daca:problem:invalid-cursor",
        ) from exc


def page_query(
    statement: Select[Any],
    *,
    timestamp_column: Any,
    id_column: Any,
    cursor: str | None,
    limit: int,
) -> Select[Any]:
    if cursor:
        timestamp, identifier = decode_cursor(cursor)
        statement = statement.where(
            or_(
                timestamp_column > timestamp,
                and_(timestamp_column == timestamp, id_column > identifier),
            )
        )
    return statement.order_by(timestamp_column, id_column).limit(limit + 1)


def make_page(
    rows: list[Any], limit: int, timestamp_attribute: str
) -> tuple[list[Any], str | None]:
    has_more = len(rows) > limit
    items = rows[:limit]
    if not has_more or not items:
        return items, None
    last = items[-1]
    return items, encode_cursor(getattr(last, timestamp_attribute), last.id)
