# Offline Authored-Knowledge Ingestion

Offline ingestion turns engineer-authored files (signal lists, register maps, and future alarm histories) into **draft contracts** for human review in Studio. It never mutates the live runtime.

## What It Is

- A Python pipeline under `apps/api/app/ingest/` that ingests CSV/XLSX tables.
- Immutable raw artifact storage (SHA-256 content addressing).
- Deterministic detection, parsing, normalization, three safety gates, quarantine, and draft generation.
- REST API at `/api/offline-ingest` protected by normal JWT/RBAC.

## What It Is Not

- Not live telemetry ingest (`/api/ingest/frame` is a separate gateway path).
- Not runtime deployment — drafts require human approval before any contract patch.
- Not PLC/simulator/gateway writes.
- Not AI/LLM/OCR — no probabilistic parsing in the live path.
- Not auto-approval — every `DraftContract` has `requires_human_approval=true` and `status=pending`.

## API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/offline-ingest/uploads` | engineer | Upload CSV/XLSX file |
| POST | `/api/offline-ingest/text` | engineer | Paste CSV-like text |
| GET | `/api/offline-ingest/runs/{run_id}` | viewer | Lightweight run summary |
| GET | `/api/offline-ingest/runs/{run_id}/report` | viewer | Full `IngestionRunReport` |
| GET | `/api/offline-ingest/runs/{run_id}/drafts` | viewer | Draft contracts |
| GET | `/api/offline-ingest/runs/{run_id}/quarantine` | viewer | Quarantined rows |

Deferred: `resolve-quarantine`, `rerun`.

## Auth Model

- Uses `require_engineer` for upload/paste endpoints.
- Uses `require_viewer` for read endpoints.
- **Does not** use the gateway ingest token (`GATEWAY_INGEST_TOKEN`).
- Dev tokens: `POST /internal/auth-test/dev-token` with role `engineer` or `viewer`.

## Supported First Slice

| Format | Document kind | Output |
|--------|---------------|--------|
| CSV signal list | `signal_list` | `tag_draft` contracts |
| CSV register map | `register_map` | `register_map_draft` contracts |
| XLSX table | `signal_list` or `register_map` | Same (sheet-aware adapter) |

## Unsupported / Deferred

- PDF, OCR, images, audio
- Free-form operator note parser
- JSON historian exports
- HAZOP full parser
- Cause-effect matrix parser
- Alarm-history parser

## End-to-End Flow

```
upload/paste
  → immutable RawArtifact (SHA-256)
  → adapter (CSV/XLSX)
  → document-kind detection
  → parser (signal_list / register_map)
  → normalizer
  → Gate 1 (artifact integrity)
  → Gate 2 (canonical schema)
  → Gate 3 (industrial truth)
  → quarantine (bad/ambiguous rows)
  → DraftContract (human approval required)
  → IngestionRunReport
  → later: Studio human approval → contract patch → compile
```

`downstream_ready_for_studio=true` means ready for human review — **not** runtime deployment.

## Safety Statement

Offline ingestion **never** mutates live runtime automatically. Drafts require human approval. It does not write to PLCs, the simulator, or the gateway.

### Red-team hardening (Chunk 1A.HF1)

- Mapping-review rows cannot become drafts: Gate 3 removes linked records from `clean_records`, quarantine blocks by `record_id` and `raw_id`, and the draft builder defensively skips blocked rows.
- Unsupported extensions and adapter parse failures produce auditable quarantine/report output — not HTTP 500.
- `manual_review_count` deduplicates mapping candidates already represented in quarantine.

## Physical Demo CSV

Upload `apps/api/tests/fixtures/ingest/physical_demo_signal_list.csv`:

```csv
asset_label,signal_label,tag_hint,unit,side
Solar Charger,Output Voltage,V1,V,dc
...
```

Expected 18 tag drafts:

```
CHG_SOLAR_OUT_V, CHG_SOLAR_OUT_I, CHG_SOLAR_OUT_P
CHG_MAINS_OUT_V, CHG_MAINS_OUT_I, CHG_MAINS_OUT_P
BAT_24V_V, BAT_24V_I, BAT_24V_P
INV_AC_OUT_V, INV_AC_OUT_I, INV_AC_OUT_P
VFD_OUT_V, VFD_OUT_I, VFD_OUT_P
MTR_FHP_SPEED, MTR_FHP_VIB, MTR_FHP_TEMP
```

## Troubleshooting

| Symptom | Cause | Action |
|---------|-------|--------|
| Row quarantined `schema_failed` / missing unit | Empty `unit` column | Fix source CSV, re-upload |
| `document_kind=unknown` | Unrecognized headers | Label document kind manually; check column names |
| `DUPLICATE_ARTIFACT` warning | Same bytes uploaded twice | Expected — SHA dedup; review if unintended |
| `unsupported_file` quarantine | `.pdf`, `.txt`, etc. | Upload `.csv` or `.xlsx` only |
| `downstream_ready_for_studio=false` | Quarantine, gate rejection, or no drafts | Review quarantine and fix source data |

## Storage

Runs persist under `OFFLINE_INGEST_DATA_DIR` (default `./offline-ingest-data`):

```
offline-ingest-data/
  raw/           # content-addressed bytes
  artifacts/     # artifact metadata
  runs/{run_id}/ # per-run JSON outputs
```