# Prompt 0 — Deletions

**Branch:** `cleanup/prompt-0-repo-deconfusion`  
**Date:** 2026-06-22

All paths relative to repo root.

| File | Reason |
|------|--------|
| `bms_3d.html` | Pre-PlantLens BMS 3D verification page; unrelated to demo-microgrid runtime |
| `bms_3d_verify.png` | Screenshot artifact from BMS experiment |
| `bms_3d_verify_2d.png` | Screenshot artifact from BMS experiment |
| `bms_server.py` | Standalone BMS Modbus bridge; not PlantLens gateway/simulator (archived copy in `docs/archive/legacy-notes/`) |
| `hmi_probe.py` | One-off Modbus TCP probe script; not referenced by tests or build |
| `modbus_scout.py` | One-off Modbus RTU scout script; not referenced by tests or build |
| `terminals/.next-id` | Local harness counter; should not be committed |
| `docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` | Moved to archive (not deleted) |
| `docs/OFFLINE_INGESTION_CHUNK_1A_FINAL.md` | Moved to archive (not deleted) |

## Not deleted (gitignored locally, never committed)

* `__pycache__/`, `*.pyc`, `node_modules/`, `apps/web/dist/`, `*.log`, `bms_history.db`
* `agent-tools/`, `terminals/*.log`, `.cliffords-data/`
* `apps/process-studio/` (local experiment; untracked)

## .gitignore additions

Added ignore rules for `tmp/`, `temp/`, `terminals/`, and pre-PlantLens `bms_*` / probe scripts to prevent re-commit.