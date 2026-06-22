# PlantLens

Deterministic, read-only industrial cognition for alarm floods.

PlantLens turns raw plant telemetry into one evidence-backed Situation, renders it on a live HMI, and keeps a hash-chained audit trail for operator decisions. AI drafts explanations and contract changes only; live runtime diagnosis stays deterministic and human-gated.

**Current product rule:** deterministic runtime, AI draft-only, 2D default, 3D lazy.

**Do not start from archived docs.** Use the source-of-truth list below.

## Source of truth (read in order)

1. [`PLANTLENS.md`](PLANTLENS.md) — system rules, demo domain, architecture map
2. [`FINAL_READY_STATE.md`](FINAL_READY_STATE.md) — demo-ready status and verification
3. [`docs/BUILD_ORDER.md`](docs/BUILD_ORDER.md) — build sequence (chunks 0–13)
4. [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) — tokens, status rules, motion, copy
5. [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) — quality, alarms, DAG, Situation, Calm Card
6. [`docs/DEMO_SCENARIO.md`](docs/DEMO_SCENARIO.md) — hero scenario and regression matrix

Agent instructions: [`AGENTS.md`](AGENTS.md)

Archived historical context only: [`docs/archive/`](docs/archive/) — **not** build instructions.

## Install and run

```bash
# Install
pnpm install --frozen-lockfile
pip install -e "./apps/api[dev]"

# Run API (from repo root)
cd apps/api && PLANTLENS_DEV_JWT_SECRET=change-this-local-dev-secret uvicorn app.main:app --reload --port 8000

# Run web
pnpm --filter @plantlens/web dev

# Run simulator scenario (API, engineer token)
curl -X POST http://localhost:8000/api/scenarios/scn_motor_overload/start \
  -H "Authorization: Bearer <token>"

# Docker compose (web on :8080, proxies /api and /ws)
docker compose -f deploy/docker/compose.full.yml up --build
```

## Validation

```bash
python -m pytest apps/api/tests -q
pnpm contracts:validate
pnpm --filter @plantlens/web typecheck
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build
```

## Repository layout

```text
plantlens/
├─ PLANTLENS.md            # master build document
├─ AGENTS.md               # strict agent instructions
├─ FINAL_READY_STATE.md    # demo-ready verification
├─ docs/                   # architecture, algorithms, build order
├─ packages/
│  ├─ contracts/           # JSON Schema contract spine
│  └─ sample-data/         # demo-microgrid bundle
├─ apps/
│  ├─ api/                 # FastAPI runtime, compiler, incidents, audit
│  ├─ gateway/             # read-only Modbus/RS485 poller
│  ├─ agents/              # draft-only AI service
│  └─ web/                 # React 19 + Vite HMI and Studio
├─ deploy/                 # Docker, compose
└─ legacy/cliffords-ts/    # frozen ingestion oracle
```

## Safety model

PlantLens is advisory. It does not trip equipment, write PLC registers, or mutate live control state.

- One canonical plant model in `packages/contracts`
- Runtime DAG is deterministic and read-only; approved edges only
- Simulator and gateway emit the same `TagFrame` contract
- Agents draft only; humans approve consequential changes
- Append-only hash-chained audit

## License

TBD.