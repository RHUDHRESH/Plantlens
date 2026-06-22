# Prompt 0 — Repository Inventory

**Branch:** `cleanup/prompt-0-repo-deconfusion`  
**Date:** 2026-06-22

## A. Source code actively used

| Area | Path | Role |
|------|------|------|
| API monolith | `apps/api/app/` | FastAPI: runtime, studio, ingest, incidents, auth, audit, hmi, library |
| Web HMI | `apps/web/src/` | React 19 runtime HMI, maps, Calm Card, studio features |
| Gateway | `apps/gateway/` | Read-only Modbus/RS485 poller |
| Agents | `apps/agents/` | Draft-only AI service |
| Legacy oracle | `legacy/cliffords-ts/` | Frozen TS ingestion regression oracle |
| Scripts | `scripts/validate-contracts.mjs`, `scripts/generate_component_library.py` | CI validation, library generation |

## B. Tests actively used

| Area | Count | Notes |
|------|-------|-------|
| `apps/api/tests/` | 70+ files | Unit, integration, scenario regression, auth red-team |
| `apps/web/src/**/*.test.*` | 26+ tests | Runtime HMI, maps, calm card, studio |

## C. Contracts and schemas

| Path | Files |
|------|-------|
| `packages/contracts/` | 16 JSON Schemas + README (plant, tag_map, alarm_rules, causal_graph, scenarios, calm_card, situation, tag_frame, runtime_evidence, incident, audit, agent_draft, action_envelope, hmi_view_model, component_library, plant_assembly) |
| `apps/api/app/schemas/` | Pydantic mirrors |
| `apps/web/src/api/types.ts` | TS types from contracts |

## D. Sample data / demo fixtures

| Path | Role |
|------|------|
| `packages/sample-data/demo-microgrid/` | Hero demo bundle (plant, tags, alarms, graph, scenarios, actions) |
| `packages/sample-data/component-library/` | Standard components + demo assembly |
| `apps/api/tests/fixtures/` | HMI and ingest test fixtures |

## E. Current docs (architecture source of truth)

| Doc | Status |
|-----|--------|
| `PLANTLENS.md` | Master build document |
| `FINAL_READY_STATE.md` | Demo-ready verification |
| `AGENTS.md` | Agent instructions (created Prompt 0) |
| `docs/BUILD_ORDER.md` | Chunk sequence |
| `docs/BUILD_MANUAL_40_PROMPTS.md` | 40-prompt execution manual |
| `docs/DESIGN_SYSTEM.md` | UI tokens and HMI rules |
| `docs/ALGORITHMS.md` | Deterministic pipeline |
| `docs/DEMO_SCENARIO.md` | Hero scenario matrix |
| `docs/ARCHITECTURE.md` | Service boundaries |
| `docs/AGENT_BOUNDARY.md` | Agent constraints |
| `docs/CONTRACTS.md` | Schema spine |
| `docs/OFFLINE_INGESTION.md` | Current offline ingest doc |
| `docs/RUNTIME_CONTRACTS.md` | REST/WS surface |
| `docs/OPS_RUNBOOK.md` | Operations |
| `docs/LIBRARIES.md` | Dependency guide |

## F. Old docs / stale plans (archived in Prompt 0)

| Original | Archive location |
|----------|------------------|
| `docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` | `docs/archive/obsolete-plans/` |
| `docs/OFFLINE_INGESTION_CHUNK_1A_FINAL.md` | `docs/archive/obsolete-plans/` |
| `bms_server.py` | `docs/archive/legacy-notes/` |

## G. Generated files (should not be committed)

| Pattern | Status |
|---------|--------|
| `node_modules/` | Gitignored |
| `apps/web/dist/` | Gitignored (local build output exists) |
| `__pycache__/`, `*.pyc` | Gitignored |
| `apps/api/compiled/` | Gitignored |
| `*.log`, `agent-tools/`, `terminals/` | Gitignored (Prompt 0) |
| `apps/web/tsconfig.tsbuildinfo` | Local only; not in git |

## H. Empty / placeholder / TODO-only

| Item | Notes |
|------|-------|
| `packages/sample-data/README.md` | Has `TODO(you)` for new scenarios — intentional, keep |
| `docs/archive/research/` | Empty placeholder dir |
| `docs/archive/old-prompts/` | Empty placeholder dir |

## I. Duplicate docs

| Pair | Resolution |
|------|------------|
| `OFFLINE_INGESTION.md` vs chunk 1A plan/final | Kept current; archived chunk docs |
| `TopStrip.tsx` vs `RuntimeTopStrip.tsx` | Kept both; documented supersession |
| `README.md` vs `PLANTLENS.md` | README now points to PLANTLENS; no content duplication |

## J. Dead imports / unreachable code

See `PROMPT_0_FRONTEND_UNUSED_REPORT.md` and `PROMPT_0_BACKEND_UNUSED_REPORT.md`. No deletions applied.

## K. README files

| README | Status |
|--------|--------|
| Root `README.md` | Updated — points to source of truth |
| `docs/README.md` | Updated — warns about archive |
| `docs/archive/README.md` | Created |
| Per-folder READMEs under `apps/`, `packages/` | Current; kept |

## L. Lockfiles and package manager files

| File | Role |
|------|------|
| `pnpm-lock.yaml` | Root Node lockfile |
| `pnpm-workspace.yaml` | Monorepo workspace |
| `apps/api/pyproject.toml`, `apps/api/uv.lock` | Python API |
| `legacy/cliffords-ts/pnpm-lock.yaml` | Isolated oracle |

## M. Deployment files

| Path | Role |
|------|------|
| `deploy/docker/compose.full.yml` | Full stack compose |
| `deploy/docker/*.Dockerfile` | api, web, gateway, agents images |
| `deploy/docker/nginx.conf` | Web proxy |
| `.github/workflows/ci.yml` | CI pipeline |

## N. Suspicious / notable

| Item | Disposition |
|------|-------------|
| `mcps/pencil/` | Cursor MCP tool JSON — agent tooling, not product; **kept** |
| `apps/process-studio/` | Local untracked experiment — **not in git** |
| Root `bms_*`, probe scripts | **deleted/archived** in Prompt 0 |
| `apps/web/public/` | Untracked (git status) — local assets; not part of Prompt 0 commit unless already tracked |