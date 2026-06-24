# PlantLens

Next-generation industrial control-system HMI — a deterministic *cognition layer* that collapses alarm floods into calm, evidence-backed situations. Built for the ABB Accelerator 2026.

## Architecture (in one breath)

A read-only **FastAPI** backend compiles HMI screens from versioned JSON *model* files validated by **Pydantic 2**; a **Vite / React 19 / Zustand** frontend renders a 3D plant map with **three.js / R3F**. Hardware sits below a single `SourceAdapter` interface (Modbus today, OPC-UA in production) so nothing above the canonical-signal boundary changes on swap.

```
Source → Signal Abstraction → State Estimation → [Known Fault Scoring | Unknown Anomaly]
       → Causal Grouping → Evidence → Action Envelope → HMI Projection → Interaction → Audit
```

## Three inviolable laws
1. **PlantLens reads, never writes.** No write methods exist on `SourceAdapter`.
2. **AI proposes, engineer approves, deterministic engine executes.**
3. **No ML in the live path.** scikit-learn only loads frozen artifacts; `.fit()` never runs live.

## Repo layout
```
plantlens/
├─ pyproject.toml          # uv-managed backend deps (Python 3.12)
├─ package.json            # pnpm workspace root (Node 24)
├─ models/                 # AUTHORED TRUTH — versioned JSON
├─ geometry/               # type-keyed schematic 3D assets
├─ backend/app/            # FastAPI app + pipeline + sources + audit + hmi
├─ frontend/               # Vite + React 19 + R3F 3D plant map
├─ studio/                 # low-code authoring canvas
├─ miners/                 # offline ML (engineer-gated, never live)
└─ firmware/               # reference ESP32 Modbus slave
```

## Quick start
```bash
# Backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
pnpm install
pnpm dev          # http://localhost:5173

# End-to-end smoke test
uv run python -m app.tests.test_pipeline
```

## Keystone pattern: parameterized assets (MATLAB/Simscape-style)
An `AssetType` is a parameterized "block" (full typed datasheet of `parameters`); an `AssetInstance` fills in overrides. Those parameters auto-derive signal definitions, thresholds (`warning_high = rated_current × service_factor`), fault-mode symptom expectations, and bind to a reusable schematic GLB from a type-keyed geometry library.
