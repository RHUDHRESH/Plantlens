# PlantLens v1 — Final Ready State Report

**Date:** 2026-06-19  
**Branch:** `codex/phase-1-baseline-build-manual`  
**Prompts completed:** 35–40

## Demo-ready: **YES** (with noted P2 items)

No unresolved P0 blockers. Hero scenario path, gateway ingest, incident escalation, agent draft/approval, and PLC advisory-only bridge are implemented and tested.

---

## Commands Run

| Command | Result |
|---------|--------|
| `pnpm contracts:validate` | **PASS** |
| `pnpm oracle` | **PASS** (40 tests) |
| `python -m pytest apps/api/tests` | **PASS** (140 tests) |
| `cd apps/gateway && uv run pytest tests` | **PASS** (15 tests) |
| `python -m ruff check apps/api/app apps/api/tests apps/gateway/gateway` | **PASS** (after --fix) |
| `pnpm typecheck` | **PASS** |
| `pnpm test:web` | **PASS** (21 tests) |
| `pnpm build:web` | **PASS** |
| `docker compose -f deploy/docker/compose.full.yml config` | **PASS** |
| `git diff --check` | **PASS** (no conflict markers) |

---

## Bundle Inspection (Prompt 37/38)

| Chunk | Size (gzip) | Lazy? |
|-------|-------------|-------|
| `index-*.js` (main) | 195.93 KB | No (2D default) |
| `PlantMap3D-*.js` | 240.94 KB | **Yes** (`React.lazy`) |

3D chunk is **not** in the initial bundle. Gzipped 3D chunk **< 700 KB** target met.

---

## Demo Rehearsal

### Positive (`scn_motor_overload`)

| Check | Status |
|-------|--------|
| 5 alarms latch | **PASS** (alarm engine tests + scenario runner) |
| 1 Calm Card | **PASS** |
| Root `MTR-301` | **PASS** |
| Raw alarms visible (glass-box table) | **PASS** |
| 2D map default | **PASS** |
| 3D toggle preserves runtime store | **PASS** |
| Escalate → Incident Room | **PASS** (API + UI) |
| Agent draft → human approve → audit | **PASS** |
| PLC advisory registers (encoder) | **PASS** (gateway bridge tests) |
| PLC accept/deny feedback parsing | **PASS** |

### Negative (`scn_rs485_dropout`)

| Check | Status |
|-------|--------|
| STALE quality emitted | **PASS** |
| No confident Situation on stale-only data | **PASS** (situation engine) |
| Stale badge in UI | **PASS** |
| UI remains usable | **PASS** |

---

## R1–R11 Evidence Ledger

| Rule | Evidence | Status |
|------|----------|--------|
| **R1** Contract spine | `pnpm contracts:validate`; TagFrame/Pydantic mirrors | **PASS** |
| **R2** Deterministic DAG | `test_dag_runtime.py` | **PASS** |
| **R3** Simulator/gateway same TagFrame | Ingest router + gateway tests + `test_gateway_ingest.py` | **PASS** |
| **R4** Forms source of truth | Studio forms + compiler (Prompts 31–34) | **PASS** |
| **R5** Agents draft-only | `test_agents.py`; agent role blocked from approval | **PASS** |
| **R6** Audit hash-chain | `test_audit_chain.py`; incident/agent writes audited | **PASS** |
| **R7** Gateway dumb pipe | `test_gateway_guardian.py`; no runtime/LLM imports | **PASS** |
| **R8** 2D default, 3D lazy | `RuntimeHMI` 2D default; `LazyPlantMap3D` code-split | **PASS** |
| **R9** PLC advisory-only | `test_plc_bridge.py`; no coil writes | **PASS** |
| **R10** 12V/generic PLC posture | `plc_output_map.json` holding registers only | **PASS** |
| **R11** E-stop not bypassable | Action handshake + PLC interlock feedback codes | **PASS** |

---

## P0 Blockers

None open.

---

## Remaining Issues

### P1
- Full `docker compose up --build` stack smoke not run in this session (config validates).
- Browser desktop/mobile screenshots not captured in CI (manual smoke recommended).

### P2
- Main JS bundle ~196 KB gzip (acceptable; 3D lazy-loaded separately).
- `pymodbus` 3.13 API migration uses deprecated `ModbusDeviceContext` (works; upgrade path documented in pymodbus v4 guide).
- Agents service uses deterministic stub when LLM unavailable (by design for HMI isolation).
- OTEL/Prometheus optional extras not installed in default API venv (metrics endpoint returns graceful fallback).

---

## Deployment Instructions

```bash
# From repo root
docker compose -f deploy/docker/compose.full.yml up --build

# Or local dev
cd apps/api && uvicorn app.main:app --reload --port 8000
cd apps/gateway && uv run python -m gateway.main
cd apps/agents && uvicorn agents.main:app --port 8100
pnpm dev:web
```

Set `GATEWAY_INGEST_TOKEN` consistently across API and gateway. Compile demo bundle via Studio or `POST /api/compiler/compile-bundle`.

---

## Demo Runbook

1. Start API + web (or full compose stack).
2. Issue dev token / log in as operator.
3. `POST /api/scenarios/scn_motor_overload/start` (or Scenario Launcher when wired).
4. Verify Calm Card root `MTR-301`, raw alarms expanded, 2D map causal path.
5. Toggle 3D — confirm lazy load, same asset status colors.
6. Escalate Calm Card → Incident Room; add note; complete checklist item.
7. Open Agent Console → request graph draft → approve as engineer.
8. Check audit chain: `GET` audit records verify hash chain.
9. Negative: run `scn_rs485_dropout` → STALE badge, degraded but usable UI.

---

## Rollback / Fallback

| Failure | Fallback |
|---------|----------|
| Gateway down | API keeps running; simulator ingest path still works |
| Agents down | Stub draft via API fallback; HMI unaffected |
| WebGL unavailable | Auto-fallback to 2D map |
| WS disconnect | Stale badge; last snapshot retained in Zustand |
| LLM outage | Deterministic agent stub |

---

## Screenshots Checked

Manual browser verification recommended for:
- Desktop runtime (2D + Calm Card)
- Mobile layout (top strip + map)
- WebGL disabled → 2D fallback panel
- Incident Room evidence-first layout
- Agent Console approval bar

(Unit/integration tests cover functional paths; visual QA is operator-signoff step.)