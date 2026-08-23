"""Run local motor-fingerprint inference and apply honest rejection states."""

from __future__ import annotations

import argparse
import json

import joblib
import numpy as np

from data_windows import build_feature_dataset


def decide_window(bundle: dict, vector: np.ndarray, quality_ok: bool) -> dict:
    if not quality_ok:
        return {"state": "SENSOR_CHECK", "reason": "window quality failed"}

    row = np.asarray(vector, dtype=np.float64).reshape(1, -1)
    probabilities = bundle["classifier"].predict_proba(row)[0]
    classes = bundle["classifier"].classes_
    best_index = int(np.argmax(probabilities))
    label = str(classes[best_index])
    probability = float(probabilities[best_index])
    novelty_prediction = int(bundle["novelty_detector"].predict(row)[0])
    novelty_score = float(bundle["novelty_detector"].decision_function(row)[0])

    if label == "healthy" and novelty_prediction == 1:
        state = "HEALTHY"
    elif probability >= float(bundle["minimum_class_probability"]):
        state = "KNOWN_FAULT"
    else:
        state = "UNKNOWN"

    return {
        "state": state,
        "condition": label if state != "UNKNOWN" else None,
        "class_probability": probability,
        "novelty_score": novelty_score,
        "model_version": bundle["model_version"],
        "requires_causal_confirmation": state == "KNOWN_FAULT",
    }


def main(args: argparse.Namespace) -> None:
    bundle = joblib.load(args.model)
    dataset = build_feature_dataset(
        args.input,
        sample_rate_hz=int(bundle["sample_rate_hz"]),
        window_seconds=float(bundle["window_seconds"]),
        overlap=float(bundle["overlap"]),
    )
    mask = dataset.run_ids == args.run_id
    if not np.any(mask):
        raise ValueError(f"run ID not found: {args.run_id}")
    for index, vector in enumerate(dataset.x[mask]):
        result = decide_window(bundle, vector, bool(dataset.quality_ok[mask][index]))
        result.update({"run_id": args.run_id, "window_index": index})
        print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--run-id", required=True)
    main(parser.parse_args())
