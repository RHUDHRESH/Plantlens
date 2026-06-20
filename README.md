# PlantLens

Deterministic, read-only industrial cognition for alarm floods.

PlantLens turns raw plant telemetry into one evidence-backed Situation, renders it on a live HMI, and keeps a hash-chained audit trail for operator decisions. AI is allowed to draft explanations and contract changes, but the live runtime diagnosis stays deterministic and human-gated.

## What It Does

- Collapses alarm floods into a single root-cause Situation.
- Shows a Runtime HMI with a 2D/3D plant map, Calm Card, raw alarms, and scenario launcher.
- Uses approved causal graph edges only; no ML or LLM runs in the live diagnosis path.
- Emits canonical evidence packets for Calm Cards, audits, and agent review.
- Lets agents draft changes, while humans approve before contracts or runtime bundles change.
- Preserves consequential actions in an append-only hash-chained audit.

## Demo Status

Demo-ready as of June 2026.

Implemented and covered:

- Deterministic runtime pipeline: `TagFrame -> quality -> alarms -> DAG -> Situation -> RuntimeEvidencePacket -> Calm Card -> asset status`
- Eight-scenario regression matrix: motor overload, PV loss, stale sensor, unapproved edge, gateway dropout, recovery, downstream-only, temporal violation
- Runtime HMI: map, Calm Card, alarm table, scenario launcher, incident room
- Studio compiler path for authored plant contracts
- Agent safety boundary: draft-only, service-unavailable fallback, human approval bridge
- Auth/RBAC red-team tests for bypass attempts, tampered tokens, agent approval denial, and protected alarm acknowledgment
- Offline authored-knowledge ingestion under `/api/offline-ingest` — produces human-review drafts only

## Run Locally

Prerequisites:

- Node.js 22+
- pnpm 10+
- Python 3.12+ or `uv`

```bash
pnpm install --frozen-lockfile

cd apps/api
pip install -e ".[dev]"
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

In a second terminal from the repo root:

```bash
pnpm --filter @plantlens/web dev
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/).

For `uv` users, the API can also run from the repo root:

```bash
uv run --directory apps/api uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Demo Flow

1. Start the API and web app.
2. Open the Runtime HMI.
3. Use the scenario launcher, or start the hero scenario with an engineer token.
4. Watch the runtime derive alarms, root cause, Situation, Calm Card, and asset status.
5. Inspect raw alarms and evidence.
6. Escalate to an incident room if needed.

## Validation

```bash
python -m pytest apps/api/tests -q
pnpm contracts:validate
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build
pnpm typecheck
```

Current local verification:

- API tests: 215 passing
- Web tests: 26 passing
- Web production build: passing
- Browser smoke test: no console errors, failed requests, or HTTP 4xx/5xx responses

## Safety Model

PlantLens is advisory. It does not trip equipment, write PLC registers, or mutate live control state.

Hard rules:

- One canonical plant model in `packages/contracts`.
- Runtime DAG traversal is deterministic and read-only.
- Only approved causal graph edges can affect root cause.
- Simulator and gateway emit the same `TagFrame` contract.
- Agents draft only; humans approve consequential changes.
- The agent role cannot approve, acknowledge alarms, or bypass human gates.
- Audit records are append-only and hash-chained.

## Red-Team Coverage

The auth guardian tests exercise:

- Missing, malformed, non-Bearer, expired, and tampered tokens
- Dev-token endpoint hidden in production
- Production auth returning 503 instead of silently bypassing
- Invalid role claims rejected at verification time
- Agent role and agent actor type denied on human-gated approval
- Viewer/agent denied on alarm acknowledgment
- Human approver matrix pinned for operator, maintenance, engineer, and admin
- Auth package isolation from runtime/studio/gateway/agent engines
- Secret-like strings not leaking in auth errors

## Repository Layout

```text
plantlens/
├─ PLANTLENS.md            # system truth, rules, demo domain
├─ docs/                   # architecture, algorithms, agent boundary, demo script
├─ packages/
│  ├─ contracts/           # JSON Schema contract spine
│  ├─ sample-data/         # demo microgrid plant bundle
│  ├─ ui-tokens/           # shared UI tokens
│  └─ icons/               # domain SVG symbols
├─ apps/
│  ├─ api/                 # FastAPI runtime, compiler, incidents, audit, auth
│  ├─ gateway/             # read-only Modbus/RS485 poller
│  ├─ agents/              # optional draft-only AI service
│  └─ web/                 # React 19 + Vite HMI and Studio
├─ deploy/                 # Docker, compose, k8s, CI
└─ legacy/cliffords-ts/    # frozen ingestion oracle
```

## Key Docs

| Doc | Purpose |
| --- | --- |
| [`PLANTLENS.md`](PLANTLENS.md) | Master build document and non-negotiable rules |
| [`docs/ALGORITHMS.md`](docs/ALGORITHMS.md) | Quality, alarms, DAG, Situation, Calm Card |
| [`docs/AGENT_BOUNDARY.md`](docs/AGENT_BOUNDARY.md) | What agents may and may not do |
| [`docs/DEMO_SCENARIO.md`](docs/DEMO_SCENARIO.md) | Hero scenario and regression matrix |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Service boundaries and data flow |
| [`docs/RUNTIME_CONTRACTS.md`](docs/RUNTIME_CONTRACTS.md) | REST and WebSocket contracts |

## Docker

```bash
docker compose -f deploy/docker/compose.full.yml up --build
```

The Docker profile serves the web app through the configured frontend container and proxies API/WebSocket traffic to the backend.

## License

TBD.
