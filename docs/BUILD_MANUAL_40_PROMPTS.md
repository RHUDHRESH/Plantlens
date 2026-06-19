# PlantLens — 40-Prompt Build Manual

> **Purpose:** Step-by-step execution guide for building **PlantLens v1** (all `docs/BUILD_ORDER.md` chunks 0–13) in 40 Cursor prompts.
> **Audience:** Composer / Codex agents working inside this repo.
> **Master context:** Read [`PLANTLENS.md`](../PLANTLENS.md) first, then this file.

---

## How to use this manual

1. Run prompts **in order** — each build prompt assumes prior prompts are complete.
2. After every **Build** prompt, run its paired **Guardian** prompt before continuing.
3. Never skip the non-negotiable rules below.
4. Do not implement runtime logic ahead of the prompt that owns it.
5. `pnpm contracts:validate` must stay green after Prompt 2.

**Progress:** Prompts **1–34 complete** (through React Flow guardian). Next: Prompt 35.

**API shell note:** Health + simulator + compiler routes mounted. Runtime tick: TagFrame → alarms → DAG → situation → Calm Card → asset status → WS broadcast. Studio compiler fail-closed with deterministic hash. No migrations at startup.

### Lockfiles

| Stack | Location | Policy |
|-------|----------|--------|
| Node monorepo | root `pnpm-lock.yaml` | Required; frozen in CI. |
| Cliffords oracle | `legacy/cliffords-ts/pnpm-lock.yaml` | Isolated from root. |
| Python API | `apps/api/uv.lock` | Keep when generated; `uv sync --extra dev` in `apps/api`. |
| Python gateway/agents | per-app `uv.lock` | Create only when a prompt intentionally runs `uv sync` for that app. |

### Prompt numbering

| Range | Type | Count |
|-------|------|-------|
| 1, 3, 5, … 39 | **Build** | 20 |
| 2, 4, 6, … 40 | **Guardian** (verify) | 20 |

Build prompts implement; Guardian prompts audit, test, and block drift.

**End state after Prompt 40:** Full v1 — contracts, API, runtime engines, Studio, web HMI (2D+3D), gateway, Incident Room, draft-only agents, DAG-to-PLC advisory bridge, hardening, and demo-ready deployment.

---

## Non-negotiable rules (load-bearing — never violate)

| Rule | Requirement |
|------|-------------|
| **R1 — One canonical contract spine** | All views read `packages/contracts`. Pydantic + Zod mirrors stay in sync. |
| **R2 — Deterministic DAG runtime** | Only `approved: true` edges. No ML, no graph mutation at runtime. |
| **R3 — Simulator-first** | Simulator and gateway emit identical `TagFrame`. |
| **R4 — Forms-first Studio** | Forms are source of truth; React Flow is projection only. |
| **R5 — Agents draft-only** | Human approval gate. Never write hardware or auto-approve. |
| **R6 — Hash-chained audit** | Append-only for compiles, edits, approvals, acks, proposals. |
| **R7 — Gateway is dumb pipe** | Poll, normalize, publish. Never diagnoses or runs LLM. |
| **R8 — 2D default, 3D lazy** | 3D never blocks initial load. |
| **R9 — PLC advisory-only** | Advisory registers + action *requests*. PLC interlocks decide. No direct control. |
| **R10 — V1 hardware** | Safe **12 V DC / generic PLC**. Not old AC/VFD path. |
| **R11 — Hardwired E-stop** | E-stop is hardware; software cannot bypass it. |

---

## Demo bench

**Domain:** DC microgrid — `packages/sample-data/demo-microgrid/`

**Hero scenario:** `scn_motor_overload` → 5 alarms → ONE Situation (`MOTOR_MECHANICAL_OVERLOAD`), root `MTR-301`.

**Negative scenario:** `scn_rs485_dropout` → `expected_situation: null`, `expected_root_cause: null` (degraded mode).

See [`docs/DEMO_SCENARIO.md`](DEMO_SCENARIO.md).

---

## Full v1 coverage map (BUILD_ORDER Chunks 0–13 → 40 prompts)

| Chunk | Topic | Build | Guardian |
|-------|-------|-------|----------|
| 0 | Contracts, CI, schema mirrors | 1, 3 | 2, 4 |
| 1 | API shell, DB, auth, audit | 5, 7, 9, 11 | 6, 8, 10, 12 |
| 2 | Simulator-first | 13 | 14 |
| 3 | Alarm, DAG, Situation, Calm Card, projection | 15, 17, 19 | 16, 18, 20 |
| 4 | Studio compiler | 21 | 22 |
| 5 | Web shell, runtime store | 23 | 24 |
| 5 | 2D plant map | 25 | 26 |
| 6 | Calm Card UI, raw alarms | 27 | 28 |
| 9a | Studio forms (forms-first) | 29 | 30 |
| 9b | React Flow projection | 31 | 32 |
| 7 | Gateway read path | 35 | 36 |
| 8 | 3D lazy map | 37 | 38 |
| 10–13 | Incident Room, agents, PLC bridge, hardening | 39 | 40 |

---

# Prompt 1 — Baseline & Build Manual (BUILD) ✅

**Goal:** Repo context, AJV Draft 2020-12 fix, create this manual, branch.

**Files to read:** `PLANTLENS.md`, `docs/BUILD_ORDER.md`, `docs/CONTRACTS.md`, `scripts/validate-contracts.mjs`, `packages/contracts/*`, `packages/sample-data/demo-microgrid/*`

**Likely files touched:** `scripts/validate-contracts.mjs`, `docs/BUILD_MANUAL_40_PROMPTS.md`

**Tasks:**
1. Branch `codex/phase-1-baseline-build-manual`
2. Fix `validate-contracts.mjs` → `ajv/dist/2020.js`
3. Create this manual
4. Report validation failures (do not patch without approval in P1)

**Tests:** `pnpm contracts:validate`

**Acceptance criteria:**
- [x] Branch exists
- [x] AJV Draft 2020-12
- [x] Manual exists
- [ ] Full validation green (deferred to Prompt 2)

---

# Prompt 2 — Contract Canary + Manual Correction (GUARDIAN) ✅

**Goal:** Green contract canary, bundle integrity proof, manual covers full v1.

**Files to read:**
- `packages/contracts/alarm_rules.schema.json`, `scenarios.schema.json`
- `packages/sample-data/demo-microgrid/alarm_rules.json`, `scenarios.json`
- `docs/BUILD_MANUAL_40_PROMPTS.md`, `docs/BUILD_ORDER.md`
- External: `Untitled document.md` — Idea 13, DAG-to-PLC Bridge, Success condition, MVP build order, Red-team answers

**Likely files touched:**
- `packages/sample-data/demo-microgrid/alarm_rules.json` (severity fix)
- `packages/contracts/scenarios.schema.json` (nullable expected fields)
- `docs/BUILD_MANUAL_40_PROMPTS.md` (full v1 coverage)

**Tasks:**
1. Fix `DC_BUS_LOW` severity `"high"` → `"critical"`
2. Allow `expected_situation` / `expected_root_cause` as `string | null` in scenarios schema
3. `pnpm contracts:validate` — all 5 PAIRS green
4. Terminal cross-ref + acyclicity check on demo bundle
5. Rewrite manual chunk map — no post-40 backlog for Incident Room, agents, PLC, hardening

**Tests:**
```bash
pnpm contracts:validate
node -e "/* bundle integrity one-liner */"
```

**Acceptance criteria:**
- [x] All 5 contract pairs pass
- [x] Bundle cross-refs OK, graph acyclic
- [x] Manual covers Chunks 0–13 in Prompts 1–40 (no post-40 backlog)
- [x] No runtime product logic implemented

---

# Prompt 3 — Monorepo CI Bootstrap (BUILD) ✅

**Goal:** Chunk 0 — workspace installs, CI, deploy skeleton.

**Files to read:** `pnpm-workspace.yaml`, `.github/workflows/ci.yml`, `deploy/docker/compose.full.yml`, `docs/BUILD_ORDER.md` Chunk 0

**Likely files touched:** `.github/workflows/ci.yml`, `deploy/docker/*.Dockerfile`, `apps/*/pyproject.toml`, root `package.json`, `apps/web/package.json`

**Tasks:**
1. `pnpm install` + `uv sync --extra dev` (in `apps/api`) succeed
2. Wire `contracts:validate` + `oracle` into CI; backend lint-only until tests exist
3. Compose skeleton validates (`pnpm compose:config`)
4. Keep root `pnpm-lock.yaml` (monorepo lockfile); legacy lock stays under `legacy/cliffords-ts/`

**Tests:**
```bash
pnpm install
pnpm contracts:validate
pnpm oracle
pnpm --filter @plantlens/web typecheck
pnpm --filter @plantlens/web build
pnpm --filter @plantlens/web test   # --passWithNoTests until Chunk 5+
cd apps/api && uv sync --extra dev
pnpm compose:config
```

**Scaffold notes (Prompt 3/4):**
- Web `main.tsx` is a stub (`export {}`) — typecheck/build pass with minimal bundle.
- API/gateway/agents need `[tool.hatch.build.targets.wheel] packages = [...]` for installability.
- API pytest skipped in CI until `apps/api/tests/test_*.py` files exist (Prompt 7+).
- Docker images build skeleton only; `api.Dockerfile` omits `migrations/` until Prompt 7.

**Acceptance criteria:**
- [x] CI runs contract validation + oracle + web typecheck/build
- [x] Workspace resolves cleanly
- [x] Root `pnpm-lock.yaml` committed/kept for frozen CI installs

---

# Prompt 4 — Workspace Bootstrap Guardian (GUARDIAN) ✅

**Goal:** Audit Prompt 3 bootstrap; fix only small config/doc issues.

**Files to read:** `PLANTLENS.md` §4–6, `legacy/README.md`, bootstrap files from Prompt 3

**Guardian checks:**
- [x] Root `pnpm-lock.yaml` exists (monorepo CI `--frozen-lockfile`)
- [x] `legacy/cliffords-ts/pnpm-lock.yaml` unchanged (separate oracle lock)
- [x] CI: Node 22, Python 3.12; API pytest conditional on test files
- [x] Docker Compose config valid
- [x] No production imports from `legacy/cliffords-ts` in `apps/`
- [x] Runtime stubs still `TODO(you)` — no product logic in Prompt 3
- [x] R1–R11 rules not violated by bootstrap work

**Verification commands (all must pass):**
```bash
pnpm install --frozen-lockfile
pnpm contracts:validate
pnpm --filter @plantlens/web typecheck
pnpm --filter @plantlens/web build
pnpm --filter @plantlens/web test
pnpm oracle
docker compose -f deploy/docker/compose.full.yml config
python -m ruff check apps/api/app
```

**Bootstrap fix applied:** web `build` uses `tsc -b --noEmit` (vite bundles; prevents `.js` artifacts in `src/`).

**Acceptance criteria:**
- [x] All verification commands pass
- [x] Layout matches architecture docs
- [x] Cliffords isolated as oracle

---

# Prompt 5 — Contract Schema Mirrors (BUILD) ✅

**Goal:** First typed contract mirrors (Pydantic + TypeScript) for **runtime** contracts so backend and frontend share the canonical schema spine. JSON Schema in `packages/contracts` remains canonical.

**Files to read:** `docs/CONTRACTS.md`, `packages/contracts/{tag_frame,alarm_rules,situation,calm_card,audit}.schema.json`, `apps/api/app/schemas/README.md`, `apps/web/src/app/schemas/README.md`

**Files created (runtime mirrors only — no authored plant/tag_map/causal_graph/scenarios yet):**
- Backend: `apps/api/app/schemas/{__init__,common,tag_frame,alarm,situation,calm_card,audit}.py`
- Frontend: `apps/web/src/app/schemas/{common,tagFrame,alarm,situation,calmCard,audit,index}.ts`
- Tests: `apps/api/tests/test_schema_contracts.py`

**Tasks:**
1. Pydantic v2 models mirror JSON Schema field names and enums (`Literal` for quality, source, severity, risk, etc.)
2. TypeScript type definitions (no Zod — not installed until Chunk 9)
3. `TagFrame.identity_key()` / `tagFrameIdentityKey()` helpers
4. No runtime engine behavior; no DB models

**Tests:** Valid/invalid `TagFrame`; demo `alarm_rules.json` via `AlarmRules`; severity enum rejection

**Acceptance criteria:**
- [x] `pnpm contracts:validate` passes
- [x] `pytest apps/api/tests` passes (10 tests after Prompt 6)
- [x] `ruff check apps/api/app apps/api/tests` passes
- [x] Web `typecheck` + `build` pass
- [x] JSON Schema canonical; mirrors do not replace it
- [x] Prompt 5 acceptance passed
- [ ] Authored contract mirrors (plant, tag_map, causal_graph, scenarios) — deferred to later prompts
- [ ] Zod mirrors — deferred to Chunk 9

---

# Prompt 6 — Schema Mirrors Guardian (GUARDIAN) ✅

**Goal:** Audit Prompt 5 runtime contract mirrors for fidelity to canonical JSON Schema; fix drift only.

**Tasks:**
1. Compare TagFrame, AlarmRules, Situation, CalmCard, AuditRecord mirrors vs `packages/contracts/*.schema.json`
2. Resolve Calm Card nested `first_signal` / `time_to_consequence` required-field drift
3. Expand `apps/api/tests/test_schema_contracts.py` (minimal Situation/CalmCard/AuditRecord, extra-field rejection)

**Calm Card schema note (product-correct tightening):** `packages/contracts/calm_card.schema.json` now declares nested `required` on `first_signal` (`alarm_id`, `asset_id`, `timestamp`, `message`) and `time_to_consequence` (`target_tag`, `target_label`, `state`) when each is present as an object (not `null`). Top-level fields remain optional. Matches `calm_card_engine` intent and existing Pydantic/TS mirrors.

**Acceptance criteria:**
- [x] Severity enum consistent: `info | warning | critical`
- [x] TagFrame quality/source enums match contract
- [x] Calm Card nested required fields aligned (schema + mirrors)
- [x] All guardian commands pass (`contracts:validate`, pytest, ruff, web typecheck/build)
- [x] Prompt 6 acceptance passed
- [ ] Zod mirrors — deferred to Chunk 9

---

# Prompt 7 — API Shell & Health (BUILD) ✅

**Goal:** Chunk 1a — FastAPI app factory, health endpoints.

**Files to read:** `apps/api/app/main.py`, `lifespan.py`, `settings.py`, `dependencies.py`, `docs/LIBRARIES.md`

**Files:** `main.py`, `lifespan.py`, `settings.py`, `routers/health.py`, `tests/test_api_health.py`

**Tasks:** `GET /healthz`, `GET /readyz`, pydantic-settings, CORS, `X-Request-ID` middleware, OpenAPI

**Tests:** `pytest apps/api/tests` (16 total); `uvicorn app.main:app --app-dir apps/api`

**Acceptance criteria:**
- [x] Health endpoints return 200
- [x] No runtime engines wired yet
- [x] Prompt 7 acceptance passed

---

# Prompt 8 — API Shell Guardian + Red-Team Gauntlet (GUARDIAN) ✅

**Goal:** Attack the Prompt 7 shell — prove thin, side-effect-free, origin-scoped CORS, no fake readiness.

**Red-team tests** (`apps/api/tests/test_api_health.py`):
- No import of `app.runtime|studio|db|auth|gateway|agents`
- Startup does not create `plantlens.db` / `compiled/`
- `/readyz` exposes only `status` + `active_plant_id`; no secrets
- Settings overrides (`ACTIVE_PLANT_ID`, `WEB_ORIGIN`) honored
- `X-Request-ID` on 200 and 404; not in response body
- CORS preflight allows configured origin, rejects evil origin
- OpenAPI lists only `/healthz` and `/readyz`
- Lifespan binds `app.state.settings` only; shutdown clean

**Acceptance criteria:**
- [x] `app.openapi()` succeeds
- [x] No runtime/DB/auth/studio imports at startup
- [x] Red-team gauntlet passes (33 API tests total)
- [x] Prompt 8 acceptance passed

---

# Prompt 9 — Database Layer (BUILD) ✅

**Goal:** Chunk 1b — SQLAlchemy async foundation, layer-separated ORM models, Alembic migrations.

**Files:** `app/db/{base,session}.py`, `app/db/models/*.py`, `migrations/{env.py,versions/0001_initial_database_layer.py}`, `tests/test_db_layer.py`, `tests/conftest.py`

**Tasks:**
- Authored (`authored_*`), compiled (`compiled_*`), event (`event_*`), derived (`derived_*`), audit (`audit_*`) tables
- Lifespan init/dispose engine; `get_db()` dependency; `/readyz` database probe (no secret leakage)
- No migrations at startup; no `create_all()` substitute

**Tests:** `alembic upgrade head`; session lifecycle; layer separation; import side-effect red-team (43 API tests)

**Acceptance criteria:**
- [x] Migrations apply
- [x] Authored ≠ derived tables (distinct prefixes + `LAYER_TABLES`)
- [x] Prompt 9 acceptance passed

---

# Prompt 10 — Database Guardian + Failure Hunt (GUARDIAN) ✅

**Goal:** Audit Prompt 9 DB layer — layer mapping, migration integrity, async lifecycle, boundaries.

**Guardian tests** (`test_db_layer.py` additions):
- `TABLE_LAYER_MAP` — 8 tables across authored/compiled/event/derived/audit
- Authored columns exclude runtime/event/audit fields; event tables have no `updated_at`
- Alembic upgrade + downgrade on temp SQLite; no credentials/absolute paths in migration
- FastAPI startup does not create schema without migration; `get_db` closes sessions
- `/healthz` unchanged; `/readyz` still secret-free

**Acceptance criteria:**
- [x] Three-layer (+ compiled/audit) mapping verified
- [x] No derived state in authored tables
- [x] Prompt 10 acceptance passed (55 API tests)

---

# Prompt 11 — Auth & RBAC (BUILD)

**Goal:** Chunk 1c — JWT/OIDC, role gates.

**Files to read:** `apps/api/app/auth/README.md`

**Likely files touched:** `auth/*.py`, `dependencies.py`

**Tasks:** Roles: viewer/engineer/operator/maintenance/admin/agent; `Depends()` guards; agent cannot approve

**Acceptance criteria:**
- [x] Unauthenticated writes rejected
- [x] Agent role blocked from approval

---

# Prompt 12 — Auth Guardian (GUARDIAN)

**Goal:** Red-team auth boundaries.

**Tasks:** No bypass endpoints, no hardcoded secrets, dev vs prod config documented.

**Acceptance criteria:**
- [x] Auth checklist passes

---

# Prompt 13 — Audit Hash-Chain (BUILD)

**Goal:** Chunk 1d — tamper-evident append-only ledger.

**Files to read:** `apps/api/app/services/audit_chain.py`, `legacy/cliffords-ts/.../auditStore.ts`, `packages/contracts/audit.schema.json`

**Likely files touched:** `services/audit_chain.py`, `db/models/audit.py`

**Tasks:** `hash_self = SHA256(canonical_json + hash_prev)`; verify on read

**Tests:** Append round-trip; tamper detection

**Acceptance criteria:**
- [x] Chain verify catches tamper
- [x] Oracle semantics preserved

---

# Prompt 14 — Audit Guardian (GUARDIAN)

**Goal:** Audit correctness vs cliffords oracle.

**Tasks:** Deterministic canonical JSON; concurrent append assumptions documented.

**Acceptance criteria:**
- [x] Hash chain tests pass

---

# Prompt 15 — Simulator Gateway (BUILD)

**Goal:** Chunk 2 — scenario playback → `TagFrame` WebSocket stream.

**Files to read:** `apps/api/app/runtime/simulator/*`, `websocket_hub.py`, `runtime_state.py`, `packages/contracts/tag_frame.schema.json`, `scenarios.json`

**Likely files touched:** `simulator/scenario_runner.py`, `simulator_gateway.py`, `routers/simulator.py`, `ws.py`, `schemas/tag_frame.py`

**Tasks:** Play `events[]` on timeline; `POST .../scenarios/{id}/start`; WS broadcast; support `scn_rs485_dropout` STALE fault

**Tests:** Start `scn_motor_overload`; WS receives ordered frames

**Acceptance criteria:**
- [x] TagFrame matches contract
- [x] Simulator-first; source-agnostic downstream

---

# Prompt 16 — Simulator Guardian (GUARDIAN)

**Goal:** Determinism and negative scenarios.

**Tasks:** Same scenario → same frames; validate frames against schema; `scn_rs485_dropout` sets STALE

**Acceptance criteria:**
- [x] Determinism test passes
- [x] Negative scenario behaves correctly

---

# Prompt 17 — Alarm Engine (BUILD)

**Goal:** Chunk 3a — thresholds, debounce, deadband, ack.

**Files to read:** `apps/api/app/runtime/alarm_engine.py`, `alarm_rules.schema.json`, `alarm_rules.json`

**Likely files touched:** `alarm_engine.py`, `schemas/alarm.py`

**Tasks:** Ops `>`, `<`, `>=`, `bool_true`, warning/critical bands; `for_ms`, deadband, latching

**Tests:** Hero scenario yields 5 expected alarms; `DC_BUS_LOW` severity `critical`

**Acceptance criteria:**
- [x] Expected alarms fire in hero scenario
- [x] STALE tags do not false-alarm

---

# Prompt 18 — Alarm Engine Guardian (GUARDIAN)

**Goal:** Alarm edge cases and enum compliance.

**Tasks:** Shelve, ack-required, severity enum only `info|warning|critical`

**Acceptance criteria:**
- [x] No ML in alarm path

---

# Prompt 19 — DAG Runtime (BUILD)

**Goal:** Chunk 3b — reverse traversal, temporal window, ranking.

**Files to read:** `apps/api/app/runtime/dag_runtime.py`, `causal_graph.schema.json`, `causal_graph.json`, `docs/ARCHITECTURE.md`

**Likely files touched:** `dag_runtime.py`

**Tasks:** Reverse adjacency; `approved: true` only; lag window; O(V+E); never mutate graph

**Tests:** Motor overload ranks `MTR-301` #1

**Acceptance criteria:**
- [x] Deterministic ranking
- [x] Unapproved edges excluded

---

# Prompt 20 — DAG Runtime Guardian (GUARDIAN)

**Goal:** DAG safety invariants.

**Tasks:** Property test same input → same output; late event outside lag excluded

**Acceptance criteria:**
- [x] R2 satisfied with evidence

---

# Prompt 21 — Situation, Calm Card, Projection (BUILD)

**Goal:** Chunk 3c–e — group alarms, build Calm Card, Time-to-Consequence, asset status.

**Files to read:** `situation_engine.py`, `calm_card_engine.py`, `asset_status.py`, `projection.py`, `situation.schema.json`, `calm_card.schema.json`, `action_envelope.yaml`

**Likely files touched:** All four runtime modules + schemas

**Tasks:**
1. ONE Situation for hero scenario
2. Calm Card: first signal, evidence chain, blocked actions from envelope
3. Asset status derivation
4. Projection advisory only (never interlock)

**Tests:** Integration test `scn_motor_overload` → Situation + Calm Card

**Acceptance criteria:**
- [x] Root `MTR-301`, evidence current→speed→bus→inverter
- [x] `scn_rs485_dropout` → no situation (null expected)

---

# Prompt 22 — Runtime Core Guardian (GUARDIAN)

**Goal:** Hero + negative scenario backend E2E.

**Tasks:** Assert `expected_situation`, `expected_root_cause`, `expected_alarms` per scenario; no invented readings

**Acceptance criteria:**
- [x] All scenarios in bundle pass assertions
- [x] `docs/DEMO_SCENARIO.md` claims match

---

# Prompt 23 — Studio Compiler (BUILD)

**Goal:** Chunk 4 — forms/contracts in → `compiled_hmi.json` + runtime indexes out.

**Files to read:** `apps/api/app/studio/compiler.py`, `validators.py`, `graph_checks.py`, `compiler_steps/`, `hmi_view_model.schema.json`

**Likely files touched:** `studio/*.py`, `routers/compiler.py`

**Tasks:** Load bundle; cross-ref validate; cycle check; HMI projection; fail-closed compile; hash + version

**Tests:** `POST /api/compiler/compile` on demo bundle; bad ref → structured error with `fix`

**Acceptance criteria:**
- [x] Demo compiles successfully
- [x] Cycle/unknown ref rejected

---

# Prompt 24 — Compiler Guardian (GUARDIAN)

**Goal:** "Matrix compiles the interface" invariants.

**Tasks:** Output validates against `hmi_view_model.schema.json`; compile audited; runtime indexes generated

**Acceptance criteria:**
- [x] Compiled output not hand-editable source
- [x] R1/R4 compile authority

---

# Prompt 25 — Web Shell & Runtime Store (BUILD)

**Goal:** Chunk 5a — React 19, Vite, API client, WebSocket, zustand.

**Files to read:** `apps/web/src/main.tsx`, `api/client.ts`, `api/ws.ts`, `app/store/runtime.ts`, `features/plant-runtime/RuntimeHMI.tsx`, `docs/DESIGN_SYSTEM.md`

**Likely files touched:** Web shell files, `tokens.css`

**Tasks:** TanStack Query for REST; zustand for WS snapshot; RuntimeHMI layout; reconnect stub

**Tests:** WS connects; tags update live

**Acceptance criteria:**
- [x] State split correct (Query vs zustand)
- [x] ISA-101 tokens applied

---

# Prompt 26 — Web Shell Guardian (GUARDIAN)

**Goal:** Frontend architecture audit.

**Tasks:** Types from contracts/OpenAPI; `useReducedMotion`; no diagnosis logic in FE

**Acceptance criteria:**
- [x] No giant global store

---

# Prompt 27 — 2D Plant Map (BUILD)

**Goal:** Chunk 5b — SVG schematic map, status halos, causal path overlay.

**Files to read:** `apps/web/src/features/maps2d/*`, `docs/DESIGN_SYSTEM.md`, `docs/DEMO_SCENARIO.md`

**Likely files touched:** `PlantMap2D.tsx`, `PlantNode.tsx`, `PlantEdge.tsx`, `CausalPathOverlay.tsx`

**Tasks:** Render from compiled HMI + runtime store; status color+text+icon; causal path numbers

**Tests:** Motor overload → motor red, bus/inverter amber, path 1-2-3

**Acceptance criteria:**
- [x] 2D is default operator surface
- [x] Updates < 150ms after WS frame

---

# Prompt 28 — 2D Map Guardian (GUARDIAN)

**Goal:** Projection-only map audit.

**Tasks:** No local plant model; WCAG status encoding; works without 3D chunk

**Acceptance criteria:**
- [x] R1/R8 satisfied

---

# Prompt 29 — Calm Card UI & Raw Alarms (BUILD)

**Goal:** Chunk 6 — decision layer beside map.

**Files to read:** `features/calm-card/CalmCard.tsx`, `features/alarms/RawAlarmTable.tsx`, Idea 6 in `Untitled document.md`

**Likely files touched:** Calm card + alarm components

**Tasks:** Evidence chain, first signal, blocked actions, raw alarm disclosure with grouping receipt; ack → audit

**Tests:** Situation renders Calm Card; expand raw alarms; ack writes audit

**Acceptance criteria:**
- [x] Glass-box suppression with receipts
- [x] No invented readings in UI

---

# Prompt 30 — Calm Card Guardian (GUARDIAN)

**Goal:** Idea 6 success conditions + red-team.

**Tasks:** No autonomous actions; blocked actions explained; escalation path to Incident Room stubbed

**Acceptance criteria:**
- [x] Idea 6 success condition met

---

# Prompt 31 — Studio Forms (BUILD)

**Goal:** Chunk 9a — forms-first authoring (R4).

**Files to read:** `features/studio-forms/StudioFormShell.tsx`, `packages/contracts/*`, Idea 2 validation rules

**Likely files touched:** `studio-forms/*`, `app/schemas/*.ts`

**Tasks:** Forms for Asset, Tag, Alarm, CausalEdge, Role, Action; Zod validation; ValidationPanel with `fix` hints

**Tests:** Author demo plant in forms → validate passes → compile

**Acceptance criteria:**
- [x] Forms are source of truth
- [x] Industrial calm UI (no bounce)

---

# Prompt 32 — Studio Forms Guardian (GUARDIAN)

**Goal:** Forms authority audit (Idea 2 success condition).

**Tasks:** Form edit updates canonical JSON; graph cannot add schema fields forms lack

**Acceptance criteria:**
- [x] R4 enforced

---

# Prompt 33 — React Flow Projection (BUILD)

**Goal:** Chunk 9b — spatial projection editor only.

**Files to read:** `features/studio-graph/StudioCanvas.tsx`, `features/hmi-preview/CompilePreview.tsx`

**Likely files touched:** `StudioCanvas.tsx`, `CompilePreview.tsx`

**Tasks:** React Flow reads/writes canonical JSON; edge `approved` toggle; compile diff preview; cycle rejected at compile

**Tests:** Graph edit → validate → compile → 2D preview matches

**Acceptance criteria:**
- [x] React Flow is projection only
- [x] Idea 1 subordinate to Idea 2

---

# Prompt 34 — React Flow Guardian (GUARDIAN)

**Goal:** Graph projection cannot become source of truth.

**Tasks:** Attempt free-form invalid edge → compile fails; coords don't override form data

**Acceptance criteria:**
- [x] Invalid states unreachable via graph alone

---

# Prompt 35 — Gateway Read Path (BUILD)

**Goal:** Chunk 7 — Modbus/RS485 poller → same `TagFrame`.

**Files to read:** `apps/gateway/gateway/*`, `tag_map.json`, `docs/LIBRARIES.md` (pymodbus), V1 12V hardware docs

**Likely files touched:** `modbus_poller.py`, `register_codec.py`, `serial_client.py`, `publish.py`

**Tasks:** Poll per tag_map; decode scale/unit; quality stamps; STALE on timeout; **read-only** (no writes)

**Tests:** pymodbus simulated server → TagFrames match simulator shape

**Acceptance criteria:**
- [ ] R3/R7/R10 satisfied
- [ ] Gateway isolated process

---

# Prompt 36 — Gateway Guardian (GUARDIAN)

**Goal:** Gateway isolation and interchangeability.

**Tasks:** Gateway crash doesn't kill API; frames schema-valid; no DAG/LLM in gateway

**Acceptance criteria:**
- [ ] Simulator and gateway interchangeable downstream

---

# Prompt 37 — 3D Lazy Map (BUILD)

**Goal:** Chunk 8 — R3F enhancement, subordinate to 2D.

**Files to read:** `features/maps3d/PlantMap3D.tsx`, `docs/LIBRARIES.md` (three, R3F)

**Likely files touched:** `PlantMap3D.tsx`, lazy route

**Tasks:** Lazy chunk < 700KB gzipped; same runtime store; status glow; causal path 3D; 2D/3D toggle

**Tests:** Build analyze chunk size; toggle preserves state

**Acceptance criteria:**
- [ ] 3D not in initial bundle
- [ ] WebGL fail → 2D fallback message

---

# Prompt 38 — 3D Map Guardian (GUARDIAN)

**Goal:** Idea 5 success conditions.

**Tasks:** No separate 3D data model; reduced motion honored; 400ms camera focus

**Acceptance criteria:**
- [ ] R8 + Idea 5 success condition met

---

# Prompt 39 — Incident Room, Agents, PLC Bridge & Hardening (BUILD)

**Goal:** Chunks 10–13 — Incident Room, draft-only agents, DAG-to-PLC advisory bridge, hardening, deployment.

**Files to read:**
- `apps/agents/*`, `apps/api/app/routers/agents.py` (create), `features/agents/AgentConsole.tsx`
- `apps/gateway/gateway/plc_bridge/*`, `plc_output_map.json`
- `deploy/docker/*`, `docs/OPS_RUNBOOK.md`, `docs/DESIGN_SYSTEM.md` (performance budgets)
- External `Untitled document.md`: DAG-to-PLC MVP build order (10 steps), Red-team answers

**Likely files touched:**
- `apps/agents/agents/main.py`, `registry.py`, `prompts/`
- `apps/api/app/routers/agents.py`
- `plc_bridge/diagnosis_encoder.py`, `advisory_writer.py`, `action_request_writer.py`, `plc_feedback_reader.py`, `bridge_service.py`
- `deploy/docker/*.Dockerfile`, `compose.full.yml`, observability config

**Tasks:**

*Incident Room (Chunk 10, Idea 13):*
1. Escalate from Calm Card → Incident Room opens with root asset, evidence, checklist
2. Timeline hash-chained; status/checklist/note append audit events
3. Evidence-first UX — not chat-first

*Agents (Chunk 11, R5):*
1. LangGraph draft workflow: propose causal edge / rule / note
2. Approval queue API — human approves → writes contract + audit
3. Agent cannot write hardware, cannot auto-approve, cannot mutate live graph

*DAG-to-PLC Advisory Bridge (Chunk 12, R9):*
Follow MVP build order from idea-doc:
1. DAG runtime stays read-only
2. `diagnosis_encoder.py` — situation → register codes
3. `plc_output_map.json` — advisory register map
4. `advisory_writer.py` — write on Situation change only, ≤2s
5. PLC feedback/debug panel (web status strip)
6. `action_envelope.yaml` enforcement on requests
7. Action request registers (handshake, not direct control)
8. `plc_feedback_reader.py` — accept/deny status
9. Test operator-approved request; PLC interlocks decide
10. **Never** DAG → coil → stop motor

*Hardening (Chunk 13):*
1. Scenario test matrix: `scn_pv_shade`, `scn_rs485_dropout`, late data, alarm flood, gateway outage
2. Degraded modes: WS reconnect, stale badge, 2D fallback when WebGL fails
3. OTEL span chain: ingest → evaluate → publish
4. Prometheus metrics: ingest rate, WS latency
5. Dockerfiles production-ready; `compose.full.yml` runs full stack
6. Recorded playback fallback for demos

**Tests:**
```bash
# Agent drafts edge → approval queue → audit on approve
# Situation change → advisory registers written
# Action request → PLC accept/deny feedback
cd apps/api && uv run pytest -q  # full scenario matrix
docker compose -f deploy/docker/compose.full.yml up --build
```

**Acceptance criteria:**
- [ ] Idea 13 success condition: Incident Room evidence-first, timeline hash-chained
- [ ] Agent draft lands in queue; approval required (R5)
- [ ] Advisory registers written on Situation change (R9)
- [ ] Action request handshake only — PLC decides (R9, R11)
- [ ] No direct hardware control from PlantLens
- [ ] All demo scenarios pass assertions
- [ ] V1 hardware: 12V DC / generic PLC, not AC/VFD (R10)
- [ ] Hardening: degraded modes, observability, deploy stack runs

---

# Prompt 40 — Final v1 System Guardian (GUARDIAN)

**Goal:** End-to-end v1 verification — full BUILD_ORDER Chunks 0–13 complete.

**Files to read:** `PLANTLENS.md` §2, `docs/DEMO_SCENARIO.md`, `docs/BUILD_ORDER.md`, `docs/OPS_RUNBOOK.md`

**Tasks:**
1. **Contract canary:** `pnpm contracts:validate` — all 5 pairs
2. **Oracle:** `pnpm oracle` — cliffords regression
3. **Backend:** full pytest suite including scenario matrix
4. **Frontend:** `pnpm --filter @plantlens/web build` — chunk budgets
5. **Full stack demo:**
   - Compile demo bundle
   - Run `scn_motor_overload` → 2D map + Calm Card
   - Escalate → Incident Room
   - Agent draft → approve flow
   - Advisory registers update on Situation
   - 2D/3D toggle works
6. **Rule audit R1–R11:** file evidence for each non-negotiable rule
7. **Red-team checklist** (from DAG-to-PLC doc):
   - "Can DAG accidentally stop the motor?" → No
   - "What if DAG diagnosis is wrong?" → Raw alarms visible, explainable path
   - "What if comms fails?" → TTL, stale requests rejected, PLC independent
   - "Can software bypass E-stop?" → No (R11)

**Tests:**
```bash
pnpm contracts:validate
pnpm oracle
cd apps/api && uv run pytest -q
pnpm --filter @plantlens/web build
docker compose -f deploy/docker/compose.full.yml config
# Manual: hero demo rehearsal + recorded fallback exists
```

**Acceptance criteria:**
- [ ] 5 alarms → 1 Calm Card → correct root `MTR-301` (hero demo)
- [ ] `scn_rs485_dropout` → no situation, degraded UI
- [ ] All BUILD_ORDER chunks 0–13 have working "done" tests
- [ ] R1–R11 verified with evidence
- [ ] PlantLens v1 is demo-ready and deployment-ready
- [ ] No unresolved P0 issues

---

## Appendix A — CI commands reference

```bash
pnpm contracts:validate
pnpm oracle
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build
cd apps/api && uv run pytest -q
cd apps/api && uv run uvicorn app.main:app --reload
docker compose -f deploy/docker/compose.full.yml up --build
```

## Appendix B — DAG-to-PLC MVP build order (Chunk 12 checklist)

1. DAG runtime read-only
2. `diagnosis_encoder.py`
3. `plc_output_map.json`
4. `advisory_writer.py`
5. Advisory writes on Situation change only
6. PLC feedback/debug panel
7. `action_envelope.yaml` enforcement
8. Action request registers
9. `plc_feedback_reader.py`
10. Operator-approved request test — PLC interlocks decide

**Never:** DAG → coil → stop motor.

## Appendix C — External research anchors

| Topic | Source |
|-------|--------|
| Ideas 1–6, 9, 13 | `Untitled document.md` |
| DAG-to-PLC safety, red-team | `Untitled document.md` § DAG-to-PLC Bridge |
| Python backend, validation rules | `deep-research-report (2).md` |
| V1 12V DC hardware | `PlantLens_V1_Generic_PLC_Circuit_Diagram_Wire_by_Wire.md` |

---

*Prompt 2 revision: full v1 in 40 prompts; contract canary green; nullable scenario expectations for degraded tests.*
</think>
Fixing the manual ending: Prompts 39–40 should cover agents, PLC bridge, hardening, and final E2E.
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
StrReplace