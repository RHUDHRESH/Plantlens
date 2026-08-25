# PlantLens: Physics-Informed Industrial Edge AI on Arduino UNO Q

[![Continuous integration](https://github.com/RHUDHRESH/Plantlens/actions/workflows/ci.yml/badge.svg)](https://github.com/RHUDHRESH/Plantlens/actions/workflows/ci.yml)

**One industrial machine. Multiple physical symptoms. One trustworthy maintenance explanation, computed locally.**

PlantLens is a read-only industrial intelligence retrofit combining passive RS485 observation, physics-informed motor fingerprinting, uncertainty-aware edge AI, and deterministic causal-DAG reasoning. It explains what changed, why the physical evidence supports that conclusion, and when the system must abstain.

**Arduino Physical AI Challenge India 2026 | Industrial & Sustainability**

**Team:** Volt Visionaries: Rhudhresh R, Dhruv D. Mehta, Shyaam S, Suraj Sharma

**Institution:** Saveetha Engineering College

**Primary board:** Arduino UNO Q | **Operating model:** local inference, offline-capable, strictly read-only

## Judges: start here

- [Judge brief and scoring rubric](docs/arduino-physical-ai-2026/JUDGE_BRIEF.md)
- [Verified evidence and limitations](docs/arduino-physical-ai-2026/EVIDENCE_LEDGER.md)
- [Causal DAG patterns and explainability](docs/arduino-physical-ai-2026/CAUSAL_DAG_PATTERNS.md)
- [Bill of materials and integration status](docs/arduino-physical-ai-2026/BILL_OF_MATERIALS.md)
- [Actual UNO Q deployment, confirmed wiring, and on-board benchmark](deploy/uno-q/README.md)
- [Full submission package](docs/arduino-physical-ai-2026/README.md)

## Why this requires the Arduino UNO Q

| Board component | Responsibility | Why it matters |
| --- | --- | --- |
| STM32U585 real-time MCU | Capture UART/RS485, delimit Modbus RTU frames, validate CRC, hold transceiver direction. | Reliable 38,400-baud frame boundaries require timing ordinary Linux userspace cannot guarantee. |
| Qualcomm QRB2210 Linux MPU | Local inference, evidence generation, FastAPI, and operator HMI. | Usable industrial edge AI runs on the same board without cloud inference. |
| Arduino Bridge | Transfer bounded passive captures between MCU and MPU. | Keeps physical acquisition and local reasoning within one explicit safety boundary. |

The existing HMI remains the only bus master during normal operation. PlantLens never writes coils, registers, PLC outputs, or motor-control commands.

## Four AI capabilities that differentiate PlantLens

1. **Physical motor fingerprinting:** RMS, crest factor, kurtosis, frequency-domain features, electrical load, RPM, airflow, and cross-sensor relationships support healthy-only novelty detection and known-condition classification.
2. **Physics-informed one-class inference:** a dependency-free RBF model learns operating envelopes, verifies voltage-current-power consistency, assigns SHA-256 model identity, and rejects unsupported evidence.
3. **Five-member uncertainty-aware ensemble:** compact experts consider overload, imbalance, bearing wear, thermal stress, and sensor faults while exposing disagreement and explicit `INSUFFICIENT_DATA` / `UNKNOWN_FAULT` decisions.
4. **PI-BFAST compound-fault tracking:** the Physics-Informed Bounded Factorial Abductive State Tracker combines bounded beam search, temporal priors, approved causal-DAG edges, signal quality, and auditable evidence receipts.

The advanced ensemble and PI-BFAST are **shadow-mode research**, not authoritative production diagnosis. The runtime remains deterministic, human-approved, and read-only. No LLM or generative AI is inserted into live equipment decisions.

## Real on-board compute evidence

Measured on the connected Arduino UNO Q on 23 August 2026 using **200 synthetic overload epochs**:

| Metric | Result |
| --- | ---: |
| Median fused ensemble + temporal inference | **11.6338 ms** |
| p95 / maximum inference | **11.9572 ms / 35.4903 ms** |
| Peak tracked Python allocation | **274.34 KiB** |
| Replay SHA-256 | `2234378f626afb18e2395710b1c45f3a791aa39d963a3de007ad303534afa4a9` |

These are genuine board-side compute measurements on synthetic inputs. They are **not** physical fault-classification accuracy, field-validation results, or end-to-end sensing latency. Captured live Modbus traffic and three electrical commissioning observations are documented separately; full register semantics and labeled physical fault accuracy remain uncommissioned.

## Alignment with challenge judging

| Criterion | Weight | Submission evidence |
| --- | ---: | --- |
| Functionality | 40% | Dual-processor UNO Q deployment, passive industrial RS485 acquisition, CRC validation, local AI, quality-gated advisory HMI. |
| Innovation | 25% | Physics-informed fingerprinting, uncertainty-aware ensemble, bounded compound-fault reasoning, approved causal DAG, non-invasive industrial retrofit. |
| Documentation | 20% | Confirmed wiring, bill of materials, causal patterns, firmware, gateway, measured board benchmark, evidence ledger, validation protocol. |
| Presentation | 15% | Judge brief, transparent quantitative evidence, operator-focused Calm Cards, demo script, reproducible commands, visible CI. |

## Reproduce

```bash
python scripts/benchmark_edge_ensemble.py --iterations 200
python scripts/benchmark_factorial_shadow.py
python -m unittest discover -s arduino/uno_q/tests -v

pnpm install --frozen-lockfile
pip install -e "./apps/api[dev]"
ruff check apps/api/app
python -m pytest apps/api/tests -q
pnpm contracts:validate
pnpm --filter @plantlens/web typecheck
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build
```

Host benchmark timings will differ from the documented UNO Q measurements. Synthetic replay verifies compute behavior, not physical diagnostic accuracy.

## Architecture and safety references

- [`PLANTLENS.md`](PLANTLENS.md): system rules and architecture.
- [`AGENTS.md`](AGENTS.md): deterministic-runtime and human-approval constraints.
- [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md): quality, alarms, causal DAG, situations, and Calm Cards.
- [`docs/EDGE_AI_RESEARCH_PROGRAM.md`](docs/EDGE_AI_RESEARCH_PROGRAM.md): shadow-mode research architecture.
- [`docs/arduino-physical-ai-2026/`](docs/arduino-physical-ai-2026/): complete challenge submission.

**Safety contract:** advisory only; approved causal edges only; simulator and gateway share `TagFrame`; research AI remains shadow-only; consequential changes require human approval; audit history is append-only.
