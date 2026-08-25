# PlantLens - Arduino Physical AI Challenge India 2026

PlantLens is an edge-AI condition-monitoring and fault-explanation system for small motors, fans, blowers, and similar rotating assets. An Arduino UNO Q learns a machine's healthy operating fingerprint from vibration and motor-current windows, identifies known fault patterns locally, rejects uncertain inputs, and combines the model output with RPM, temperature, airflow, voltage, and signal chronology to produce one evidence-backed operator decision.

## Submission identity

- Product: **PlantLens**
- Team: **Volt Visionaries**
- Institution: **Saveetha Engineering College**
- Members: **Rhudhresh R, Dhruv D. Mehta, Shyaam S, Suraj Sharma**
- Category: **Industrial & Sustainability**
- Repository: <https://github.com/RHUDHRESH/Plantlens>

## Problem statement

Low-cost industrial monitoring systems usually stop at thresholds: high current, low speed, high temperature, or excessive vibration. During a compound event, a single mechanical problem can raise several alarms, forcing the operator to manually determine which signal changed first and which alarms are only downstream effects. Small factories and educational laboratories rarely have access to expensive condition-monitoring platforms or cloud connectivity.

PlantLens addresses this gap with a local, read-only system that answers four questions:

1. Is this operating window similar to the machine's learned healthy fingerprint?
2. If it is abnormal, which known fault pattern is the closest match?
3. What physical evidence supports or contradicts that result?
4. What should the operator inspect next?

## Product boundary

PlantLens is advisory. It may illuminate an indicator, sound a buzzer, and publish a local alert, but it does not autonomously trip equipment or write control parameters. Poor-quality, missing, stale, or out-of-distribution data routes to `SENSOR_CHECK`, `UNKNOWN`, or `HUMAN_REVIEW` instead of a forced diagnosis.

## System flow

```text
Motor/fan/blower
  -> vibration + current + RPM + temperature + airflow + voltage
  -> UNO Q STM32U585: deterministic sampling, quality flags, alert outputs
  -> UNO Q Linux MPU: windowing, spectral features, on-device ML inference
  -> confidence and novelty gate
  -> PlantLens causal DAG: first deviation + physical dependency checks
  -> local dashboard: condition, likely root, evidence, confidence, next check
```

## Edge-AI strategy

The deployable prototype uses a two-stage motor fingerprint:

- **Novelty detector:** learns only healthy windows and detects operating patterns outside the healthy envelope.
- **Known-fault classifier:** distinguishes demonstrated classes such as healthy operation, mechanical obstruction/overload, imbalance, and airflow blockage.

The model consumes spectral and statistical features from vibration and current. Slow signals such as RPM, temperature, airflow, and voltage remain independent causal evidence. This separation prevents a classifier from hiding the physical reason behind its output.

## Documentation map

- [`JUDGE_BRIEF.md`](JUDGE_BRIEF.md) - concise functionality, innovation, evidence, and official scoring alignment
- [`JUDGING_RUBRIC_COVERAGE.md`](JUDGING_RUBRIC_COVERAGE.md) - exhaustive official criteria, additional industry expectations, evidence mapping, and unresolved gaps
- [`JUDGE_DEFENSE_PLAYBOOK.md`](JUDGE_DEFENSE_PLAYBOOK.md) - technical questioning, evidence boundaries, difficult integration questions, and differentiated positioning
- [`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md) - board-measured, prototype-observed, software-tested, and not-yet-validated claims
- [`CAUSAL_DAG_PATTERNS.md`](CAUSAL_DAG_PATTERNS.md) - approved physical cause-effect patterns, compound faults, and safe abstention
- [`BILL_OF_MATERIALS.md`](BILL_OF_MATERIALS.md) - deployed components, optional sensing components, and commissioning status
- [`ARCHITECTURE.md`](ARCHITECTURE.md) - hardware/software boundaries and runtime sequence
- [`EDGE_AI_PIPELINE.md`](EDGE_AI_PIPELINE.md) - data collection, features, training, inference, and rejection logic
- [`HARDWARE_AND_WIRING.md`](HARDWARE_AND_WIRING.md) - functional BOM and wiring rules
- [`VALIDATION_PROTOCOL.md`](VALIDATION_PROTOCOL.md) - repeatable experiments and reporting rules
- [`DEMO_VIDEO_SCRIPT.md`](DEMO_VIDEO_SCRIPT.md) - continuous 5-10 minute recording plan
- [`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md) - final portal and evidence checks
- [`../../arduino/uno_q/README.md`](../../arduino/uno_q/README.md) - reference implementation
- [`../../deploy/uno-q/README.md`](../../deploy/uno-q/README.md) - actual dual-processor deployment, passive RS485 gateway, confirmed pinout, and target-board benchmark
- [`../EDGE_AI_RESEARCH_PROGRAM.md`](../EDGE_AI_RESEARCH_PROGRAM.md) - physics-informed motor fingerprint, compact fault ensemble, and bounded factorial shadow tracker

## Evidence status

The repository contains a deterministic production runtime, passive industrial communication capture, verified CRC fixtures, real electrical commissioning observations, software-tested physics-informed edge research, and a reference Arduino motor-fingerprint pipeline. A recorded connected-UNO-Q benchmark measured **11.6338 ms median fused inference**, **11.9572 ms p95**, and **274.34 KiB peak Python allocation** over **200 synthetic overload epochs**. This is real target-board compute evidence, not physical fault-classification accuracy, sensor-to-decision latency, or a claim that all sensor channels are commissioned. See the evidence ledger for exact boundaries.
