"""UNO-Q benchmark for the compact ensemble plus PI-BFAST temporal kernel."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
import time
import tracemalloc
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.edge_research.compact_ensemble import CompactFaultEnsemble, FEATURES  # noqa: E402
from app.edge_research.factorial_shadow import (  # noqa: E402
    ApprovedFaultEdge,
    EdgeEpoch,
    FactorialShadowEngine,
    FaultEvidenceSpec,
)


def build_temporal() -> FactorialShadowEngine:
    faults = ("overload", "imbalance", "bearing_wear", "thermal_stress", "sensor_fault")
    return FactorialShadowEngine(
        [FaultEvidenceSpec(fault, {f"ensemble_{fault}": 2.0}, {}) for fault in faults],
        beam_width=16,
        accept_probability=0.60,
        approved_edges=(
            ApprovedFaultEdge("overload", "thermal_stress", weight=0.6),
            ApprovedFaultEdge("imbalance", "bearing_wear", weight=0.5),
        ),
    )


def run(iterations: int) -> dict[str, object]:
    ensemble = CompactFaultEnsemble()
    temporal = build_temporal()
    features = {feature: 0.0 for feature in FEATURES}
    features.update(current_z=3.0, power_z=2.2, rpm_drop_z=2.4, temperature_slope_z=0.8)
    quality = {feature: 1.0 for feature in FEATURES}
    timings: list[float] = []
    tracemalloc.start()
    for _ in range(iterations):
        started = time.perf_counter_ns()
        ensemble_result = ensemble.infer(features, quality)
        temporal_features = {
            f"ensemble_{estimate.fault_id}": estimate.probability * 4.0 - 2.0
            for estimate in ensemble_result.estimates
        }
        temporal_result = temporal.update(
            EdgeEpoch(
                mode="STEADY_HIGH",
                features=temporal_features,
                quality={name: ensemble_result.effective_quality for name in temporal_features},
            ),
            healthy_center={name: 0.0 for name in temporal_features},
            healthy_scale={name: 1.0 for name in temporal_features},
        )
        timings.append((time.perf_counter_ns() - started) / 1_000_000)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    ordered = sorted(timings)
    receipt = {
        "ensemble_decision": ensemble_result.decision,
        "top_fault": ensemble_result.estimates[0].fault_id,
        "top_probability": round(ensemble_result.estimates[0].probability, 6),
        "temporal_decision": temporal_result.decision,
        "temporal_state": list(temporal_result.top_states[0].faults),
    }
    return {
        "iterations": iterations,
        "ensemble_members": 5,
        "faults": 5,
        "median_ms": round(statistics.median(timings), 4),
        "p95_ms": round(ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))], 4),
        "max_ms": round(max(timings), 4),
        "python_peak_kib": round(peak / 1024, 2),
        "receipt": receipt,
        "replay_sha256": hashlib.sha256(
            json.dumps(receipt, sort_keys=True).encode()
        ).hexdigest(),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=1000)
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations must be positive")
    print(json.dumps(run(args.iterations), indent=2))
