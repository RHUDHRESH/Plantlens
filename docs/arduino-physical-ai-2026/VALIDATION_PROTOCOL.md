# Validation Protocol

## Objective

Demonstrate that PlantLens can distinguish healthy operation from repeatable abnormal conditions, reject bad sensing, explain the temporal cause chain, and generate a local alert without internet access.

## Run design

For each condition:

1. Reset the rig and verify all channels are `GOOD`.
2. Record at least 10 seconds of healthy baseline.
3. Apply one controlled fault injection.
4. Continue recording for at least 20 seconds.
5. Remove the injection and record recovery.
6. Save the complete session with a unique run ID.
7. Repeat at least five times for the video-day engineering check; expand to ten or more for model evaluation.

## Required scenarios

| ID | Condition | Pass criterion |
| --- | --- | --- |
| V01 | Healthy | No sustained fault alert |
| V02 | Mechanical obstruction/overload | Abnormal detected; current-before-RPM evidence shown |
| V03 | Imbalance | Abnormal vibration fingerprint detected |
| V04 | Airflow blockage | Flow reduction shown as primary evidence |
| V05 | Voltage sag | Supply deviation precedes downstream symptoms |
| V06 | Sensor disconnected/stale | `SENSOR_CHECK`; no fabricated root cause |
| V07 | Untrained compound condition | `UNKNOWN` or `HUMAN_REVIEW`, not forced into a known class |

## Results table

Fill from physical runs only.

| Scenario | Runs | Correct condition | Rejected/unknown | Median latency | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| V01 Healthy |  |  |  |  |  |
| V02 Overload |  |  |  |  |  |
| V03 Imbalance |  |  |  |  |  |
| V04 Blockage |  |  |  |  |  |
| V05 Voltage sag |  |  |  |  |  |
| V06 Sensor fault |  |  |  |  |  |
| V07 Unknown |  |  |  |  |  |

## Existing software evidence

The PlantLens repository documents passing contract validation, backend tests, web type checking, web tests, and production build checks in `FINAL_READY_STATE.md`. The Arduino reference implementation includes its own synthetic-data smoke test. Neither substitutes for physical bench validation.

## Evidence package

- raw session CSV/JSONL files
- training/test split manifest by run ID
- model bundle and model-card metadata
- confusion matrix and per-class metrics
- UNO Q inference latency log
- photographs of every physical fault fixture
- continuous demo video showing date verification
