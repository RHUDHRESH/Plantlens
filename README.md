# PlantLens

> Deterministic, read-only industrial cognition. It collapses an alarm flood into ONE
> evidence-backed root-cause **Situation**, renders it as a calm decision card on a live plant
> map, and keeps a hash-chained audit of every decision. AI drafts; humans approve; the runtime
> stays deterministic; nothing writes to hardware.

**New here? Read [`PLANTLENS.md`](PLANTLENS.md) first**, then [`docs/`](docs/README.md).

## Repository layout (monorepo)

```
plantlens/
├─ PLANTLENS.md            ← master build document (start here)
├─ docs/                   ← architecture, build order, libraries, design system, contracts
├─ packages/
│  ├─ contracts/           ← JSON-schema spine (single source of truth)
│  ├─ sample-data/         ← demo-microgrid bundle (validates against contracts)
│  ├─ ui-tokens/           ← design tokens (CSS vars source)
│  └─ icons/               ← domain SVG symbols (motors, buses, breakers…)
├─ apps/
│  ├─ api/                 ← FastAPI modular monolith (the spine): ingest, runtime, studio, incidents, audit
│  ├─ gateway/             ← Modbus/RS485 poller (separate process; read-only)
│  ├─ agents/              ← draft-only AI service (optional; never on the live path)
│  └─ web/                 ← React 19 + Vite: runtime HMI, Studio, 2D/3D maps, Calm Cards, Incident Room
├─ deploy/                 ← Docker, compose, k8s, CI
└─ legacy/
   └─ cliffords-ts/        ← original TS ingestion engine, FROZEN as regression oracle
```

## Quick start (bootstrap — Prompt 3)

```bash
pnpm install                                   # web + workspace (root pnpm-lock.yaml)
pnpm contracts:validate                        # schema canary (must pass)
pnpm oracle                                    # cliffords regression oracle
cd apps/api && uv sync --extra dev             # backend deps + lint/test tools (uses apps/api/uv.lock)
pnpm compose:config                            # validate Docker compose skeleton
# Full stack (after runtime is implemented):
docker compose -f deploy/docker/compose.full.yml up --build
# compile the demo, then run the hero scenario:
curl -X POST localhost:8000/api/v1/compiler/compile
curl -X POST localhost:8000/api/v1/simulator/scenarios/scn_motor_overload/start
# open the web app → watch the motor go red and the Calm Card appear
```

## The non-negotiable rules (full list in PLANTLENS.md §2)
1. One canonical plant model — every view reads `packages/contracts`.
2. The DAG runtime is deterministic and read-only (approved edges only).
3. Simulator-first — sim and gateway emit the identical `TagFrame`.
4. Forms are the source of truth; React Flow is a projection.
5. Agents draft only — behind a human-approval gate.
6. Append-only hash-chained audit for everything.
7. The gateway never diagnoses, compiles, or runs an LLM.
8. 2D is default; 3D is a lazy-loaded enhancement.

## Lockfiles

| Stack | File | Policy |
|-------|------|--------|
| Node (monorepo) | root `pnpm-lock.yaml` | Required; CI uses `pnpm install --frozen-lockfile`. |
| Node (oracle) | `legacy/cliffords-ts/pnpm-lock.yaml` | Separate; do not merge into root lock. |
| Python (`apps/api`) | `apps/api/uv.lock` | Keep when present; regenerate with `uv sync` after `pyproject.toml` changes. |
| Python (`apps/gateway`, `apps/agents`) | `uv.lock` per app | Add only when that app’s deps are synced with `uv` (future prompts). |

## Status
This repo is currently a **scaffold** through **Prompt 6** (contract mirrors + guardian): every
folder has a `README.md` describing its files, and every source file has a SPEC header describing
what to build (with a `TODO(you)` marker). API health, DB, runtime engines, and UI behavior are not
implemented yet. Follow [`docs/BUILD_ORDER.md`](docs/BUILD_ORDER.md) chunk by chunk via
[`docs/BUILD_MANUAL_40_PROMPTS.md`](docs/BUILD_MANUAL_40_PROMPTS.md).

## License
TBD.
