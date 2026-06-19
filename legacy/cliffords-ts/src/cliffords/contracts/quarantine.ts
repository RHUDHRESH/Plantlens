import type { SourceRef } from "./canonical.js";

export type QuarantineGate =
  | "GATE_1_ARTIFACT"
  | "GATE_2_SCHEMA"
  | "GATE_3_TRUTH";

export type QuarantineRecord = {
  quarantine_id: string;
  artifact_id: string;
  parsed_id?: string;
  canonical_id?: string;
  gate: QuarantineGate;
  severity: "LOW" | "MEDIUM" | "HIGH" | "BLOCKER";
  reason_code: string;
  reason_message: string;
  suggested_fix?: string;
  raw_snapshot: unknown;
  created_at_utc: string;
  needs_human_review: boolean;
};

export type MappingRequest = {
  request_id: string;
  created_at_utc: string;
  issue:
    | "UNKNOWN_TAG"
    | "UNKNOWN_EQUIPMENT"
    | "UNKNOWN_ZONE"
    | "AMBIGUOUS_SIGNAL";
  raw_value: string;
  suggested_matches: Array<{
    id: string;
    label: string;
    confidence: number;
  }>;
  source_ref: SourceRef;
  status: "OPEN" | "APPROVED" | "REJECTED";
};
