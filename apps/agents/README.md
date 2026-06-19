# apps/agents — draft-only AI plane (Chunk 11, optional)

Useful AI with **zero operational authority** (rule R5). Agents produce DRAFT artifacts behind a
human-approval gate. They never touch hardware, never mutate the live causal graph, never
auto-approve. A provider outage must never affect the live HMI (this service is isolated).

## Files
| File | Responsibility |
|------|----------------|
| `agents/main.py` | FastAPI app exposing draft endpoints (the API proxies to these) |
| `agents/registry.py` | provider-agnostic adapter (OpenAI primary, Gemini fallback) + the agent roster |
| `agents/prompts/` | one prompt per task (markdown): graph_draft, alarm_rule_draft, scenario_draft, maintenance_note |
| `agents/tools/` | safe read-only tools: schema_search, plant_context, diff_checker, export_preview |
| `agents/workflows/` | LangGraph workflows: graph_draft, scenario_builder, maintenance_draft (each ends at an approval node) |

## Agent roster (all draft/read only)
| Agent | Role | Permission |
|-------|------|-----------|
| Build | generate Studio drafts from spreadsheets/docs | draft only |
| Tag Mapper | suggest tag mappings/aliases | suggestion only |
| Alarm Explainer | explain active paths + confidence | read only |
| Maintenance Planner | fault path → work suggestion | draft only |
| Scenario Author | build simulator scenarios from templates | draft only |
| HMI Narrator | summarize live state for operators | read only |
| Data Quality | detect bad mappings/stale tags/drift | read only |
| Change Review | diff compiled models, highlight risk | recommendation only |

## The approval workflow (every agent action)
1. agent proposes a DRAFT artifact (schema-constrained output)
2. system attaches evidence + impacted assets
3. it lands in the API approval queue (`/api/v1/agents/approvals`)
4. a human (engineer+) approves or rejects
5. approval is hash-chained (audit) and ONLY THEN writes to contracts
6. live device writes are never an agent capability

## Tool boundary (registry.py enforces)
ALLOWED tools: search templates, inspect asset graph, read telemetry history, explain alarms,
propose threshold changes, draft rule expressions, generate work-order/scenario drafts, retrieve
manuals.
FORBIDDEN: write Modbus, toggle outputs, arm relays, ack device alarms, mutate runtime config
without approval. If an agent can act on control surfaces, you've broken the product.

## Prompt discipline (prompts/)
"Use only the provided evidence. Do not invent sensor readings. Do not recommend action beyond the
approved action envelope. Output must match the provided JSON schema." Keep explanations grounded
in the deterministic Situation/evidence — the agent rewrites, it does not diagnose.
