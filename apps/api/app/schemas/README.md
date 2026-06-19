# apps/api/app/schemas — Pydantic transport models (mirror of packages/contracts)

These are **transport + validation** models for request/response bodies and internal payloads.
They mirror the JSON Schemas in `packages/contracts/` one-to-one. They are **NOT** the database
models (those live in `app/db/models/` and are a different layer — see `app/db/README.md`).

## Files (one per contract family + a couple of request/response wrappers)
| File | Mirrors contract | Key models |
|------|------------------|-----------|
| `tag_frame.py` | tag_frame.schema.json | `TagFrame` (quality + source Literals) |
| `plant.py` | plant.schema.json | `Plant`, `Asset`, `Connection`, `Area` |
| `tag.py` | tag_map.schema.json | `TagMap`, `TagBinding`, `Source`, `Register` |
| `alarm.py` | alarm_rules.schema.json | `AlarmRule`, `AlarmCondition`; + runtime `ActiveAlarm` |
| `dag.py` | causal_graph.schema.json | `CausalGraph`, `CausalNode`, `CausalEdge` |
| `situation.py` | situation.schema.json | `Situation`, `EvidenceItem` |
| `calm_card.py` | calm_card.schema.json | `CalmCard`, `FirstSignal`, `RecommendedAction`, `BlockedAction` |
| `action.py` | action_envelope.schema.json | `ActionEnvelope`, `Action` |
| `hmi.py` | hmi_view_model.schema.json | `HmiViewModel`, `MapNode`, `MapEdge` |
| `scenario.py` | scenarios.schema.json | `Scenario`, `ScenarioEvent` |
| `incident.py` | incident.schema.json | `IncidentRoom`, `ChecklistItem`, `TimelineItem`, `Resolution` |
| `audit.py` | audit.schema.json | `AuditRecord` |
| `validation.py` | (compiler) | `Issue`, `ValidationResult` |
| `compile_result.py` | (compiler) | `CompileResult` |
| `agent.py` | (agents) | `DraftRequest`, `DraftArtifact`, `Approval` |

## The sync discipline
You can generate the canonical JSON Schema FROM these (`Model.model_json_schema()`) and diff it in
CI against `packages/contracts/*.schema.json` (the `contract-validate` job). If they drift, the
build fails. Use `Literal[...]` for every enum so the two stay identical.

## Convention
- Use `Field(pattern=..., ge=..., default_factory=...)` to encode the schema constraints.
- Use `model_config = ConfigDict(extra="forbid")` to match `additionalProperties: false`.
- Keep these free of DB/ORM imports. They cross the wire; they don't touch SQLAlchemy.
