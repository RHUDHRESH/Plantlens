> ARCHIVED HISTORICAL CONTEXT — not current build instruction. Current source of truth: PLANTLENS.md.

# Chunk 1A Final — Offline Ingestion Complete

**Date:** 2026-06-20  
**Status:** Chunk 1A complete — API demoable, draft-only, human-review path.

## Summary of All 10 Chunks

| Chunk | Deliverable |
|-------|-------------|
| 1A.1 | Implementation plan (`docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md`) |
| 1A.2 | Pydantic schema spine (`apps/api/app/schemas/ingest/`) |
| 1A.3 | Immutable local run storage (`apps/api/app/ingest/stores/`) |
| 1A.4 | CSV/XLSX adapters (`apps/api/app/ingest/adapters/`) |
| 1A.5 | Document-kind detection (`apps/api/app/ingest/detectors/`) |
| 1A.6 | Deterministic normalizers (`apps/api/app/ingest/normalizers/`) |
| 1A.7 | Signal/register parsers + mapping (`apps/api/app/ingest/parsers/`, `mapping/`) |
| 1A.8 | Gates + quarantine (`apps/api/app/ingest/gates/`, `quarantine.py`) |
| 1A.9 | Draft builders, report builder, pipeline orchestrator |
| 1A.10 | API routes, fixtures, integration tests, docs |

## Files / Folders Created

```
apps/api/app/ingest/          # Full offline pipeline
apps/api/app/schemas/ingest/  # Pydantic contracts
apps/api/app/routers/offline_ingest.py
apps/api/tests/fixtures/ingest/
apps/api/tests/integration/test_offline_ingest_api.py
apps/api/tests/unit/ingest/
docs/OFFLINE_INGESTION.md
```

## Final API Surface

Prefix: `/api/offline-ingest`

- `POST /uploads` — file upload (engineer)
- `POST /text` — pasted content (engineer)
- `GET /runs/{run_id}` — run summary (viewer)
- `GET /runs/{run_id}/report` — full report (viewer)
- `GET /runs/{run_id}/drafts` — draft contracts (viewer)
- `GET /runs/{run_id}/quarantine` — quarantined rows (viewer)

## Test Commands

```bash
cd apps/api

python -m pytest tests/integration/test_offline_ingest_api.py -q
python -m pytest tests/unit/ingest/test_offline_ingest_router_guards.py -q
python -m pytest tests/unit/ingest -q
python -m pytest tests/test_gateway_ingest.py -q
python -m pytest tests -q
ruff check app/ingest app/routers/offline_ingest.py tests
mypy app/ingest app/routers/offline_ingest.py
```

## Known Deferrals (Post-1A)

- `POST /runs/{run_id}/resolve-quarantine`
- `POST /runs/{run_id}/rerun`
- Studio approval UI wiring
- Contract patch application (tag_map, alarm_rules, causal_graph)
- PDF/OCR/operator-note parsers
- Alarm history, cause-effect, HAZOP parsers
- Golden parity tests vs legacy Cliffords
- Async file streaming for large uploads

## Demo Script

1. Start API: `uvicorn app.main:app --reload --port 8000`
2. Get engineer token: `POST /internal/auth-test/dev-token` with `{"role":"engineer"}`
3. Upload `physical_demo_signal_list.csv` to `POST /api/offline-ingest/uploads`
4. `GET /api/offline-ingest/runs/{run_id}/report` — expect 18 drafts, `downstream_ready_for_studio=true`
5. `GET /api/offline-ingest/runs/{run_id}/drafts` — 18 `tag_draft` contracts, all `requires_human_approval=true`
6. Quarantine empty on clean upload
7. Upload `physical_demo_signal_list_missing_unit.csv`
8. `GET /quarantine` — at least one row with `suggested_fix` and `source_ref`

## Red-Team Checklist

- [x] No `/api/ingest` behavior change
- [x] No runtime mutation from offline path
- [x] No legacy TypeScript import
- [x] No auto-approval (`requires_human_approval` always true)
- [x] No AI in live diagnosis path
- [x] Source refs preserved on quarantine records
- [x] Bad rows quarantined, not promoted to drafts
- [x] Gateway ingest token not accepted on offline routes
- [x] RBAC (engineer/viewer) enforced on offline routes