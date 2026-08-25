# Judge Brief: PlantLens on Arduino UNO Q

## The 20-second pitch

PlantLens retrofits an industrial machine without controlling it. The Arduino UNO Q's real-time MCU passively observes its RS485/Modbus network, while its Linux MPU runs compact local AI. Physics-informed motor fingerprinting, uncertainty-aware fault inference, and an approved causal DAG produce one evidence-backed maintenance advisory instead of disconnected alarm spam.

## Physical AI workflow

1. Observe a physical industrial Modbus RTU bus at 38,400 baud.
2. Capture frames on the UNO Q MCU and verify communication integrity.
3. Transfer bounded observations across Arduino Bridge.
4. Compute motor fingerprints and bounded fault hypotheses locally on the UNO Q MPU.
5. Validate quality, timing, novelty, and approved physical cause-effect relationships.
6. Present an explainable read-only operator advisory; never actuate machinery.

## Originality

- The MCU/MPU split is technically necessary, not cosmetic.
- Passive RS485 acquisition preserves the existing industrial HMI as bus master.
- Physical operating envelopes and voltage-current-power consistency constrain inference.
- Five compact fault experts expose disagreement and explicitly reject missing or unfamiliar evidence.
- PI-BFAST considers bounded compound-fault states using temporal priors and approved DAG edges.
- Human-readable causal receipts link machine symptoms to one actionable explanation.
- No Modbus writes, autonomous control, live LLM, or runtime graph mutation.

## Evaluation mapping

| Criterion | Weight | Inspect |
| --- | ---: | --- |
| Functionality | 40% | [`deploy/uno-q/README.md`](../../deploy/uno-q/README.md), MCU bridge, passive gateway, deployment regression tests. |
| Innovation | 25% | [`compact_ensemble.py`](../../apps/api/app/edge_research/compact_ensemble.py), [`factorial_shadow.py`](../../apps/api/app/edge_research/factorial_shadow.py), [`motor_fingerprint.py`](../../apps/api/app/edge_research/motor_fingerprint.py), [`CAUSAL_DAG_PATTERNS.md`](CAUSAL_DAG_PATTERNS.md). |
| Documentation | 20% | [`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md), [`BILL_OF_MATERIALS.md`](BILL_OF_MATERIALS.md), wiring, deployment documentation, validation protocol. |
| Presentation | 15% | Root README, this brief, demo script, operator Calm Card, CI results. |

## Defensible result

On the connected UNO Q, 200 synthetic overload epochs yielded **11.6338 ms median fused inference**, **11.9572 ms p95**, and **274.34 KiB peak tracked allocation**. This verifies board-side compute cost, not physical diagnostic accuracy.

**Volt Visionaries:** Rhudhresh R, Dhruv D. Mehta, Shyaam S, Suraj Sharma.

**Saveetha Engineering College | Industrial & Sustainability.**
