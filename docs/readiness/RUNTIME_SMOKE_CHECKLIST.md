# Runtime Smoke Checklist

Manual verification checklist for demo readiness. Automated tests cover unit/integration paths; this list is for human smoke on a running stack.

## Runtime HMI

| Check | Expected | Automated proxy |
|---|---|---|
| App starts | Vite build succeeds | `pnpm --filter @plantlens/web build` PASS |
| API starts | pytest suite passes | 556 API tests PASS |
| Compiled bundle loads | `getCompiledBundle` used in RuntimeHMI | RuntimeHMI tests PASS |
| WebSocket connects or fallback | stale/disconnected handling | `ws.test.ts` PASS |
| HMI projection loads | HmiStatePanel / RuntimeHMI tests | PASS |
| 2D map renders | PlantMap2D tests | PASS |
| 3D lazy map or WebGL fallback | LazyPlantMap3D + PlantMap3D tests | PASS |
| Asset select opens drawer | AssetDetailDrawer tests | PASS |
| Causal path rail | CausalPathRail tests | PASS |
| Evidence panel | CausalPathEvidencePanel tests | PASS |
| Command palette Ctrl+K | CommandPalette tests | PASS |
| Search asset focuses map | searchIndex/scoring tests | PASS |
| Search alarm opens raw alarms | commandRegistry tests | PASS |
| Raw alarms expand | RawAlarmTable tests | PASS |
| Calm Card visible | CalmCard tests | PASS |
| Incident room opens | IncidentRoom mounted in RuntimeHMI | RuntimeHMI test PASS |
| Agent console draft-only | AgentConsole present | manual |
| Studio engineer/maintenance only | useStudioRoute + RuntimeHMI | PASS |
| Studio forms draft-only | StudioFormShell tests | PASS |
| Compile preview local/read-only | CompilePreviewWorkbench tests | PASS (Prompt 9) |
| SOC display if valid | Direct SOC path tested | socEstimator direct test PASS |
| SOC unavailable if missing | Demo BAT-101 shows unavailable | socEstimator + SocBadge |

## Safety

| Check | Status |
|---|---|
| No backend runtime diagnosis mutation | Confirmed — no API runtime edits in this gate |
| No graph/rule mutation at runtime | Confirmed |
| No hardware write command | Confirmed |
| No fake compile success | Compile preview is local-only |
| No fake SOC | SOC_NOT_AVAILABLE with honest UI |