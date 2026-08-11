from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "didaca-sample-data-product"
    sample_database_url: str = (
        "postgresql+psycopg://didaca_sample_api:didaca_sample_api_dev@localhost:5432/didaca_sample"
    )
    policy_projector_database_url: str = (
        "postgresql+psycopg://didaca_policy_projector:didaca_projector_dev@localhost:5432/"
        "didaca_sample"
    )
    opa_decision_url: str = "http://localhost:8181/v1/data/didaca/authz/decision"
    didaca_policy_deployment_token: str = "change-me-in-production"
    didaca_demo_auth: bool = False
    catalog_deployment_ack_url: str | None = None
    catalog_internal_token: str = "local-development-only"
    deployment_ack_timeout_seconds: float = 2.0
    seed_policy_revision_id: str = "51111111-1111-4111-8111-111111111111"
    product_id: str = "11111111-1111-4111-8111-111111111111"
    product_slug: str = "estv-tax-statistics"
    product_owner: str = "ESTV"
    product_classification: str = "restricted"


@lru_cache
def get_settings() -> Settings:
    return Settings()
