"""Pydantic mirrors for component library contracts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class NominalRange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    min: float | None = None
    max: float | None = None


class Port(BaseModel):
    model_config = ConfigDict(extra="forbid")

    port_id: str
    name: str
    direction: Literal["input", "output", "bidirectional"]
    medium: str
    quantity_kind: str
    nominal_range: NominalRange | None = None
    compatibility_tags: list[str] = Field(default_factory=list)
    required: bool = True


class SignalTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal_template_id: str
    name: str
    quantity_kind: str
    unit: str
    expected_min: float
    expected_max: float
    sampling_hint_ms: int
    quality_required: str
    source_port_id: str
    evidence_weight_default: float
    alarm_thresholds: dict[str, float] = Field(default_factory=dict)


class FaultEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signal_template_id: str
    relation: str
    weight: float
    required: bool


class FaultMode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fault_mode_id: str
    title: str
    description: str
    severity: Literal["info", "warning", "critical"]
    root_asset_applicability: str
    required_evidence: list[FaultEvidence] = Field(default_factory=list)
    optional_evidence: list[FaultEvidence] = Field(default_factory=list)
    downstream_effects: list[str] = Field(default_factory=list)
    rejected_alternatives: list[str] = Field(default_factory=list)
    operator_actions: list[str]
    safety_level: str


class VisualAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    icon_kind: Literal["inline_svg", "render_hint"]
    icon_svg: str | None = None
    node_shape: str
    low_poly_shape: str
    accent_role: str
    port_layout: dict[str, list[str]]
    size_hint: dict[str, int]
    preview_label: str
    render_tokens: dict[str, str]


class ComponentTemplate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    component_type_id: str
    display_name: str
    category: Literal["power_electrical", "actuation_mechanical", "process_physical", "sensors"]
    description: str
    version: str
    manufacturer_neutral: Literal[True]
    physical_domain: str
    ports: list[Port]
    signal_templates: list[SignalTemplate] = Field(default_factory=list)
    fault_modes: list[FaultMode] = Field(default_factory=list)
    recommended_sensors: list[str] = Field(default_factory=list)
    hmi_render_hint: dict[str, Any] = Field(default_factory=dict)
    visual_asset: VisualAsset
    safety_notes: list[str] = Field(default_factory=list)
    limits: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)


class ComponentLibrary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    library_id: str
    version: str
    description: str | None = None
    components: list[ComponentTemplate]