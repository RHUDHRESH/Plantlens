# Final Ready Report

**Verdict: NOT_READY_FOR_DEMO**

Audit date: 2026-06-22

## 1. Current branch

`release/final-readiness-soc-cleanup` (from `feat/prompt-9-local-compile-preview-hmi-preview`)

## 2. Latest commit

`6e3956c` (`chore: final readiness cleanup and soc audit`) — includes Prompt 9 base `d84e595`

## 3. Feature chain status

All prompt branches 0–9 exist locally and on `origin`. Automated tests pass on the release branch.  
**Prompt 9 is present** — compile preview workbench is wired; not the disabled Prompt 8 shell.

**Blocker:** `main` only contains through Prompt 1. Prompts 2–9 are not merged. A demo cloned from `main` will not include Studio, local compile preview, causal path explorer, command palette, or 3D parity.

## 4. SOC verdict

**SOC_NOT_AVAILABLE** for demo-microgrid.

- No direct BMS/fuel-gauge SOC tag
- No coulomb-counting inputs (current, capacity Ah, initial SOC, sign convention, history)
- No OCV table; voltage-only inference correctly refused
- UI shows honest unavailable state in battery asset drawer

## 5. Missing branches / features

None missing from the branch chain.  
**Missing from `main`:** prompts 2–9 merge.

## 6. Cleanup blockers

| Blocker | Severity |
|---|---|
| Feature prompts 2–9 not merged to `main` | BLOCKER for main-line demo |
| SOC not available in demo plant | ACCEPTABLE (honest unavailable UI) |

## 7. Tests

| Suite | Result |
|---|---|
| Web typecheck | PASS |
| Web tests (319) | PASS |
| Web build | PASS |
| contracts:validate | PASS |
| API pytest (556) | PASS |

## 8. Smoke checklist

See `RUNTIME_SMOKE_CHECKLIST.md`. Automated proxies all pass; full manual smoke still recommended before live demo.

## 9. Final risk list

1. **Main branch lag** — biggest demo risk; users on `main` see an incomplete product.
2. **SOC unavailable** — correct for demo-microgrid; do not add fake percentage.
3. **action_envelope.json** — frontend-only copy from YAML; document if authoring that file in Studio.
4. **Chunk size warning** — web build warns on 3D bundle size; not a functional blocker.

## 10. Exact next command for the user

Merge the feature chain into `main` (or demo from the release branch), then verify live:

```bash
git checkout release/final-readiness-soc-cleanup
pnpm install --frozen-lockfile
pnpm contracts:validate
pnpm --filter @plantlens/web test
# Terminal 1: start API + simulator per project README
# Terminal 2:
pnpm --filter @plantlens/web dev
# Open http://localhost:5173 — engineer role → Studio → Compile Preview → Generate local preview
# Select BAT-101 — confirm "SOC unavailable — missing required authored inputs."
```

To make SOC reportable later (without faking), add to authored `tag_map.json`:

- a direct `BAT_101_SOC` tag from BMS, **or**
- `BAT_101_I` + documented `capacity_Ah`, `initial_soc_percent`, and `current_sign` in plant meta, **or**
- validated OCV table + rest flag for the specific chemistry.