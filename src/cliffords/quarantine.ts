import type { QuarantineGate, QuarantineRecord } from "./contracts/quarantine.js";
import type { Clock, IdProvider } from "./contracts/plantModel.js";

export type QuarantineInput = {
  artifact_id: string;
  parsed_id?: string;
  canonical_id?: string;
  gate: QuarantineGate;
  severity: QuarantineRecord["severity"];
  reason_code: string;
  reason_message: string;
  suggested_fix?: string;
  raw_snapshot: unknown;
  needs_human_review?: boolean;
};

export function createQuarantineRecord(
  input: QuarantineInput,
  clock: Clock,
  ids: IdProvider
): QuarantineRecord {
  const record: QuarantineRecord = {
    quarantine_id: ids.next("quarantine"),
    artifact_id: input.artifact_id,
    gate: input.gate,
    severity: input.severity,
    reason_code: input.reason_code,
    reason_message: input.reason_message,
    raw_snapshot: structuredClone(input.raw_snapshot),
    created_at_utc: clock.now().toISOString(),
    needs_human_review: input.needs_human_review ?? true
  };
  if (input.parsed_id !== undefined) {
    record.parsed_id = input.parsed_id;
  }
  if (input.canonical_id !== undefined) {
    record.canonical_id = input.canonical_id;
  }
  if (input.suggested_fix !== undefined) {
    record.suggested_fix = input.suggested_fix;
  }
  return record;
}
