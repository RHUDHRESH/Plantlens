"""Pipeline package — the fixed deterministic architecture.

Each stage is one module consuming the prior stage's typed output:
  signal_abstraction -> state_estimation -> fault_scoring / anomaly
  -> causal_grouping -> evidence -> action_envelope -> orchestrator
Plus relevance.py (cross-cutting) and orchestrator.py (runs the whole chain per tick).
"""
