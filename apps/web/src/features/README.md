# apps/web/src/features — one folder per product surface

Each feature folder owns its components, hooks, and types. Features read the runtime store
(`app/store/runtime.ts`) and the typed API client; they don't talk to the WebSocket directly
(only `api/ws.ts` writes the store). Below: every folder, its files, and what to build.

## operational-map/ — shared map UI kernel (Prompt 1+)
| File | Role |
|------|------|
| `mapKernelTypes.ts` | Map mode, role lens, zoom band, layer, and command types |
| `layerRegistry.ts` | Deterministic layer definitions and safety-critical rules |
| `roleLenses.ts` | Operator/engineer/maintenance/manager visibility defaults |
| `zoomBands.ts` | Scale → zoom band helpers |
| `useOperationalMapStore.ts` | Zustand store for map navigation state (not telemetry) |
| `selectors.ts` | Pure selectors for layer/role visibility |
| `index.ts` | Public API |

Owns UI navigation state for 2D/3D maps: mode, role lens, layers, selection, focus, zoom band, commands.
Does **not** own telemetry/runtime facts or change diagnosis. `app/store/runtime.ts` remains the WebSocket/HMI snapshot source.

## plant-runtime/ — the runtime HMI shell (Chunk 5)
| File | Build |
|------|-------|
| `RuntimeHMI.tsx` | the shell: top strip (health/mode/source/time/role) + 2D map (hero) + Calm Card (right) + raw alarms (bottom). Loads compiled bundle; opens WS; renders from runtime store. |
| `TopStrip.tsx` | plant health, mode, data-source indicator, clock, role, the "DATA STALE" badge |
| `ViewToggle.tsx` | 2D / 3D / Raw-alarms switch (3D lazy-loaded) |

## maps2d/ — SVG plant map (Chunk 5, canonical + default)
| File | Build |
|------|-------|
| `PlantMap2D.tsx` | root `<svg>`; renders edges then nodes from compiled `map_2d`; binds live status |
| `PlantNode.tsx` | one asset node: status border/fill/halo + label + type + ROOT badge; click → side panel |
| `PlantEdge.tsx` | power-flow line; highlights when on the active causal path |
| `StatusHalo.tsx` | the warning/critical pulse (steady, not blinking) |
| `CausalPathOverlay.tsx` | numbered 1-2-3 markers along the situation's causal_path |
| `AssetPopover.tsx` | side panel: tags, alarms, related situation, actions |
| `mapTypes.ts` | shared `AssetStatus`, `MapNode`, `MapEdge`, `RuntimeState` types |
| `MapToolbar.tsx` | zoom/fit/layer toggles (add after the basics work) |

## maps3d/ — R3F plant map (Chunk 8, lazy enhancement)
PlantMap3D, PlantScene, AssetMesh, PowerCable3D, StatusGlow, CausalPath3D, CameraRig,
CameraPresets, CalmCardAnchor3D, map3dTypes. Reads the SAME runtime store; primitives first, GLTF
later; route-split so it never blocks initial load.

## calm-card/ — the decision layer (Chunk 6)
CalmCard, CalmCardHeader, FirstSignal, EvidenceChain, RecommendedAction, BlockedActions,
TimeToConsequenceRing, OperatorAuthority, RawAlarmDisclosure, CalmCardSkeleton. Renders the
deterministic CalmCard contract; "view raw alarms" expands grouped alarms with receipts.

## alarms/ — raw alarm surface (Chunk 6)
RawAlarmTable (virtualized), AlarmRow, AckButton (writes audit), ShelveDialog (reason+expiry).
Always available; never hidden. UI says "N grouped", never "suppressed".

## scenarios/ — simulator controls (Chunk 2/5)
ScenarioLauncher (list + run), ScenarioControlPanel (start/stop/reset), ScenarioTimeline,
ScenarioStatusBadge.

## studio-forms/ — authoring source of truth (Chunk 9, FORMS FIRST)
StudioFormShell, StepRail, ProjectForm, AssetForm, TagForm, AlarmRuleForm, CausalEdgeForm,
RoleViewForm, ActionEnvelopeForm, ValidationPanel, CompilePreview. Each form uses react-hook-form +
zodResolver; the zod schemas mirror packages/contracts (in `app/schemas/`). Save → validate →
compile → preview the SAME 2D HMI.

## studio-graph/ — React Flow projection (Chunk 9, SECOND)
StudioCanvas (@xyflow/react), custom nodes (Source/Battery/Bus/Inverter/Motor/Sensor),
custom edges (PowerFlow/Signal/Causal), NodeInspector, CompileDiff. The canonical JSON is the
source of truth; React Flow is a view/editor over it (applyNodeChanges, not replace).

## hmi-preview/ — compile output preview (Chunk 4/9)
CompileButton, CompileStatusPanel, ValidationReport (renders {code,message,fix}),
GeneratedFilesViewer, DynamicHMI (renders compiled_hmi.json without the live store, for preview).

## incidents/ — Incident Room (Chunk 10)
IncidentRoom, IncidentHeader, IncidentStatusBadge, IncidentLiveContext, IncidentCalmCardPanel,
IncidentEvidenceTimeline, IncidentChecklist, IncidentLog (comments), IncidentResolutionPanel,
incidentTypes, incidentApi.

## agents/ — Agent Console (Chunk 11)
AgentConsole (chat), EvidenceDrawer, ApprovalBar (approve/reject a draft), DraftDiff. Every agent
output is a draft needing approval; nothing applies directly.

## Shared rule
Status rendering (color+text+icon+shape), motion durations, and copy tone come from
`docs/DESIGN_SYSTEM.md`. Don't reinvent them per feature.
