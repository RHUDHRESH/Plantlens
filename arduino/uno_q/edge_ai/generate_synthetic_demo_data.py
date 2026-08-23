"""Generate deterministic synthetic sessions for software smoke testing only."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

import numpy as np


SAMPLE_RATE = 800
SECONDS = 12


def make_run(label: str, seed: int) -> list[dict[str, str | float]]:
    rng = np.random.default_rng(seed)
    n = SAMPLE_RATE * SECONDS
    t = np.arange(n) / SAMPLE_RATE
    base_hz = 24.0 + rng.normal(0, 0.4)
    vibration = 0.08 * np.sin(2 * np.pi * base_hz * t) + rng.normal(0, 0.018, n)
    current = 0.82 + 0.03 * np.sin(2 * np.pi * base_hz * t) + rng.normal(0, 0.018, n)
    rpm, temperature, airflow, voltage = 1440.0, 31.0, 4.8, 12.1

    if label == "overload":
        current += 0.42 + 0.08 * np.sin(2 * np.pi * 2 * base_hz * t)
        vibration += 0.04 * np.sin(2 * np.pi * 2 * base_hz * t)
        rpm, temperature = 1080.0, 38.0
    elif label == "imbalance":
        vibration += 0.20 * np.sin(2 * np.pi * base_hz * t)
        current += 0.04 * np.sin(2 * np.pi * base_hz * t)
        rpm = 1370.0
    elif label == "airflow_blockage":
        current += 0.17
        vibration += 0.03 * np.sin(2 * np.pi * 3 * base_hz * t)
        airflow, temperature = 1.9, 35.0

    rows: list[dict[str, str | float]] = []
    for index in range(n):
        rows.append(
            {
                "run_id": f"run_{label}_{seed:02d}",
                "label": label,
                "timestamp_ms": round(index * 1000 / SAMPLE_RATE, 3),
                "vibration": float(vibration[index]),
                "current": float(current[index]),
                "rpm": rpm + rng.normal(0, 4),
                "temperature": temperature + rng.normal(0, 0.08),
                "airflow": airflow + rng.normal(0, 0.04),
                "voltage": voltage + rng.normal(0, 0.015),
                "quality": "GOOD",
            }
        )
    return rows


def main(path: str) -> None:
    labels = ["healthy", "overload", "imbalance", "airflow_blockage"]
    rows = [row for label in labels for seed in range(1, 7) for row in make_run(label, seed)]
    output = Path(path)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} synthetic rows to {output}")
    print("Synthetic output validates software plumbing only, not physical accuracy.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    main(parser.parse_args().output)
