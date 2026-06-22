# Prompt 0 — Known Failures

**Date:** 2026-06-22  
**Status:** **RESOLVED** in Prompt 0.1 (test-only fixes)

## Previously failing (now fixed)

### 1. `test_only_expected_shell_and_chunk_routes_mounted`

**File:** `apps/api/tests/test_api_health.py`  
**Was:** `unexpected route in OpenAPI: /api/library/compatibility-matrix`  
**Fix:** Added `/api/library/` to `ALLOWED_API_PREFIXES`.

### 2. `test_pipeline_no_runtime_side_effects`

**File:** `apps/api/tests/unit/ingest/test_drafts_reports_pipeline.py`  
**Was:** `FileNotFoundError: app\ingest\pipeline.py` when pytest run from repo root  
**Fix:** Resolved paths via `Path(__file__).resolve().parents[3]` (`API_ROOT`, `PIPELINE_SOURCE`, `INGEST_ROOT`).

## Current verification (Prompt 0.1)

| Command | Result |
|---------|--------|
| `python -m pytest apps/api/tests -q` | PASS (556 tests) |
| `pnpm contracts:validate` | PASS |
| `pnpm --filter @plantlens/web typecheck` | PASS |
| `pnpm --filter @plantlens/web test` | PASS (80 tests) |
| `pnpm --filter @plantlens/web build` | PASS |