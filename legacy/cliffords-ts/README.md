# Cliffords Cycle

Cliffords is PlantLens' framework-independent TypeScript ingestion core. It preserves every raw input, routes it through artifact detection and replaceable adapters, validates canonical records through three gates, quarantines rejected data, opens mapping requests for unresolved plant entities, and emits an auditable ingestion report.

## Industrial Alignment

The implementation follows the data-handling concepts in OPC UA Alarms & Conditions, CloudEvents 1.0, RFC 3339, W3C PROV, NIST SP 800-82 Rev. 3, and NIST SP 800-92. This is an engineering alignment profile, not a claim of formal product certification.

- OPC UA condition identity, receive time, quality, acknowledgement, retain, branch, comment, and condition-class fields are preserved.
- CloudEvents `source` plus `id` is retained as the producer-scoped event identity and used for duplicate suppression.
- Canonical timestamps are RFC 3339 UTC values. Unqualified timestamps require a configured plant timezone.
- Every canonical record links to the raw artifact ID and SHA-256 digest.
- Raw writes are read back and hash-verified before Gate 1 passes.
- File-backed audit events form a canonical-JSON SHA-256 hash chain. Reads fail if events were modified or reordered.
- Parser record counts, JSON nesting, text field sizes, artifact sizes, future clock skew, and uncertain-quality policy are configurable.

## Supported V1 Inputs

- CSV alarm histories and cause/effect matrices
- Excel alarm histories and structured matrices
- JSON event payloads
- OPC-UA-style event payloads
- Pasted text and operator notes
- PDF, image/OCR, and audio interfaces return explicit deferred results in V1; unsupported binary inputs are preserved and quarantined.

## Usage

```ts
import {
  DEFAULT_CLIFFORD_CONFIG,
  createMemoryStores,
  runCliffordsCycle
} from "@plantlens/cliffords";

const stores = createMemoryStores();
const result = await runCliffordsCycle(
  {
    kind: "paste",
    text: "10:00 P-101 temperature high, then flow dropped"
  },
  {
    plant_timezone: "Asia/Kolkata",
    tag_registry: {},
    equipment_registry: {},
    zone_registry: {},
    archetype_library: {},
    config: DEFAULT_CLIFFORD_CONFIG,
    stores
  }
);

console.log(result.status);
console.log(result.clean_records);
console.log(result.quarantined_records);
console.log(result.mapping_requests);
console.log(result.report);
```

The default stores write immutable raw artifacts and per-run JSON outputs under `.cliffords-data`. Inject `createMemoryStores()` for tests or an application-managed store implementation.

Canonical alarms include `source_event_id`, `source_event_source`, `received_at_utc`, `source_quality`, and a `source_ref.artifact_sha256` provenance link. Records with bad source quality are blocked. Uncertain source quality is blocked by default and can only be relaxed explicitly with `reject_uncertain_quality`.

The file audit store serializes concurrent appends within one Node.js process. Multi-process deployments should provide a transactional `AuditStore` implementation backed by a database, object-lock store, or dedicated append service.

## Web Intake Console

The repo includes a local industrial intake console around the real Cliffords pipeline. It accepts file, text, JSON, and OPC-UA event payloads, then shows Gate 1, Gate 2, Gate 3, clean records, quarantines, mapping requests, reports, and persisted run file paths.

```bash
pnpm web
```

Open the printed URL, normally `http://127.0.0.1:4177`.

The web server lives in `src/app/server.ts`. Static UI files live in `src/app/public`. Demo plant registries and signal rules live in `src/app/demoPlant.ts`.

The UI posts to `POST /api/run` with one of these payloads:

```json
{
  "plant_timezone": "Asia/Kolkata",
  "input": {
    "kind": "file",
    "filename": "sample_alarm_history.csv",
    "mime_type": "text/csv",
    "bytes_base64": "..."
  }
}
```

```json
{
  "plant_timezone": "Asia/Kolkata",
  "input": {
    "kind": "event",
    "payload": {
      "ConditionName": "PV101_CURRENT_LOW",
      "SourceName": "PV-101",
      "Severity": 700,
      "ActiveState": true
    }
  }
}
```

Web runs use file-backed stores by default and write outputs under `.cliffords-data`.

## Commands

```bash
pnpm web
pnpm typecheck
pnpm build
pnpm test
```
