# PlantLens

> Deterministic, read-only industrial cognition. It collapses an alarm flood into ONE
> evidence-backed root-cause **Situation**, renders it as a calm decision card on a live plant
> map, and keeps a hash-chained audit of every decision. AI drafts; humans approve; the runtime
> stays deterministic; nothing writes to hardware.

**New here?** Read [`PLANTLENS.md`](PLANTLENS.md), then [`docs/README.md`](docs/README.md).

## What works today

- **Deterministic runtime pipeline:** TagFrame → quality → alarms → DAG root-cause → situation → `RuntimeEvidencePacket` → Calm Card → asset status
- **Eight scenario regression tests** — motor overload, PV loss, stale sensor, unapproved edge, gateway dropout, recovery, downstream-only, temporal violation
- **Runtime HMI** — 2D map, Calm Card, raw alarms, scenario launcher
- **Agent plane** — draft-only; `service_unavailable` fallback when offline (no fabricated graph edges)
- **Audited draft approval** — human approve/reject; runtime unchanged until contract compile/deploy

**AI does not diagnose live faults.** Agents read evidence packets and draft explanations; humans approve before anything touches contracts.

## Repository layout

```
plantlens/
├─ PLANTLENS.md            ← master build document
├─ docs/                   ← architecture, algorithms, agent boundary, demo scenario
├─ packages/
│  ├─ contracts/           ← JSON-schema spine (single source of truth)
│  ├─ sample-data/         ← demo-microgrid bundle
│  ├─ ui-tokens/           ← design tokens
│  └─ icons/               ← domain SVG symbols
├─ apps/
│  ├─ api/                 ← FastAPI: ingest, runtime, studio, incidents, audit, agents
│  ├─ gateway/             ← Modbus/RS485 poller (read-only)
│  ├─ agents/              ← draft-only AI service (optional)
│  └─ web/                 ← React 19 + Vite: Runtime HMI, Studio, maps, Calm Cards
├─ deploy/                 ← Docker, compose, k8s, CI
└─ legacy/cliffords-ts/    ← frozen regression oracle
```

## Quick start

```bash
# Install
pnpm install --frozen-lockfile
cd apps/api && pip install -e ".[dev]"

# Validate contracts
pnpm contracts:validate

# Run API (from apps/api)
uvicorn app.main:app --reload --port 8000

# Run web (from repo root)
pnpm --filter @plantlens/web dev

# Run hero scenario (engineer dev token)
curl -X POST http://localhost:8000/api/scenarios/scn_motor_overload/start \
  -H "Authorization: Bearer <token>"

# Full stack via Docker
docker compose -f deploy/docker/compose.full.yml up --build
```

## Tests

```bash
python -m pytest apps/api/tests -q          # 198 tests
pnpm contracts:validate
pnpm --filter @plantlens/web typecheck
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build
```

See [`FINAL_READY_STATE.md`](FINAL_READY_STATE.md) for demo script and verification table.

## Key documentation

| Doc | Purpose |
|-----|---------|
| [`PLANTLENS.md`](PLANTLENS.md) | System truth, non-negotiable rules, demo domain |
| [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) | Quality, alarms, DAG, situation, Calm Card, projection |
| [`docs/AGENT_BOUNDARY.md`](docs/AGENT_BOUNDARY.md) | What agents may/may not do; approval flow |
| [`docs/DEMO_SCENARIO.md`](docs/DEMO_SCENARIO.md) | Hero scenario + eight-scenario matrix |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Service boundaries, data flow |
| [`docs/RUNTIME_CONTRACTS.md`](docs/RUNTIME_CONTRACTS.md) | REST + WebSocket surface |

## Non-negotiable rules (summary)

1. One canonical plant model — every view reads `packages/contracts`.
2. DAG runtime is deterministic and read-only (approved edges only).
3. Simulator-first — sim and gateway emit identical `TagFrame`.
4. Agents draft only — behind human approval; never on the live diagnosis path.
5. Append-only hash-chained audit for consequential changes.
6. PlantLens is advisory — it does not trip or control equipment.

Full list in [`PLANTLENS.md`](PLANTLENS.md) §2.

## Status

**Demo-ready (2026-06-19).** Core runtime cognition, evidence packets, Calm Cards, scenario regression, and agent safety boundary are implemented and tested on `main`.

Deferred: approve-draft → contract patch → compile → hot_reload; full six agent types; per-tick situation audit.

## License

TBD.