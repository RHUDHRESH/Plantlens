# apps/api/app/runtime/simulator — simulator-first ingestion (rule R3)

This is what lets you build the entire product with zero hardware. The simulator emits the
**identical `TagFrame`** the RS485 gateway emits, so everything downstream (alarm/DAG/situation/
calm-card) is source-agnostic. Build this in Chunk 2 — it is the first full vertical slice's
data source.

## Files
| File | Responsibility | Chunk |
|------|----------------|-------|
| `scenario_runner.py` | parse + play a scenario from scenarios.json (set/ramp/fault events, timing) | 2 |
| `simulator_gateway.py` | drive the runtime tick from each emitted frame; broadcast snapshots | 2 |

## Three modes (build in order)
1. **Scenario mode** — fixed timed events from `scenarios.json`. The MVP + the demo path.
2. **Live noisy mode** — baseline values + parameterized noise (UI stress / chatter testing).
3. **Replay mode** — replay recorded CSV/JSON telemetry traces (demos, debugging, late-data tests).

## The contract that makes this work
Every frame the simulator emits MUST be a valid `TagFrame` (packages/contracts/tag_frame.schema.json)
with `source="simulator"`. When you later add the gateway (apps/gateway), it emits the same shape
with `source="modbus_rtu"`. The HMI top strip shows which source is live; nothing else changes.

## Determinism
Scenario mode is deterministic: same scenario → same frames → same alarms → same situation → same
Calm Card, every time. That determinism is the demo's reliability AND the test suite's backbone
(each scenario carries `expected_root_cause` / `expected_alarms`).
