# Prompt 0 — Final Cleanup Report

**Branch:** `cleanup/prompt-0-repo-deconfusion`  
**Date:** 2026-06-22

## 1. Branch name

`cleanup/prompt-0-repo-deconfusion`

## 2. Files deleted

| Path |
|------|
| `bms_3d.html` |
| `bms_3d_verify.png` |
| `bms_3d_verify_2d.png` |
| `bms_server.py` (archived copy retained) |
| `hmi_probe.py` |
| `modbus_scout.py` |
| `terminals/.next-id` |
| `docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` (moved to archive) |
| `docs/OFFLINE_INGESTION_CHUNK_1A_FINAL.md` (moved to archive) |

## 3. Files archived

| From | To |
|------|-----|
| `docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` | `docs/archive/obsolete-plans/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` |
| `docs/OFFLINE_INGESTION_CHUNK_1A_FINAL.md` | `docs/archive/obsolete-plans/OFFLINE_INGESTION_CHUNK_1A_FINAL.md` |
| `bms_server.py` | `docs/archive/legacy-notes/bms_server.py` |

## 4. Files kept despite suspicion

| Path | Why kept |
|------|----------|
| `mcps/pencil/*` | Cursor MCP tool descriptors; agent tooling, not product runtime |
| `legacy/cliffords-ts/` | Frozen regression oracle per PLANTLENS.md |
| `features/plant-runtime/TopStrip.tsx` | Superseded duplicate; documented, not deleted |
| `features/studio-graph/AssemblyStudioPage.tsx` | Future studio route; tests reference it |
| `apps/process-studio/` | Local untracked; not in git |

## 5. Current source-of-truth docs

1. `PLANTLENS.md`
2. `FINAL_READY_STATE.md`
3. `AGENTS.md`
4. `docs/BUILD_ORDER.md`
5. `docs/BUILD_MANUAL_40_PROMPTS.md`
6. `docs/DESIGN_SYSTEM.md`
7. `docs/ALGORITHMS.md`
8. `docs/DEMO_SCENARIO.md`
9. `docs/ARCHITECTURE.md`
10. `docs/AGENT_BOUNDARY.md`
11. `docs/CONTRACTS.md`
12. `docs/OFFLINE_INGESTION.md`

## 6. Current test results

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm contracts:validate` | PASS |
| `python -m pytest apps/api/tests -q` | **554 pass, 2 fail** (pre-existing; see KNOWN_FAILURES) |
| `pnpm --filter @plantlens/web typecheck` | PASS |
| `pnpm --filter @plantlens/web test` | PASS (80 tests) |
| `pnpm --filter @plantlens/web build` | PASS |

## 7. Remaining risks

* Two API guardian tests fail from repo root (documented; not cleanup-caused).
* `TopStrip.tsx` duplicate may confuse agents — noted in frontend unused report.
* Router mounts all paths to `RuntimeHMI`; studio page components exist but are not separately routed.
* `apps/web/public/` is untracked in working tree — verify before Prompt 1 if assets are needed.
* `mcps/pencil/` in git may look like product code — agents should read `AGENTS.md` first.

## 8. Recommendation for Prompt 1

**Prompt 1 is safe to run** for frontend-heavy work:

1. Read `AGENTS.md` → `PLANTLENS.md` → `docs/BUILD_MANUAL_40_PROMPTS.md` (Prompt 1 section).
2. Do **not** read `docs/archive/` unless reviewing history.
3. Fix the two pre-existing API test failures if Prompt 1 guardian requires full green pytest from repo root.
4. Start from `packages/contracts` and `packages/sample-data/demo-microgrid` — unchanged by cleanup.
5. No product behavior was modified; runtime HMI, maps, and contracts are intact.