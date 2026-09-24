# PlantLens v2 overhaul plan

Source: four parallel audits run on 2026-09-24 against `main` @ `eaf8aee`. Baseline results are in
`OVERHAUL_BASELINE.md`. Every phase keeps rules R1–R8 and the required checks green.

## What the audits found

### 1. Hardware (RS-485 and Arduino)
- There is no port auto-detection by VID/PID. The default ports disagree with each other
  (`/dev/ttyUSB0` vs `COM3`), and neither matches an Uno, which appears as `/dev/ttyACM*`.
- **Modbus reads are not batched.** A single contiguous block (registers 0–41) takes 21
  requests. With pymodbus defaults, one silent slave costs 12 s per group, so the last tag
  goes STALE after about 4 minutes.
- **A USB replug is never recovered.** The code retries the same device name forever and
  never finds the port under a new name.
- **The Arduino auto-reset is not handled.** Opening the port raises DTR, and every error
  reopens it, which resets the Uno again.
- **The plain-text path produces wrong values.** A partial line becomes two GOOD values;
  garbled keys are remapped to the default tag; CSV rows are dropped; `NaN` is accepted as
  GOOD; one bad JSON line closes the port.
- **The shipped acquisition sketch sends CSV the gateway cannot parse.** It also sends
  about 320 kbit/s at 921600 baud, which a 16 MHz Uno cannot sustain.
- **The publisher has a flush task per frame, requeues frames in reverse order, and retries
  a 422 forever.** The retries block the queue.

### 2. Runtime latency
- **Compute is not the problem.** A full evaluation takes about 0.2 ms per frame, about 3,000
  frames per second.
- **The latency comes from the design.** Evaluation happens only when a frame arrives, so
  `for_ms` debounces complete on the next unrelated frame, 1–3.5 s late. `MOTOR_TEMP_HIGH`
  never fires live.
- **Clock skew hides every alarm.** Gateway device timestamps are treated as "now" while
  age is measured against server time, so a gateway clock 2 s fast marks every tag STALE.
- **Failures are silent.** Evaluation errors are swallowed.

### 3. Causal algorithm
- **The graph is barely used.** In the hero scenario root-cause analysis traverses
  zero approved edges.
- **Timing checks are wrong.** Each hop is compared with the symptom time, not the previous
  node, and a missing cause alarm counts as consistent.
- **Confidence is uncalibrated.** Scores reach 1.0 "high" with 2 of 4 evidence tags present.
- **Only one root is possible.** Cycles are rejected outright, so feedback loops cannot be
  modelled.

### 4. Component library
- 27 bench component types. `downstream_effects` is empty everywhere, and there are no lag
  windows and no internal loops.
- Its vocabulary does not match the asset types in `plant.schema`. The motor/VFD, PV/MPPT,
  DC bus, compressor, heat exchanger and boiler types are missing.

### 5. Approvals
- The draft queue is in memory only, and approval stops at `runtime_deployed: False`.
- **Hot reload rebuilds from the authored files, not from the compiled artifact.**
- There is no JSON Schema validation in the API, and compile and deploy write no audit entry.
- Operators can approve graph drafts.

### 6. Frontend
- **Studio drag-and-drop:**
  - Nothing can be dragged from the palette.
  - Nodes do not follow the cursor.
  - There is no delete, undo, snap or save.
  - A CSS rotate override breaks the handles.
  - Connection IDs can collide.
  - **New edges are created with `approved: true`, which bypasses the approval gate.**
- **Visuals:**
  - The tokens contradict `DESIGN_SYSTEM.md`.
  - The Studio uses neon CSS.
  - Critical alarms pulse, which the design doc forbids.
  - Status is shown with Unicode glyphs.
- **Views:**
  - There are no trends.
  - The causal graph is not mounted.
  - The alarm list has no sort, filter or shelve.
  - Role views are cosmetic.
  - Approvals are shown as a raw JSON dump.

### 7. `backend/`
- Nothing in CI, Docker or the docs uses it. It is superseded except for three pieces:
  - `allowed_roles` gating for actions. **`apps/api` does not enforce this today.**
  - Register scan and tag binding.
  - Calm Card text templates.

## Phases

Each phase ends with a commit to `overhaul/plantlens-v2` and all required checks passing.

| # | Phase | Key deliverables |
|---|-------|------------------|
| 0 | Safety fixes | New Studio edges default to `approved:false`. Only engineers and admins may approve. The gateway test no longer hangs. Evaluation errors are logged. |
| 1 | Runtime latency | A periodic evaluator (100 ms, configurable) plus debounce deadlines. Server-clock "now" for gateway frames. orjson and concurrent websocket sends with a per-client timeout. A latency benchmark test (frame to push, measured in ticks and ms). |
| 2 | Causal engine v2 | Contract additions, all optional: edge `polarity`, `lag_ms` as [min,max], `loop_ok`; node `symptom_alarms`, `prior`; graph `scoring`. Compile step: condense loops into single nodes with Tarjan, accumulate lag windows, bundle hash. Scoring from first-out timing, coverage, fingerprint, quality and contradictions. Minimal root set covering all alarms. Calibrated confidence with a margin. Loop explanation. Deterministic IDs. |
| 3 | Causal pattern library | `causal_pattern_library.schema.json`. Patterns for about 14 component types: motor, pump, fan, compressor, valve, heat exchanger, VFD/inverter, battery, PV/MPPT, DC bus, transformer, conveyor, tank, boiler. Each has failure modes, tag roles, symptom lags, internal edges and loops, and checks. `library/instantiate.py` turns bindings into an approval draft, or an observability-gap report when a required tag is missing. |
| 4 | Approval pipeline | Database-backed drafts and reviews. RFC 6902 patch with a path allow-list. JSON Schema validation in the API. Compile, then an atomic versioned runtime swap that reconciles per-rule state. Rollback. `/api/changes/*` endpoints. Audit actions for every step. Migration 0002. |
| 5 | Gateway rewrite | `transport/discovery` (VID/PID) and `serial_link` (async, reconnect on hotplug, DTR/reset handling). `line/framer` + `csv_reader` (the `PL1` checksummed protocol plus header-driven CSV). `modbus/batch_planner` + `scan_engine` (merge ranges up to 125 registers, per-device backoff, read-only function whitelist). An ordered batch `uplink`. A shared TagFrame model. A new Uno sketch. Tests against a pty and the pymodbus simulator. |
| 6 | Design system and symbols | `tokens.json` becomes the single source and generates CSS and the Tailwind theme. P1–P4 alarm-priority tokens. A dark control-room theme. Local fonts. An ISA-101 / P&ID SVG symbol set in `packages/icons`, with shape-coded alarm priority and steady (non-pulsing) critical alarms. |
| 7 | Studio drag-and-drop | Drag from the palette with `screenToFlowPosition`. Snap to a 16 px grid. Typed handles with `isValidConnection`. Controlled xyflow state. Undo/redo as a command stack. Keyboard nudge, delete, select-all and duplicate. Debounced `PUT /api/studio/layout/{plant}`. |
| 8 | Views and roles | Routed app shell with operator, engineer and admin navigation and guards. Alarm list with sort, filter, ack and shelve. Trends via uPlot and a history endpoint. Causal graph view laid out with elk. Approval queue with a diff and a required comment. |
| 9 | Cleanup | Port `allowed_roles` gating and the Calm Card templates, then delete `backend/`. Update PLANTLENS §7, ALGORITHMS and DESIGN_SYSTEM. Make `xlsx` an optional dependency of the legacy package. |

Phases 1–5 are backend work and can be tested fully in the cloud. For phase 5, the user
validates on real RS-485 and Uno hardware.
