# PlantLens v1 — Final Ready State Report

**Date:** 2026-06-19  
**Branch:** `main` (credibility pass — config-driven runtime, icons, nginx, scenario matrix)

## Demo-ready: **YES**

No unresolved P0 blockers. Runtime DAG/situation logic is config-driven from `causal_graph.json`. Scenario launcher, domain icons, schematic 3D, nginx proxy, and six-scenario regression matrix are implemented and tested.

---

## Commands

```bash
# Install
pnpm install --frozen-lockfile
pip install -e "./apps/api[dev]"

# Run API (from repo root)
cd apps/api && uvicorn app.main:app --reload --port 8000

# Run web
pnpm --filter @plantlens/web dev

# Run simulator scenario (API, engineer token)
curl -X POST http://localhost:8000/api/scenarios/scn_motor_overload/start \
  -H "Authorization: Bearer <token>"

# Tests
python -m pytest apps/api/tests -q
pnpm contracts:validate
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build

# Docker compose (web on :8080, proxies /api and /ws)
docker compose -f deploy/docker/compose.full.yml up --build
```

---

## Verification (2026-06-19)

| Command | Result |
|---------|--------|
| `pnpm contracts:validate` | **PASS** |
| `python -m pytest apps/api/tests` | **PASS** (158 tests) |
| `pnpm --filter @plantlens/web typecheck` | **PASS** |
| `pnpm --filter @plantlens/web test` | **PASS** (26 tests) |
| `pnpm --filter @plantlens/web build` | **PASS** |

---

## Demo script

1. Start API + web (or `docker compose -f deploy/docker/compose.full.yml up --build`).
2. Open Runtime HMI — 2D map is default.
3. In **Scenarios**, click **Run** on `scn_motor_overload`.
4. Watch 2D map: domain icons, status legend, root highlight, causal path numbers.
5. Toggle **3D** — schematic components lazy-load (not generic boxes).
6. Expand **Raw alarms** — five alarms preserved.
7. Read **Calm Card** evidence chain and recommended first check.
8. Escalate → Incident Room + audit receipt.
9. Run `scn_sensor_stale_no_root` — SENSOR BAD badge, **no** fake root cause.

---

## Credibility fixes delivered

| Fix | Status |
|-----|--------|
| Config-driven DAG / situation (no hardcoded PV/bus rules) | **DONE** |
| ScenarioLauncher UI + `GET /api/scenarios` | **DONE** |
| Domain SVG icons + map legend | **DONE** |
| Schematic 3D components (lazy chunk) | **DONE** |
| `deploy/docker/nginx.conf` + web.Dockerfile | **DONE** |
| EMA projection + confidence band | **DONE** |
| Six-scenario regression matrix | **DONE** |
| Asset status precedence (critical > warning > sensor_bad) | **DONE** |
| CI runs pytest unconditionally | **DONE** |

---

## Standards language

Aligned with ISA-18.2 / IEC 62682 alarm management and IEC 61511 cause-and-effect thinking. **Not certified.** PlantLens is read-only advisory above PLC/DCS — no live LLM diagnosis, no direct hardware control.

---

## Deferred (post-v1)

- Recorded playback fallback for live demo hiccups
- Full frontend Zod ↔ JSON Schema drift CI for every runtime contract
- `compose.edge.yml` edge profile (full stack uses `compose.full.yml` today)