"""Gateway settings."""

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    api_base_url: str = Field(default="http://localhost:8000", alias="API_BASE_URL")
    gateway_ingest_token: str = Field(default="change-me", alias="GATEWAY_INGEST_TOKEN")
    tag_map_path: str = Field(
        default="../../packages/sample-data/demo-microgrid/tag_map.json",
        alias="TAG_MAP_PATH",
    )
    gateway_id: str = Field(default="gw-rs485-1", alias="GATEWAY_ID")
    poll_enabled: bool = Field(default=True, alias="POLL_ENABLED")
    plc_bridge_enabled: bool = Field(default=False, alias="PLC_BRIDGE_ENABLED")
    plc_slave_id: int = Field(default=1, alias="PLC_SLAVE_ID")
    health_port: int = Field(default=8081, alias="HEALTH_PORT")


@lru_cache
def get_settings() -> Settings:
    return Settings()


def resolve_tag_map_path(settings: Settings) -> Path:
    path = Path(settings.tag_map_path)
    if path.is_absolute():
        return path
    return Path(__file__).resolve().parents[3] / settings.tag_map_path