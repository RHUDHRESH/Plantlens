import type { ParsedRecord } from "../contracts/canonical.js";
import {
  enforcePayloadDepth,
  PayloadLimitError
} from "./payloadLimits.js";
import type { AdapterContext, AdapterInput, AdapterResult } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function first(
  record: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }
  return null;
}

function firstFrom(
  primary: Record<string, unknown>,
  fallback: Record<string, unknown>,
  keys: string[]
): unknown {
  const value = first(primary, keys);
  return value === null ? first(fallback, keys) : value;
}

function isCloudEvent(record: Record<string, unknown>): boolean {
  return (
    typeof record.specversion === "string" &&
    typeof record.id === "string" &&
    typeof record.source === "string" &&
    typeof record.type === "string"
  );
}

export function parseJsonEvent(
  input: AdapterInput,
  context: AdapterContext
): AdapterResult {
  const payload =
    input.payload ??
    JSON.parse(Buffer.from(input.bytes).toString("utf8"));
  enforcePayloadDepth(payload, context.config.max_json_depth);
  const values = Array.isArray(payload) ? payload : [payload];
  if (values.length > context.config.max_parsed_records) {
    throw new PayloadLimitError(
      "RECORD_LIMIT_EXCEEDED",
      `JSON event count ${values.length} exceeds configured maximum ${context.config.max_parsed_records}`
    );
  }
  const records: ParsedRecord[] = [];

  values.forEach((value, index) => {
    const envelope = asRecord(value);
    if (!envelope) {
      return;
    }
    const cloudEvent = isCloudEvent(envelope);
    const data = cloudEvent ? asRecord(envelope.data) : null;
    const record = data ?? envelope;
    const activeState = firstFrom(record, envelope, [
      "active_state",
      "ActiveState"
    ]);
    const ackedState = firstFrom(record, envelope, [
      "acked_state",
      "AckedState"
    ]);
    const explicitState = firstFrom(record, envelope, ["state", "status"]);
    const state =
      explicitState ??
      (activeState === true
        ? "ACTIVE"
        : ackedState === true
          ? "ACKED"
          : activeState === false
            ? "CLEAR"
            : null);
    records.push({
      parsed_id: context.ids.next("parsed"),
      artifact_id: input.artifact.artifact_id,
      record_kind: "alarm_event_candidate",
      extracted_at_utc: context.clock.now().toISOString(),
      source_ref: {
        artifact_id: input.artifact.artifact_id,
        json_pointer: `${Array.isArray(payload) ? `/${index}` : ""}${data ? "/data" : ""}`
      },
      confidence: 0.95,
      fields: {
        timestamp: cloudEvent
          ? (envelope.time ??
            first(record, ["timestamp", "time", "Time", "occurred_at"]))
          : firstFrom(record, envelope, [
              "timestamp",
              "time",
              "Time",
              "occurred_at"
            ]),
        received_at: firstFrom(record, envelope, [
          "received_at",
          "receive_time",
          "ReceiveTime"
        ]),
        source_event_id: cloudEvent
          ? envelope.id
          : firstFrom(record, envelope, [
              "source_event_id",
              "event_id",
              "EventId",
              "id"
            ]),
        source_event_source: cloudEvent
          ? envelope.source
          : firstFrom(record, envelope, [
              "source_event_source",
              "event_source",
              "source"
            ]),
        tag_id: firstFrom(record, envelope, [
          "tag_id",
          "tag",
          "ConditionName",
          "signal",
          "subject"
        ]),
        equipment_id: firstFrom(record, envelope, [
          "equipment_id",
          "equipment",
          "SourceName",
          "asset"
        ]),
        priority: firstFrom(record, envelope, [
          "priority",
          "severity",
          "Severity"
        ]),
        state,
        source_quality: firstFrom(record, envelope, [
          "source_quality",
          "quality",
          "Quality",
          "status_code"
        ]),
        process_value: firstFrom(record, envelope, [
          "value",
          "Value",
          "process_value"
        ]),
        engineering_unit: firstFrom(record, envelope, [
          "unit",
          "Unit",
          "engineering_unit"
        ]),
        alarm_message: firstFrom(record, envelope, [
          "message",
          "Message",
          "description"
        ]),
        zone_id: firstFrom(record, envelope, ["zone_id", "zone"]),
        source_system: firstFrom(record, envelope, [
          "source_system",
          "source"
        ]),
        acked_state: ackedState,
        active_state: activeState,
        cloud_event_specversion: cloudEvent
          ? envelope.specversion
          : null,
        cloud_event_type: cloudEvent ? envelope.type : null,
        cloud_event_subject: cloudEvent ? (envelope.subject ?? null) : null,
        cloud_event_datacontenttype: cloudEvent
          ? (envelope.datacontenttype ?? null)
          : null,
        cloud_event_dataschema: cloudEvent
          ? (envelope.dataschema ?? null)
          : null
      },
      raw_text: JSON.stringify(envelope)
    });
  });

  return { records };
}

export function parseSensorPacket(
  input: AdapterInput,
  context: AdapterContext
): AdapterResult {
  return parseJsonEvent(input, context);
}
