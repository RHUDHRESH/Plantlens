"""Deterministic bench payload adapter for the PlantLens demo HMI projection layer."""

from datetime import datetime
from enum import StrEnum
from typing import Any, Self

from pydantic import AwareDatetime, Field, field_validator, model_validator

from app.hmi.contracts import HMIBaseModel


class BenchSignalQuality(StrEnum):
    GOOD = "GOOD"
    STALE = "STALE"
    MISSING = "MISSING"
    BAD = "BAD"


class BenchAsset(HMIBaseModel):
    asset_id: str
    name: str
    kind: str


class BenchSignal(HMIBaseModel):
    signal_id: str
    asset_id: str
    name: str
    value: float | int | bool | str | None
    unit: str
    expected_min: float | None = None
    expected_max: float | None = None
    quality: BenchSignalQuality = BenchSignalQuality.GOOD
    timestamp: AwareDatetime | None = None

    @field_validator("timestamp", mode="before")
    @classmethod
    def parse_timestamp(cls, value: Any) -> AwareDatetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            if value.tzinfo is None:
                raise ValueError("timestamp must be timezone-aware")
            return value
        if isinstance(value, str):
            normalized = value.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                raise ValueError("timestamp must be timezone-aware")
            return parsed
        raise ValueError("timestamp must be a string or datetime")

    @model_validator(mode="after")
    def validate_expected_range(self) -> Self:
        if (
            self.expected_min is not None
            and self.expected_max is not None
            and self.expected_min > self.expected_max
        ):
            raise ValueError("expected_min must be less than or equal to expected_max")
        return self


class BenchCausalityEdge(HMIBaseModel):
    edge_id: str
    from_asset_id: str
    to_asset_id: str
    relation: str = "causes"


class BenchPayload(HMIBaseModel):
    plant_id: str
    run_id: str
    assets: list[BenchAsset]
    signals: list[BenchSignal]
    causality_edges: list[BenchCausalityEdge] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_cross_references(self) -> Self:
        asset_ids = [asset.asset_id for asset in self.assets]
        _raise_on_duplicates(asset_ids, "asset_id")

        signal_ids = [signal.signal_id for signal in self.signals]
        _raise_on_duplicates(signal_ids, "signal_id")

        asset_id_set = set(asset_ids)
        for signal in self.signals:
            if signal.asset_id not in asset_id_set:
                raise ValueError(
                    f"signal '{signal.signal_id}' references unknown asset '{signal.asset_id}'"
                )

        for edge in self.causality_edges:
            if edge.from_asset_id not in asset_id_set:
                raise ValueError(
                    f"edge '{edge.edge_id}' references unknown asset '{edge.from_asset_id}'"
                )
            if edge.to_asset_id not in asset_id_set:
                raise ValueError(
                    f"edge '{edge.edge_id}' references unknown asset '{edge.to_asset_id}'"
                )

        return self


def _raise_on_duplicates(ids: list[str], field_name: str) -> None:
    seen: set[str] = set()
    for item_id in ids:
        if item_id in seen:
            raise ValueError(f"duplicate {field_name}: '{item_id}'")
        seen.add(item_id)


def load_bench_payload(payload: dict) -> BenchPayload:
    """Validate and load a canonical bench payload without mutating the input."""
    return BenchPayload.model_validate(payload)