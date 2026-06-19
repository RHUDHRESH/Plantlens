# apps/api/app/db — persistence (SQLAlchemy 2.0)

The DB layer. **ORM models here are NOT the Pydantic schemas** (those are transport — `app/schemas`).
Keep authored config and derived runtime state in separate tables (docs/ARCHITECTURE.md "three
layers of truth").

## Files
| File | Purpose |
|------|---------|
| `base.py` | `class Base(DeclarativeBase)` + shared mixins (id, created_at, updated_at) |
| `session.py` | async engine + `async_sessionmaker`; `get_session()` used by dependencies.get_db |
| `models/` | ORM models (see below) |
| `repositories/` | data-access functions (no business logic; the services call these) |

## models/ (one file per aggregate)
| File | Tables | Layer |
|------|--------|-------|
| `plant.py` | plant, asset, connection, tag_binding (authored config) | authored |
| `rule.py` | alarm_rule, causal_node, causal_edge, action (authored) | authored |
| `compiled.py` | compiled_bundle (versioned + hash) | compiled |
| `run.py` | scenario_run, tag_event (immutable event log) | event |
| `alarm.py` | alarm_event, alarm_ack/shelve (immutable) | event |
| `situation.py` | situation, calm_card (derived snapshots, for replay/audit) | derived |
| `incident.py` | incident, checklist_item, timeline_item, resolution | derived+authored |
| `audit.py` | audit_record (append-only, hash-chained) | audit |
| `user.py` | user, role (or just role claims if using external OIDC) | auth |

## repositories/ (thin data access)
`plants.py`, `alarms.py`, `runs.py`, `audit.py`, `incidents.py` — each exposes async CRUD/query
functions. No alarm/DAG logic here; that's `app/runtime`.

## Migrations
Alembic in `apps/api/migrations/`. Use `autogenerate`. Never edit the DB by hand.

## MVP shortcut
For the first slice you can run entirely off in-memory `runtime_state` + the file-backed
`config_store` and skip most of the DB. Add tables as you need durability (events, audit,
incidents). SQLite (`aiosqlite`) first; Postgres (`psycopg`) when concurrency demands it.
