"""Benchmark the deterministic Easy302 decode/poll-plan hot path.

This does not claim PLC I/O latency because the PLC is not connected. It measures
CPU decode/TagFrame construction work that will run on the UNO Q.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "gateway"))

from gateway.modbus_poller import build_poll_plan, coalesce_poll_plan  # noqa: E402
from gateway.register_codec import decode  # noqa: E402
from gateway.tag_frame import TagFrame  # noqa: E402


def run(iterations: int) -> dict[str, float | int]:
    path = ROOT / "packages" / "sample-data" / "easy302-uno-q" / "tag_map.json"
    tag_map = json.loads(path.read_text(encoding="utf-8"))
    raw_plan = build_poll_plan(tag_map)
    plan = coalesce_poll_plan(raw_plan)
    tags = [tag for group in plan for tag in group.tags]
    samples: list[float] = []
    for sequence in range(iterations):
        start = time.perf_counter_ns()
        now = datetime.now(UTC)
        for tag in tags:
            registers = [0x0000, 0x41C0] if tag.width == 2 else [100]
            value = decode(registers, tag.codec, scale=tag.scale, offset=tag.offset)
            TagFrame(
                tag_id=tag.tag_id,
                asset_id=tag.asset_id,
                value=value,
                unit=tag.unit,
                quality="GOOD",
                timestamp=now,
                source="modbus_rtu",
                seq=sequence,
                gateway_id="uno-q-benchmark",
            )
        samples.append((time.perf_counter_ns() - start) / 1_000_000)
    ordered = sorted(samples)
    p95 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]
    return {
        "iterations": iterations,
        "tags_per_epoch": len(tags),
        "requests_before_coalescing": len(raw_plan),
        "requests_after_coalescing": len(plan),
        "median_cpu_ms": round(statistics.median(samples), 4),
        "p95_cpu_ms": round(p95, 4),
        "max_cpu_ms": round(max(samples), 4),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=10_000)
    args = parser.parse_args()
    if args.iterations < 1:
        parser.error("--iterations must be positive")
    print(json.dumps(run(args.iterations), indent=2))
