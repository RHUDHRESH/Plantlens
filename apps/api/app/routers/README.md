# apps/api/app/routers — the HTTP/WS layer (thin)

One `APIRouter` per resource. Routers are THIN: validate input (Pydantic), call a service/engine,
return a schema. No business logic here. Full surface in `docs/RUNTIME_CONTRACTS.md`.

## Files
| File | Mounts | Calls | Chunk |
|------|--------|-------|-------|
| `health.py` | `/healthz`, `/readyz` | db/gateway readiness | 1 |
| `plants.py` | `/api/v1/plants...` | config_store / repositories.plants | 1 |
| `tags.py` | `/api/v1/.../runtime/tags` | runtime_state | 2 |
| `simulator.py` | `/api/v1/simulator/scenarios...` | runtime/simulator | 2 |
| `ws.py` | `/ws/runtime` | websocket_hub | 2 |
| `alarms.py` | `/api/v1/.../alarms`, `/ack` | alarm_engine, audit_chain | 3 |
| `runtime.py` | `/api/v1/.../runtime/{assets,root-cause}`, `/calm-card/current` | runtime engines | 3 |
| `studio.py` | `/api/v1/studio/forms/*`, `/validate` | config_store, validators | 4 |
| `compiler.py` | `/api/v1/compiler/{compile,latest,validation-report}` | studio/compiler | 4 |
| `graph.py` | `/api/v1/.../graph`, `/graph/check` | config_store, graph_checks | 4/9 |
| `hmi.py` | `/api/v1/.../hmi/views/{id}` | compiled bundle | 4 |
| `incident_room.py` | `/api/v1/incident-room/...` | incidents service | 10 |
| `agents.py` | `/api/v1/agents/*`, approvals | agents service (httpx) + audit | 11 |

## Conventions
- Prefix every router with its tag; mount all in main.py.
- Mutating endpoints depend on `require_role(...)` and write an audit record.
- Errors return the structured `{code,message,fix}` shape (DESIGN_SYSTEM.md), not bare 422s.
- `ws.py` accepts the connection, registers with the hub, then loops on receive until disconnect.

## Each router file
Create `<name>.py` with `router = APIRouter(prefix="/api/v1/...", tags=["..."])` and the endpoints
listed in `docs/RUNTIME_CONTRACTS.md`. Keep handlers a few lines each.
