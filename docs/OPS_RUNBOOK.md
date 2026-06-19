# PlantLens Ops Runbook

How to run the stack locally, what breaks, and how to recover. Expand this as you build.

## Local dev (Phase 1 — Docker Compose on one host)
```bash
# 1. contracts + web deps
pnpm install
# 2. api deps
cd apps/api && uv sync   # or: python -m venv .venv && pip install -e .
# 3. bring up the stack
docker compose -f deploy/docker/compose.full.yml up --build
```
Services: `api` (:8000), `web` (:5173 dev / :80 prod), `gateway`, `postgres` (:5432), optional
`agents`, `otel-collector`. For the very first MVP you can skip Postgres and use SQLite
(`DATABASE_URL=sqlite+aiosqlite:///./plantlens.db`).

## Run the hero demo (no hardware)
1. `POST /api/v1/compiler/compile` (compiles the demo bundle → `compiled_hmi.json`).
2. Open the web app → Runtime HMI (loads the compiled bundle, opens `/ws/runtime`).
3. `POST /api/v1/simulator/scenarios/scn_motor_overload/start`.
4. Watch: motor goes red, bus/inverter amber, Calm Card slides in, raw alarms available below.

## Degraded modes (these must be graceful)
| Failure | Expected behavior | Where handled |
|---------|-------------------|---------------|
| WebSocket drops | freeze last snapshot, "DATA STALE" badge, auto-reconnect | `apps/web/src/api/ws.ts` |
| Gateway timeout | affected tags → `STALE` quality, node greys, no crash | `apps/gateway/.../modbus_poller.py` |
| Compile fails | runtime keeps last known-good `compiled_hmi.json`; show structured error | `apps/api/app/studio/compiler.py` |
| WebGL unavailable | auto-fallback to 2D map | `apps/web/src/features/maps3d/` |
| LLM provider down | agent features degrade; live HMI unaffected | `apps/agents/` (isolated) |
| Scenario re-run while one is active | lock + cancel current + reset state | `apps/api/app/runtime/simulator/` |

## Audit verification
`GET /api/v1/plants/{id}/audit` re-walks the hash chain on read. If `hash_self` of any record
≠ `SHA256(canonical_json(record) + hash_prev)`, the read fails loudly — that is the tamper-evidence
working as designed.

## Observability
- Logs: structlog JSON; filter by `trace_id` to follow one ingest cycle end-to-end.
- Metrics: Prometheus — ingest frames/sec, WS paint latency, active alarms, compile duration.
- Traces: OTEL span chain `ingest → normalize → persist → evaluate → publish`.

## Backups
Postgres dump + the `compiled/` bundle + the audit log to object storage / mounted volume.
Authored contracts are version-controlled; runtime/audit data is the thing you must back up.
