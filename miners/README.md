# Offline miners / ML confinement zone (Domain S)

**Law #3: No ML in the live path.** Everything here runs build-time only and
outputs PROPOSALS to a staging area; only an engineer-approved proposal mutates
the authored model (`graph.json`). This is the ML-confinement law made physical.

## Methods
- `fpgrowth.py` — alarm-sequence co-occurrence (mlxtend 0.24.0 `frequent_patterns`)
- `prefixspan.py` — sequential pattern mining
- `transfer_entropy.py` — directional edge candidates with effective-TE bias
  correction: `TE(Y->X) - TE(Y_surrogate->X)` (Schreiber; Dimpfl-Peter)
- `pid_cnn.py` — P&ID digitization (scikit-learn 1.9.0 frozen artifacts)
- `hazop_extract.py` — HAZOP semantic edge extraction (weakest link; lean on gate)
- `propose_edges.py` — writes candidates to staging; never touches live graph

## Approval gate
Nothing enters the live causal graph without an engineer signature
(`graph.json` edges carry `approved_by`). The unclassified situations surfaced
by `pipeline/anomaly.py` feed the miner queue so the known-world grows from the
unknown-world — always gated.
