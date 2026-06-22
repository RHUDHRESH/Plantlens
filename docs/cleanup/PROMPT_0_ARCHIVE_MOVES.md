# Prompt 0 — Archive Moves

**Branch:** `cleanup/prompt-0-repo-deconfusion`  
**Date:** 2026-06-22

Each archived file received this banner at the top:

> ARCHIVED HISTORICAL CONTEXT — not current build instruction. Current source of truth: PLANTLENS.md.

| From | To | Reason |
|------|-----|--------|
| `docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` | `docs/archive/obsolete-plans/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` | Planning-only blueprint; implementation complete; `docs/OFFLINE_INGESTION.md` is current |
| `docs/OFFLINE_INGESTION_CHUNK_1A_FINAL.md` | `docs/archive/obsolete-plans/OFFLINE_INGESTION_CHUNK_1A_FINAL.md` | Chunk completion report; superseded by `docs/OFFLINE_INGESTION.md` |
| `bms_server.py` | `docs/archive/legacy-notes/bms_server.py` | Pre-PlantLens Inovance EASY302 BMS bridge; useful hardware context but not PlantLens architecture |

## Created

| Path | Purpose |
|------|---------|
| `docs/archive/README.md` | Warns agents not to follow archived docs |
| `docs/archive/research/` | Empty; reserved for future research dumps |
| `docs/archive/old-prompts/` | Empty; reserved for past prompt logs |
| `docs/archive/obsolete-plans/` | Completed/abandoned plans |
| `docs/archive/legacy-notes/` | Hardware experiments and scratch code |