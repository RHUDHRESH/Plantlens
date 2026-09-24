# Retirement of `backend/` (flat prototype)

`backend/` was an early flat FastAPI prototype that ran alongside the canonical monorepo API in
`apps/api`. Nothing in CI, Docker or the docs used it: CI's "backend" job already ran
`apps/api`, and `apps/gateway/README.md` warned against using it. It was removed in the v2
overhaul (branch `overhaul/plantlens-v2`).

## What was ported, and what wasn't

**Action role gating** (`action_evaluator.py`) was ported. `apps/api` never enforced the
envelope's `allowed_roles`. It now does:
- `calm_card_engine.evaluate_actions_for_role` evaluates each action against the viewer's role
  and against `blocked_if` alarms.
- `GET /api/runtime/actions` returns that evaluation per caller.

**Register scan and binding commit** (`main.py:/api/scan`, `/api/bindings`) was superseded.
- Port and register discovery now lives in the gateway's commissioning endpoints (auto-detect by
  VID/PID and a Modbus batch planner).
- Changes to plant-model bindings go through the change pipeline (`docs/CHANGE_PIPELINE.md`),
  never through direct file writes.

**Calm Card text templates** (`data/templates.json`) were not ported. They were keyed to a
different demo (motor "M-04") and situation ids the current plant doesn't use. Their content
(checks, counter-evidence, consequence text) is now covered, with engineer review, by:
- causal pattern `checks` and `discriminators`;
- `situation_types.why_it_matters`.

The alarm engine, DAG engine, WebSocket hub, audit ledger and Modbus poller already had canonical
implementations in `apps/api` and `apps/gateway`, so they were not ported.
