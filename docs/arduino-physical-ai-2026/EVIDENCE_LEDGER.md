# Evidence Ledger

| Claim | Status | Supported evidence | Source |
| --- | --- | --- | --- |
| UNO Q executes the edge compute path | Board-measured | Connected-board run on 23 Aug 2026, 200 synthetic epochs. | [`deploy/uno-q/README.md`](../../deploy/uno-q/README.md) |
| Local inference performance | Board-measured | 11.6338 ms median, 11.9572 ms p95, 35.4903 ms maximum, 274.34 KiB Python peak. Compute path only. | Deployment README; benchmark script |
| Deterministic replay | Reproduced | SHA-256 `2234378f626afb18e2395710b1c45f3a791aa39d963a3de007ad303534afa4a9`. | [`benchmark_edge_ensemble.py`](../../scripts/benchmark_edge_ensemble.py) |
| MAX485 wiring | Prototype-observed | D1/TX to DI, D0/RX to RO, D2 to tied DE and /RE, common GND. | Deployment README and bridge firmware |
| Industrial communications | Prototype-observed | 38,400-baud 8N1 Modbus RTU; captured FC03 request/response passes CRC parser tests. | [`test_uno_q_passive_gateway.py`](../../apps/api/tests/test_uno_q_passive_gateway.py) |
| Electrical commissioning samples | Prototype-observed; interpretation provisional | Approximately (27.15444, 2.26244, 61.43538), (26.91980, 15.39559, 413.48633), (26.99155, 24.25614, 656.78320). Register mapping remains uncommissioned. | [`edge_commissioning.py`](../../deploy/uno-q/plantlens_app/python/edge_commissioning.py) |
| Five-expert ensemble | Implemented and software-tested | Seeded lightweight fault estimates, quality weighting, disagreement, abstention. Not a field-trained production classifier. | [`compact_ensemble.py`](../../apps/api/app/edge_research/compact_ensemble.py) |
| PI-BFAST compound fault tracker | Implemented and software-tested | Bounded factorial states, approved causal edges, temporal priors, novelty rejection. Shadow mode only. | [`factorial_shadow.py`](../../apps/api/app/edge_research/factorial_shadow.py) |
| Physics-informed fingerprint | Implemented and software-tested | RBF operating envelopes, electrical consistency, model hashing, explicit uncertainty. | [`motor_fingerprint.py`](../../apps/api/app/edge_research/motor_fingerprint.py) |
| Analog multichannel acquisition | Reference firmware, not physically commissioned | A0 vibration, A1 current, A2 voltage, A3 airflow, D2 RPM, built-in LED. | Arduino reference acquisition sketch |
| Physical fault accuracy, F1, confusion matrix | Not measured | No labeled physical fault sessions are available in this repository. | [`VALIDATION_PROTOCOL.md`](VALIDATION_PROTOCOL.md) |
| Sensor-to-decision latency | Not measured | Existing timing covers inference computation only. | Validation protocol |
| Exact sensor models and engineering-unit calibration | Not fully commissioned | Native registers stay `raw_word` until validated against device documentation and physical references. | Deployment README |
| Invoice, final demo video, physical fault photographs | Not evidenced | Must be supplied separately by the team. | Submission checklist |

**Interpretation rule:** software tests establish implementation behavior; synthetic benchmarks establish compute cost; live captured traffic establishes communication. None proves physical multi-class diagnostic accuracy.
