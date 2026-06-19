# PlantLens Contracts — the schema spine

Everything compiles from data contracts. Not "some parts" — **all of it**. The JSON Schemas in
`packages/contracts/` are the single source of truth. Backend validates with Pydantic models
that mirror them; frontend validates with Zod schemas that mirror them; the demo bundle in
`packages/sample-data/demo-microgrid/` must validate against all of them.

## The contract families

| Family | File | What it pins down | Authored / Derived |
|--------|------|-------------------|--------------------|
| Plant structure | `plant.schema.json` | assets, areas/zones, connections, 2D+3D coords, roles | Authored |
| Tag binding | `tag_map.schema.json` | semantic tag → source (sim/modbus), register, unit, quality policy | Authored |
| Alarm rules | `alarm_rules.schema.json` | tag, operator, thresholds, debounce, deadband, priority, ack, shelve | Authored |
| Causal graph | `causal_graph.schema.json` | nodes, **approved** edges, lag windows, root-cause rules, provenance | Authored |
| Action envelope | `action_envelope.schema.json` | allowed actions per situation, roles, blocked_if, isolation, safety | Authored |
| HMI view model | `hmi_view_model.schema.json` | compiled 2D/3D nodes+edges, widgets, panels, role views | **Compiled** |
| Scenarios | `scenarios.schema.json` | simulator events with timing, expected_root_cause, expected_alarms | Authored (test) |
| Tag frame | `tag_frame.schema.json` | the live telemetry envelope (sim + gateway both emit this) | Runtime |
| Situation | `situation.schema.json` | grouped alarms, root, affected, causal path, evidence | Derived |
| Calm card | `calm_card.schema.json` | first signal, evidence chain, why, best check, blocked, raw count | Derived |
| Incident | `incident.schema.json` | incident room: status, checklist, timeline, resolution | Derived+authored |
| Audit | `audit.schema.json` | append-only hash-chained record | Runtime |

## The two contracts you must get right first

### `tag_frame.schema.json` — the universal telemetry envelope
This is what makes simulator-first work (R3). Simulator and RS485 gateway emit the *identical*
shape. Everything downstream is source-agnostic.
```json
{
  "tag_id": "BUS_101_V",
  "asset_id": "BUS-101",
  "value": 20.86,
  "unit": "V",
  "quality": "GOOD",
  "timestamp": "2026-06-18T12:48:12.100Z",
  "source": "simulator",
  "seq": 1881
}
```
`quality ∈ {GOOD, UNCERTAIN, BAD, STALE, MISSING}`. `source ∈ {simulator, modbus_rtu, modbus_tcp,
manual, backfill}`. `seq` enables dedupe by `(source, tag_id, seq, timestamp)`.

### `causal_graph.schema.json` — the runtime truth
The DAG runtime ONLY traverses edges with `approved: true` (R2). Every edge carries a lag window
`[lag_min_ms, lag_max_ms]` (time-respecting traversal), a `provenance`
(`cause_effect_matrix | hazop | pid | historian | operator_note | manual`), and a `confidence`.
Unapproved edges are visible in Studio but **never enter runtime**.

## Naming conventions (enforce these in validators)
- **Asset IDs:** `^[A-Z0-9-]+$` (e.g. `MOTOR-301`, `DC_BUS_01` — pick one separator and be
  consistent; the demo uses hyphen for asset IDs and underscore for tag IDs).
- **Tag IDs:** `^[A-Z0-9_]+$`, conventionally `<ASSET>_<SIGNAL>` (e.g. `MOTOR_301_VIB`).
- **Alarm IDs / Situation types:** `SCREAMING_SNAKE_CASE`.
- Every cross-reference must resolve: a tag's `asset_id` must exist in `plant.json`; an alarm's
  `tag` must exist in `tag_map.json`; a graph edge's endpoints must exist as nodes; an action's
  `situation_ids` must be real situation types. The compiler's validators enforce all of this.

## Keeping the three mirrors in sync (the discipline that prevents drift)
1. **JSON Schema** in `packages/contracts/*.schema.json` is canonical.
2. **Pydantic** models in `apps/api/app/schemas/*.py` mirror them; you can also generate the JSON
   Schema *from* Pydantic (`model_json_schema()`) and diff against the canonical file in CI.
3. **Zod** schemas in `apps/web/src/app/schemas/*` mirror them; or generate TS types from the
   exported OpenAPI (`packages/contracts/openapi/openapi.json`).

CI fails on drift (`contract-validate` job): regenerate-and-diff. If the three disagree, the
build breaks — that is the point.

## Compiled vs authored — never edit the compiled bundle by hand
`hmi_view_model.json` and the runtime indexes (`runtime_tag_index.json`,
`runtime_alarm_index.json`, `runtime_graph_index.json`) are *outputs* of the compiler. They are
regenerated on every compile and are never hand-edited or treated as source. If you need to change
the HMI, change the authored contracts and recompile.
