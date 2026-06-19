# PlantLens Runtime Contracts — REST + WebSocket surface

The API is intentionally **boring**. Boring is stable. All paths are versioned under `/api/v1`.
Auto-generated OpenAPI lives at `/openapi.json` and is exported to `packages/contracts/openapi/`
to generate the frontend's TS client types.

## Health
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/healthz` | liveness |
| GET | `/readyz` | DB + gateway + config readiness |

## Plants & bundle
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/plants` | list plants |
| POST | `/api/v1/plants` | create / import a plant bundle |
| GET | `/api/v1/plants/{plant_id}` | plant metadata |
| GET | `/api/v1/plants/{plant_id}/bundle` | full validated authored bundle |

## Studio / compiler
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/plants/{plant_id}/validate` | validate all contracts (no deploy) |
| POST | `/api/v1/compiler/compile` | compile contracts → `compiled_hmi.json` + indexes |
| GET | `/api/v1/compiler/latest` | latest compiled bundle |
| GET | `/api/v1/compiler/validation-report` | last validation report |
| GET | `/api/v1/plants/{plant_id}/studio/forms` | form schema for Studio |
| POST | `/api/v1/studio/forms/assets` (etc.) | save authored asset/tag/alarm/edge |

## Runtime
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/plants/{plant_id}/runtime/tags` | current tag snapshot |
| GET | `/api/v1/plants/{plant_id}/runtime/assets` | derived asset status |
| GET | `/api/v1/plants/{plant_id}/runtime/alarms` | active + recent alarms |
| POST | `/api/v1/plants/{plant_id}/runtime/alarms/{alarm_id}/ack` | acknowledge (writes audit) |
| POST | `/api/v1/plants/{plant_id}/runtime/root-cause` | evaluate root cause from a symptom |
| GET | `/api/v1/runtime/calm-card/current` | current Calm Card |

## Graph
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/plants/{plant_id}/graph` | approved causal graph |
| POST | `/api/v1/plants/{plant_id}/graph/check` | lint: cycles, orphans, unknown refs |
| PATCH | `/api/v1/plants/{plant_id}/graph/edges/{id}` | draft edit (not live until approved+compiled) |

## Simulator
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/simulator/scenarios` | list scenarios |
| POST | `/api/v1/simulator/scenarios/{id}/start` | start a scenario run |
| POST | `/api/v1/simulator/scenarios/{id}/stop` | stop / reset runtime state |

## Incidents
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/incidents` | create from a Calm Card (escalate) |
| GET | `/api/v1/incident-room/{incident_id}` | full incident room object |
| POST | `/api/v1/incident-room/{incident_id}/comments` | add note (audit) |
| POST | `/api/v1/incident-room/{incident_id}/status` | change status (audit) |
| POST | `/api/v1/incident-room/{incident_id}/checklist/{check_id}/complete` | check item (audit) |

## Agents (draft-only)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/agents/graph-draft` | draft causal-edge candidates |
| POST | `/api/v1/agents/scenario-draft` | draft a scenario |
| POST | `/api/v1/agents/maintenance-draft` | draft an operator/maintenance note |
| GET | `/api/v1/agents/approvals` | approval queue |
| POST | `/api/v1/agents/approvals/{id}/approve` | approve → writes contracts + audit |

## Audit
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/plants/{plant_id}/audit` | audit feed (verify chain on read) |

---

## WebSocket — `/ws/runtime` (one per plant)

Client subscribe:
```json
{ "type": "subscribe", "topics": ["tags","alarms","root_cause","asset_status","scenario_state","calm_card"] }
```

Server frames (all carry `ts` and `plant_id`):

**runtime.snapshot** — the whole derived state (use this for MVP; optimize to deltas later):
```json
{ "type": "runtime.snapshot", "ts": "...", "state": {
  "tags": { "BUS_101_V": { "value": 20.86, "unit": "V", "quality": "GOOD", "asset_id": "BUS-101" } },
  "asset_status": { "MTR-301": "critical", "BUS-101": "warning", "INV-102": "warning" },
  "active_alarms": [ ... ],
  "active_situations": [ ... ],
  "latest_calm_card": { ... }
}}
```

**tag.frame** (delta), **alarm.event** (`raised`/`cleared`/`acked`), **active_situation** /
**situation_cleared**, **calm_card.created**, **scenario.state** — see each schema in
`packages/contracts/`.

### WebSocket discipline (degraded modes — build these in Chunk 13)
- Auto-reconnect with backoff.
- On disconnect: freeze last-known snapshot, show a **"LIVE DATA STALE — last known values"** badge.
- Raw alarm log/REST remains available as fallback.
- Never let a frozen plant *look* calm — stale must scream.
