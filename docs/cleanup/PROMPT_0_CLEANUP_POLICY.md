# Prompt 0 — Cleanup Policy

**Branch:** `cleanup/prompt-0-repo-deconfusion`  
**Date:** 2026-06-22

## KEEP

* Current source code under `apps/api`, `apps/web`, `apps/gateway`, `apps/agents` when referenced by build/test/runtime
* `packages/contracts`
* `packages/sample-data/demo-microgrid`
* All tests under `apps/api/tests` and `apps/web` test files
* `pyproject.toml`, `package.json`, lockfiles, workspace files
* `deploy/docker` files
* `legacy/cliffords-ts/` (frozen oracle)
* `PLANTLENS.md`
* `FINAL_READY_STATE.md`
* `docs/BUILD_ORDER.md`
* `docs/BUILD_MANUAL_40_PROMPTS.md`
* `docs/DESIGN_SYSTEM.md`
* `docs/ALGORITHMS.md`
* `docs/DEMO_SCENARIO.md`
* `docs/ARCHITECTURE.md`
* `docs/AGENT_BOUNDARY.md`
* `docs/CONTRACTS.md`
* `docs/OFFLINE_INGESTION.md` (current operational doc for offline ingest)
* `docs/RUNTIME_CONTRACTS.md`, `docs/OPS_RUNBOOK.md`, `docs/LIBRARIES.md`
* `mcps/pencil/` (Cursor MCP tool descriptors — agent tooling, not product runtime)

## ARCHIVE

* Old research dumps useful but not operational
* Past prompt logs and chunk completion reports
* Abandoned implementation plans superseded by current docs
* Pre-PlantLens hardware experiments (BMS/Modbus scratch)
* Any file with useful context but high agent-confusion risk

**Archive locations:** `docs/archive/research/`, `old-prompts/`, `obsolete-plans/`, `legacy-notes/`

## DELETE

* Empty files
* Duplicate generated build artifacts committed to git
* Accidental `.js` emitted into `src/` from TypeScript builds
* `__pycache__`, `.pyc`, `.DS_Store`, committed `node_modules`, `dist/`, cache artifacts
* Paste/temp/scratch files with no unique PlantLens information
* Obsolete placeholders not imported and containing no useful context
* Local logs, local sqlite DBs (unless explicit sample fixtures), local `.env`

## NEVER DELETE

* Anything imported by active code
* Anything referenced by tests
* Anything referenced by `docs/BUILD_ORDER.md` or `PLANTLENS.md`
* Any schema/contract/sample data
* Any file required for install/build/test
* Audit, security, runtime, gateway, simulator, compiler, scenario, or Calm Card logic

## When unsure

Archive instead of delete. Document the decision in `docs/cleanup/`.