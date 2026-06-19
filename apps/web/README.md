# apps/web — React 19 + Vite frontend

The operator-facing surface: runtime HMI, 2D/3D plant maps, Calm Cards, raw alarms, Studio
(forms + graph), Incident Room, Agent Console. Read `docs/DESIGN_SYSTEM.md` before writing any UI.

## Config (Chunk 5)
| File | Purpose |
|------|---------|
| `package.json` | deps (per chunk — see the `_dependencies_by_chunk_note`) |
| `vite.config.ts` | dev proxy to the API + WS; 3D route-splitting |
| `tsconfig.json` | strict TS; `@/*` and `@contracts/*` path aliases |
| `index.html` | shell; Inter Variable font |

## `src/` layout
| Folder | What |
|--------|------|
| `main.tsx` | mount React, providers, router |
| `app/` | `router.tsx`, `providers.tsx` (QueryClient + theme), `store/` (zustand), `queryClient.ts`, `schemas/` (zod mirrors of contracts) |
| `api/` | `client.ts` (REST, typed from OpenAPI), `ws.ts` (runtime WebSocket + reconnect/stale), `types.ts` |
| `styles/` | `tokens.css` (design tokens as CSS vars), `globals.css` |
| `assets/icons/` | domain SVG symbols (motor, bus, inverter, breaker, sensor) — NOT Lucide |
| `components/` | shared chrome (`shell/`, `ui/`) |
| `features/` | one folder per product surface (see `features/README.md`) |

## Feature → chunk map
| Feature | Chunk | Hero file |
|---------|-------|-----------|
| `plant-runtime/` | 5 | `RuntimeHMI.tsx` (the shell) |
| `maps2d/` | 5 | `PlantMap2D.tsx` (SVG, canonical/default) |
| `calm-card/` | 6 | `CalmCard.tsx` (decision layer) |
| `alarms/` | 6 | `RawAlarmTable.tsx` |
| `scenarios/` | 2/5 | `ScenarioLauncher.tsx` |
| `maps3d/` | 8 | `PlantMap3D.tsx` (R3F, lazy) |
| `studio-forms/` | 9 | `StudioFormShell.tsx` (source of truth) |
| `studio-graph/` | 9 | React Flow projection |
| `hmi-preview/` | 4/9 | `CompilePreview.tsx` |
| `incidents/` | 10 | `IncidentRoom.tsx` |
| `agents/` | 11 | `AgentConsole.tsx` |

## State strategy (don't over-engineer — docs/LIBRARIES.md)
- **Server data** → TanStack Query (plants, compiled bundle, incidents, audit).
- **Live runtime stream** → one zustand store (`app/store/runtime.ts`) fed by the WebSocket.
- **Editor/UI local** → component state / useReducer.
Do NOT fetch live tags via polling; live data is the WebSocket. Do NOT build five global stores.

## The golden frontend rules
- 2D (SVG) is canonical + default; 3D (R3F) is lazy-loaded enhancement reading the SAME store.
- Coordinates live in the compiled bundle (from plant.json), never hardcoded in components.
- Status = color + text + icon + shape (never color alone). Honor `useReducedMotion`.
- Defend the performance budgets every sprint (DESIGN_SYSTEM.md).
