# Overhaul baseline (before any code change)

Branch `overhaul/plantlens-v2`, forked from `main` @ `eaf8aee`. Recorded 2026-09-24 in a cloud
container (Node 22.22, pnpm 10.33, Python 3.12.3 via uv).

| Check | Result |
|-------|--------|
| `pnpm contracts:validate` | PASS |
| `python -m pytest apps/api/tests -q` | PASS: 584 passed, 3 warnings (26 s) |
| `pytest apps/gateway` | 29 passed, **but the process never exits** (see below) |
| `pnpm --filter @plantlens/web typecheck` | PASS |
| `pnpm --filter @plantlens/web test` | PASS: 57 files, 361 tests |
| `pnpm --filter @plantlens/web build` | PASS, with a warning that one chunk is over 500 kB (no code-splitting) |

## Pre-existing problems

1. **Gateway test run hangs at exit.** `apps/gateway/tests/test_health_commission.py` starts a
   non-daemon `Thread` whose two `server.handle_request()` calls wait forever in `accept()`
   after the one request the test makes. A py-spy dump confirmed the main thread blocked in
   `threading._shutdown`, waiting on it.
2. **Full `pnpm install` fails in restricted networks.** `legacy/cliffords-ts` pins `xlsx` to a
   tarball on `cdn.sheetjs.com`, which is not on the npm registry. Workaround:
   `pnpm install --filter '!@plantlens/cliffords'`.
