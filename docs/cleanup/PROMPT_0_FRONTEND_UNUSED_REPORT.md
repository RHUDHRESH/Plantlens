# Prompt 0 — Frontend Unused Component Report

**Scope:** `apps/web/src/features/**`  
**Method:** Static import scan across `apps/web/src` (excluding `node_modules`)  
**Date:** 2026-06-22

**Policy:** No feature components deleted in Prompt 0. Report only unless clearly obsolete scratch.

| File | Imported anywhere? | Recommendation | Reason |
|------|-------------------|----------------|--------|
| `features/agents/AgentConsole.tsx` | yes | keep | Used by RuntimeHMI |
| `features/alarms/RawAlarmTable.tsx` | yes | keep | Used by RuntimeHMI |
| `features/calm-card/*` | yes | keep | Calm Card stack used by RuntimeHMI |
| `features/hmi-preview/*` | yes | keep | HMI preview surface; tests cover components |
| `features/hmi-state/HmiStatePanel.tsx` | yes | keep | Used by RuntimeHMI |
| `features/hmi-state/index.ts` | no | keep | Barrel export; may be used in future routes |
| `features/incidents/IncidentRoom.tsx` | yes | keep | Used by RuntimeHMI |
| `features/maps2d/*` | yes | keep | Canonical 2D map; core runtime |
| `features/maps3d/*` | yes | keep | Lazy 3D map; core runtime |
| `features/ops3d/adapters.ts` | yes | keep | 3D view-model adapter; imported by RuntimeHMI |
| `features/ops3d/map3dTypes.ts` | yes | keep | Types imported by `api/types.ts` |
| `features/plant-runtime/RuntimeHMI.tsx` | yes | keep | Router entry point |
| `features/plant-runtime/TopStrip.tsx` | no | keep | **Superseded** by `components/shell/RuntimeTopStrip.tsx`; old duplicate, low confusion risk if left |
| `features/scenarios/ScenarioLauncher.tsx` | yes | keep | Used by RuntimeHMI |
| `features/studio-forms/forms.tsx` | yes | keep | Studio forms entry |
| `features/studio-forms/StudioFormShell.tsx` | no | keep | Planned studio shell; router currently routes all paths to RuntimeHMI |
| `features/studio-graph/AssemblyStudioPage.tsx` | no | keep | Assembly studio page; wired in tests, not yet in router |
| `features/studio-graph/ComponentLibraryPage.tsx` | no | keep | Component library page; future studio route |
| `features/studio-graph/StudioCanvas.tsx` | yes | keep | React Flow projection |
| `features/studio-graph/*` (other) | yes | keep | Assembly studio subcomponents imported internally |

## Notes

* `apps/web/src/app/router.tsx` currently routes `/`, `/hmi`, `/studio`, `/studio/assembly`, `/studio/library` all to `RuntimeHMI`. Studio page components exist but are not router-mounted yet — **keep** for Prompt 1+ frontend work.
* `TopStrip.tsx` is the only clear duplicate of active code. Recommend deletion in a future prompt after confirming no test imports it.
* No frontend feature files deleted in Prompt 0.