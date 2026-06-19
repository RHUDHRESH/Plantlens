# PlantLens — Master Build Document

> This is the single source of truth for the PlantLens refactor. Read this file first.
> It reconciles the 5 deep-research reports and the 13 idea documents into ONE buildable
> architecture. Every folder in this repo has its own `README.md` describing exactly what
> file belongs there and why. This document explains the *system*; the folder READMEs
> explain the *files*; `docs/BUILD_ORDER.md` explains the *sequence*.

---

## 1. What PlantLens actually is (the one-paragraph truth)

PlantLens is a **deterministic, read-only industrial cognition layer** that sits *above* a
DCS/PLC and *beside* the safety system. It ingests live telemetry (simulator first, RS485
later), evaluates **engineer-approved alarm rules**, traverses an **engineer-approved causal
DAG** to collapse an alarm flood into ONE root-cause **Situation**, renders that Situation as
a **Calm Card** on a live **2D/3D plant map**, and keeps a **hash-chained audit ledger** of
every decision. AI is confined to *offline drafting* (propose rules/edges/text for a human to
approve) — it is **never** in the live diagnosis path and **never** writes to hardware.

The three things that win (validated by the ABB competitive research):

1. **The matrix compiles the interface** — you don't draw HMI screens, you model the plant
   once (forms → contracts) and PlantLens *compiles* the HMI, alarms, causal graph, and role
   views from it.
2. **Glass-box suppression with receipts** — every collapsed alarm is reversible in one click
   and carries an audit receipt (which rule grouped it, who approved that rule, when).
3. **Time-to-Consequence** — a deterministic countdown on each Calm Card (Endsley Level-3
   projection), computed by rate extrapolation, shown as a confidence band — never an interlock.

---

## 2. The non-negotiable rules (these are load-bearing — violating them breaks the product)

| # | Rule | Why |
|---|------|-----|
| R1 | **One canonical plant model.** Studio forms, React Flow, 2D map, 3D map, and agents are all *views* over the same contracts in `packages/contracts`. No view invents its own schema. | Stops schema drift, the #1 prototype killer. |
| R2 | **The DAG runtime is deterministic and read-only.** It only traverses `approved: true` edges. No ML, no probabilistic inference, no graph mutation at runtime. | Safety + explainability + testability (IEC 61511 posture). |
| R3 | **Simulator-first.** The simulator and the RS485 gateway emit the *identical* `TagFrame` contract. Nothing downstream knows or cares which is the source. | Demo never depends on hardware behaving. |
| R4 | **Forms are the source of truth; React Flow is a projection.** Author in typed forms (correctness), review/edit relations in the graph (spatial), draft with AI (text). In that order. | Free-form graph editing creates invalid states, cycles, fake confidence. |
| R5 | **Agents draft only.** They produce draft artifacts (configs, rules, scenarios, notes, explanations) behind a human-approval gate. They never write hardware, never mutate the live graph, never auto-approve. | One bad autonomous action ends the product. |
| R6 | **Append-only hash-chained audit for everything** — compiles, edits, approvals, acks, agent proposals, runtime explanations. | "Glass-box with receipts" only exists if it is durable and reviewable. |
| R7 | **The gateway never computes root cause, never compiles UI, never runs an LLM.** It polls, normalizes, quality-stamps, publishes `TagFrame`s. That is all. | Separation of concerns; the gateway is the one place serial/hardware pain lives. |
| R8 | **2D is the default operator surface; 3D is lazy-loaded enhancement.** | 2D is reliable under stress and on weak hardware; 3D must never block initial load. |

---

## 3. The demo domain (the bench you build everything against)

A **DC electrical microgrid** (aligns with ABB electrical distribution; better than a generic
process loop). Seven waypoints:

```
PV Array → MPPT → Battery → DC Bus → Inverter → 3-Phase Motor
                                  └→ Inverter → Lamp Load
```

**Hero scenario — "Motor Mechanical Overload":** motor current rises first → speed drops →
DC-bus voltage sags → inverter undervoltage appears downstream. Five raw alarms collapse into
ONE Situation whose root is the motor, with the bus/inverter shown as *downstream effects*, not
causes. This is the "oh damn, this makes sense" moment.

The canonical demo bundle lives in `packages/sample-data/demo-microgrid/` and every contract
schema in `packages/contracts/` is validated against it.

---

## 4. The five planes (services) and how data flows

```
[Simulator | RS485 Gateway]   ──TagFrame──▶  [API: ingest → normalize → persist]
                                                   │
                                                   ▼
                                          [Alarm Engine] ──active alarms──▶ [DAG Runtime]
                                                                                  │ root-cause
                                                                                  ▼
                                                                         [Situation Engine]
                                                                                  │
                                                                                  ▼
                                                                         [Calm Card Engine]
                                                                                  │ WebSocket
                                                                                  ▼
                              [Web: 2D/3D map + Calm Card + Raw Alarms + Incident Room + Studio]
                                                   ▲
                                  [Studio Compiler]│ compiles contracts → compiled_hmi.json
                                                   │
                              [Agents (draft-only)]┘ propose drafts → human approves → contracts
```

- `apps/api` — the modular monolith: ingest, runtime (alarm/DAG/situation/calm-card), studio
  compiler, incidents, audit, auth, websocket hub. **This is the spine.**
- `apps/gateway` — Modbus/RS485 poller (separate process). Emits `TagFrame`s. Read-only.
- `apps/agents` — draft-only AI service (LangGraph). Optional; never on the live path.
- `apps/web` — React 19 + Vite frontend: runtime HMI, Studio, maps, Calm Cards, Incident Room.
- `packages/contracts` — JSON Schemas = the single source of truth all services compile from.

---

## 5. Map of the 13 idea-docs → where they live in this repo

| Idea | Feature | Backend home | Frontend home |
|------|---------|--------------|---------------|
| 1 | Drag-drop Plant Studio | `apps/api/app/studio/` (compiler, validators) | `apps/web/src/features/studio-graph/` |
| 2 | Form-based Studio (FIRST) | `apps/api/app/studio/` (form compiler, validators) | `apps/web/src/features/studio-forms/` |
| 3 | HMI Compiler | `apps/api/app/studio/compiler_steps/` | `apps/web/src/features/hmi-preview/` |
| 4 | Live 2D plant map | `apps/api/app/runtime/asset_status.py` | `apps/web/src/features/maps2d/` |
| 5 | Live 3D plant map | (same runtime data) | `apps/web/src/features/maps3d/` |
| 6 | Calm Card system | `apps/api/app/runtime/calm_card_engine.py` | `apps/web/src/features/calm-card/` |
| 9 | Simulator-first runtime | `apps/api/app/runtime/simulator/` | `apps/web/src/features/scenarios/` |
| 13 | Incident Room | `apps/api/app/incidents/` | `apps/web/src/features/incidents/` |
| 13b | DAG-to-PLC advisory bridge | `apps/gateway/gateway/plc_bridge/` | (status panel only) |
| — | Agent Plane | `apps/agents/` | `apps/web/src/features/agents/` |
| — | Ingestion (existing TS) | `legacy/cliffords-ts/` (frozen oracle) + ported into `apps/api/app/ingest/` | — |

> The idea-docs use `backend/` and `frontend/` with flat feature folders. We map them into the
> monorepo. The *concepts* (Studio, Calm Card, Situation, scenarios, action envelope) are kept
> verbatim; only the *paths* change.

---

## 6. The Cliffords legacy engine (what to do with the existing code)

The current repo IS `@plantlens/cliffords` — a strict TypeScript ingestion core (adapters,
3 gates, normalizers, parsers, mapping, stores, audit hash-chain, model compiler). Per
`deep-research-report (2).md`:

- **Freeze it** under `legacy/cliffords-ts/` (move `src/`, `package.json`, tsconfigs, vitest).
- **Use it as the regression oracle**: its fixtures and gate outputs become golden tests the
  Python port must match.
- **Port selectively to Python** under `apps/api/app/ingest/` — keep the contracts (canonical
  event shape, audit chain, gate semantics), reimplement in Pydantic so the backend owns one
  language. Do NOT run a split-brain Node+Python product.

See `legacy/cliffords-ts/README.md` and `apps/api/app/ingest/README.md` for the exact mapping.

---

## 7. How to use this scaffold

1. Read this file, then `docs/ARCHITECTURE.md`, then `docs/BUILD_ORDER.md`.
2. Pick a chunk from `docs/BUILD_ORDER.md` (they are ordered; do not skip ahead).
3. For each file in that chunk, open the file (it has a header block describing exactly what to
   build) and open the folder's `README.md` (it lists every file and its purpose).
4. Install only the library parts named in `docs/LIBRARIES.md` for that chunk.
5. Validate against the contracts in `packages/contracts` and the sample bundle.

Every `.py` / `.ts` / `.tsx` stub in this scaffold contains a **SPEC header** (what to build,
inputs/outputs, algorithm, complexity, which library parts, red-team notes) and a clearly
marked `TODO(you)` where your implementation goes. Nothing here is finished code — it is a
blueprint you fill in.
