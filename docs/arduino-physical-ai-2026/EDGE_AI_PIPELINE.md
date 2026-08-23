# Edge-AI Motor Fingerprint Pipeline

## 1. Data collection

Collect separate sessions for each physical condition. Do not randomly split adjacent windows from the same run across training and test sets; that leaks nearly identical samples and inflates accuracy. Split by complete run/session.

Recommended prototype configuration:

- Vibration and current: 800 Hz target sampling rate
- Window: 2 seconds
- Overlap: 50%
- RPM, airflow, voltage, and temperature: stored alongside each window as causal context
- Minimum starting target: 10 independent runs per condition, 30 seconds per run

The rates are configuration defaults, not measured hardware claims. Lower them if the selected sensor cannot sustain them, and record the actual rate in the report.

## 2. Features

For vibration and current, the reference implementation extracts:

- mean, standard deviation, RMS, peak-to-peak
- crest factor and kurtosis
- zero-crossing rate
- dominant frequency and spectral centroid
- low-, mid-, and high-band energy ratios

RPM drop, temperature rise, airflow reduction, and voltage sag are not hidden inside the classifier. They remain readable evidence used by the causal layer.

## 3. Model

The reference Python implementation uses:

- `IsolationForest` trained only on healthy feature windows for novelty detection
- `RandomForestClassifier` for demonstrated fault classes
- `StandardScaler` fitted on training data
- persisted model bundle containing feature order, sampling rate, window size, thresholds, and class labels

An Edge Impulse `.eim` model can replace the scikit-learn bundle without changing the PlantLens decision contract.

## 4. Acceptance and rejection

```text
quality failed
  -> SENSOR_CHECK
quality good + healthy novelty score + classifier healthy
  -> HEALTHY
abnormal novelty score + top class probability >= 0.70
  + causal evidence agrees for 3 windows
  -> KNOWN_FAULT
otherwise
  -> UNKNOWN or HUMAN_REVIEW
```

## 5. Fault classes for the prototype

| Class | Physical injection | Expected primary evidence |
| --- | --- | --- |
| Healthy | Normal load and unobstructed airflow | Stable vibration/current/RPM |
| Mechanical obstruction/overload | Controlled shaft or load restriction | Current rises before RPM falls |
| Imbalance | Small safely mounted eccentric mass | Vibration energy increases near rotational order |
| Airflow blockage | Partially restrict blower inlet/outlet | Airflow falls; load/current may change |
| Voltage sag | Controlled supply reduction within safe limits | Voltage falls before speed/current consequences |

Bearing-wear and misalignment labels should not be claimed unless the team created repeatable, safe physical fixtures for them.

## 6. Metrics to report

- session-held-out confusion matrix
- macro F1, per-class precision and recall
- false-alert rate during healthy runs
- unknown-fault rejection rate
- inference latency on the UNO Q
- model bundle size and peak memory
- time from physical injection to stable alert

Until those measurements are recorded, use `not yet measured`; never backfill plausible-looking numbers.
