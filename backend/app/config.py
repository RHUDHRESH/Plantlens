"""Application configuration — paths and runtime switches."""
from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings

ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = ROOT / "models"
GEOMETRY_DIR = ROOT / "geometry"


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8000
    models_dir: Path = MODELS_DIR
    geometry_dir: Path = GEOMETRY_DIR
    source: str = "sim"  # "sim" | "modbus" | "opcua"
    scenario: str | None = "bearing_cascade"
    tick_hz: float = 1.0
    enable_ws: bool = True
    degraded_mode: bool = False

    class Config:
        env_prefix = "PLANTLENS_"


settings = Settings()
