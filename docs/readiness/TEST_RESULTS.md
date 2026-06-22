# Test Results

Audit date: 2026-06-22  
Branch: `release/final-readiness-soc-cleanup`

## Commands run

```bash
pnpm install --frozen-lockfile
pnpm contracts:validate
pnpm --filter @plantlens/web typecheck
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build
python -m pytest apps/api/tests -q
```

## Results

| Command | Result | Notes |
|---|---|---|
| `pnpm install --frozen-lockfile` | **PASS** | Lockfile up to date |
| `pnpm contracts:validate` | **PASS** | All 7 demo contract pairs valid |
| `pnpm --filter @plantlens/web typecheck` | **PASS** | No TS errors |
| `pnpm --filter @plantlens/web test` | **PASS** | 52 files, **319 tests** |
| `pnpm --filter @plantlens/web build` | **PASS** | Vite production build OK (chunk size warning only) |
| `python -m pytest apps/api/tests -q` | **PASS** | **556 passed** (84 deprecation warnings, unrelated) |

## Failures caused by this cleanup

None.

## Readiness impact

All automated gates pass on `release/final-readiness-soc-cleanup`.  
Main-line demo readiness still blocked by unmerged feature branches (see `FINAL_READY_REPORT.md`).