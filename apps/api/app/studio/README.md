# apps/api/app/studio — the compiler ("the matrix compiles the interface")

Turns authored contracts (plant/tag_map/alarm_rules/causal_graph/action_envelope) into the
compiled bundle the runtime + maps consume. This is X-Factor 1: you don't draw screens, you compile
them from the model. Fail-closed: a validation error returns a structured message with a `fix` and
the runtime keeps the last known-good compiled bundle.

## Files
| File | Responsibility | Chunk |
|------|----------------|-------|
| `compiler.py` | orchestrates the compile pipeline (calls compiler_steps in order) | 4 |
| `compiler_steps/` | one file per step: load → validate → build indexes → project HMI → write | 4 |
| `validators.py` | reference integrity, threshold logic, missing-tag/3D warnings | 4 |
| `graph_checks.py` | cycle detection + topological order (networkx) | 4 |
| `id_generator.py` | clean auto IDs (INV-01, MOTOR-01) for drag-drop authoring | 4 |
| `config_store.py` | read/write authored contracts + compiled bundle (files now, DB later) | 4 |
| `schema_loader.py` | load JSON Schemas from packages/contracts for validation | 4 |

## Pipeline (compiler_steps, in order)
```
load_bundle → validate_bundle → build_asset_index → build_tag_index → build_alarm_index
→ build_graph_index → build_hmi_view_model → build_role_views → write_compiled_bundle
```

## Inputs → Outputs
IN  (authored): plant.json, tag_map.json, alarm_rules.json, causal_graph.json, action_envelope.yaml
OUT (compiled): compiled_hmi.json, runtime_tag_index.json, runtime_alarm_index.json,
                runtime_graph_index.json, runtime_role_views.json, validation_report.json
                + a content hash + version (for rollback + audit)

## Fatal errors vs warnings (validators.py)
Fatal (block compile, return with `fix`): unknown asset/tag/alarm reference, graph cycle,
unapproved edge on a runtime path, illogical thresholds (critical not more severe than warning),
duplicate IDs, missing source address.
Warnings (compile proceeds): asset missing 3D model, motor without inverter, critical asset with
no temperature tag, role with no visible panels.

## The rule
The compiled bundle is an OUTPUT — never hand-edited, never the source of truth. Change the
authored contracts and recompile. The compiler is the single authority that owns
compile/validate/hash/version.
