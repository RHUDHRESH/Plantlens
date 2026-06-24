"""Keystone schema: parameterized asset types (MATLAB/Simscape-style blocks).

An AssetType is a parameterized "block" (full typed datasheet of parameters);
an AssetInstance fills in overrides. Parameters auto-derive signal definitions,
thresholds (warning_high = rated_current * service_factor), fault-mode symptom
expectations, and bind to a reusable schematic GLB via geometry_ref.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


class ParamKind(StrEnum):
    scalar = "scalar"
    enum = "enum"
    text = "text"


class ParameterSpec(BaseModel):
    """One datasheet parameter — a Simscape {value, 'unit'} pair analogue."""
    key: str
    label: str
    unit: str | None = None
    kind: ParamKind = ParamKind.scalar
    default: float | str | None = None
    min: float | None = None
    max: float | None = None
    choices: list[str] | None = None
    required: bool = True


class Derivation(BaseModel):
    """Auto-derive a threshold from parameters. expr is a safe AST, never eval()."""
    target: str  # "current.warning_high"
    expr: str  # "rated_current * service_factor"


class ExpectedSymptom(BaseModel):
    """A symptom a fault mode is expected to produce (Domain E)."""
    signal: str
    direction: Literal["high", "low", "rising", "falling", "spectral_peak"]
    band: str | None = None  # "1x_rpm", "2x_line_freq"
    weight: float = 1.0  # w_i in Confidence(F)
    kappa: float = 1.0  # credibility multiplier
    required: bool = True


class FaultMode(BaseModel):
    id: str
    label: str
    symptoms: list[ExpectedSymptom]
    contradictions: list[str] = []  # signal keys that veto this fault


class SignalDef(BaseModel):
    """Signal template an asset type emits (scalar or composite)."""
    key: str
    kind: Literal["scalar", "composite"]
    dtype: str = "float32"
    unit: str | None = None
    sample_rate_hz: float | None = None
    channels: list[str] | None = None  # composite: ["a","b","c"] or spectrum bins


class AssetType(BaseModel):
    """The library 'block' — a parameterized equipment class."""
    type_id: str  # "induction_motor_3ph"
    class_: str = Field(alias="class")  # "motor"
    label: str
    parameters: list[ParameterSpec]
    signals: list[SignalDef]
    derivations: list[Derivation] = []
    fault_modes: list[FaultMode] = []
    geometry_ref: str  # key into GeometryRegistry -> GLB or procedural id

    model_config = {"populate_by_name": True}


class AssetInstance(BaseModel):
    """A filled-in, positioned instance of an AssetType (Domain A)."""
    instance_id: str  # "M-101"
    type_id: str
    overrides: dict[str, float | str] = {}
    position: tuple[float, float, float]
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0)
    address_map_ref: str | None = None  # binds to comms
    parent: str | None = None  # system instance id
    criticality: Literal["low", "medium", "high", "safety"] = "medium"


def resolve_instance(inst: AssetInstance, atype: AssetType) -> dict[str, float | str]:
    """Resolve instance = type defaults <- overrides, validate against min/max.

    Raises ValueError if an override violates ParameterSpec constraints.
    """
    resolved: dict[str, float | str] = {}
    for spec in atype.parameters:
        if spec.key in inst.overrides:
            val = inst.overrides[spec.key]
            if spec.kind == ParamKind.scalar and isinstance(val, (int, float)):
                if spec.min is not None and val < spec.min:
                    raise ValueError(f"{inst.instance_id}.{spec.key} < min {spec.min}")
                if spec.max is not None and val > spec.max:
                    raise ValueError(f"{inst.instance_id}.{spec.key} > max {spec.max}")
            resolved[spec.key] = val
        elif spec.default is not None:
            resolved[spec.key] = spec.default
        elif spec.required:
            raise ValueError(f"{inst.instance_id} missing required {spec.key}")
    return resolved
