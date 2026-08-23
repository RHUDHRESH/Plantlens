"""Mirror of packages/contracts/fault_matrix.schema.json."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ExpectedDirection = Literal["HIGH", "LOW", "RISING", "FALLING", "TRUE", "FALSE"]


class FaultSymptom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tag_id: str
    expected_direction: ExpectedDirection
    weight: float = Field(ge=0.0, le=1.0)
    required: bool = False


class FaultDef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    asset_id: str
    symptoms: list[FaultSymptom]
    description: str | None = None
    situation_type: str | None = None
    safe_action_id: str | None = None


class FaultMatrix(BaseModel):
    """Authored symptom evidence matrix (overlay; DAG remains root-cause authority)."""

    model_config = ConfigDict(extra="forbid")

    version: str
    matrix_id: str
    faults: list[FaultDef]


class FaultMatrixScore(BaseModel):
    """Scored fault candidate from the deterministic fault-matrix engine."""

    model_config = ConfigDict(extra="forbid")

    fault_id: str
    fault_name: str
    asset_id: str
    confidence: float = Field(ge=0.0, le=1.0)
    coverage: float = Field(ge=0.0, le=1.0)
    contradicted: bool = False
    situation_type: str | None = None
    safe_action_id: str | None = None
    supporting_symptoms: list[str] = Field(default_factory=list)
    contradicting_symptoms: list[str] = Field(default_factory=list)
    missing_symptoms: list[str] = Field(default_factory=list)
