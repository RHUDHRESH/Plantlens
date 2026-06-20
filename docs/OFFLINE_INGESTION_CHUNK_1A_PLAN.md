# Chunk 1A — Offline Authored-Knowledge Ingestion Plan

**Task:** 1A.1 — Repo Recon + Implementation Map  
**Date:** 2026-06-20  
**Status:** Planning only — no pipeline implementation in this chunk.

This document is the implementation blueprint for the Python offline ingestion spine. A downstream engineer can start **1A.2 (Ingestion Schema Spine)** from this file without re-reading the whole repository.

---

## 1. Current Repo Situation

### 1.1 What live ingest currently does

Live telemetry ingestion is implemented and tested. It is **not** offline document ingestion.

| Item | Location | Behavior |
|------|----------|----------|
| Router | `apps/api/app/routers/ingest.py` | Prefix `/api/ingest`, tags `["ingest"]` |
| Endpoints | `POST /api/ingest/frame`, `POST /api/ingest/frame/batch` | Accept `TagFrame` bodies |
| Auth | `verify_gateway_ingest_token` | Bearer token vs `settings.gateway_ingest_token` (not JWT RBAC) |
| Processing | `_ingest_frames` → `get_simulator_gateway().on_frame()` | Stamps `ingest_ts`, updates in-memory `runtime_state` |
| Schema | `apps/api/app/schemas/tag_frame.py` | Mirrors `packages/contracts/tag_frame.schema.json` |
| Tests | `apps/api/tests/test_gateway_ingest.py` | Token required, batch accept, stale quality, bad frame 422 |
| Registration | `apps/api/app/main.py` line 66 | `app.include_router(ingest.router)` |

Gateway process (`apps/gateway/gateway/tag_frame.py`, `publish.py`, `modbus_poller.py`) emits the same `TagFrame` contract and POSTs to `/api/ingest/frame`. This path is on the **runtime tick** and must remain untouched.

### 1.2 What offline ingestion currently has

| Item | Status |
|------|--------|
| `apps/api/app/ingest/README.md` | Spec only — describes planned Python port of Cliffords |
| `apps/api/app/ingest/` subfolders | **Do not exist** (adapters, detectors, gates, etc.) |
| `apps/api/app/schemas/ingest/` | **Does not exist** |
| `apps/api/app/routers/offline_ingest.py` | **Does not exist** |
| `apps/api/tests/fixtures/ingest/` | **Does not exist** |
| `apps/api/tests/golden/` | **Does not exist** (mentioned in `tests/README.md` but not created) |
| `packages/contracts/` ingest schemas | **None** — offline ingest uses internal Pydantic models first; JSON Schema export deferred |

Offline ingestion is **zero implementation**. The product boundary is clear in docs (`PLANTLENS.md` R5, `docs/ARCHITECTURE.md` three layers of truth) but no code path exists yet.

### 1.3 What legacy Cliffords provides as reference

`legacy/cliffords-ts/` is **frozen** (see `legacy/README.md`). It is a regression oracle, not a runtime dependency.

| Legacy module | Reference value for Python port |
|---------------|--------------------------------|
| `contracts/artifact.ts` | `RawArtifact`, input kinds, `ArtifactType`, `SourceChannel` |
| `contracts/canonical.ts` | `SourceRef`, `ParsedRecord`, `CanonicalAlarmEvent`, `CanonicalCausalEdgeCandidate` |
| `contracts/validation.ts` | `ValidationIssue`, `GateSummary`, `Gate1/2/3Result`, `IngestionReport`, `CliffordRunResult` |
| `contracts/quarantine.ts` | `QuarantineRecord`, `MappingRequest` |
| `gates/gate1ArtifactIntegrity.ts` | SHA-256 verify, size limits, immutable raw store read-back |
| `gates/gate2CanonicalSchema.ts` | Zod canonical schema enforcement, per-row quarantine |
| `gates/gate3IndustrialTruth.ts` | Tag/equipment/zone registry resolution, mapping requests |
| `adapters/csvAlarmAdapter.ts`, `excelMatrixAdapter.ts` | CSV/XLSX → structured table parsing |
| `detectors/detectArtifactType.ts`, `detectDocumentKind.ts`, `detectCsvDialect.ts` | Heuristic type detection |
| `normalizers/*` | Tag, equipment, unit, timestamp, priority, quality normalization |
| `parsers/parseStructuredTable.ts` | Column alias map, row-level `ParsedRecord` emission |
| `mapping/tagResolver.ts`, `equipmentResolver.ts` | Registry lookup + similarity suggestions |
| `stores/rawArtifactStore.ts`, `runArtifactStore.ts` | File-backed immutable raw + per-run JSON outputs |
| `reports/buildIngestionReport.ts` | Gate summaries, totals, `downstream_ready` flag |
| `fixtures/*.csv`, `*.json`, `*.txt` | Golden-test inputs (alarm history, cause-effect, OPC-UA event) |

**Important:** Legacy `ArtifactType` does not include `signal_list` or `register_map`. Chunk 1A adds these document kinds for the physical-demo vertical slice. Legacy `detectDocumentKind` only distinguishes cause-effect, HAZOP, permit, maintenance, P&ID, operator note.

### 1.4 What must not be touched

| Boundary | Rule |
|----------|------|
| `apps/api/app/routers/ingest.py` | No edits to `/api/ingest/frame` or `/api/ingest/frame/batch` |
| `apps/api/app/runtime/` | No coupling from offline ingest into runtime tick |
| `apps/gateway/` | No changes |
| `legacy/cliffords-ts/**` | No TypeScript modifications |
| `apps/web/` legacy TS | No imports from legacy into Python production code |
| Live runtime graph / `tag_map.json` | Offline drafts must not auto-apply |
| AI / OCR / vector DB / LangGraph | Out of scope for Chunk 1A |

Existing patterns to **reuse** (read-only reference):

- Auth: `apps/api/app/auth/dependencies.py` — `require_engineer`, `require_viewer`, `require_human_approver`
- Audit hash-chain: `apps/api/app/services/audit_chain.py` — pattern for tamper-evident append (offline ingest run audit is separate, file-backed first)
- Draft gate pattern: `apps/api/app/routers/agents.py` + `agent_draft_queue` — human approval required; offline `DraftContract` follows same philosophy with `requires_human_approval = true` always
- DB session: `apps/api/app/dependencies.py` — `get_db` available but **not required** for Chunk 1A storage

---

## 2. Implementation Target

Offline authored-knowledge ingestion pipeline (draft-only, human-approved later):

```
Raw file / pasted text
  → immutable RawArtifact (SHA-256, source channel, raw_uri)
  → document-kind detector (transparent heuristics)
  → adapter (CSV / XLSX in 1A; JSON/text later)
  → RawRecord (row-level, preserves row_number, sheet_name, raw values, source_ref)
  → parser (signal_list / register_map)
  → normalizer (tag, asset, unit, timestamp, priority, quality)
  → MappingCandidate (ambiguous → review queue)
  → Gate 1 — artifact integrity (hash verify, size, read-back)
  → Gate 2 — canonical schema (required fields, unit present, tag pattern)
  → Gate 3 — industrial truth (registry match, unit sanity, duplicate tag)
  → quarantine (bad/ambiguous rows with reason + suggested_fix + source_ref)
  → DraftContract (tag_map / asset proposals, requires_human_approval=true)
  → IngestionRunReport (gate summaries, counts, top_issues)
  → later: Studio human approval → contract patch → compile
```

**Product boundary:** Nothing from this path enters live runtime automatically. `downstream_ready` on the report means "ready for human review in Studio," not "ready for runtime."

---

## 3. Proposed Folder / File Tree

Create these in subchunks 1A.2–1A.10. **Do not create them in 1A.1.**

### `apps/api/app/ingest/`

```
apps/api/app/ingest/
├── __init__.py
├── README.md                          # exists — update in 1A.10 only
├── config.py                          # IngestConfig: size limits, thresholds (port DEFAULT_CLIFFORD_CONFIG)
├── pipeline.py                        # run_offline_ingest_cycle() orchestrator
├── adapters/
│   ├── __init__.py
│   ├── base.py                        # Adapter protocol, AdapterInput, AdapterResult
│   ├── csv_adapter.py                 # CSV → list[RawRecord]
│   └── xlsx_adapter.py                # XLSX → list[RawRecord] (sheet-aware)
├── detectors/
│   ├── __init__.py
│   ├── document_kind.py               # signal_list, register_map, alarm_history, etc.
│   └── csv_dialect.py                 # delimiter, header row detection
├── parsers/
│   ├── __init__.py
│   ├── signal_list.py                 # physical-demo column map → tag candidates
│   └── register_map.py                # register address columns → tag candidates
├── normalizers/
│   ├── __init__.py
│   ├── tag.py                         # normalize_tag_id + physical-demo canonical builder
│   ├── asset.py                       # asset_label → asset_id slug
│   ├── unit.py                        # UNIT_ALIASES map (port normalizeUnits.ts)
│   ├── timestamp.py                   # RFC 3339 UTC (deferred usage in signal-list slice)
│   ├── priority.py                    # deferred (alarm history)
│   └── quality.py                     # deferred (OPC-UA / historian)
├── mapping/
│   ├── __init__.py
│   ├── candidates.py                  # build MappingCandidate from ambiguous rows
│   └── similarity.py                  # normalized string similarity (port legacy)
├── gates/
│   ├── __init__.py
│   ├── gate1_artifact_integrity.py
│   ├── gate2_canonical_schema.py
│   └── gate3_industrial_truth.py
├── quarantine.py                      # create_quarantine_record helper
├── drafts/
│   ├── __init__.py
│   └── builder.py                     # NormalizedRecord[] → DraftContract[]
├── reports/
│   ├── __init__.py
│   └── builder.py                     # IngestionRunReport assembly
└── stores/
    ├── __init__.py
    ├── base.py                        # store protocols
    ├── file_raw_store.py              # content-addressed raw/ by sha256
    ├── file_run_store.py              # runs/{run_id}/*.json
    └── memory_stores.py               # test doubles
```

### `apps/api/app/schemas/ingest/`

```
apps/api/app/schemas/ingest/
├── __init__.py
├── artifact.py                        # RawArtifact, SourceChannel, DocumentKind
├── record.py                          # RawRecord, SourceRef
├── detection.py                       # DetectionReport
├── normalized.py                      # NormalizedRecord
├── mapping.py                         # MappingCandidate
├── gates.py                           # GateIssue, GateReport, GateSummary
├── quarantine.py                      # QuarantineRecord
├── draft.py                           # DraftContract
├── report.py                          # IngestionRunReport
└── api.py                             # request/response wrappers for router
```

### `apps/api/app/routers/`

```
apps/api/app/routers/offline_ingest.py   # prefix /api/offline-ingest
```

### `apps/api/tests/`

```
apps/api/tests/
├── fixtures/ingest/
│   ├── physical_demo_signal_list.csv    # vertical-slice golden input
│   ├── physical_demo_signal_list_missing_unit.csv  # Gate 2 reject case
│   └── physical_demo_register_map.xlsx    # deferred XLSX slice / Gate 3 cases
├── unit/ingest/
│   ├── test_schemas.py
│   ├── test_stores.py
│   ├── test_csv_adapter.py
│   ├── test_document_kind.py
│   ├── test_normalizers.py
│   ├── test_signal_list_parser.py
│   ├── test_gates.py
│   ├── test_drafts.py
│   └── test_report_builder.py
├── integration/
│   └── test_offline_ingest_api.py
└── test_gateway_ingest.py               # EXISTS — must keep passing unchanged
```

### `docs/`

```
docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md    # this file
docs/OFFLINE_INGESTION.md                  # operator-facing API docs (1A.10)
```

### `apps/api/app/settings.py` addition (1A.3)

Add `offline_ingest_data_dir: str = "./offline-ingest-data"` — file-backed store root.

### `apps/api/app/main.py` addition (1A.10)

```python
from app.routers import offline_ingest
app.include_router(offline_ingest.router)  # after ingest.router — separate prefix
```

---

## 4. Schema Design Plan

All models use `model_config = ConfigDict(extra="forbid")`. IDs are UUID-based strings with prefixes (`art_`, `run_`, `qrn_`, `drf_`).

### 4.1 `RawArtifact`

Immutable stored input.

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `artifact_id` | `str` | **required** | `art_{uuid}` |
| `received_at_utc` | `AwareDatetime` | **required** | RFC 3339 |
| `original_filename` | `str \| None` | **required** | uploads |
| `mime_type` | `str \| None` | **required** | |
| `extension` | `str \| None` | **required** | e.g. `.csv` |
| `size_bytes` | `int` | **required** | `ge=0` |
| `sha256` | `str` | **required** | `pattern=^[a-f0-9]{64}$` |
| `source_channel` | `Literal["upload","paste","api","manual"]` | **required** | no `opcua`/`simulator` in 1A |
| `raw_uri` | `str` | **required** | file path or `memory://raw/{sha256}` |
| `document_kind` | `DocumentKind \| None` | **required** | set after detection |
| `detection_confidence` | `float` | **required** | `0.0–1.0` |
| `detection_signals` | `list[str]` | **required** | transparent heuristic reasons |
| `metadata` | `dict[str, Any]` | **required** | uploader principal, content-type sniff |
| `duplicate_of_artifact_id` | `str \| None` | deferred | when SHA-256 already stored |

### 4.2 `SourceRef`

Provenance link (embedded in records).

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `artifact_id` | `str` | **required** | |
| `artifact_sha256` | `str` | **required** | |
| `row_number` | `int \| None` | **required** | 1-based CSV row |
| `sheet_name` | `str \| None` | deferred | XLSX |
| `column_name` | `str \| None` | **required** | |
| `cell_ref` | `str \| None` | deferred | e.g. `B12` |
| `json_pointer` | `str \| None` | deferred | JSON exports |

### 4.3 `RawRecord`

Adapter output — one row/cell group before normalization.

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `raw_id` | `str` | **required** | `raw_{uuid}` |
| `artifact_id` | `str` | **required** | |
| `row_number` | `int` | **required** | `ge=1` |
| `sheet_name` | `str \| None` | deferred | |
| `fields` | `dict[str, str \| None]` | **required** | column_name → raw cell value |
| `source_ref` | `SourceRef` | **required** | |
| `extracted_at_utc` | `AwareDatetime` | **required** | |

### 4.4 `DetectionReport`

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `artifact_id` | `str` | **required** | |
| `document_kind` | `DocumentKind` | **required** | see enum below |
| `confidence` | `float` | **required** | |
| `signals` | `list[str]` | **required** | e.g. `["header:asset_label", "header:signal_label"]` |
| `supported` | `bool` | **required** | false → quarantine at Gate 1 |
| `reason` | `str \| None` | **required** | when unsupported |

`DocumentKind` enum (1A):

```
signal_list | register_map | alarm_history | cause_effect_matrix
| operator_note | unknown
```

Deferred kinds: `hazop_worksheet`, `pid_document`, `maintenance_record`, `permit_to_work`, `json_event`, `opcua_event`.

### 4.5 `NormalizedRecord`

Canonical tag candidate from signal/register parsing.

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `record_id` | `str` | **required** | `nrm_{uuid}` |
| `record_kind` | `Literal["tag_candidate"]` | **required** | extend later for alarm/edge |
| `tag_id` | `str` | **required** | `^[A-Z0-9_]+$` |
| `asset_id` | `str` | **required** | `^[A-Z0-9-]+$` |
| `asset_label` | `str` | **required** | original human label |
| `signal_label` | `str` | **required** | |
| `unit` | `str` | **required** | normalized |
| `side` | `str \| None` | **required** | dc/ac/mechanical/thermal from demo CSV |
| `signal_type` | `str \| None` | deferred | maps to `tag_map.signal_type` enum |
| `source_ref` | `SourceRef` | **required** | |
| `confidence` | `float` | **required** | `0.0–1.0` |
| `normalization_notes` | `list[str]` | **required** | audit trail of transforms |

### 4.6 `MappingCandidate`

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `mapping_id` | `str` | **required** | `map_{uuid}` |
| `issue` | `Literal["UNKNOWN_TAG","UNKNOWN_ASSET","AMBIGUOUS_SIGNAL","DUPLICATE_TAG"]` | **required** | |
| `raw_value` | `str` | **required** | |
| `suggested_matches` | `list[{id, label, confidence}]` | **required** | top-5 similarity |
| `source_ref` | `SourceRef` | **required** | |
| `status` | `Literal["OPEN","RESOLVED","REJECTED"]` | **required** | default OPEN |

### 4.7 `GateIssue`

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `code` | `str` | **required** | e.g. `MISSING_UNIT` |
| `message` | `str` | **required** | |
| `severity` | `Literal["LOW","MEDIUM","HIGH","BLOCKER"]` | **required** | |
| `field` | `str \| None` | **required** | |
| `source_ref` | `SourceRef \| None` | deferred | per-row issues in Gate 2/3 |

### 4.8 `GateReport`

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `gate` | `Literal["GATE_1","GATE_2","GATE_3"]` | **required** | |
| `status` | `Literal["PASS","PARTIAL","FAIL","SKIPPED"]` | **required** | |
| `accepted` | `int` | **required** | |
| `rejected` | `int` | **required** | |
| `issues` | `list[GateIssue]` | **required** | |

### 4.9 `QuarantineRecord`

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `quarantine_id` | `str` | **required** | `qrn_{uuid}` |
| `artifact_id` | `str` | **required** | |
| `raw_id` | `str \| None` | **required** | |
| `record_id` | `str \| None` | deferred | post-normalization |
| `gate` | `Literal["GATE_1","GATE_2","GATE_3"]` | **required** | |
| `severity` | `Literal["LOW","MEDIUM","HIGH","BLOCKER"]` | **required** | |
| `reason_code` | `str` | **required** | |
| `reason_message` | `str` | **required** | |
| `suggested_fix` | `str` | **required** | human-actionable |
| `raw_snapshot` | `dict[str, Any]` | **required** | row fields preserved |
| `source_ref` | `SourceRef` | **required** | |
| `created_at_utc` | `AwareDatetime` | **required** | |
| `needs_human_review` | `bool` | **required** | always `true` in 1A |

### 4.10 `DraftContract`

Proposed authored config — **never auto-applied**.

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `draft_id` | `str` | **required** | `drf_{uuid}` |
| `draft_type` | `Literal["tag_map_patch","asset_patch","alarm_rule_patch","causal_edge_patch"]` | **required** | slice uses `tag_map_patch` |
| `run_id` | `str` | **required** | |
| `artifact_id` | `str` | **required** | |
| `proposed_changes` | `list[dict[str, Any]]` | **required** | tag_map entries matching `packages/contracts/tag_map.schema.json` tag binding shape |
| `source_refs` | `list[SourceRef]` | **required** | |
| `requires_human_approval` | `bool` | **required** | **must always be `true`** — validate in builder |
| `approval_status` | `Literal["PENDING","APPROVED","REJECTED"]` | **required** | default PENDING |
| `created_at_utc` | `AwareDatetime` | **required** | |
| `created_by` | `str` | **required** | principal subject |
| `confidence` | `float` | **required** | aggregate |
| `validation_status` | `Literal["valid","invalid","pending"]` | deferred | pre-compile check |
| `explanation` | `str` | deferred | Studio display |

### 4.11 `IngestionRunReport`

| Field | Type | Slice | Notes |
|-------|------|-------|-------|
| `run_id` | `str` | **required** | `run_{uuid}` |
| `started_at_utc` | `AwareDatetime` | **required** | |
| `completed_at_utc` | `AwareDatetime` | **required** | |
| `artifact_id` | `str` | **required** | |
| `document_kind` | `DocumentKind` | **required** | |
| `gate_1` | `GateReport` | **required** | |
| `gate_2` | `GateReport` | **required** | |
| `gate_3` | `GateReport` | **required** | |
| `totals` | `{parsed, normalized, clean, quarantined, mapping_requests, drafts}` | **required** | |
| `top_issues` | `list[{reason_code, count}]` | **required** | |
| `downstream_ready` | `bool` | **required** | true only when all gates PASS, clean>0, quarantined=0, mapping=0 |
| `triggered_by` | `str` | **required** | principal subject |

---

## 5. Storage Plan

**Decision: file-backed local storage for Chunk 1A** (hybrid-lite).

| Layer | Mechanism | Rationale |
|-------|-----------|-----------|
| Raw bytes | `{offline_ingest_data_dir}/raw/{sha256}` | Content-addressed, immutable, duplicate detection = file exists |
| Run outputs | `{offline_ingest_data_dir}/runs/{run_id}/*.json` | `artifact.json`, `raw_records.json`, `normalized.json`, `quarantine.json`, `drafts.json`, `report.json` |
| Index | In-memory dict in process + JSON sidecar `runs/index.json` | Avoid Alembic migrations for 1A |
| Tests | `MemoryRawStore` + `MemoryRunStore` | Fast unit tests |

**Not using SQLAlchemy tables in 1A** because:

- DB README explicitly allows file-backed MVP for non-runtime data.
- Legacy Cliffords already proves the file-store pattern.
- Ingestion runs are replayable from `artifact.json` + raw file hash.
- Avoids mixing immutable ingest blobs into the runtime event model.

**Deferred to post-1A:** SQLite `offline_ingest_runs` table for query/list pagination; optional audit-chain append via `AuditChainService` on run completion.

**Replay contract:** Given `run_id`, load `artifact.json`, read raw bytes by `sha256`, re-run pipeline — must produce identical `normalized.json` and `report.json` (deterministic).

---

## 6. Dependency Plan

Current `apps/api/pyproject.toml` has no spreadsheet/file-upload deps. Add only:

| Package | Version | Chunk | Purpose |
|---------|---------|-------|---------|
| `python-multipart` | `~=0.0.9` | 1A.10 | `UploadFile` in FastAPI |
| `aiofiles` | `~=24.1` | 1A.3 | async raw file writes |
| `openpyxl` | `~=3.1` | 1A.4 | XLSX read (no pandas required for register maps) |
| `filetype` | `~=1.2` | 1A.4 | CI-safe MIME sniff (optional; extension fallback acceptable) |

**Do not add:** pandas (heavy; `csv` stdlib + openpyxl sufficient), OCR/PDF libs, LangGraph, LLM SDKs, chromadb.

**CSV parsing:** Use Python stdlib `csv` module (legacy uses `csv-parse/sync`).

Install command for 1A.4+:

```bash
cd apps/api
uv add "python-multipart~=0.0.9" "aiofiles~=24.1" "openpyxl~=3.1" "filetype~=1.2"
```

---

## 7. API Route Plan

**Router:** `apps/api/app/routers/offline_ingest.py`  
**Prefix:** `/api/offline-ingest`  
**Tag:** `offline-ingest`

| Method | Path | Purpose | Auth | Request | Response | Slice |
|--------|------|---------|------|---------|----------|-------|
| POST | `/uploads` | Upload CSV/XLSX file, start ingest run | `require_engineer` | `multipart/form-data` file + optional `plant_id` | `{run_id, status, artifact_id}` | **1A.10** |
| POST | `/text` | Paste operator note / small table text | `require_engineer` | `{text: str, filename?: str}` | `{run_id, status, artifact_id}` | **1A.10** (signal-list CSV paste deferred) |
| GET | `/runs/{run_id}` | Run metadata + status | `require_viewer` | path `run_id` | `{run_id, artifact, document_kind, status, started_at, completed_at}` | **1A.10** |
| GET | `/runs/{run_id}/report` | Full `IngestionRunReport` | `require_viewer` | path | `IngestionRunReport` | **1A.10** |
| GET | `/runs/{run_id}/drafts` | Draft contracts from run | `require_viewer` | path | `{drafts: list[DraftContract]}` | **1A.10** |
| GET | `/runs/{run_id}/quarantine` | Quarantined rows | `require_viewer` | path | `{quarantine: list[QuarantineRecord]}` | **1A.10** |
| POST | `/runs/{run_id}/resolve-quarantine` | Human resolves quarantine item | `require_engineer` | `{quarantine_id, resolution, patched_fields?}` | `{updated_run_id?}` | **deferred** |
| POST | `/runs/{run_id}/rerun` | Re-run pipeline on same artifact | `require_engineer` | optional `config_overrides` | `{run_id, status}` | **deferred** |

**Auth notes:**

- Engineer/admin can upload and trigger runs (`ENGINEER_WRITE_ROLES`).
- Viewer+ can inspect runs (including `agent` role for read-only draft review).
- Agents **cannot** approve drafts — reuse `require_human_approver` only when Studio approval bridge is wired (post-1A).
- Offline ingest uses JWT RBAC, **not** `gateway_ingest_token`.

**Error semantics:**

- `404` — unknown `run_id`
- `409` — duplicate upload in progress (optional, deferred)
- `422` — unsupported file type / empty file
- `413` — exceeds `max_artifact_size_bytes` (default 25 MiB, port legacy)

---

## 8. Test Plan

### 8.1 Regression guard (must always pass)

| Test | File | Assertion |
|------|------|-----------|
| Live TagFrame ingest unchanged | `test_gateway_ingest.py` | All 5 existing tests pass without modification |

### 8.2 Vertical-slice tests (new)

| # | Test | File | Assertion |
|---|------|------|-----------|
| 1 | CSV physical demo upload E2E | `integration/test_offline_ingest_api.py` | POST fixture → 200, `run_id` returned |
| 2 | Raw artifact SHA-256 stable | `unit/ingest/test_stores.py` | Same bytes → same hash across puts |
| 3 | Duplicate file detected | `unit/ingest/test_stores.py` | Second put same sha256 → `duplicate=true`, no overwrite |
| 4 | Source refs preserved | `unit/ingest/test_csv_adapter.py` | Row 3 → `row_number=3`, `artifact_sha256` set |
| 5 | Signal-list detector | `unit/ingest/test_document_kind.py` | Demo CSV headers → `signal_list`, confidence ≥ 0.8 |
| 6 | Tag normalization | `unit/ingest/test_normalizers.py` | `V1` + Solar Charger → `CHG_SOLAR_OUT_V` |
| 7 | Asset normalization | `unit/ingest/test_normalizers.py` | `24V Lithium Battery` → `BAT-24V` |
| 8 | Unit normalization | `unit/ingest/test_normalizers.py` | `degC` → `degC`, `A` → `A` |
| 9 | Expected 18 canonical tags | `unit/ingest/test_signal_list_parser.py` | Full fixture → exact tag set (see §9) |
| 10 | Gate 1 pass | `unit/ingest/test_gates.py` | Valid artifact → PASS, hash verified |
| 11 | Gate 2 missing unit reject | `unit/ingest/test_gates.py` | Row with empty unit → quarantine `MISSING_UNIT` |
| 12 | Gate 3 industrial truth warning | `unit/ingest/test_gates.py` | Unknown unit `foo` → quarantine or mapping |
| 13 | Gate 3 duplicate tag fail | `unit/ingest/test_gates.py` | Two rows map to same `tag_id` → quarantine |
| 14 | Quarantine suggested fix | `unit/ingest/test_gates.py` | `suggested_fix` non-empty, actionable |
| 15 | Drafts require human approval | `unit/ingest/test_drafts.py` | Every `DraftContract.requires_human_approval is True` |
| 16 | Report counts correct | `unit/ingest/test_report_builder.py` | `totals.parsed=18`, `totals.clean=18` on happy path |

### 8.3 Golden tier (deferred post-slice)

`tests/golden/test_cliffords_parity.py` — run legacy fixtures through Python port when alarm/cause-effect parsers exist.

---

## 9. Demo Fixture Plan

### 9.1 Primary fixture

**Path:** `apps/api/tests/fixtures/ingest/physical_demo_signal_list.csv`

```csv
asset_label,signal_label,tag_hint,unit,side
Solar Charger,Output Voltage,V1,V,dc
Solar Charger,Output Current,I1,A,dc
Solar Charger,Output Power,P1,W,dc
Mains Charger,Output Voltage,V2,V,dc
Mains Charger,Output Current,I2,A,dc
Mains Charger,Output Power,P2,W,dc
24V Lithium Battery,Voltage,V3,V,dc
24V Lithium Battery,Current,I3,A,dc
24V Lithium Battery,Power,P3,W,dc
Inverter,AC Output Voltage,V4,V,ac
Inverter,AC Output Current,I4,A,ac
Inverter,AC Output Power,P4,W,ac
VFD,Motor Feed Voltage,V5,V,ac
VFD,Motor Feed Current,I5,A,ac
VFD,Motor Feed Power,P5,W,ac
FHP 3Phase AC Motor,Speed,N,rpm,mechanical
FHP 3Phase AC Motor,Vibration,Vib,mm/s,mechanical
FHP 3Phase AC Motor,Temperature,Temp,degC,thermal
```

### 9.2 Expected canonical draft tags (18)

```
CHG_SOLAR_OUT_V    CHG_SOLAR_OUT_I    CHG_SOLAR_OUT_P
CHG_MAINS_OUT_V    CHG_MAINS_OUT_I    CHG_MAINS_OUT_P
BAT_24V_V          BAT_24V_I          BAT_24V_P
INV_AC_OUT_V       INV_AC_OUT_I       INV_AC_OUT_P
VFD_OUT_V          VFD_OUT_I          VFD_OUT_P
MTR_FHP_SPEED      MTR_FHP_VIB        MTR_FHP_TEMP
```

### 9.3 Deterministic tag builder rules (1A.6)

Implement in `normalizers/tag.py` as explicit lookup — not ML.

| asset_label | signal_label (contains) | tag_hint | → tag_id |
|-------------|-------------------------|----------|----------|
| Solar Charger | Output Voltage | V1 | `CHG_SOLAR_OUT_V` |
| Solar Charger | Output Current | I1 | `CHG_SOLAR_OUT_I` |
| Solar Charger | Output Power | P1 | `CHG_SOLAR_OUT_P` |
| Mains Charger | Output Voltage | V2 | `CHG_MAINS_OUT_V` |
| Mains Charger | Output Current | I2 | `CHG_MAINS_OUT_I` |
| Mains Charger | Output Power | P2 | `CHG_MAINS_OUT_P` |
| 24V Lithium Battery | Voltage | V3 | `BAT_24V_V` |
| 24V Lithium Battery | Current | I3 | `BAT_24V_I` |
| 24V Lithium Battery | Power | P3 | `BAT_24V_P` |
| Inverter | AC Output Voltage | V4 | `INV_AC_OUT_V` |
| Inverter | AC Output Current | I4 | `INV_AC_OUT_I` |
| Inverter | AC Output Power | P4 | `INV_AC_OUT_P` |
| VFD | Motor Feed Voltage | V5 | `VFD_OUT_V` |
| VFD | Motor Feed Current | I5 | `VFD_OUT_I` |
| VFD | Motor Feed Power | P5 | `VFD_OUT_P` |
| FHP 3Phase AC Motor | Speed | N | `MTR_FHP_SPEED` |
| FHP 3Phase AC Motor | Vibration | Vib | `MTR_FHP_VIB` |
| FHP 3Phase AC Motor | Temperature | Temp | `MTR_FHP_TEMP` |

Asset IDs: `CHG-SOLAR`, `CHG-MAINS`, `BAT-24V`, `INV-001`, `VFD-001`, `MTR-FHP` (hyphenated per `docs/CONTRACTS.md`).

### 9.4 Gate test fixtures

| Fixture | Purpose |
|---------|---------|
| `physical_demo_signal_list_missing_unit.csv` | Row with empty `unit` → Gate 2 `MISSING_UNIT` |
| `physical_demo_signal_list_bad_unit.csv` | `unit=foo` → Gate 3 warning/fail |
| `physical_demo_register_map.xlsx` | XLSX adapter + register_map detector (1A.4+, may extend slice) |

---

## 10. Risk List

| Risk | Impact | Mitigation |
|------|--------|------------|
| Accidentally breaking live `/api/ingest` | Runtime demo broken | Separate router/prefix; never import offline pipeline from `ingest.py`; keep `test_gateway_ingest.py` in CI |
| Fake industrial truth gates | Bad tags enter drafts | Gate 3 uses explicit unit allowlist + duplicate tag detection; registry empty in 1A → mapping candidates, not auto-resolve |
| Weak provenance / source refs | Un-auditable drafts | Require `SourceRef` on every `RawRecord`, `NormalizedRecord`, `QuarantineRecord`, `DraftContract` |
| Overbuilding DB persistence too early | Migration churn, coupled to runtime DB | File-backed stores only in 1A; SQLite index deferred |
| Importing legacy TS by mistake | Split-brain, CI breakage | No `legacy/` imports in `apps/`; golden tests call subprocess `pnpm test` only |
| Auto-approval of imported drafts | R5 violation | `DraftContract.requires_human_approval` hardcoded `True`; builder raises if false |
| Too many file types too early | Scope creep | CSV signal-list first; XLSX register map second; PDF/OCR/JSON deferred |
| Tests assert shape not semantics | False confidence | Assert exact 18 tag IDs, exact quarantine reason codes, exact report counts |
| Confusion with live ingest naming | Wrong mental model | Prefix `/api/offline-ingest`; OpenAPI tag `offline-ingest`; docs stress boundary |
| Non-deterministic normalization | Golden parity impossible | Pure functions, explicit lookup table for demo, no LLM |

---

## 11. Final 10-Subchunk Build Order

| Step | Task | Deliverable |
|------|------|-------------|
| **1A.1** | Repo Recon + Implementation Map | `docs/OFFLINE_INGESTION_CHUNK_1A_PLAN.md` (this file) |
| **1A.2** | Ingestion Schema Spine | `apps/api/app/schemas/ingest/*.py` |
| **1A.3** | Immutable Local Run Storage | `apps/api/app/ingest/stores/*`, settings `offline_ingest_data_dir` |
| **1A.4** | CSV/XLSX Adapters | `adapters/csv_adapter.py`, `adapters/xlsx_adapter.py` |
| **1A.5** | Document Kind Detection | `detectors/document_kind.py`, `detectors/csv_dialect.py` |
| **1A.6** | Deterministic Normalizers | `normalizers/tag.py`, `asset.py`, `unit.py` (+ stubs for timestamp/priority/quality) |
| **1A.7** | Signal/Register Parsers + Mapping Candidates | `parsers/signal_list.py`, `mapping/candidates.py` |
| **1A.8** | Gates + Quarantine | `gates/gate1..3`, `quarantine.py` |
| **1A.9** | Draft Contracts + Report Builder | `drafts/builder.py`, `reports/builder.py`, `pipeline.py` |
| **1A.10** | API Routes, Tests, Docs | `routers/offline_ingest.py`, fixtures, tests, `docs/OFFLINE_INGESTION.md` |

**First vertical slice done when:** Engineer uploads `physical_demo_signal_list.csv` via `POST /api/offline-ingest/uploads`, receives 18 draft tag bindings with `requires_human_approval=true`, report shows `downstream_ready=true`, and `test_gateway_ingest.py` still passes.

---

## Appendix A — Inspection Log (1A.1)

Files read during recon:

- Docs: `README.md`, `PLANTLENS.md`, `FINAL_READY_STATE.md`, `docs/ARCHITECTURE.md`, `docs/BUILD_ORDER.md`, `docs/CONTRACTS.md`, `docs/LIBRARIES.md`
- Live ingest: `apps/api/app/routers/ingest.py`, `main.py`, `schemas/tag_frame.py`, `tests/test_gateway_ingest.py`
- Gateway: `apps/gateway/gateway/tag_frame.py`
- Ingest target: `apps/api/app/ingest/README.md`, `schemas/README.md`, `tests/README.md`
- Auth/audit: `auth/dependencies.py`, `auth/principal.py`, `services/audit_chain.py`, `dependencies.py`
- Legacy oracle: `legacy/README.md`, `legacy/cliffords-ts/README.md`, contracts, gates, stores, adapters, detectors, parsers, normalizers, mapping
- Contracts: `packages/contracts/*`, `packages/contracts/agent_draft.schema.json`, `tag_map.schema.json`
- Config: `apps/api/pyproject.toml`, `apps/api/app/settings.py`

**No tests were run** — this is a planning-only patch.