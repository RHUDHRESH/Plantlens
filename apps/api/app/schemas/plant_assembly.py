"""Pydantic mirrors for plant assembly contracts."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class Coords2D(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float


class Coords3D(BaseModel):
    model_config = ConfigDict(extra="forbid")
    x: float
    y: float
    z: float


class AssetInstance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str
    component_type_id: str
    display_name: str
    position_2d: Coords2D
    position_3d: Coords3D | None = None
    configured_ports: list[str] = Field(default_factory=list)
    configured_signals: list[str] = Field(default_factory=list)
    overrides: dict[str, Any] = Field(default_factory=dict)
    enabled_fault_modes: list[str] = Field(default_factory=list)


ConnectionKind = Literal["power", "signal", "mechanical", "airflow", "fluid", "mounting", "data"]


class PlantConnection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    connection_id: str
    from_asset_id: str
    from_port_id: str
    to_asset_id: str
    to_port_id: str
    connection_kind: ConnectionKind
    approved: bool
    lag_min_ms: int = 0
    lag_max_ms: int = 0
    notes: str = ""


class PlantAssembly(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assembly_id: str
    plant_id: str
    version: str
    assets: list[AssetInstance] = Field(default_factory=list)
    connections: list[PlantConnection] = Field(default_factory=list)
    global_tags: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CheckConnectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_component_type_id: str
    from_port_id: str
    to_component_type_id: str
    to_port_id: str


class ValidateAssemblyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plant_assembly: PlantAssembly
    component_library: dict[str, Any] | None = None


class AnalyzeAssemblyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plant_assembly: PlantAssembly
    component_library: dict[str, Any] | None = None


class ScoreFaultsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plant_assembly: PlantAssembly
    observed_signals: dict[str, Any] = Field(default_factory=dict)
    data_quality: dict[str, Any] = Field(default_factory=dict)
    component_library: dict[str, Any] | None = None