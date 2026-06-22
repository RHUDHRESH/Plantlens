# PlantLens Agent Instructions

You are modifying PlantLens, an industrial HMI/cognition system.

## Source of truth

1. `PLANTLENS.md`
2. `docs/BUILD_ORDER.md`
3. `docs/DESIGN_SYSTEM.md`
4. `docs/ALGORITHMS.md`
5. `packages/contracts`
6. `packages/sample-data/demo-microgrid`

## Hard rules

* Do not put AI/LLM logic in the live runtime diagnosis path.
* Runtime DAG uses approved edges only.
* Do not mutate graph/rules at runtime.
* Simulator and gateway must emit the same `TagFrame` contract.
* 2D map is canonical/default.
* 3D is lazy-loaded and must not block runtime load.
* Forms are source of truth; graph/3D are projections.
* Agents draft only and need human approval.
* PlantLens is read-only advisory; no direct hardware control.
* Do not introduce uncontrolled colors, blinking critical alarms, game-like UI, or dashboard clutter.
* Do not hand-draw one-off HMI screens when they should compile from model/contracts.
* Do not bypass tests.
* If unsure, ask or write a cleanup report; do not freestyle.
* Do not start from `docs/archive/` unless explicitly asked.

## Before changing code

1. Read the relevant README/spec files.
2. Locate existing types/contracts.
3. Check imports/usages.
4. Make the smallest safe change.
5. Add/update tests.
6. Run the required checks.

## Required checks

```bash
pnpm contracts:validate
python -m pytest apps/api/tests -q
pnpm --filter @plantlens/web typecheck
pnpm --filter @plantlens/web test
pnpm --filter @plantlens/web build
```