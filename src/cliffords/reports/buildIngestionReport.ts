import type { RawArtifact } from "../contracts/artifact.js";
import type { GateSummary, IngestionReport } from "../contracts/validation.js";

export type IngestionReportInput = {
  run_id: string;
  started_at_utc: string;
  completed_at_utc: string;
  artifact: RawArtifact;
  gate_1: GateSummary;
  gate_2: GateSummary;
  gate_3: GateSummary;
  totals: IngestionReport["totals"];
  reason_codes: string[];
};

export function buildIngestionReport(
  input: IngestionReportInput
): IngestionReport {
  const counts = new Map<string, number>();
  for (const reasonCode of input.reason_codes) {
    counts.set(reasonCode, (counts.get(reasonCode) ?? 0) + 1);
  }

  return {
    run_id: input.run_id,
    started_at_utc: input.started_at_utc,
    completed_at_utc: input.completed_at_utc,
    artifact_id: input.artifact.artifact_id,
    detected_type: input.artifact.detected_type,
    gate_1: structuredClone(input.gate_1),
    gate_2: structuredClone(input.gate_2),
    gate_3: structuredClone(input.gate_3),
    totals: structuredClone(input.totals),
    top_issues: [...counts.entries()]
      .map(([reason_code, count]) => ({ reason_code, count }))
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.reason_code.localeCompare(right.reason_code)
      ),
    downstream_ready:
      input.gate_1.status === "PASS" &&
      input.gate_2.status === "PASS" &&
      input.gate_3.status === "PASS" &&
      input.totals.clean > 0 &&
      input.totals.quarantined === 0 &&
      input.totals.mapping_requests === 0
  };
}

export function formatIngestionReport(report: IngestionReport): string {
  const issues =
    report.top_issues.length === 0
      ? "none"
      : report.top_issues
          .map((issue) => `${issue.reason_code} (${issue.count})`)
          .join(", ");
  return [
    `Cliffords run ${report.run_id}: ${report.downstream_ready ? "downstream ready" : "review required"}`,
    `Artifact: ${report.artifact_id} (${report.detected_type ?? "unknown"})`,
    `Records: ${report.totals.parsed} parsed, ${report.totals.clean} clean, ${report.totals.quarantined} quarantined`,
    `Mapping requests: ${report.totals.mapping_requests}`,
    `Top issues: ${issues}`
  ].join("\n");
}
