# apps/api/app/ingest — Python port of the Cliffords ingestion pipeline

This ports `legacy/cliffords-ts` into the Python backend so PlantLens has ONE language. Same
contracts, same 3 gates, same audit hash-chain — reimplemented with Pydantic. The legacy TS engine
stays frozen as the regression oracle; this must reproduce its outputs (the `golden` test tier).

> Chunk 1A (2026-06) delivers the offline authored-knowledge vertical slice. Live runtime
> ingest (`/api/ingest/frame`) is a separate gateway path and remains untouched.

**Full operator/developer docs:** [docs/OFFLINE_INGESTION.md](../../../../docs/OFFLINE_INGESTION.md)

## Implemented 1A Components

| Folder | Status | Purpose |
|--------|--------|---------|
| `stores/` | Done | Immutable raw + per-run JSON storage |
| `adapters/` | Done | CSV/XLSX → `RawRecord` |
| `detectors/` | Done | Document-kind + CSV dialect detection |
| `normalizers/` | Done | Tag, asset, unit, register normalization |
| `parsers/` | Done | Signal list + register map parsers |
| `mapping/` | Done | Mapping candidates for ambiguous rows |
| `gates/` | Done | Gate 1 integrity → Gate 2 schema → Gate 3 industrial truth |
| `quarantine.py` | Done | Quarantine record helpers |
| `drafts/` | Done | `DraftContract` builders (human approval required) |
| `reports/` | Done | `IngestionRunReport` builder |
| `pipeline.py` | Done | `run_offline_ingest_cycle` orchestrator |

## API

Routes live in `apps/api/app/routers/offline_ingest.py` at prefix `/api/offline-ingest`.
Upload produces draft-only output — nothing enters runtime without human approval.

## What it produces

Draft canonical records (tag proposals, register-map proposals) that feed the OFFLINE authoring
path: a human reviews/approves them in Studio before they enter approved contracts (R2/R5).
Nothing from ingestion enters the live runtime un-approved.

## Golden parity (deferred)

`tests/golden/` will feed legacy fixtures through both engines and assert identical canonical
output + gate verdicts. Deferred post-1A.