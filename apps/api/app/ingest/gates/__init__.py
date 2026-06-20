"""Offline ingestion validation gates."""

from app.ingest.gates.gate1_artifact_integrity import run_gate1_artifact_integrity
from app.ingest.gates.gate2_canonical_schema import run_gate2_canonical_schema
from app.ingest.gates.gate3_industrial_truth import run_gate3_industrial_truth

__all__ = [
    "run_gate1_artifact_integrity",
    "run_gate2_canonical_schema",
    "run_gate3_industrial_truth",
]