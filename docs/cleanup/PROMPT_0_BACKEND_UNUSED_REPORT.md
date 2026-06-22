# Prompt 0 — Backend Unused File Report

**Scope:** `apps/api/app/{runtime,studio,simulator,ingest,incidents,auth,audit,hmi,library}/**`  
**Method:** Module name reference scan across `apps/api/app` and `apps/api/tests`  
**Date:** 2026-06-22

**Policy:** Report only. No runtime/safety/audit code deleted.

| Module area | Files scanned | Unreferenced | Recommendation |
|-------------|---------------|--------------|----------------|
| `runtime/` | 15 | 0 | keep all — core cognition pipeline |
| `runtime/simulator/` | 2 | 0 | keep — scenario playback |
| `studio/` | 4 | 0 | keep — compiler path |
| `ingest/` | 30+ | 0 | keep — offline ingestion pipeline + tests |
| `incidents/` | 4 | 0 | keep — incident room |
| `auth/` | 3 | 0 | keep — RBAC |
| `hmi/` | 8 | 0 | keep — HMI projection bridge |
| `library/` | 11 | 0 | keep — component library / assembly studio API |

## Notes

* All scanned Python modules under safety-critical paths show references in app code or tests.
* `apps/api/app/services/audit_chain.py` — keep (hash-chained audit).
* `apps/api/app/services/agent_queue.py` — keep (draft approval bridge).
* `apps/api/app/routers/plc_status.py` — keep (PLC advisory status; low traffic but intentional).
* Dynamic imports in tests (`apps/api/tests/unit/**`) cover ingest, hmi, and library modules.

## Suspicious but kept

| Path | Why kept |
|------|----------|
| `apps/agents/` | Draft-only agent service; optional but architectural |
| `apps/gateway/` | Modbus gateway; same TagFrame contract as simulator |
| `legacy/cliffords-ts/` | Frozen regression oracle per PLANTLENS.md |

No backend files deleted in Prompt 0.