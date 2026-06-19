import type { ArtifactType } from "./artifact.js";

export type SourceRef = {
  artifact_id: string;
  artifact_sha256?: string;
  row_number?: number;
  column_name?: string;
  cell_ref?: string;
  page_number?: number;
  bbox?: [number, number, number, number];
  transcript_start_sec?: number;
  transcript_end_sec?: number;
  json_pointer?: string;
};

export type ParsedRecordKind =
  | "alarm_event_candidate"
  | "tag_candidate"
  | "equipment_candidate"
  | "causal_edge_candidate"
  | "operator_note_candidate"
  | "maintenance_action_candidate"
  | "permit_candidate"
  | "pid_connection_candidate";

export type ParsedRecord = {
  parsed_id: string;
  artifact_id: string;
  record_kind: ParsedRecordKind;
  extracted_at_utc: string;
  source_ref: SourceRef;
  confidence: number;
  fields: Record<string, unknown>;
  raw_text?: string;
};

export type CanonicalAlarmState =
  | "ACTIVE"
  | "CLEAR"
  | "ACKED"
  | "SHELVED"
  | "SUPPRESSED"
  | "UNKNOWN";

export type SourceQuality = "GOOD" | "UNCERTAIN" | "BAD" | "UNKNOWN";

export type CanonicalAlarmEvent = {
  record_type: "alarm_event";
  event_id: string;
  source_event_id: string | null;
  source_event_source: string | null;
  tag_id: string;
  equipment_id: string | null;
  zone_id: string | null;
  timestamp_utc: string;
  received_at_utc: string;
  priority: 1 | 2 | 3 | 4;
  state: CanonicalAlarmState;
  source_quality: SourceQuality;
  process_value: number | string | null;
  engineering_unit: string | null;
  alarm_message: string | null;
  source_system: string | null;
  source_type: ArtifactType;
  source_ref: SourceRef;
  confidence: number;
  metadata: Record<string, unknown>;
};

export type CanonicalCausalEdgeCandidate = {
  record_type: "causal_edge_candidate";
  edge_candidate_id: string;
  cause_tag_id: string | null;
  effect_tag_id: string | null;
  cause_equipment_id: string | null;
  effect_equipment_id: string | null;
  min_delay_sec: number | null;
  max_delay_sec: number | null;
  edge_kind:
    | "process"
    | "electrical"
    | "mechanical"
    | "thermal"
    | "control"
    | "unknown";
  evidence_source:
    | "cause_effect_matrix"
    | "hazop"
    | "pid"
    | "historian"
    | "operator_note"
    | "manual";
  source_ref: SourceRef;
  confidence: number;
  approval_status: "PROPOSED" | "APPROVED" | "REJECTED";
  metadata: Record<string, unknown>;
};

export type CanonicalRecord =
  | CanonicalAlarmEvent
  | CanonicalCausalEdgeCandidate;
