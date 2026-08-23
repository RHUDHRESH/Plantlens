# PlantLens Product Vision

> **Signed for the Grandiose Rebuild.** Source companions: `PLANTLENS.md`, `docs/BUILD_ORDER.md`, `docs/DESIGN_SYSTEM.md`, `docs/ALGORITHMS.md`, `docs/AGENT_BOUNDARY.md`.

## North star

PlantLens is a **deterministic, read-only industrial cognition workbench** for a DC microgrid bench. It sits above the PLC/DCS and beside safety. It turns live telemetry into **one evidence-backed Situation**, shown on a Calm Card and a fault×signal matrix, with a hash-chained audit trail.

AI **drafts and explains only**. Live diagnosis is never an LLM. PlantLens never writes coils or trips equipment.

## What wins

1. **The matrix compiles the interface** — author once (forms → contracts); compile HMI, alarms, graph, role views.
2. **Glass-box grouping with receipts** — alarm floods collapse with reversible disclosure and audit who/what/when.
3. **Time-to-Consequence** — advisory EMA band on the Calm Card; never an interlock.

## Non-negotiables (R1–R8)

| # | Rule |
|---|------|
| R1 | One canonical plant model in `packages/contracts` |
| R2 | DAG runtime deterministic; `approved: true` edges only; no ML/LLM diagnosis |
| R3 | Simulator and gateway emit identical `TagFrame` |
| R4 | Forms are source of truth; React Flow / maps are projections |
| R5 | Agents draft only; human approval required |
| R6 | Append-only hash-chained audit for consequential events |
| R7 | Gateway polls/normalizes/publishes only — no root cause, no LLM |
| R8 | 2D default; 3D lazy and never blocks load |

## Bench

```
PV-101 → MPPT-101 → BAT-101 → BUS-101 ┬→ INV-101 → LD-201
                                        └→ INV-102 → MTR-301
```

**21 Modbus signals** (register bible) are the physical truth. Hero demo: motor mechanical overload — five raw alarms → one Situation rooted at `MTR-301`.

## Screens (jobs)

| Screen | Job |
|--------|-----|
| **Monitor** (default home) | Live signal rail + fault×signal matrix (cognition hero) + Calm Card; map toggle secondary |
| **Diagnose** | Evidence chain, contradictions, missing evidence, rejected candidates, raw alarms with receipts |
| **Copilot** | Evidence-bound local LLM explain/draft; provider Live / Degraded / Offline |
| **Incidents** | Escalate → evidence-first room (checklist, notes, status, audit) |
| **Studio** | Form-first authoring (assets, tags, alarms, edges, matrix, actions) → validate → compile → preview |
| **Connection** | Real Modbus/source health, register decode, quality — not decorative |

**Icon rail:** Monitor · Diagnose · Studio · Incidents · Connection.

Scenarios and Atlas are **engineer test / secondary tools**, not the product entry story.

## Locked product decisions

- **Monitor hero:** fault×signal matrix primary; 2D map secondary toggle (R8 still: 2D is canonical spatial view).
- **Diagnosis:** approved DAG is root-cause authority; fault matrix is glass-box evidence overlay + Studio authoring that feeds coverage/fingerprints.
- **LLM:** Ollama local (OpenAI-compatible); narrates packet; never invents root; deterministic fallback when down.
- **Frontend:** shadcn kit stolen then altered; ISA-101 calm wins over SaaS candy.

## Anti-goals

- Scenario-toy homepage / fake confidence
- Blinking critical alarms, game-like 3D, dashboard clutter
- LLM in live diagnosis path
- Auto-approve drafts or hardware writes
- Hand-drawn one-off HMI screens that bypass contracts
- Hardcoded cloud API keys in repo

## Acceptance demos

1. **Live or recorded registers:** 21 tags update with quality chips on Monitor.
2. **Motor overload:** matrix lights motor symptoms first; Calm Card roots `MTR-301`; five raw alarms preserved with receipts.
3. **Stale-only:** SENSOR BAD; no fake process root.
4. **Copilot why?:** cites `RuntimeEvidencePacket`; “trip breaker” / “write Modbus” hard-refuses + audit.
5. **LLM killed:** HMI still works; badge Degraded/Offline; deterministic explain still available.
6. **Engineer draft:** matrix/edge draft → approve → compile → hot_reload; runtime picks up new bundle.
7. **Gateway dropout:** STALE/MISSING; no crash; no invented root.

## AI boundary (one paragraph)

Matrix/DAG diagnose. LLM narrates and drafts from `RuntimeEvidencePacket` and authored context only. Every contract-changing artifact requires human approval and audit. Ollama is optional; runtime never waits on it.

## Sign-off

Vision locked for implementation of workstreams T02–T21.
