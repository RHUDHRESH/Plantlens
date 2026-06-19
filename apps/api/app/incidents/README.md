# apps/api/app/incidents — Incident Room (post-escalation response workflow)

When a Calm Card is escalated, this creates a shared, evidence-first command record (NOT a
chat-first ticket). One object carries root asset, live state, the Calm Card, the evidence bundle,
a response checklist, an append-only timeline, and resolution. Every mutation is hash-chained.

## Files
| File | Responsibility |
|------|----------------|
| `incident_room_service.py` | build the full IncidentRoom object (merges stored incident + LIVE runtime state) |
| `incident_store.py` | persist/load incidents (files now, DB later); append-only timeline |
| `incident_timeline.py` | make timeline items (incident_created/status_changed/comment/checklist_updated/resolution) |
| `incident_checklist.py` | generate a checklist from the situation_type (structured response steps) |
| `incident_status.py` | the state machine: open→acknowledged→in_progress→resolved→closed |
| `incident_resolution.py` | capture resolution (confirmed root cause, action, downtime, diagnosis-correct) |

## Validates against
`packages/contracts/incident.schema.json`.

## Rules
- Timeline is APPEND-ONLY. Never edit an item; add a correction entry instead.
- `live_state` is recomputed from current runtime on every fetch, so the room shows live truth
  (still_active?), not a frozen snapshot.
- Every comment / status change / checklist completion writes an audit record (R6).
- Remote users are READ-ONLY in v1 (no control writes from the room).

## Build (Chunk 10)
Start with: GET incident room, add comment, change status, complete checklist item. Skip
multi-user presence, attachments, PDF export for MVP.
