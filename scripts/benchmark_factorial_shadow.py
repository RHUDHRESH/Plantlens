"""Resource benchmark for the shadow factorial edge engine."""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
import tracemalloc
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.edge_research.factorial_shadow import (
    ApprovedFaultEdge,
    EdgeEpoch,
    FactorialShadowEngine,
    FaultEvidenceSpec,
)


def build_engine(faults: int, beam: int) -> FactorialShadowEngine:
    specs = [
        FaultEvidenceSpec(
            f"fault_{index}",
            {f"feature_{index}": 1.2, f"cross_{index}": 0.4},
            {f"contradiction_{index}": 0.7},
        )
        for index in range(faults)
    ]
    edges = [
        ApprovedFaultEdge(f"fault_{index}", f"fault_{index + 1}", weight=0.4)
        for index in range(faults - 1)
    ]
    return FactorialShadowEngine(
        specs,
        beam_width=beam,
        maximum_active_faults=3,
        approved_edges=edges,
    )


def run(iterations: int, faults: int, beam: int) -> dict[str, float | int]:
    engine = build_engine(faults, beam)
    features = {name: 0.0 for i in range(faults) for name in (f"feature_{i}", f"cross_{i}", f"contradiction_{i}")}
    quality = {name: 1.0 for name in features}
    features["feature_0"] = 2.5
    if faults > 1:
        features["feature_1"] = 2.0
    epoch = EdgeEpoch("STEADY_HIGH", features, quality)
    center = {name: 0.0 for name in features}
    scale = {name: 1.0 for name in features}
    tracemalloc.start()
    timings: list[float] = []
    for _ in range(iterations):
        start = time.perf_counter_ns()
        engine.update(epoch, healthy_center=center, healthy_scale=scale)
        timings.append((time.perf_counter_ns() - start) / 1_000_000)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    ordered = sorted(timings)
    return {
        "iterations": iterations,
        "faults": faults,
        "beam_width": beam,
        "approved_dag_edges": max(0, faults - 1),
        "median_ms": round(statistics.median(timings), 4),
        "p95_ms": round(ordered[min(len(ordered) - 1, int(iterations * 0.95))], 4),
        "max_ms": round(max(timings), 4),
        "python_peak_kib": round(peak / 1024, 2),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=10_000)
    parser.add_argument("--faults", type=int, default=10, choices=range(1, 11))
    parser.add_argument("--beam", type=int, default=32)
    args = parser.parse_args()
    print(json.dumps(run(args.iterations, args.faults, args.beam), indent=2))
