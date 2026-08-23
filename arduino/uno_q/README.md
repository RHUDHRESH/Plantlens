# PlantLens UNO Q Reference Implementation

This folder contains the runnable reference path for motor fingerprinting on the Arduino UNO Q Linux side plus an MCU acquisition sketch template.

## What is implemented

- deterministic window feature extraction from vibration and motor current
- healthy-only novelty detector (`IsolationForest`)
- known-condition classifier (`RandomForestClassifier`)
- model bundle with feature order, thresholds, labels, and version metadata
- local inference state machine with quality and confidence rejection
- synthetic-data generator and smoke test for software validation

The synthetic generator is not evidence of physical accuracy. Replace its output with real UNO Q sessions before reporting performance.

## Expected input CSV

Each row is one timestamped sample:

```text
run_id,label,timestamp_ms,vibration,current,rpm,temperature,airflow,voltage,quality
run_001,healthy,0,0.013,0.84,1460,31.2,4.8,12.1,GOOD
```

Only `vibration` and `current` are required for the fingerprint model. The remaining channels are preserved as causal evidence.

## Quick smoke test

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt

python edge_ai/generate_synthetic_demo_data.py --output synthetic_sessions.csv
python edge_ai/train_model.py --input synthetic_sessions.csv --output plantlens_motor_model.joblib
python edge_ai/run_inference.py --model plantlens_motor_model.joblib --input synthetic_sessions.csv --run-id run_overload_03
python -m unittest discover -s tests -v
```

## Physical-data workflow

1. Adapt `mcu/plantlens_acquisition.ino` to the exact sensor modules and pin map.
2. Capture independent run files for healthy and fault conditions.
3. Merge them into the documented CSV schema.
4. Train with `train_model.py`; the script splits by `run_id` to prevent window leakage.
5. Copy the model bundle to the UNO Q Linux filesystem.
6. Run `run_inference.py` from the App Lab Python application or wrap its `decide_window` function in a custom Brick.
7. Publish each decision to the existing PlantLens ingest/API boundary.

## Default prototype configuration

- sample rate: 800 Hz
- window: 2 seconds
- overlap: 50%
- accepted known class: probability at least 0.70
- stable alert: three consecutive accepted abnormal windows

All defaults are stored in the model bundle and should be replaced by measured configuration values.
