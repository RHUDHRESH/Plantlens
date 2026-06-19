import { z } from "zod";
import type { RawArtifact } from "../contracts/artifact.js";
import type {
  CanonicalCausalEdgeCandidate,
  CanonicalRecord,
  ParsedRecord
} from "../contracts/canonical.js";
import type {
  Clock,
  CliffordConfig,
  IdProvider
} from "../contracts/plantModel.js";
import type {
  Gate2Result,
  ValidationIssue
} from "../contracts/validation.js";
import { normalizeAlarmState } from "../normalizers/normalizeAlarmState.js";
import { normalizeEquipmentId } from "../normalizers/normalizeEquipmentId.js";
import {
  mapOpcUaSeverity,
  normalizePriority
} from "../normalizers/normalizePriority.js";
import { normalizeSourceEventId } from "../normalizers/normalizeSourceEventId.js";
import { normalizeSourceQuality } from "../normalizers/normalizeSourceQuality.js";
import { normalizeTagId } from "../normalizers/normalizeTagId.js";
import { normalizeText } from "../normalizers/normalizeText.js";
import { normalizeTimestamp } from "../normalizers/normalizeTimestamp.js";
import { normalizeUnits } from "../normalizers/normalizeUnits.js";
import { createQuarantineRecord } from "../quarantine.js";

const sourceRefSchema = z.object({
  artifact_id: z.string().min(1),
  artifact_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  row_number: z.number().int().positive().optional(),
  column_name: z.string().optional(),
  cell_ref: z.string().optional(),
  page_number: z.number().int().positive().optional(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
  transcript_start_sec: z.number().nonnegative().optional(),
  transcript_end_sec: z.number().nonnegative().optional(),
  json_pointer: z.string().optional()
});

const alarmSchema = z.object({
  record_type: z.literal("alarm_event"),
  event_id: z.string().min(1),
  source_event_id: z.string().nullable(),
  source_event_source: z.string().nullable(),
  tag_id: z.string().min(1),
  equipment_id: z.string().nullable(),
  zone_id: z.string().nullable(),
  timestamp_utc: z.iso.datetime(),
  received_at_utc: z.iso.datetime(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  state: z.enum([
    "ACTIVE",
    "CLEAR",
    "ACKED",
    "SHELVED",
    "SUPPRESSED",
    "UNKNOWN"
  ]),
  source_quality: z.enum(["GOOD", "UNCERTAIN", "BAD", "UNKNOWN"]),
  process_value: z.union([z.number(), z.string(), z.null()]),
  engineering_unit: z.string().nullable(),
  alarm_message: z.string().nullable(),
  source_system: z.string().nullable(),
  source_type: z.string(),
  source_ref: sourceRefSchema,
  confidence: z.number().min(0).max(1),
  metadata: z.record(z.string(), z.unknown())
});

const edgeSchema = z.object({
  record_type: z.literal("causal_edge_candidate"),
  edge_candidate_id: z.string().min(1),
  cause_tag_id: z.string().nullable(),
  effect_tag_id: z.string().nullable(),
  cause_equipment_id: z.string().nullable(),
  effect_equipment_id: z.string().nullable(),
  min_delay_sec: z.number().nonnegative().nullable(),
  max_delay_sec: z.number().nonnegative().nullable(),
  edge_kind: z.enum([
    "process",
    "electrical",
    "mechanical",
    "thermal",
    "control",
    "unknown"
  ]),
  evidence_source: z.enum([
    "cause_effect_matrix",
    "hazop",
    "pid",
    "historian",
    "operator_note",
    "manual"
  ]),
  source_ref: sourceRefSchema,
  confidence: z.number().min(0).max(1),
  approval_status: z.enum(["PROPOSED", "APPROVED", "REJECTED"]),
  metadata: z.record(z.string(), z.unknown())
});

function issue(
  code: string,
  message: string,
  field?: string
): ValidationIssue {
  const result: ValidationIssue = {
    code,
    message,
    severity: "HIGH"
  };
  if (field !== undefined) {
    result.field = field;
  }
  return result;
}

function numericOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function sourceRef(
  record: ParsedRecord,
  artifact: RawArtifact
): ParsedRecord["source_ref"] {
  return {
    ...structuredClone(record.source_ref),
    artifact_sha256: artifact.sha256
  };
}

function oversizedTextPath(
  value: unknown,
  maximumLength: number,
  path = "fields",
  ancestors = new Set<object>()
): string | null {
  if (typeof value === "string") {
    return value.length > maximumLength ? path : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  if (ancestors.has(value)) {
    return path;
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const match = oversizedTextPath(
        value[index],
        maximumLength,
        `${path}[${index}]`,
        ancestors
      );
      if (match) {
        ancestors.delete(value);
        return match;
      }
    }
  } else {
    for (const [key, entry] of Object.entries(value)) {
      const match = oversizedTextPath(
        entry,
        maximumLength,
        `${path}.${key}`,
        ancestors
      );
      if (match) {
        ancestors.delete(value);
        return match;
      }
    }
  }
  ancestors.delete(value);
  return null;
}

function edgeEvidence(
  artifact: RawArtifact,
  raw: unknown
): CanonicalCausalEdgeCandidate["evidence_source"] {
  if (artifact.detected_type === "cause_effect_matrix") {
    return "cause_effect_matrix";
  }
  if (artifact.detected_type === "hazop_worksheet") {
    return "hazop";
  }
  if (artifact.detected_type === "pid_document") {
    return "pid";
  }
  if (artifact.detected_type === "operator_note") {
    return "operator_note";
  }
  const normalized = normalizeText(raw)?.toLowerCase();
  return normalized === "historian" ? "historian" : "manual";
}

function addQuarantines(
  record: ParsedRecord,
  recordIssues: ValidationIssue[],
  result: Gate2Result,
  clock: Clock,
  ids: IdProvider
): void {
  for (const validationIssue of recordIssues) {
    result.issues.push(validationIssue);
    result.quarantined_records.push(
      createQuarantineRecord(
        {
          artifact_id: record.artifact_id,
          parsed_id: record.parsed_id,
          gate: "GATE_2_SCHEMA",
          severity: validationIssue.severity,
          reason_code: validationIssue.code,
          reason_message: validationIssue.message,
          suggested_fix: validationIssue.field
            ? `Correct or map the ${validationIssue.field} field`
            : "Correct the source record",
          raw_snapshot: record
        },
        clock,
        ids
      )
    );
  }
}

function canonicalizeAlarm(
  record: ParsedRecord,
  artifact: RawArtifact,
  plantTimezone: string | undefined,
  config: CliffordConfig,
  ids: IdProvider
): { canonical: CanonicalRecord | null; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const tagId = normalizeTagId(record.fields.tag_id);
  if (!tagId) {
    issues.push(issue("MISSING_TAG_ID", "Alarm tag ID is missing", "tag_id"));
  }

  const timestamp = normalizeTimestamp(
    record.fields.timestamp,
    plantTimezone
  );
  if (!timestamp.ok) {
    issues.push(
      issue(
        timestamp.reason,
        timestamp.reason === "NEEDS_TIMEZONE"
          ? "Timestamp has no offset and no plant timezone is configured"
          : "Timestamp could not be normalized",
        "timestamp"
      )
    );
  }

  const priority = normalizePriority(record.fields.priority);
  const mappedPriority =
    priority ??
    mapOpcUaSeverity(
      record.fields.priority,
      config.opcua_severity_ranges
    );
  if (!mappedPriority) {
    issues.push(
      issue("BAD_PRIORITY", "Priority could not be mapped to 1-4", "priority")
    );
  }

  const state = normalizeAlarmState(record.fields.state);
  if (!state) {
    issues.push(
      issue("BAD_STATE", "Live alarm state is not recognized", "state")
    );
  }

  if (
    issues.length > 0 ||
    !tagId ||
    !timestamp.ok ||
    !mappedPriority ||
    !state
  ) {
    return { canonical: null, issues };
  }

  const rawReceivedAt = record.fields.received_at;
  const receivedAt =
    rawReceivedAt === null || rawReceivedAt === undefined || rawReceivedAt === ""
      ? { ok: true as const, value: artifact.received_at_utc }
      : normalizeTimestamp(rawReceivedAt, plantTimezone);
  if (!receivedAt.ok) {
    return {
      canonical: null,
      issues: [
        issue(
          "BAD_RECEIVE_TIMESTAMP",
          "Source receive timestamp could not be normalized",
          "received_at"
        )
      ]
    };
  }

  const processValue = record.fields.process_value;
  const canonical = {
    record_type: "alarm_event" as const,
    event_id: ids.next("event"),
    source_event_id: normalizeSourceEventId(record.fields.source_event_id),
    source_event_source: normalizeText(
      record.fields.source_event_source
    ),
    tag_id: tagId,
    equipment_id: normalizeEquipmentId(record.fields.equipment_id),
    zone_id: normalizeText(record.fields.zone_id)?.toUpperCase() ?? null,
    timestamp_utc: timestamp.value,
    received_at_utc: receivedAt.value,
    priority: mappedPriority,
    state,
    source_quality: normalizeSourceQuality(record.fields.source_quality),
    process_value:
      typeof processValue === "number" || typeof processValue === "string"
        ? processValue
        : null,
    engineering_unit: normalizeUnits(record.fields.engineering_unit),
    alarm_message: normalizeText(record.fields.alarm_message),
    source_system: normalizeText(record.fields.source_system),
    source_type: artifact.detected_type ?? "unknown",
    source_ref: sourceRef(record, artifact),
    confidence: record.confidence,
    metadata: {
      raw_tag_id: record.fields.tag_id ?? null,
      raw_equipment_id: record.fields.equipment_id ?? null,
      acked_state: record.fields.acked_state ?? null,
      active_state: record.fields.active_state ?? null,
      confirmed_state: record.fields.confirmed_state ?? null,
      suppressed_state: record.fields.suppressed_state ?? null,
      shelving_state: record.fields.shelving_state ?? null,
      enabled_state: record.fields.enabled_state ?? null,
      retain: record.fields.retain ?? null,
      branch_id: record.fields.branch_id ?? null,
      condition_class_id: record.fields.condition_class_id ?? null,
      condition_class_name: record.fields.condition_class_name ?? null,
      last_severity: record.fields.last_severity ?? null,
      comment: record.fields.comment ?? null,
      client_user_id: record.fields.client_user_id ?? null,
      cloud_event_specversion:
        record.fields.cloud_event_specversion ?? null,
      cloud_event_type: record.fields.cloud_event_type ?? null,
      cloud_event_subject: record.fields.cloud_event_subject ?? null,
      cloud_event_datacontenttype:
        record.fields.cloud_event_datacontenttype ?? null,
      cloud_event_dataschema: record.fields.cloud_event_dataschema ?? null,
      opcua_severity: record.fields.opcua_severity ?? null
    }
  };
  const parsed = alarmSchema.safeParse(canonical);
  return parsed.success
    ? { canonical, issues: [] }
    : {
        canonical: null,
        issues: [
          issue(
            "SCHEMA_VALIDATION_FAILED",
            parsed.error.issues.map((entry) => entry.message).join("; ")
          )
        ]
      };
}

function canonicalizeEdge(
  record: ParsedRecord,
  artifact: RawArtifact,
  ids: IdProvider
): { canonical: CanonicalRecord | null; issues: ValidationIssue[] } {
  const minDelay = numericOrNull(record.fields.min_delay_sec);
  const maxDelay = numericOrNull(record.fields.max_delay_sec);
  const causeTag = normalizeTagId(record.fields.cause_tag_id);
  const effectTag = normalizeTagId(record.fields.effect_tag_id);
  const causeEquipment = normalizeEquipmentId(
    record.fields.cause_equipment_id
  );
  const effectEquipment = normalizeEquipmentId(
    record.fields.effect_equipment_id
  );
  const issues: ValidationIssue[] = [];
  if (!causeTag && !causeEquipment) {
    issues.push(
      issue(
        "MISSING_CAUSE",
        "Causal edge has no cause tag or equipment",
        "cause"
      )
    );
  }
  if (!effectTag && !effectEquipment) {
    issues.push(
      issue(
        "MISSING_EFFECT",
        "Causal edge has no effect tag or equipment",
        "effect"
      )
    );
  }
  if (
    minDelay !== null &&
    maxDelay !== null &&
    minDelay > maxDelay
  ) {
    issues.push(
      issue(
        "INVALID_DELAY_RANGE",
        "Minimum delay exceeds maximum delay",
        "delay"
      )
    );
  }
  if (issues.length > 0) {
    return { canonical: null, issues };
  }
  const edge: CanonicalCausalEdgeCandidate = {
    record_type: "causal_edge_candidate",
    edge_candidate_id: ids.next("edge"),
    cause_tag_id: causeTag,
    effect_tag_id: effectTag,
    cause_equipment_id: causeEquipment,
    effect_equipment_id: effectEquipment,
    min_delay_sec: minDelay,
    max_delay_sec: maxDelay,
    edge_kind: [
      "process",
      "electrical",
      "mechanical",
      "thermal",
      "control"
    ].includes(String(record.fields.edge_kind).toLowerCase())
      ? (String(record.fields.edge_kind).toLowerCase() as CanonicalCausalEdgeCandidate["edge_kind"])
      : "unknown",
    evidence_source: edgeEvidence(artifact, record.fields.evidence_source),
    source_ref: sourceRef(record, artifact),
    confidence: record.confidence,
    approval_status: "PROPOSED",
    metadata: {
      raw_evidence_source: record.fields.evidence_source ?? null,
      cause_text: record.fields.cause_text ?? null,
      effect_text: record.fields.effect_text ?? null
    }
  };
  const parsed = edgeSchema.safeParse(edge);
  return parsed.success
    ? { canonical: edge, issues: [] }
    : {
        canonical: null,
        issues: [
          issue(
            "SCHEMA_VALIDATION_FAILED",
            parsed.error.issues.map((entry) => entry.message).join("; ")
          )
        ]
      };
}

export function gate2CanonicalSchema(
  parsedRecords: ParsedRecord[],
  artifact: RawArtifact,
  plantTimezone: string | undefined,
  config: CliffordConfig,
  clock: Clock,
  ids: IdProvider
): Gate2Result {
  const result: Gate2Result = {
    status: "PASS",
    canonical_records: [],
    contextual_records: [],
    quarantined_records: [],
    issues: []
  };

  for (const record of parsedRecords) {
    const oversizedPath =
      oversizedTextPath(record.fields, config.max_text_field_chars) ??
      (record.raw_text &&
      record.raw_text.length > config.max_text_field_chars
        ? "raw_text"
        : null);
    if (oversizedPath) {
      addQuarantines(
        record,
        [
          issue(
            "TEXT_FIELD_TOO_LARGE",
            `Extracted text at ${oversizedPath} exceeds ${config.max_text_field_chars} characters`,
            oversizedPath
          )
        ],
        result,
        clock,
        ids
      );
      continue;
    }
    if (
      !Number.isFinite(record.confidence) ||
      record.confidence < 0 ||
      record.confidence > 1
    ) {
      addQuarantines(
        record,
        [
          issue(
            "BAD_CONFIDENCE",
            "Extraction confidence must be a finite value between 0 and 1",
            "confidence"
          )
        ],
        result,
        clock,
        ids
      );
      continue;
    }
    if (
      record.artifact_id !== artifact.artifact_id ||
      !record.source_ref.artifact_id ||
      record.source_ref.artifact_id !== artifact.artifact_id
    ) {
      addQuarantines(
        record,
        [
          issue(
            "MISSING_SOURCE_REF",
            "Source reference is missing or points to another artifact",
            "source_ref"
          )
        ],
        result,
        clock,
        ids
      );
      continue;
    }
    if (
      record.record_kind !== "alarm_event_candidate" &&
      record.record_kind !== "causal_edge_candidate"
    ) {
      result.contextual_records.push(record);
      continue;
    }
    if (record.confidence < config.extraction_confidence_threshold) {
      addQuarantines(
        record,
        [
          issue(
            "LOW_EXTRACTION_CONFIDENCE",
            `Confidence ${record.confidence} is below ${config.extraction_confidence_threshold}`
          )
        ],
        result,
        clock,
        ids
      );
      continue;
    }
    const canonicalized =
      record.record_kind === "alarm_event_candidate"
        ? canonicalizeAlarm(record, artifact, plantTimezone, config, ids)
        : canonicalizeEdge(record, artifact, ids);
    if (canonicalized.canonical) {
      result.canonical_records.push(canonicalized.canonical);
    } else {
      addQuarantines(
        record,
        canonicalized.issues,
        result,
        clock,
        ids
      );
    }
  }

  result.status =
    result.canonical_records.length === 0 &&
    result.quarantined_records.length > 0
      ? "FAIL"
      : result.quarantined_records.length > 0
        ? "PARTIAL"
        : "PASS";
  return result;
}
