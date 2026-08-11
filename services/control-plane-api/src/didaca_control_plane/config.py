from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="DIDACA_CONTROL_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    service_name: str = "BIT DiDaCa Control Plane"
    environment: str = "development"
    database_url: str = (
        "postgresql+psycopg://didaca_control:change-me@postgres:5432/didaca_control_plane"
    )
    health_poll_interval_seconds: float = Field(default=30.0, ge=0)
    health_request_timeout_seconds: float = Field(default=3.0, gt=0, le=30)
    policy_sync_enabled: bool = False
    seed_on_startup: bool = False
    demo_auth: bool = False
    endpoint_host_allowlist: str = "catalog-api"
    cors_origins: str = "http://localhost:8081"

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_endpoint_hosts(self) -> tuple[str, ...]:
        return tuple(
            host.strip().lower().rstrip(".")
            for host in self.endpoint_host_allowlist.split(",")
            if host.strip()
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
