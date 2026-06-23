"""Typed application settings (pydantic-settings)."""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-backed configuration for the API shell."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    plantlens_env: str = Field(default="dev", validation_alias=AliasChoices("PLANTLENS_ENV"))
    log_level: str = Field(default="info", validation_alias=AliasChoices("PLANTLENS_LOG_LEVEL"))
    database_url: str = Field(
        default="sqlite+aiosqlite:///./plantlens.db",
        validation_alias=AliasChoices("DATABASE_URL"),
    )
    active_plant_id: str = Field(
        default="demo_microgrid_001",
        validation_alias=AliasChoices("ACTIVE_PLANT_ID"),
    )
    sample_data_dir: str = Field(
        default="../../packages/sample-data/demo-microgrid",
        validation_alias=AliasChoices("SAMPLE_DATA_DIR"),
    )
    component_library_dir: str = Field(
        default="packages/sample-data/component-library",
        validation_alias=AliasChoices("COMPONENT_LIBRARY_DIR"),
    )
    compiled_dir: str = Field(
        default="./compiled",
        validation_alias=AliasChoices("COMPILED_DIR"),
    )
    offline_ingest_data_dir: str = Field(
        default="./offline-ingest-data",
        validation_alias=AliasChoices("OFFLINE_INGEST_DATA_DIR"),
    )
    oidc_issuer: str = Field(default="", validation_alias=AliasChoices("OIDC_ISSUER"))
    oidc_audience: str = Field(default="", validation_alias=AliasChoices("OIDC_AUDIENCE"))
    oidc_jwks_url: str = Field(default="", validation_alias=AliasChoices("OIDC_JWKS_URL"))
    dev_jwt_secret: str = Field(
        default="",
        validation_alias=AliasChoices("PLANTLENS_DEV_JWT_SECRET"),
    )
    gateway_ingest_token: str = Field(
        default="change-me",
        validation_alias=AliasChoices("GATEWAY_INGEST_TOKEN"),
    )
    gateway_health_url: str = Field(
        default="http://127.0.0.1:9101/health",
        validation_alias=AliasChoices("GATEWAY_HEALTH_URL"),
    )
    agents_base_url: str = Field(
        default="http://localhost:8100",
        validation_alias=AliasChoices("AGENTS_BASE_URL"),
    )
    otel_exporter_otlp_endpoint: str = Field(
        default="",
        validation_alias=AliasChoices("OTEL_EXPORTER_OTLP_ENDPOINT"),
    )
    web_origin: str = Field(
        default="http://localhost:5173",
        validation_alias=AliasChoices("WEB_ORIGIN", "PLANTLENS_WEB_ORIGIN"),
    )


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton for injection and app factory."""
    return Settings()
