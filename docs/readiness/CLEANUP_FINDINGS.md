# Cleanup Findings

Audit date: 2026-06-22

| File | Line / area | Severity | Reason | Action taken |
|---|---|---|---|---|
| `apps/web/src/api/ws.test.ts` | `vi.stubGlobal` | ACCEPTABLE | Vitest WebSocket mock in tests | None |
| `apps/web/src/app/hooks/useReducedMotion.test.ts` | `vi.stubGlobal` | ACCEPTABLE | Test mock for `matchMedia` | None |
| `apps/web/src/features/maps3d/LazyPlantMap3D.tsx` | `runtime-placeholder` | ACCEPTABLE | Legitimate Suspense loading copy | None |
| `apps/web/src/features/studio-forms/StudioFormShell.tsx` | role view stubs copy | ACCEPTABLE | Honest deferred-feature note | None |
| `apps/web/src/features/maps2d/useSvgViewport.ts` | eslint-disable | ACCEPTABLE | Documented exhaustive-deps exception | None |
| `apps/web/src/features/maps3d/useOperationalCamera3D.tsx` | eslint-disable | ACCEPTABLE | Documented exhaustive-deps exception | None |
| `docs/archive/` | entire tree | ACCEPTABLE | Not imported by app code (confirmed) | None |
| `apps/web/src` | `console.log` / `debugger` | ACCEPTABLE | None found in production `apps/web/src` | None |
| `apps/web/src` | `localStorage` / `sessionStorage` | ACCEPTABLE | None in studio-forms or hmi-preview | None |
| `main` branch | prompts 2–9 unmerged | **BLOCKER** | Demo from `main` lacks promised features | Documented in `FINAL_READY_REPORT.md` |
| Demo microgrid | no SOC tag | ACCEPTABLE | Honest unavailable UI added | `battery-soc` module + `SocBadge` |

No accidental `console.log`, `debugger`, `@ts-ignore`, or fake compile/SOC production paths removed beyond adding honest unavailable SOC state.