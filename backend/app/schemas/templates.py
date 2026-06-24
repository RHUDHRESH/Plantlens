"""HMI screen templates (Domain K) — screens compiled from model files."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class WidgetSpec(BaseModel):
    kind: Literal["calm_card", "status_strip", "map3d", "map2d", "action_envelope",
                  "evidence_list", "role_view", "feed"]
    binds_to: str  # signal/situation/asset key


class ScreenTemplate(BaseModel):
    id: str
    zoom_level: Literal["macro", "meso", "micro"]
    widgets: list[WidgetSpec]


class TemplateLibrary(BaseModel):
    templates: list[ScreenTemplate]
