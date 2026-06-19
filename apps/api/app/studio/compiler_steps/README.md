# compiler_steps — one pure function per stage

Each file exports one function. compiler.py calls them in order. Keep them pure and individually
unit-tested. (Create each as `<name>.py` with a SPEC header like the runtime engines.)

| File | Function | Does |
|------|----------|------|
| `load_bundle.py` | `load_bundle(plant_id) -> dict` | read plant/tag_map/alarm_rules/causal_graph (JSON) + action_envelope (YAML via yaml.safe_load) |
| `validate_bundle.py` | `validate_bundle(bundle) -> ValidationResult` | run validators.py + graph_checks.py; collect errors+warnings with `fix` text |
| `build_asset_index.py` | `build_asset_index(bundle) -> dict` | asset_id -> {name,type,zone,criticality,parent,map,scene,tags:[],alarms:[]} |
| `build_tag_index.py` | `build_tag_index(bundle, asset_index) -> dict` | tag_id -> tag + runtime_value placeholder; append tag_id to its asset |
| `build_alarm_index.py` | `build_alarm_index(bundle, tag_index) -> dict` | alarm_id -> rule + active/acked flags |
| `build_graph_index.py` | `build_graph_index(bundle, alarm_index) -> dict` | APPROVED edges only → {nodes, edges, adjacency, reverse_adjacency} |
| `build_hmi_view_model.py` | `build_hmi_view_model(...) -> dict` | map_2d nodes/edges (from coords_2d + connections), map_3d (coords_3d), widgets, panels |
| `build_role_views.py` | `build_role_views(bundle, hmi) -> dict` | filter the hmi per role (operator sees situations; maintenance sees NE107 device-health; etc.) |
| `write_compiled_bundle.py` | `write_compiled_bundle(compiled) -> None` | write compiled_hmi.json + runtime_*_index.json + validation_report.json to COMPILED_DIR |

## Rules
- `build_graph_index` MUST drop unapproved edges (rule R2) — they never reach the runtime.
- `build_hmi_view_model` shares node ids between map_2d and map_3d; only coords differ.
- `write_compiled_bundle` writes atomically (temp file + rename) so a crash never leaves a partial
  bundle the runtime might load.
