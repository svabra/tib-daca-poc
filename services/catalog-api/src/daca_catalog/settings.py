import re
from functools import lru_cache

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_POSTGRES_SCHEMA = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
    )

    app_name: str = "BIT DaCa Catalog API"
    environment: str = "local"
    root_path: str = ""
    daca_demo_auth: bool = False
    daca_open_metadata_publication: bool = False
    database_url: str | None = None
    pg_host: str = "localhost"
    pg_port: int = 55432
    pg_oltp_database: str = "daca_catalog"
    pg_user: str = "daca_catalog"
    pg_password: str = "daca_catalog_dev"
    daca_catalog_schema: str = "public"
    seed_on_startup: bool = False
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:8080"])
    sample_policy_projection_url: str | None = None
    sample_policy_projection_token: str | None = Field(
        default=None,
        validation_alias=AliasChoices("SAMPLE_POLICY_PROJECTION_TOKEN", "DACA_POLICY_DEPLOYMENT_TOKEN"),
    )
    projection_timeout_seconds: float = 3.0
    internal_token: str = "local-development-only"

    @field_validator("daca_catalog_schema")
    @classmethod
    def validate_catalog_schema(cls, value: str) -> str:
        schema = value.strip()
        if not _POSTGRES_SCHEMA.fullmatch(schema):
            raise ValueError(
                "DACA_CATALOG_SCHEMA must be a lowercase PostgreSQL identifier"
            )
        return schema

    @property
    def resolved_database_url(self) -> str:
        if self.database_url and self.database_url.strip():
            return self.database_url.strip()
        return URL.create(
            "postgresql+psycopg",
            username=self.pg_user,
            password=self.pg_password,
            host=self.pg_host,
            port=self.pg_port,
            database=self.pg_oltp_database,
        ).render_as_string(hide_password=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
