"""Load run-separated CSV samples and convert them into model windows."""

from __future__ import annotations

import csv
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from feature_extractor import extract_window_features, feature_order


GOOD_QUALITIES = {"GOOD", "OK", "VALID"}


@dataclass(frozen=True)
class FeatureDataset:
    x: np.ndarray
    y: np.ndarray
    run_ids: np.ndarray
    quality_ok: np.ndarray
    feature_names: list[str]


def load_sample_rows(path: str | Path) -> dict[str, list[dict[str, str]]]:
    runs: dict[str, list[dict[str, str]]] = defaultdict(list)
    with Path(path).open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        required = {"run_id", "label", "timestamp_ms", "vibration", "current", "quality"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV missing columns: {sorted(missing)}")
        for row in reader:
            runs[row["run_id"]].append(row)
    for rows in runs.values():
        rows.sort(key=lambda item: float(item["timestamp_ms"]))
    return dict(runs)


def build_feature_dataset(
    path: str | Path,
    sample_rate_hz: int,
    window_seconds: float,
    overlap: float,
) -> FeatureDataset:
    if not 0 <= overlap < 1:
        raise ValueError("overlap must be in [0, 1)")
    size = int(round(sample_rate_hz * window_seconds))
    step = max(1, int(round(size * (1.0 - overlap))))
    names = feature_order()

    vectors: list[np.ndarray] = []
    labels: list[str] = []
    run_ids: list[str] = []
    quality_ok: list[bool] = []

    for run_id, rows in load_sample_rows(path).items():
        if len(rows) < size:
            continue
        label = rows[0]["label"]
        if any(row["label"] != label for row in rows):
            raise ValueError(f"run {run_id} contains multiple labels")
        for start in range(0, len(rows) - size + 1, step):
            window = rows[start : start + size]
            vibration = np.asarray([float(row["vibration"]) for row in window])
            current = np.asarray([float(row["current"]) for row in window])
            features = extract_window_features(vibration, current, sample_rate_hz)
            vectors.append(features.vector(names))
            labels.append(label)
            run_ids.append(run_id)
            quality_ok.append(all(row["quality"].upper() in GOOD_QUALITIES for row in window))

    if not vectors:
        raise ValueError("no complete windows were produced")
    return FeatureDataset(
        x=np.vstack(vectors),
        y=np.asarray(labels),
        run_ids=np.asarray(run_ids),
        quality_ok=np.asarray(quality_ok, dtype=bool),
        feature_names=names,
    )
