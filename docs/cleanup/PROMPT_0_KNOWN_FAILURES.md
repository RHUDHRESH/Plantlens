# Prompt 0 — Known Failures (pre-existing)

**Date:** 2026-06-22  
**Not caused by Prompt 0 cleanup** (docs/archive/deletions only).

## `python -m pytest apps/api/tests -q`

**Result:** 554 passed, **2 failed**

### 1. `test_only_expected_shell_and_chunk_routes_mounted`

**File:** `apps/api/tests/test_api_health.py`  
**Error:** `unexpected route in OpenAPI: /api/library/compatibility-matrix`

**Cause:** Component library routes were added under `/api/library/*` but `ALLOWED_API_PREFIXES` in the guardian test was not updated to include `/api/library`.

**Fix (Prompt 1+):** Add `/api/library` to `ALLOWED_API_PREFIXES` or document library routes as intentional.

### 2. `test_pipeline_no_runtime_side_effects`

**File:** `apps/api/tests/unit/ingest/test_drafts_reports_pipeline.py`  
**Error:** `FileNotFoundError: app\ingest\pipeline.py`

**Cause:** Test reads `Path("app/ingest/pipeline.py")` with a cwd-relative path. Fails when pytest is run from repo root (Prompt 0 required command). Works when cwd is `apps/api`.

**Fix (Prompt 1+):** Use `Path(__file__).resolve().parents[...]` or `importlib` to locate `pipeline.py` regardless of cwd.

## Passing checks

| Command | Result |
|---------|--------|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm contracts:validate` | PASS |
| `pnpm --filter @plantlens/web typecheck` | PASS |
| `pnpm --filter @plantlens/web test` | PASS (80 tests) |
| `pnpm --filter @plantlens/web build` | PASS |