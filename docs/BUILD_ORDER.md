# PlantLens Build Order

> **CURRENT SOURCE OF TRUTH — safe for build agents.**

Build in this order. Do **not** skip ahead — each chunk depends on the previous. Each chunk
lists the files to write (all already scaffolded with SPEC headers), the libraries you install
*for that chunk only*, and the "done" test that proves the chunk works.

The golden rule: **a vertical slice beats a horizontal layer.** Chunk 0–3 gets you a full
slice (simulator → alarm → DAG → Calm Card → live 2D map) with zero hardware and zero AI. That
slice is the product. Everything after is depth.

---

## Chunk 0 — Foundation & contracts  *(do this first, fully)*
**Goal:** monorepo skeleton, the contract spine, the demo bundle, CI bootstrap.
- `packages/contracts/*.schema.json` — all 11 JSON Schemas (the single source of truth).
- `packages/sample-data/demo-microgrid/*.json` — the demo bundle that validates against them.
- `legacy/cliffords-ts/` — move the existing TS engine here, frozen.
- `apps/api/pyproject.toml`, `apps/web/package.json`, root workspace files, `.github/workflows/ci.yml`.
- `deploy/docker/compose.full.yml` (skeleton).
**Install:** nothing yet (just package managers).
**Done when:** `pnpm install` and `uv sync` (or `pip install -e`) succeed; a schema-validation
script confirms the demo bundle validates against every contract.

## Chunk 1 — API skeleton, DB, auth, audit
**Goal:** the FastAPI shell that everything plugs into.
- `apps/api/app/main.py`, `lifespan.py`, `settings.py`, `dependencies.py`
- `apps/api/app/db/` (base, session, models for plant/run/alarm/audit/user, repositories)
- `apps/api/app/auth/` (OIDC/JWT verify, RBAC roles: viewer/engineer/operator/maintenance/admin/agent)
- `apps/api/app/services/audit_chain.py` (hash-chained append-only ledger)
- `apps/api/app/routers/health.py`
**Install (API):** `fastapi uvicorn[standard] pydantic pydantic-settings sqlalchemy alembic aiosqlite structlog`
**Done when:** `GET /healthz` and `GET /readyz` return 200; an audit append + read round-trips and
a tampered record is detected on read.

## Chunk 2 — Simulator-first runtime (the data source)
**Goal:** deterministic scenario playback emitting `TagFrame`s over a WebSocket. No hardware.
- `apps/api/app/schemas/tag_frame.py`, `scenario.py`
- `apps/api/app/runtime/runtime_state.py`, `websocket_hub.py`
- `apps/api/app/runtime/simulator/scenario_runner.py`, `simulator_gateway.py`
- `apps/api/app/routers/simulator.py`, `ws.py`
- `packages/sample-data/demo-microgrid/scenarios.json` (already in Chunk 0)
**Install:** (already have everything) + `orjson`
**Done when:** `POST /api/simulator/scenarios/motor_overload/start` streams tag frames on
`/ws/runtime`, and the runtime snapshot updates tag-by-tag with correct timing.

## Chunk 3 — Alarm + DAG + Situation + Calm Card engines  *(the core differentiator)*
**Goal:** the alarm flood collapses into ONE Calm Card with an evidence chain.
- `apps/api/app/runtime/alarm_engine.py` (thresholds, debounce `for_ms`, deadband, latching, ack)
- `apps/api/app/runtime/dag_runtime.py` (reverse traversal, temporal window, ranking)
- `apps/api/app/runtime/situation_engine.py` (group alarms → Situation, root + affected + path)
- `apps/api/app/runtime/calm_card_engine.py` (first signal, evidence chain, best check, blocked)
- `apps/api/app/runtime/asset_status.py` (normal/warning/critical/sensor_bad/offline derivation)
- `apps/api/app/runtime/projection.py` (Time-to-Consequence — optional but high-value)
- `apps/api/app/schemas/{alarm,situation,calm_card,evidence,action}.py`
- `apps/api/app/routers/{alarms,runtime}.py`
**Install:** `networkx` (authoring/validation; runtime uses plain adjacency maps)
**Done when:** the motor-overload scenario yields exactly one Situation
(`MOTOR_MECHANICAL_OVERLOAD`), root = MOTOR_01, evidence ordered current→speed→bus→inverter,
and a Calm Card with first-signal + best-first-check. Scenario test asserts `expected_root_cause`.

## Chunk 4 — Studio compiler (forms → compiled HMI)
**Goal:** "the matrix compiles the interface." Contracts in → `compiled_hmi.json` out.
- `apps/api/app/studio/compiler.py` + `compiler_steps/` (load, validate, build indexes, project HMI, write)
- `apps/api/app/studio/validators.py`, `graph_checks.py`, `id_generator.py`, `config_store.py`
- `apps/api/app/schemas/{plant,tag,hmi,validation,compile_result}.py`
- `apps/api/app/routers/{studio,compiler}.py`
**Install:** `pyyaml` (action_envelope.yaml)
**Done when:** `POST /api/compiler/compile` validates the demo bundle, writes
`compiled_hmi.json` + runtime indexes, and returns structured errors (with `fix`) on a bad bundle
(unknown ref / cycle / motor-without-inverter warning).

## Chunk 5 — Web shell + runtime HMI + 2D map  *(the operator home screen)*
**Goal:** the live 2D plant map driven by `compiled_hmi.json` + WebSocket.
- `apps/web/` config (vite, tsconfig, tailwind), `src/main.tsx`, `app/` (router, providers, store, queryClient)
- `apps/web/src/api/{client.ts,ws.ts,types.ts}` (types generated from contracts)
- `apps/web/src/features/plant-runtime/` (RuntimeHMI shell, top strip, layout)
- `apps/web/src/features/maps2d/` (PlantMap2D, PlantNode, PlantEdge, StatusHalo, CausalPathOverlay)
- `apps/web/src/app/store/runtime.ts` (zustand runtime store)
**Install (web):** `react react-dom typescript vite @tanstack/react-query zustand tailwindcss
@radix-ui/* lucide-react motion`
**Done when:** running motor-overload turns the motor node red, bus/inverter amber, draws the
causal path numbers, and updates < 150 ms after each WS frame.

## Chunk 6 — Calm Card UI + raw alarm disclosure
**Goal:** the decision layer beside the map.
- `apps/web/src/features/calm-card/` (CalmCard, EvidenceChain, FirstSignal, RecommendedAction,
  BlockedActions, RawAlarmDisclosure, TimeToConsequenceRing)
- `apps/web/src/features/alarms/` (raw alarm table, ack button)
**Install:** (already have)
**Done when:** the Situation renders a Calm Card; "view raw alarms" expands all grouped alarms
with their grouping receipt; ack writes an audit record.

## Chunk 7 — Gateway (Modbus/RS485)  *(real hardware path — still optional for demo)*
**Goal:** the same `TagFrame`s from real registers.
- `apps/gateway/` (main, settings, register_codec, serial_client, modbus_poller, simulator_adapter, publish, health)
**Install (gateway):** `pymodbus[serial] pyserial tenacity httpx structlog`
**Done when:** a simulated Modbus server (pymodbus) is polled, registers decode to the same
`TagFrame` shape, quality stamps work, and a timeout marks tags STALE without crashing.

## Chunk 8 — 3D map
**Goal:** premium spatial layer, lazy-loaded, subordinate to 2D.
- `apps/web/src/features/maps3d/` (PlantMap3D, PlantScene, AssetMesh, PowerCable3D, StatusGlow,
  CausalPath3D, CameraRig, CameraPresets, CalmCardAnchor3D)
**Install (web):** `three @react-three/fiber @react-three/drei`
**Done when:** a 2D/3D toggle swaps views using the *same* runtime store; the 3D route is a
separate lazy chunk < 700 KB gzipped; motor glows red with causal-path numbers.

## Chunk 9 — Studio Forms, then React Flow  *(author the plant)*
**Goal:** form-first authoring (R4), graph as a projection second.
- `apps/web/src/features/studio-forms/` (StudioFormShell, Project/Asset/Tag/Alarm/CausalEdge/Role/Action forms,
  ValidationPanel, CompilePreview) + zod schemas mirroring the contracts
- `apps/web/src/features/studio-graph/` (React Flow canvas, custom nodes/edges, node inspector, compile diff)
**Install (web):** `react-hook-form @hookform/resolvers zod @xyflow/react`
**Done when:** authoring the demo plant in forms → Validate → Compile → Preview renders the same
2D HMI; the graph view reads/writes the same canonical JSON; a cycle is rejected at compile.

## Chunk 10 — Incident Room
**Goal:** post-escalation shared command screen (evidence-first, not chat-first).
- `apps/api/app/incidents/` (room service, store, timeline, checklist, status, resolution)
- `apps/api/app/routers/incident_room.py`, `apps/api/app/schemas/incident*.py`
- `apps/web/src/features/incidents/` (IncidentRoom, Header, LiveContext, CalmCardPanel,
  EvidenceTimeline, Checklist, Log, ResolutionPanel)
**Install:** (already have)
**Done when:** a Calm Card escalates → Incident Room opens with root asset, evidence, checklist;
checking an item + adding a note + changing status all append hash-chained timeline events.

## Chunk 11 — Agent plane (draft-only)
**Goal:** useful AI with zero operational authority (R5).
- `apps/agents/` (main, registry, prompts/, tools/, workflows/)
- `apps/api/app/routers/agents.py` (draft endpoints + approval queue)
**Install (agents):** `langgraph langchain` + provider SDK (`openai` and/or `google-genai`);
retrieval: start with SQLite FTS5, add `chromadb` only when corpus justifies it.
**Done when:** an agent drafts a causal-edge candidate from a note; it lands in an approval queue;
approval writes the edge to contracts + an audit receipt; the agent can never write hardware or
auto-approve.

## Chunk 12 — DAG-to-PLC advisory bridge
**Goal:** publish diagnosis to PLC registers as *advisory* state; action requests are handshakes.
- `apps/gateway/gateway/plc_bridge/` (diagnosis_encoder, advisory_writer, action_request_writer,
  plc_feedback_reader, bridge_service) + `plc_output_map.json`
**Install:** (gateway already has pymodbus)
**Done when:** on a new Situation, advisory registers (SITUATION_CODE, ROOT_ASSET_CODE, SEVERITY,
CONFIDENCE) are written ≤ every 2s; an operator-approved action becomes a *request* the PLC
accepts/denies via its own interlocks. PlantLens never directly controls hardware.

## Chunk 13 — Hardening
**Goal:** make it survive first contact with reality.
- Scenario test matrix (late data, alarm flood, stale tags, gateway outage, bad CSV import).
- Degraded modes (WS reconnect, stale badge, 2D fallback when WebGL fails).
- Performance budgets (see `docs/DESIGN_SYSTEM.md`).
- `deploy/docker/*.Dockerfile`, `compose.edge.yml`, observability (OTEL + Prometheus), `security.yml`.
**Done when:** every demo scenario passes its assertion; a recorded fallback exists; budgets hold.

---

## Effort estimate (from the research, sanity-checked)
- Ruthless demo-grade MVP with architectural integrity (Chunks 0–6, +8 cosmetic): **~14–16 person-weeks**.
- Credible v1 (all chunks): **~38 person-weeks**.
- Solo: too long; you will cut the wrong corners. Two strong full-stack engineers for ~8 weeks
  reaches a credible v1; three (one FE-heavy, one BE/gateway-heavy) reach it in ~5–6.
