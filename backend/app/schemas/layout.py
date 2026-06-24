"""Plant layout schema (Domain A/L) — spatial positions only, separate from topology."""
from __future__ import annotations

from pydantic import BaseModel


class LayoutEntry(BaseModel):
    instance_id: str
    position: tuple[float, float, float]
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0)


class PlantLayout(BaseModel):
    entries: list[LayoutEntry]
