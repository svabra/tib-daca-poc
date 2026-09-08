import re
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

_POSTGRES_SCHEMA = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")
_S3_BUCKET = re.compile(r"^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$")


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
    semantic_suggestion_threshold: float = Field(
        default=70.0,
        ge=0,
        le=100,
        validation_alias=AliasChoices(
            "DACA_SEMANTIC_SUGGESTION_THRESHOLD",
            "SEMANTIC_SUGGESTION_THRESHOLD",
        ),
    )
    internal_token: str = "local-development-only"
    daaif_ui_url: str | None = None
    daca_physical_metadata_adapter: Literal["fixture", "postgresql", "s3", "all"] = "fixture"
    daca_physical_postgres_dsn: SecretStr | None = None
    daca_physical_s3_endpoint_url: str | None = None
    daca_physical_s3_bucket: str | None = None
    daca_physical_s3_prefix: str = ""
    daca_physical_s3_region: str = "us-east-1"
    daca_physical_s3_access_key_id: SecretStr | None = None
    daca_physical_s3_secret_access_key: SecretStr | None = None
    daca_physical_s3_max_objects: int = Field(default=500, ge=1, le=10_000)
    daca_deepl_api_key: SecretStr | None = None
    daca_deepl_api_url: str = "https://api-free.deepl.com/v2/translate"
    daca_termdat_api_url: str = "https://api.termdat.bk.admin.ch/v2"

    @field_validator("daca_catalog_schema")
    @classmethod
    def validate_catalog_schema(cls, value: str) -> str:
        schema = value.strip()
        if not _POSTGRES_SCHEMA.fullmatch(schema):
            raise ValueError(
                "DACA_CATALOG_SCHEMA must be a lowercase PostgreSQL identifier"
            )
        return schema

    @field_validator("daaif_ui_url")
    @classmethod
    def validate_daaif_ui_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().rstrip("/")
        parsed = urlsplit(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("DAAIF_UI_URL must be an absolute HTTP(S) URL")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("DAAIF_UI_URL must not contain credentials")
        if parsed.query or parsed.fragment:
            raise ValueError("DAAIF_UI_URL must not contain a query or fragment")
        return normalized

    @field_validator("daca_physical_postgres_dsn")
    @classmethod
    def validate_physical_postgres_dsn(cls, value: SecretStr | str | None) -> SecretStr | None:
        if value is None:
            return None
        normalized = value.get_secret_value().strip() if isinstance(value, SecretStr) else value.strip()
        if not normalized:
            return None
        parsed = urlsplit(normalized)
        if parsed.scheme not in {"postgresql", "postgresql+psycopg", "postgresql+psycopg2"} or not parsed.hostname:
            raise ValueError("DACA_PHYSICAL_POSTGRES_DSN must be a PostgreSQL DSN")
        return SecretStr(normalized)

    @field_validator("daca_physical_s3_endpoint_url")
    @classmethod
    def validate_physical_s3_endpoint(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip().rstrip("/")
        parsed = urlsplit(normalized)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("DACA_PHYSICAL_S3_ENDPOINT_URL must be an absolute HTTP(S) URL")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("DACA_PHYSICAL_S3_ENDPOINT_URL must not contain credentials")
        if parsed.query or parsed.fragment:
            raise ValueError("DACA_PHYSICAL_S3_ENDPOINT_URL must not contain a query or fragment")
        return normalized

    @field_validator("daca_physical_s3_bucket")
    @classmethod
    def validate_physical_s3_bucket(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        normalized = value.strip()
        if not _S3_BUCKET.fullmatch(normalized):
            raise ValueError("DACA_PHYSICAL_S3_BUCKET must be a valid S3 bucket name")
        return normalized

    @field_validator("daca_physical_s3_prefix")
    @classmethod
    def validate_physical_s3_prefix(cls, value: str) -> str:
        normalized = value.strip().strip("/")
        if ".." in normalized.split("/"):
            raise ValueError("DACA_PHYSICAL_S3_PREFIX must not contain parent traversal")
        return normalized

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
