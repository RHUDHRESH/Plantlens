import type { AdapterInput, AdapterResult } from "./adapters/types.js";
import { parseCsvAlarm } from "./adapters/csvAlarmAdapter.js";
import { parseExcelMatrix } from "./adapters/excelMatrixAdapter.js";
import { parseJsonEvent } from "./adapters/jsonEventAdapter.js";
import { parseOpcuaEvent } from "./adapters/opcuaEventAdapter.js";
import { PayloadLimitError } from "./adapters/payloadLimits.js";
import { parseTextNote } from "./adapters/textNoteAdapter.js";
import type { CliffordInput, RawArtifact } from "./contracts/artifact.js";
import type { ParsedRecord } from "./contracts/canonical.js";
import type {
  CliffordConfig,
  CliffordContext,
  CliffordStores
} from "./contracts/plantModel.js";
import type { QuarantineRecord } from "./contracts/quarantine.js";
import type {
  AuditEventInput,
  CliffordRunResult,
  Gate2Result,
  Gate3Result,
  GateSummary,
  ValidationIssue
} from "./contracts/validation.js";
import { gate1ArtifactIntegrity } from "./gates/gate1ArtifactIntegrity.js";
import { gate2CanonicalSchema } from "./gates/gate2CanonicalSchema.js";
import { gate3IndustrialTruth } from "./gates/gate3IndustrialTruth.js";
import { createQuarantineRecord } from "./quarantine.js";
import { buildIngestionReport } from "./reports/buildIngestionReport.js";
import {
  DEFAULT_CLIFFORD_CONFIG,
  randomIdProvider,
  systemClock
} from "./runtime.js";
import { createFileStores } from "./stores/index.js";

function resolveConfig(context: CliffordContext): CliffordConfig {
  return {
    ...DEFAULT_CLIFFORD_CONFIG,
    ...context.config,
    opcua_severity_ranges:
      context.config.opcua_severity_ranges.length > 0
        ? context.config.opcua_severity_ranges
        : DEFAULT_CLIFFORD_CONFIG.opcua_severity_ranges
  };
}

function resolveStores(
  context: CliffordContext,
  config: CliffordConfig
): CliffordStores {
  const defaults = createFileStores(config.data_directory);
  return {
    raw: context.stores?.raw ?? defaults.raw,
    canonical: context.stores?.canonical ?? defaults.canonical,
    quarantine: context.stores?.quarantine ?? defaults.quarantine,
    audit: context.stores?.audit ?? defaults.audit,
    runs: context.stores?.runs ?? defaults.runs
  };
}

function adapterInput(
  artifact: RawArtifact,
  bytes: Uint8Array,
  input: CliffordInput
): AdapterInput {
  const result: AdapterInput = { artifact, bytes };
  if (input.kind === "json" || input.kind === "event") {
    result.payload = input.payload;
  }
  return result;
}

function routeArtifact(
  input: AdapterInput,
  context: Parameters<typeof parseCsvAlarm>[1]
): AdapterResult {
  if (
    input.artifact.extension === ".xlsx" ||
    input.artifact.extension === ".xls"
  ) {
    return parseExcelMatrix(input, context);
  }
  switch (input.artifact.detected_type) {
    case "alarm_csv":
    case "historian_csv":
    case "cause_effect_matrix":
    case "hazop_worksheet":
      return parseCsvAlarm(input, context);
    case "opcua_event":
      return parseOpcuaEvent(input, context);
    case "json_event":
      return parseJsonEvent(input, context);
    case "operator_note":
    case "maintenance_record":
    case "permit_to_work":
    case "pid_document":
    case "unknown":
      return parseTextNote(input, context);
    case "audio_recording":
    case "image_scan":
      return {
        records: [],
        deferred_reason: `Extraction for ${input.artifact.detected_type} is deferred`
      };
    default:
      return parseTextNote(input, context);
  }
}

function validationIssue(
  quarantine: QuarantineRecord
): ValidationIssue {
  return {
    code: quarantine.reason_code,
    message: quarantine.reason_message,
    severity: quarantine.severity
  };
}

function gateSummary(
  status: GateSummary["status"],
  accepted: number,
  quarantines: QuarantineRecord[],
  issues?: ValidationIssue[]
): GateSummary {
  return {
    status,
    accepted,
    rejected: quarantines.length,
    issues:
      issues?.map((issue) => structuredClone(issue)) ??
      quarantines.map(validationIssue)
  };
}

async function appendAudit(
  stores: CliffordStores,
  event: AuditEventInput
): Promise<void> {
  await stores.audit.append(event);
}

async function persistResult(
  stores: CliffordStores,
  result: CliffordRunResult
): Promise<void> {
  await stores.canonical.put(result.run_id, result.clean_records);
  await stores.quarantine.put(
    result.run_id,
    result.quarantined_records
  );
  await stores.runs.writeRunOutput(
    result.run_id,
    "artifact",
    result.artifact
  );
  await stores.runs.writeRunOutput(
    result.run_id,
    "parsed",
    result.parsed_records
  );
  await stores.runs.writeRunOutput(
    result.run_id,
    "canonical",
    result.clean_records
  );
  await stores.runs.writeRunOutput(
    result.run_id,
    "quarantine",
    result.quarantined_records
  );
  await stores.runs.writeRunOutput(
    result.run_id,
    "mapping-requests",
    result.mapping_requests
  );
  await stores.runs.writeRunOutput(result.run_id, "report", result.report);
}

function runStatus(
  cleanCount: number,
  parsedCount: number,
  quarantineCount: number,
  mappingCount: number
): CliffordRunResult["status"] {
  if (cleanCount > 0) {
    return quarantineCount > 0 || mappingCount > 0 ? "PARTIAL" : "PASS";
  }
  if (quarantineCount > 0) {
    return "FAIL";
  }
  return parsedCount > 0 ? "PARTIAL" : "FAIL";
}

export async function runCliffordsCycle(
  input: CliffordInput,
  context: CliffordContext
): Promise<CliffordRunResult> {
  const config = resolveConfig(context);
  const clock = context.clock ?? systemClock;
  const ids = context.ids ?? randomIdProvider;
  const stores = resolveStores(context, config);
  const runId = ids.next("run");
  const startedAt = clock.now().toISOString();

  await appendAudit(stores, {
    event_id: ids.next("audit"),
    run_id: runId,
    occurred_at_utc: startedAt,
    event_type: "RUN_STARTED",
    details: {
      input_kind: input.kind,
      pipeline: "cliffords",
      contract_version: "1.0"
    }
  });

  const gate1 = await gate1ArtifactIntegrity(
    input,
    config,
    stores.raw,
    clock,
    ids
  );
  await appendAudit(stores, {
    event_id: ids.next("audit"),
    run_id: runId,
    artifact_id: gate1.artifact.artifact_id,
    occurred_at_utc: clock.now().toISOString(),
    event_type: "GATE_1_COMPLETED",
    details: {
      status: gate1.status,
      sha256: gate1.artifact.sha256 || null,
      raw_uri: gate1.artifact.raw_uri || null,
      raw_store_verified:
        gate1.artifact.metadata.raw_store_verified ?? false,
      detected_type: gate1.artifact.detected_type ?? null
    }
  });

  if (gate1.status === "FAIL") {
    const completedAt = clock.now().toISOString();
    const report = buildIngestionReport({
      run_id: runId,
      started_at_utc: startedAt,
      completed_at_utc: completedAt,
      artifact: gate1.artifact,
      gate_1: gateSummary("FAIL", 0, [gate1.quarantine]),
      gate_2: gateSummary("SKIPPED", 0, []),
      gate_3: gateSummary("SKIPPED", 0, []),
      totals: {
        parsed: 0,
        clean: 0,
        quarantined: 1,
        mapping_requests: 0
      },
      reason_codes: [gate1.quarantine.reason_code]
    });
    const result: CliffordRunResult = {
      run_id: runId,
      status: "FAIL",
      artifact: gate1.artifact,
      parsed_records: [],
      clean_records: [],
      quarantined_records: [gate1.quarantine],
      mapping_requests: [],
      report
    };
    await persistResult(stores, result);
    await appendAudit(stores, {
      event_id: ids.next("audit"),
      run_id: runId,
      artifact_id: gate1.artifact.artifact_id,
      occurred_at_utc: completedAt,
      event_type: "RUN_COMPLETED",
      details: { status: result.status, downstream_ready: false }
    });
    return result;
  }

  const adapterContext = { clock, ids, config };
  let parsedRecords: ParsedRecord[] = [];
  const extractionQuarantines: QuarantineRecord[] = [];
  try {
    const adapted = routeArtifact(
      adapterInput(gate1.artifact, gate1.bytes, input),
      adapterContext
    );
    if (adapted.records.length > config.max_parsed_records) {
      throw new PayloadLimitError(
        "RECORD_LIMIT_EXCEEDED",
        `Parsed record count ${adapted.records.length} exceeds configured maximum ${config.max_parsed_records}`
      );
    }
    parsedRecords = adapted.records;
    if (adapted.deferred_reason || parsedRecords.length === 0) {
      extractionQuarantines.push(
        createQuarantineRecord(
          {
            artifact_id: gate1.artifact.artifact_id,
            gate: "GATE_2_SCHEMA",
            severity: "HIGH",
            reason_code: adapted.deferred_reason
              ? "UNSUPPORTED_BINARY"
              : "SCHEMA_VALIDATION_FAILED",
            reason_message:
              adapted.deferred_reason ??
              "No records could be extracted from the artifact",
            raw_snapshot: {
              detected_type: gate1.artifact.detected_type,
              raw_uri: gate1.artifact.raw_uri
            }
          },
          clock,
          ids
        )
      );
    }
  } catch (error) {
    extractionQuarantines.push(
      createQuarantineRecord(
        {
          artifact_id: gate1.artifact.artifact_id,
          gate: "GATE_2_SCHEMA",
          severity: "HIGH",
          reason_code:
            error instanceof PayloadLimitError
              ? error.reason_code
              : "SCHEMA_VALIDATION_FAILED",
          reason_message:
            error instanceof Error
              ? error.message
              : "Artifact parsing failed",
          raw_snapshot: {
            detected_type: gate1.artifact.detected_type,
            raw_uri: gate1.artifact.raw_uri
          }
        },
        clock,
        ids
      )
    );
  }

  const gate2: Gate2Result = gate2CanonicalSchema(
    parsedRecords,
    gate1.artifact,
    context.plant_timezone,
    config,
    clock,
    ids
  );
  gate2.quarantined_records.unshift(...extractionQuarantines);
  gate2.issues.unshift(...extractionQuarantines.map(validationIssue));
  if (extractionQuarantines.length > 0) {
    gate2.status =
      gate2.canonical_records.length > 0 ? "PARTIAL" : "FAIL";
  }
  await appendAudit(stores, {
    event_id: ids.next("audit"),
    run_id: runId,
    artifact_id: gate1.artifact.artifact_id,
    occurred_at_utc: clock.now().toISOString(),
    event_type: "GATE_2_COMPLETED",
    details: {
      status: gate2.status,
      canonical_records: gate2.canonical_records.length,
      quarantined_records: gate2.quarantined_records.length
    }
  });

  const previousRecords = await stores.canonical.getAll();
  const gate3: Gate3Result = gate3IndustrialTruth(
    gate2.canonical_records,
    context.tag_registry,
    context.equipment_registry,
    context.zone_registry,
    context.archetype_library,
    config,
    previousRecords,
    clock,
    ids
  );
  await appendAudit(stores, {
    event_id: ids.next("audit"),
    run_id: runId,
    artifact_id: gate1.artifact.artifact_id,
    occurred_at_utc: clock.now().toISOString(),
    event_type: "GATE_3_COMPLETED",
    details: {
      status: gate3.status,
      clean_records: gate3.clean_records.length,
      quarantined_records: gate3.quarantined_records.length,
      mapping_requests: gate3.mapping_requests.length
    }
  });

  const quarantinedRecords = [
    ...gate2.quarantined_records,
    ...gate3.quarantined_records
  ];
  const completedAt = clock.now().toISOString();
  const status = runStatus(
    gate3.clean_records.length,
    parsedRecords.length,
    quarantinedRecords.length,
    gate3.mapping_requests.length
  );
  const report = buildIngestionReport({
    run_id: runId,
    started_at_utc: startedAt,
    completed_at_utc: completedAt,
    artifact: gate1.artifact,
    gate_1: gateSummary("PASS", 1, []),
    gate_2: gateSummary(
      gate2.status,
      gate2.canonical_records.length,
      gate2.quarantined_records,
      gate2.issues
    ),
    gate_3: gateSummary(
      gate3.status,
      gate3.clean_records.length,
      gate3.quarantined_records,
      gate3.warnings.length > 0
        ? [
            ...gate3.quarantined_records.map(validationIssue),
            ...gate3.warnings
          ]
        : undefined
    ),
    totals: {
      parsed: parsedRecords.length,
      clean: gate3.clean_records.length,
      quarantined: quarantinedRecords.length,
      mapping_requests: gate3.mapping_requests.length
    },
    reason_codes: quarantinedRecords.map((record) => record.reason_code)
  });
  const result: CliffordRunResult = {
    run_id: runId,
    status,
    artifact: gate1.artifact,
    parsed_records: parsedRecords,
    clean_records: gate3.clean_records,
    quarantined_records: quarantinedRecords,
    mapping_requests: gate3.mapping_requests,
    report
  };
  await persistResult(stores, result);
  await appendAudit(stores, {
    event_id: ids.next("audit"),
    run_id: runId,
    artifact_id: gate1.artifact.artifact_id,
    occurred_at_utc: completedAt,
    event_type: "RUN_COMPLETED",
    details: {
      status: result.status,
      downstream_ready: result.report.downstream_ready
    }
  });
  return result;
}

export * from "./contracts/artifact.js";
export * from "./contracts/canonical.js";
export * from "./contracts/plantModel.js";
export * from "./contracts/quarantine.js";
export * from "./contracts/validation.js";
export * from "./model/index.js";
export * from "./reports/buildIngestionReport.js";
export * from "./runtime.js";
export * from "./stores/index.js";
