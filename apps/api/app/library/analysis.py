"""Orchestrate assembly engineering analysis matrices."""

from __future__ import annotations

from typing import Any

from app.library.assembly import validate_plant_assembly
from app.library.matrices import (
    build_causal_propagation_matrix,
    build_fault_signature_matrix,
    build_observability_matrix,
)
from app.library.scoring import rank_fault_candidates
from app.library.sensor_recommendation import recommend_sensors


def analyze_plant_assembly(
    plant_assembly: dict[str, Any],
    component_library: dict[str, Any],
) -> dict[str, Any]:
    validation = validate_plant_assembly(plant_assembly, component_library)
    errors = list(validation.get("errors") or [])
    warnings = list(validation.get("warnings") or [])

    fault_signature_matrix = build_fault_signature_matrix(component_library, plant_assembly)
    warnings.extend(fault_signature_matrix.get("warnings") or [])

    observability_matrix = build_observability_matrix(
        component_library,
        plant_assembly,
        fault_signature_matrix,
    )
    causal_propagation_matrix = build_causal_propagation_matrix(component_library, plant_assembly)
    errors.extend(causal_propagation_matrix.get("errors") or [])
    warnings.extend(causal_propagation_matrix.get("warnings") or [])

    sensor_recommendations = recommend_sensors(
        component_library,
        plant_assembly,
        fault_signature_matrix,
        observability_matrix,
    )

    status = "error" if errors else "ok"
    return {
        "status": status,
        "fault_signature_matrix": {
            "assembly_id": fault_signature_matrix["assembly_id"],
            "faults": fault_signature_matrix["faults"],
            "fault_count": len(fault_signature_matrix["faults"]),
        },
        "observability_matrix": observability_matrix,
        "causal_propagation_matrix": causal_propagation_matrix,
        "sensor_recommendations": sensor_recommendations,
        "errors": errors,
        "warnings": warnings,
    }


def score_plant_faults(
    plant_assembly: dict[str, Any],
    component_library: dict[str, Any],
    observed_signals: dict[str, Any],
    data_quality: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fault_signature_matrix = build_fault_signature_matrix(component_library, plant_assembly)
    observability_matrix = build_observability_matrix(
        component_library,
        plant_assembly,
        fault_signature_matrix,
    )
    causal_matrix = build_causal_propagation_matrix(component_library, plant_assembly)

    ranked = rank_fault_candidates(
        fault_signature_matrix.get("faults") or [],
        observability_matrix.get("fault_observability") or [],
        observed_signals,
        data_quality or {},
        causal_matrix,
    )

    return {
        "status": "ok",
        "ranked_faults": [
            {
                "fault_key": row["fault_key"],
                "final_score": row["final_score"],
                "confidence_ceiling": row["confidence_ceiling"],
                "explanation": row["explanation"],
            }
            for row in ranked
        ],
        "observability_summary": observability_matrix.get("summary") or {},
        "errors": causal_matrix.get("errors") or [],
        "warnings": fault_signature_matrix.get("warnings") or [],
    }