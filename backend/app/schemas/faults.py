"""Fault library schema (Domain E).

Symptom weights, contradiction vetos and derivation of Confidence(F) live in
pipeline/fault_scoring.py; this file only validates the authored truth.
"""
from __future__ import annotations

from pydantic import BaseModel

from .asset_types import ExpectedSymptom


class FaultSpec(BaseModel):
    id: str
    label: str
    asset_type_id: str  # which AssetType this fault mode applies to
    symptoms: list[ExpectedSymptom]
    contradictions: list[str] = []
    safe_state_action: str | None = None


class FaultLibrary(BaseModel):
    faults: list[FaultSpec]
