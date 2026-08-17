from __future__ import annotations

import os
import re

_POSTGRES_SCHEMA = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def sample_schema() -> str:
    schema = os.getenv("DACA_SAMPLE_SCHEMA", "public").strip()
    if not _POSTGRES_SCHEMA.fullmatch(schema):
        raise RuntimeError(
            "DACA_SAMPLE_SCHEMA must be a lowercase PostgreSQL identifier"
        )
    return schema


def shared_postgres_enabled() -> bool:
    return os.getenv("DACA_SHARED_POSTGRES", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def function_search_path() -> str:
    schema = sample_schema()
    if schema == "public":
        return "public, pg_temp"
    return f'"{schema}", public, pg_temp'


def proxy_session_condition() -> str:
    if shared_postgres_enabled():
        return "NULLIF(current_setting('daca.subject_id', true), '') IS NOT NULL"
    return "session_user = 'daca_sample_api'"
