# Judge Defense and Competitive Positioning Playbook

## Opening statement

"One industrial fault often creates several alarms. PlantLens uses both processors on an Arduino UNO Q to observe existing machinery without interfering with control, evaluate local machine-state hypotheses, reject unreliable or unfamiliar evidence, and give the operator one explainable maintenance recommendation."

## Board and physical-AI questions

**Why specifically Arduino UNO Q?** The MCU handles Modbus RTU capture and timing while the QRB2210 runs local inference, the evidence service and HMI. Arduino Bridge connects them. The dual architecture is functional, not decorative.

**Where is the physical interaction?** A MAX485-compatible interface observes real industrial RS485 traffic through D0/RX, D1/TX and D2 direction control. Normal operation is passive; captured traffic is CRC-validated before entering the software pipeline.

**Why no motor actuation?** Industrial maintenance tooling should not gain authority over live machinery merely to make a competition demonstration more dramatic. PlantLens intentionally produces an operator advisory and never writes a PLC coil or holding register.

## AI and originality questions

**What is genuinely AI rather than thresholds?** The repository includes learned/reference motor fingerprints, healthy-envelope novelty detection, compact fault estimation, uncertainty-aware ensemble reasoning and a bounded temporal multi-fault tracker. Deterministic approved causal logic governs how this evidence is interpreted.

**Why five experts?** Overload, imbalance, bearing wear, thermal stress and sensor faults have different physical evidence patterns. Multiple bounded estimators expose disagreement and can reject unsupported conclusions instead of forcing a single class.

**What does PI-BFAST add?** It tracks bounded combinations of plausible faults across time, using approved cause-effect edges and quality-weighted observations. It is explicitly shadow research and cannot mutate the production causal graph.

**Why not use an LLM?** Live industrial decisions need bounded latency, deterministic safety constraints, explicit evidence and conservative failure modes. Generative text is not a substitute for commissioned sensor measurements or approved causality.

**What makes this original?** The differentiated contribution is the combination of dual-processor physical acquisition, passive brownfield integration, physics-informed uncertainty, bounded compound-fault reasoning and deterministic human-readable causal evidence.

## Evidence and validation questions

**What was physically measured on the board?** Fused inference executed on the connected UNO Q across 200 synthetic overload epochs: 11.6338 ms median, 11.9572 ms p95, 35.4903 ms maximum and 274.34 KiB peak tracked Python allocation.

**Does that prove diagnostic accuracy?** No. It proves target-board compute execution and resource cost. Physical classification accuracy requires labeled, independently collected machine sessions and has not yet been established.

**What is real versus synthetic?** Captured Modbus frames, confirmed transceiver wiring, three electrical commissioning observations and the target-board execution platform are prototype evidence. Benchmark input epochs are synthetic. The analog sensor sketch describes reference assignments, not fully commissioned installed sensors.

**Can your results be reproduced?** The ensemble benchmark emits a stable SHA-256 evidence receipt, and the public CI validates contracts, frontend, backend, oracle behavior and regression tests.

**What happens if a register is not commissioned?** It stays a generic `raw_word`. PlantLens does not invent engineering units or diagnostic evidence, and insufficient measurements cause abstention.

## Difficult questions

**Why is the strongest fault tracker only shadow mode?** This is an intentional safety boundary. Research hypotheses can be evaluated without allowing an unvalidated model to modify production decisions or control machinery.

**Can D2 support both RS485 direction and RPM sensing?** Not with the two published firmware configurations unchanged. The RS485 bridge and analog acquisition sketch are alternative reference topologies. A combined build must remap and verify RPM on another interrupt-capable pin.

**Why is there no confusion matrix?** A credible physical confusion matrix requires labeled sessions collected independently across conditions and runs. Publishing one without that dataset would be misleading.

**How does this scale beyond one motor?** Acquisition feeds a canonical `TagFrame`, while asset configuration, approved causal graphs and evidence packets separate the integration layer from machine-specific fault models.

## Comparative positioning

Against multi-sensor monitoring: "Multiple sensors are useful; the harder problem is establishing which observation is trustworthy, which event happened first and which symptoms are downstream effects."

Against single-machine health scoring: "A 0-to-100 health score is useful, but operators also need failure-mode uncertainty, sensor-quality rejection, unknown-condition handling and an explainable causal path."

Against broad autonomous prototypes: "Industrial adoption benefits from a narrow, auditable and non-invasive integration boundary before autonomous actuation is considered."

Against visually impressive classifier demos: "The differentiator is not merely identifying a known class; it is refusing unsafe conclusions when sensor quality, physical chronology or prior operating experience is insufficient."

## Non-negotiable closing

"PlantLens does not claim physical accuracy it has not measured. Its contribution is trustworthy edge intelligence: local compute, transparent uncertainty, approved causal reasoning and read-only industrial integration on Arduino UNO Q."
