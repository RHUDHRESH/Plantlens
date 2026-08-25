# Official and Industry-Judge Evaluation Coverage

The published competition rubric allocates 40 points to functionality, 25 to innovation, 20 to technical documentation, and 15 to presentation. Additional dimensions below are engineering expectations, not undisclosed official judging criteria.

## Official criterion 1: functionality and execution (40 points)

| Judge question | Demonstrable answer | Evidence | Remaining limitation |
| --- | --- | --- | --- |
| Is Arduino UNO Q the indispensable primary platform? | Its STM32U585 captures time-sensitive Modbus frames; its QRB2210 runs local inference and HMI; Arduino Bridge joins both. | `deploy/uno-q/README.md`, bridge firmware, passive gateway | Demo must show the actual board and live Bridge data. |
| Does the system interact with physical equipment? | It passively observes an existing 38,400-baud industrial RS485 bus and validates captured Modbus CRC. | Passive gateway, captured-frame regression tests, documented wiring | Engineering-unit register semantics require additional commissioning. |
| Does meaningful AI run locally? | Physics-informed fingerprinting, compact five-expert ensemble and bounded temporal tracking run on target; 200 synthetic epochs benchmarked on board. | 11.6338 ms median target-board benchmark and reproducible replay hash | Benchmark measures computation, not field accuracy. |
| Does it produce useful action? | One evidence-backed read-only operator advisory with explicit cause, supporting symptoms and safe next check. | Runtime evidence and Calm Card implementation | Final submission video must demonstrate the operator workflow. |
| Does it fail safely? | Missing, stale, uncommissioned and contradictory observations trigger abstention; no actuator or Modbus write surface exists. | Research tests, gateway code, safety documentation | Physical sensor-disconnection footage remains to be recorded. |

## Official criterion 2: innovation and originality (25 points)

1. **Physically necessary dual-processor partition:** real-time protocol capture and Linux inference cooperate on one UNO Q.
2. **Non-invasive brownfield retrofit:** the existing HMI remains bus master; existing PLC and control logic remain untouched.
3. **Physics-constrained machine fingerprints:** electrical relationships and operating regimes constrain plausible interpretations.
4. **Uncertainty-aware fault intelligence:** five lightweight fault experts expose confidence, disagreement, data sufficiency and unknown conditions.
5. **Bounded multi-fault state tracking:** PI-BFAST reasons over simultaneous fault hypotheses with temporal priors and approved edges.
6. **Causal, rather than merely correlational, presentation:** chronology, signal quality and approved physical dependencies accompany every explanation.
7. **Conservative production boundary:** experimental AI stays in shadow mode; deterministic approved runtime decisions retain authority.

The novelty is the integrated combination and safety architecture. Do not claim individual generic techniques, such as random forests or anomaly detection, were invented by this team.

## Official criterion 3: technical documentation (20 points)

Required documentation is traceable through the challenge index: team identity and abstract; actual deployed and reference-only BOM; confirmed pin map; dual-processor architecture; causal graph; acquisition firmware; local AI algorithms; commissioning workflow; validation methodology; measured compute results; explicit evidence limitations; reproducible commands; automated tests; demo script; submission checklist.

Separate **observed**, **computed**, **synthetic**, **reference-only**, and **unvalidated** claims. The evidence ledger is authoritative when wording elsewhere might imply stronger validation.

## Official criterion 4: presentation and creativity (15 points)

The first 30 seconds must establish the industrial problem, physical board, live machine observation, local intelligence and single operator outcome. Present one known event, one bad-sensor refusal and one unknown-event refusal. Explain the dual-processor split visually; make the dashboard and passive bus visible simultaneously. Conclude with the quantitative on-device benchmark and safety boundary.

## Additional industry evaluation dimensions

| Engineering dimension | PlantLens position | Judge-ready proof |
| --- | --- | --- |
| Reproducibility | Public green CI across contracts, oracle, frontend and backend. | 584 backend tests, 361 frontend tests and public workflow run. |
| Calibration honesty | Synthetic benchmarks and physical observations are separately labeled. | Evidence ledger and validation protocol. |
| Operational safety | Advisory-only architecture; no equipment-control or register-write surface. | Passive gateway and MCU firmware review. |
| Explainability | Ordered cause-effect evidence, approved DAG edges and human-readable advisory. | Causal DAG patterns and runtime evidence packet. |
| Robustness | CRC validation, quality gating, stale-data handling, uncertainty and novelty rejection. | Edge research and passive gateway regression tests. |
| Deployability | Existing industrial RS485 network can be observed without replacing a PLC. | Confirmed D0/D1/D2 wiring and deployment README. |
| Commercial scalability | Shared machine-observation architecture can extend across pumps, fans, motors and blowers. | Canonical `TagFrame`, sample configurations and machine-independent causal runtime. |
| Resource efficiency | Compact pure-Python inference and measured target-board memory allocation. | 274.34 KiB tracked peak and reproducible benchmark. |
| Data governance | Local inference and explicit commissioning boundaries avoid silently mislabeling native industrial registers. | Native `raw_word` policy and read-only gateway. |
| Technical ownership | Team must explain every model, failure mode, graph edge, benchmark scope and board interaction. | Judge defense playbook and live demonstration. |

## Hard gaps documentation cannot close

There is no labeled multi-session physical fault dataset, physical confusion matrix, field-validated diagnostic accuracy, end-to-end physical latency log, final public video, invoice evidence, or complete sensor calibration record in this repository. These require real-world work, not stronger wording.
