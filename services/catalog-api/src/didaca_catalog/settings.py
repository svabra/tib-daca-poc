from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
    )

    app_name: str = "BIT DiDaCa Catalog API"
    environment: str = "local"
    didaca_demo_auth: bool = False
    didaca_open_metadata_publication: bool = False
    database_url: str = "sqlite+pysqlite:///./didaca-catalog.db"
    seed_on_startup: bool = False
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:8080"])
    sample_policy_projection_url: str | None = None
    sample_policy_projection_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SAMPLE_POLICY_PROJECTION_TOKEN", "DIDACA_POLICY_DEPLOYMENT_TOKEN"),
    )
    projection_timeout_seconds: float = 3.0
    internal_token: str = "local-development-only"


@lru_cache
def get_settings() -> Settings:
    return Settings()
