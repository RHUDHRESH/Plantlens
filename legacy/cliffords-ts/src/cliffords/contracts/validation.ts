import type { RawArtifact } from "./artifact.js";
import type {
  CanonicalRecord,
  ParsedRecord
} from "./canonical.js";
import type {
  MappingRequest,
  QuarantineRecord
} from "./quarantine.js";

export type ValidationIssue = {
  code: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "BLOCKER";
  field?: string;
};

export type GateSummary = {
  status: "PASS" | "PARTIAL" | "FAIL" | "SKIPPED";
  accepted: number;
  rejected: number;
  issues: ValidationIssue[];
};

export type Gate1Result =
  | {
      status: "PASS";
      artifact: RawArtifact;
      bytes: Uint8Array;
    }
  | {
      status: "FAIL";
      artifact: RawArtifact;
      quarantine: QuarantineRecord;
    };

export type Gate2Result = {
  status: "PASS" | "PARTIAL" | "FAIL";
  canonical_records: CanonicalRecord[];
  contextual_records: ParsedRecord[];
  quarantined_records: QuarantineRecord[];
  issues: ValidationIssue[];
};

export type Gate3Result = {
  status: "PASS" | "PARTIAL" | "FAIL";
  clean_records: CanonicalRecord[];
  quarantined_records: QuarantineRecord[];
  mapping_requests: MappingRequest[];
  warnings: ValidationIssue[];
};

export type AuditEventInput = {
  event_id: string;
  run_id: string;
  artifact_id?: string;
  occurred_at_utc: string;
  event_type: string;
  details: Record<string, unknown>;
};

export type AuditEvent = AuditEventInput & {
  previous_event_hash: string | null;
  event_hash: string;
  hash_algorithm: "SHA-256";
};

export type AuditChainVerification = {
  valid: boolean;
  checked_events: number;
  broken_index: number | null;
  reason: string | null;
};

export type IngestionReport = {
  run_id: string;
  started_at_utc: string;
  completed_at_utc: string;
  artifact_id: string;
  detected_type: RawArtifact["detected_type"];
  gate_1: GateSummary;
  gate_2: GateSummary;
  gate_3: GateSummary;
  totals: {
    parsed: number;
    clean: number;
    quarantined: number;
    mapping_requests: number;
  };
  top_issues: Array<{ reason_code: string; count: number }>;
  downstream_ready: boolean;
};

export type CliffordRunResult = {
  run_id: string;
  status: "PASS" | "PARTIAL" | "FAIL";
  artifact: RawArtifact;
  parsed_records: ParsedRecord[];
  clean_records: CanonicalRecord[];
  quarantined_records: QuarantineRecord[];
  mapping_requests: MappingRequest[];
  report: IngestionReport;
};
