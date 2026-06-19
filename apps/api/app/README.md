# apps/api/app — application package

Thin top-level (`main`, `lifespan`, `settings`, `dependencies`), then one folder per concern.

| Folder | What lives there | README |
|--------|------------------|--------|
| `schemas/` | Pydantic transport models mirroring `packages/contracts` | `schemas/README.md` |
| `db/` | SQLAlchemy models (authored vs derived) + repositories | `db/README.md` |
| `auth/` | OIDC/JWT verify + RBAC | `auth/README.md` |
| `services/` | `audit_chain` (hash-chain), exports | `services/README.md` |
| `runtime/` | alarm + DAG + situation + calm-card + asset-status + projection engines | `runtime/README.md` |
| `runtime/simulator/` | scenario runner + simulator gateway | `runtime/simulator/README.md` |
| `studio/` | the compiler (contracts → compiled_hmi.json) + validators | `studio/README.md` |
| `incidents/` | incident room service/store/timeline/checklist | `incidents/README.md` |
| `ingest/` | Python port of the cliffords pipeline | `ingest/README.md` |
| `routers/` | thin HTTP/WS layer, one file per resource | `routers/README.md` |

## Data-flow reminder (the runtime tick)
`TagFrame → runtime_state → alarm_engine → dag_runtime → situation_engine → calm_card_engine →
asset_status → audit_chain.append → websocket_hub.broadcast`. Each arrow is a pure function call;
the only stateful thing is `runtime_state` (in-memory) and the DB. See `runtime/README.md`.
