"""Train a run-separated novelty detector and known-condition classifier."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from data_windows import build_feature_dataset


def train(args: argparse.Namespace) -> dict:
    dataset = build_feature_dataset(
        args.input,
        sample_rate_hz=args.sample_rate,
        window_seconds=args.window_seconds,
        overlap=args.overlap,
    )
    valid = dataset.quality_ok
    x, y, groups = dataset.x[valid], dataset.y[valid], dataset.run_ids[valid]
    if np.unique(groups).size < 4:
        raise ValueError("at least four independent run IDs are required")
    if "healthy" not in set(y):
        raise ValueError("training data must include the 'healthy' label")

    splitter = GroupShuffleSplit(n_splits=1, test_size=args.test_size, random_state=args.seed)
    train_idx, test_idx = next(splitter.split(x, y, groups))

    classifier = Pipeline(
        [
            ("scale", StandardScaler()),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=240,
                    min_samples_leaf=2,
                    class_weight="balanced_subsample",
                    random_state=args.seed,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    classifier.fit(x[train_idx], y[train_idx])

    novelty = Pipeline(
        [
            ("scale", StandardScaler()),
            (
                "model",
                IsolationForest(
                    n_estimators=200,
                    contamination=args.healthy_contamination,
                    random_state=args.seed,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    healthy_train = train_idx[y[train_idx] == "healthy"]
    if healthy_train.size < 3:
        raise ValueError("not enough healthy training windows")
    novelty.fit(x[healthy_train])

    predicted = classifier.predict(x[test_idx])
    report = classification_report(y[test_idx], predicted, output_dict=True, zero_division=0)
    matrix = confusion_matrix(y[test_idx], predicted, labels=classifier.classes_).tolist()

    bundle = {
        "model_version": datetime.now(timezone.utc).strftime("plantlens-%Y%m%dT%H%M%SZ"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sample_rate_hz": args.sample_rate,
        "window_seconds": args.window_seconds,
        "overlap": args.overlap,
        "minimum_class_probability": args.minimum_probability,
        "persistence_windows": args.persistence_windows,
        "feature_names": dataset.feature_names,
        "classes": classifier.classes_.tolist(),
        "classifier": classifier,
        "novelty_detector": novelty,
        "validation": {
            "scope": "session-held-out evaluation on supplied input data",
            "train_run_ids": sorted(set(groups[train_idx])),
            "test_run_ids": sorted(set(groups[test_idx])),
            "classification_report": report,
            "confusion_matrix_labels": classifier.classes_.tolist(),
            "confusion_matrix": matrix,
        },
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.output)
    return bundle


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser()
    result.add_argument("--input", required=True)
    result.add_argument("--output", required=True)
    result.add_argument("--sample-rate", type=int, default=800)
    result.add_argument("--window-seconds", type=float, default=2.0)
    result.add_argument("--overlap", type=float, default=0.5)
    result.add_argument("--test-size", type=float, default=0.3)
    result.add_argument("--seed", type=int, default=19)
    result.add_argument("--healthy-contamination", type=float, default=0.05)
    result.add_argument("--minimum-probability", type=float, default=0.70)
    result.add_argument("--persistence-windows", type=int, default=3)
    return result


if __name__ == "__main__":
    model = train(parser().parse_args())
    validation = model["validation"]
    print(f"saved {model['model_version']}")
    print(f"classes: {', '.join(model['classes'])}")
    print(f"test run IDs: {', '.join(validation['test_run_ids'])}")
    print("Do not present synthetic-data metrics as physical performance.")
