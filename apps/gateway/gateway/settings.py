"""Gateway settings (pydantic-settings).

Flat legacy variables keep working (``GATEWAY_SERIAL_PORT``, ``GATEWAY_SERIAL_MODE``,
``GATEWAY_SERIAL_BAUDRATE``, ``LINE_DEFAULT_TAG_ID`` ...). Structured settings use a ``__``
delimiter, e.g. ``GATEWAY_LINK__RESET_POLICY=wait_for_reset`` or ``GATEWAY_MODBUS__TIMEOUT_MS=300``.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from gateway.tag_frame import TagSource


class LinkSettings(BaseModel):
    """How to find and open the serial port (line mode and Modbus RTU)."""

    selector: str | None = Field(
        default=None,
        description="auto | VID:PID[:SERIAL] | sn:SERIAL | /dev/serial/by-id/... | /dev/ttyACM0 | COM5",
    )
    baudrate: int | None = None
    bytesize: int = 8
    parity: Literal["N", "E", "O"] | None = None
    stopbits: float | None = None
    reset_policy: Literal["hold_dtr_low", "wait_for_reset"] | None = None
    reset_settle_ms: int = Field(default=2000, ge=0, le=10000)
    ready_banner: str | None = r"^#PLANTLENS READY"
    ready_timeout_ms: int = Field(default=0, ge=0, le=30000)
    backoff_min_ms: int = Field(default=250, ge=10)
    backoff_max_ms: int = Field(default=5000, ge=100)
    exclusive: bool = True
    local_echo: bool = False


class LineSettings(BaseModel):
    protocol: Literal["auto", "pl1", "csv", "kv", "json"] = "auto"
    max_line_bytes: int = Field(default=512, ge=16, le=65536)
    csv_header: str | None = Field(default=None, description="Fixed header if the device never sends one")
    column_map: dict[str, str] = Field(
        default_factory=dict, description='JSON object: column/key -> tag_id, e.g. {"A0":"VIB_X"}'
    )
    source: TagSource = "serial_line"
    stale_after_ms: int | None = Field(default=None, ge=50, description="Override tag-map stale_after_ms")


class ModbusSettings(BaseModel):
    timeout_ms: int = Field(default=250, ge=20, le=10000)
    retries: int = Field(default=1, ge=0, le=5)
    inter_request_ms: float | None = Field(default=None, ge=0, description="None -> RTU t3.5 only")
    max_gap: int = Field(default=8, ge=0, le=124)
    max_registers: int = Field(default=125, ge=1, le=125)
    max_bits: int = Field(default=2000, ge=1, le=2000)
    backoff_min_ms: int = Field(default=250, ge=10)
    backoff_max_ms: int = Field(default=5000, ge=100)


class UplinkSettings(BaseModel):
    batch_max: int = Field(default=200, ge=1, le=5000)
    flush_ms: int = Field(default=250, ge=10)
    queue_max: int = Field(default=5000, ge=10)
    timeout_s: float = Field(default=5.0, gt=0)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        env_nested_delimiter="__",
        populate_by_name=True,
    )

    api_base_url: str = Field(default="http://localhost:8000", alias="API_BASE_URL")
    gateway_ingest_token: str = Field(default="change-me", alias="GATEWAY_INGEST_TOKEN")
    tag_map_path: str = Field(
        default="../../packages/sample-data/demo-microgrid/tag_map.json",
        alias="TAG_MAP_PATH",
    )
    gateway_id: str = Field(default="gw-rs485-1", alias="GATEWAY_ID")
    serial_port_override: str | None = Field(default=None, alias="GATEWAY_SERIAL_PORT")
    serial_mode: Literal["modbus", "modbus_rtu", "modbus_tcp", "line"] = Field(
        default="modbus", alias="GATEWAY_SERIAL_MODE"
    )
    serial_baudrate: int | None = Field(default=None, alias="GATEWAY_SERIAL_BAUDRATE")
    line_default_tag_id: str | None = Field(default="MOTOR_301_CURRENT", alias="LINE_DEFAULT_TAG_ID")
    poll_enabled: bool = Field(default=True, alias="POLL_ENABLED")
    plc_bridge_enabled: bool = Field(default=False, alias="PLC_BRIDGE_ENABLED")
    plc_slave_id: int = Field(default=1, alias="PLC_SLAVE_ID")
    health_port: int = Field(default=9101, alias="HEALTH_PORT")

    link: LinkSettings = Field(default_factory=LinkSettings, alias="GATEWAY_LINK")
    line: LineSettings = Field(default_factory=LineSettings, alias="GATEWAY_LINE")
    modbus: ModbusSettings = Field(default_factory=ModbusSettings, alias="GATEWAY_MODBUS")
    uplink: UplinkSettings = Field(default_factory=UplinkSettings, alias="GATEWAY_UPLINK")

    def link_selector(self, fallback: str | None = None) -> str | None:
        return self.serial_port_override or self.link.selector or fallback


@lru_cache
def get_settings() -> Settings:
    return Settings()


def resolve_tag_map_path(settings: Settings) -> Path:
    path = Path(settings.tag_map_path)
    if path.is_absolute():
        return path
    here = Path(__file__).resolve()
    roots = [Path.cwd()]
    # repo layout: <root>/apps/gateway/gateway/settings.py ; container: /app/gateway/settings.py
    for depth in (3, 1):
        if len(here.parents) > depth:
            roots.append(here.parents[depth])
    candidates = [root / path for root in roots]
    if len(here.parents) > 3:
        candidates.append(here.parents[3] / "apps" / "gateway" / path)
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]
