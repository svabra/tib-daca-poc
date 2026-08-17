from __future__ import annotations

import re
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_POSTGRES_SCHEMA = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "daca-sample-data-product"
    root_path: str = ""
    sample_database_url: str | None = None
    policy_projector_database_url: str | None = None
    pg_host: str = "localhost"
    pg_port: int = 5432
    pg_oltp_database: str = "daca_sample"
    pg_user: str = "daca_sample_api"
    pg_password: str = "daca_sample_api_dev"
    daca_sample_schema: str = "public"
    daca_shared_postgres: bool = False
    opa_decision_url: str = "http://localhost:8181/v1/data/daca/authz/decision"
    daca_policy_deployment_token: str = "change-me-in-production"
    daca_demo_auth: bool = False
    catalog_deployment_ack_url: str | None = None
    catalog_internal_token: str = "local-development-only"
    deployment_ack_timeout_seconds: float = 2.0
    seed_policy_revision_id: str = "51111111-1111-4111-8111-111111111111"
    product_id: str = "11111111-1111-4111-8111-111111111111"
    product_slug: str = "estv-tax-statistics"
    product_owner: str = "ESTV"
    product_classification: str = "restricted"

    @field_validator("daca_sample_schema")
    @classmethod
    def validate_sample_schema(cls, value: str) -> str:
        schema = value.strip()
        if not _POSTGRES_SCHEMA.fullmatch(schema):
            raise ValueError(
                "DACA_SAMPLE_SCHEMA must be a lowercase PostgreSQL identifier"
            )
        return schema

    def _shared_postgres_url(self) -> str:
        return URL.create(
            "postgresql+psycopg",
            username=self.pg_user,
            password=self.pg_password,
            host=self.pg_host,
            port=self.pg_port,
            database=self.pg_oltp_database,
        ).render_as_string(hide_password=False)

    @property
    def resolved_sample_database_url(self) -> str:
        if self.sample_database_url and self.sample_database_url.strip():
            return self.sample_database_url.strip()
        return self._shared_postgres_url()

    @property
    def resolved_policy_projector_database_url(self) -> str:
        if self.policy_projector_database_url and self.policy_projector_database_url.strip():
            return self.policy_projector_database_url.strip()
        if self.daca_shared_postgres:
            return self._shared_postgres_url()
        return (
            "postgresql+psycopg://daca_policy_projector:daca_projector_dev@"
            "localhost:5432/daca_sample"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
