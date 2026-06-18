import type { ArtifactType } from "../contracts/artifact.js";

export function detectDocumentKind(text: string): ArtifactType {
  const normalized = text.toLowerCase();
  if (
    /\bcause\b/.test(normalized) &&
    /\beffect\b/.test(normalized) &&
    /min.?delay|max.?delay/.test(normalized)
  ) {
    return "cause_effect_matrix";
  }
  if (/\bhazop\b|deviation|safeguard/.test(normalized)) {
    return "hazop_worksheet";
  }
  if (/permit[- ]to[- ]work|\bptw\b/.test(normalized)) {
    return "permit_to_work";
  }
  if (/maintenance|work order|repair action/.test(normalized)) {
    return "maintenance_record";
  }
  if (/p\s*&\s*id|piping and instrumentation/.test(normalized)) {
    return "pid_document";
  }
  return "operator_note";
}
