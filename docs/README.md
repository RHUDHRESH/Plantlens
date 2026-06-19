# PlantLens docs

Read in this order:

1. [`../PLANTLENS.md`](../PLANTLENS.md) — master build document (start here). The system, the
   non-negotiable rules, the demo domain, and where each of the 13 idea-docs lives.
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — service boundaries, data flow, the runtime tick, the
   DAG algorithm, deployment posture.
3. [`CONTRACTS.md`](CONTRACTS.md) — the JSON-schema spine; how the three mirrors (JSON Schema /
   Pydantic / Zod) stay in sync.
4. [`BUILD_ORDER.md`](BUILD_ORDER.md) — the 14 chunks, in order, with per-chunk "done" tests.
5. [`LIBRARIES.md`](LIBRARIES.md) — how to get every library and exactly which parts to use.
6. [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) — tokens, status rules, motion, copy, budgets.
7. [`DEMO_SCENARIO.md`](DEMO_SCENARIO.md) — the bench and the hero scenario to build against.
8. [`RUNTIME_CONTRACTS.md`](RUNTIME_CONTRACTS.md) — REST + WebSocket surface.
9. [`OPS_RUNBOOK.md`](OPS_RUNBOOK.md) — running the stack locally, degraded modes, recovery.

Every source folder in the repo also has its own `README.md` describing every file that belongs
there and why. The docs here explain the system; the folder READMEs explain the files.
