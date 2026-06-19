import { parse } from "csv-parse/sync";
import type { RawArtifact } from "../contracts/artifact.js";
import type { ParsedRecord } from "../contracts/canonical.js";
import type { AdapterContext } from "../adapters/types.js";
import { detectCsvDialect } from "../detectors/detectCsvDialect.js";
import { normalizeText } from "../normalizers/normalizeText.js";

export type ColumnKey =
  | "timestamp"
  | "received_at"
  | "tag"
  | "equipment"
  | "priority"
  | "state"
  | "value"
  | "unit"
  | "message"
  | "zone"
  | "source_event_id"
  | "source_event_source"
  | "cause"
  | "effect"
  | "min_delay"
  | "max_delay"
  | "source";

export type ColumnMap = Partial<Record<ColumnKey, number>>;

const ALIASES: Record<ColumnKey, string[]> = {
  timestamp: [
    "timestamp",
    "time",
    "event_time",
    "datetime",
    "date",
    "ts",
    "occurred_at"
  ],
  received_at: [
    "received_at",
    "receive_time",
    "receivetime",
    "ingested_at",
    "server_time"
  ],
  tag: [
    "tag",
    "tag_id",
    "tagid",
    "tagname",
    "point",
    "point_id",
    "pointname",
    "signal",
    "instrument",
    "alarm_tag",
    "alarm_tag_id",
    "condition_name",
    "conditionname",
    "alarm"
  ],
  equipment: [
    "equipment",
    "equipment_id",
    "equipmentid",
    "asset",
    "asset_id",
    "source_name",
    "sourcename"
  ],
  priority: [
    "priority",
    "severity",
    "class",
    "level",
    "p",
    "alarm_priority",
    "alarm_severity",
    "opcua_severity"
  ],
  state: [
    "state",
    "condition",
    "condition_state",
    "event_state",
    "eventstate",
    "active_clear",
    "active_state",
    "activestate",
    "status"
  ],
  value: [
    "value",
    "pv",
    "process_value",
    "processvalue",
    "reading",
    "measured_value"
  ],
  unit: ["unit", "eu", "engineering_unit", "engineeringunit", "uom"],
  message: ["message", "alarm_text", "description", "comment", "event_text", "text"],
  zone: ["zone", "zone_id", "zoneid", "area", "area_id", "location"],
  source_event_id: ["source_event_id", "sourceeventid", "event_id", "eventid", "id"],
  source_event_source: [
    "source_event_source",
    "sourceeventsource",
    "event_source",
    "eventsource",
    "source_node",
    "sourcenode"
  ],
  cause: ["cause", "cause_tag", "cause_tag_id", "cause_equipment", "initiator", "from"],
  effect: [
    "effect",
    "effect_tag",
    "effect_tag_id",
    "effect_equipment",
    "consequence",
    "to"
  ],
  min_delay: ["min_delay_sec", "mindelaysec", "minimum_delay", "min_delay"],
  max_delay: ["max_delay_sec", "maxdelaysec", "maximum_delay", "max_delay"],
  source: ["source", "evidence_source"]
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function fingerprintColumns(
  columns: string[],
  _sampleRows: string[][] = []
): ColumnMap {
  const normalized = columns.map(normalizeHeader);
  const map: ColumnMap = {};
  for (const [key, aliases] of Object.entries(ALIASES) as Array<
    [ColumnKey, string[]]
  >) {
    const index = normalized.findIndex((column) => aliases.includes(column));
    if (index >= 0) {
      map[key] = index;
    }
  }
  return map;
}

function valueAt(row: string[], index: number | undefined): string | null {
  return index === undefined ? null : (normalizeText(row[index]) ?? null);
}

function toNumberOrRaw(value: string | null): number | string | null {
  if (value === null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

export function normalizeTableRows(
  rows: string[][],
  columnMap: ColumnMap,
  artifact: RawArtifact,
  context: AdapterContext
): ParsedRecord[] {
  const isCauseEffect =
    columnMap.cause !== undefined && columnMap.effect !== undefined;

  return rows.map((row, index) => {
    const rowNumber = index + 2;
    if (isCauseEffect) {
      return {
        parsed_id: context.ids.next("parsed"),
        artifact_id: artifact.artifact_id,
        record_kind: "causal_edge_candidate",
        extracted_at_utc: context.clock.now().toISOString(),
        source_ref: {
          artifact_id: artifact.artifact_id,
          row_number: rowNumber
        },
        confidence: 0.96,
        fields: {
          cause_tag_id: valueAt(row, columnMap.cause),
          effect_tag_id: valueAt(row, columnMap.effect),
          min_delay_sec: toNumberOrRaw(valueAt(row, columnMap.min_delay)),
          max_delay_sec: toNumberOrRaw(valueAt(row, columnMap.max_delay)),
          evidence_source: valueAt(row, columnMap.source) ?? "manual",
          edge_kind: "unknown"
        },
        raw_text: row.join(",")
      };
    }

    return {
      parsed_id: context.ids.next("parsed"),
      artifact_id: artifact.artifact_id,
      record_kind: "alarm_event_candidate",
      extracted_at_utc: context.clock.now().toISOString(),
      source_ref: {
        artifact_id: artifact.artifact_id,
        row_number: rowNumber
      },
      confidence: 0.98,
      fields: {
        timestamp: valueAt(row, columnMap.timestamp),
        received_at: valueAt(row, columnMap.received_at),
        source_event_id: valueAt(row, columnMap.source_event_id),
        source_event_source: valueAt(row, columnMap.source_event_source),
        tag_id: valueAt(row, columnMap.tag),
        equipment_id: valueAt(row, columnMap.equipment),
        priority: valueAt(row, columnMap.priority),
        state: valueAt(row, columnMap.state),
        process_value: toNumberOrRaw(valueAt(row, columnMap.value)),
        engineering_unit: valueAt(row, columnMap.unit),
        alarm_message: valueAt(row, columnMap.message),
        zone_id: valueAt(row, columnMap.zone),
        source_system: null
      },
      raw_text: row.join(",")
    };
  });
}

export function parseStructuredTable(
  text: string,
  artifact: RawArtifact,
  context: AdapterContext
): ParsedRecord[] {
  const dialect = detectCsvDialect(text);
  const table = parse(text, {
    bom: true,
    delimiter: dialect.delimiter,
    quote: dialect.quote,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true
  }) as string[][];

  const [headers, ...rows] = table;
  if (!headers || headers.length === 0) {
    return [];
  }
  return normalizeTableRows(
    rows,
    fingerprintColumns(headers),
    artifact,
    context
  );
}
