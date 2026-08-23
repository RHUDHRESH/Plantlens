# UNO Q Architecture

## Why the UNO Q is central

The Arduino UNO Q performs the complete local sense-think-alert loop. The dual architecture gives each task a clear owner:

| Layer | Responsibility |
| --- | --- |
| STM32U585 MCU | Time-critical sensor sampling, timestamping, quality flags, RPM pulse counting, LED/buzzer output |
| Qualcomm QRB2210 Linux MPU | Feature extraction, model training/inference, event fusion, API, dashboard |
| PlantLens runtime | Deterministic alarm evaluation, temporal causal graph, evidence packet, Calm Card |

The system remains functional without an internet connection after installation.

## Runtime sequence

1. Sample vibration and current at a configurable high rate; sample RPM, temperature, airflow, and voltage at their appropriate lower rates.
2. Create a two-second window with 50% overlap.
3. Reject the window if timestamps, range checks, missing-sample ratio, or sensor quality fail.
4. Extract statistical and spectral features from vibration and current.
5. Run the healthy novelty detector and known-fault classifier on the Linux MPU.
6. Apply confidence, novelty, and persistence gates.
7. Submit the accepted result and supporting telemetry to the deterministic causal layer.
8. Trace the earliest credible deviation through approved equipment relationships.
9. Display a Calm Card and activate a local indicator. Do not modify motor control.

## Decision states

| State | Meaning | Operator response |
| --- | --- | --- |
| `HEALTHY` | Window matches the learned healthy envelope | Continue monitoring |
| `KNOWN_FAULT` | Model confidence and causal evidence agree | Follow the next inspection step |
| `UNKNOWN` | Abnormal but not sufficiently similar to a trained class | Capture data and inspect manually |
| `SENSOR_CHECK` | Missing, stale, saturated, or contradictory sensing | Repair or reposition sensor |
| `HUMAN_REVIEW` | Model and causal evidence disagree | Engineer reviews raw signals |

## Safety and trust rules

- The ML model proposes machine condition; it does not write actuators.
- Three consecutive abnormal windows are required before a fault alert.
- A known-fault label requires configurable minimum confidence, default `0.70`.
- Any out-of-range or stale primary channel blocks a confident diagnosis.
- Raw alarms remain accessible; grouping is reversible.
- Every decision includes timestamps, feature summary, confidence, model version, supporting evidence, and rejected alternatives.
