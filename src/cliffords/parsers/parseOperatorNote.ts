import type { RawArtifact } from "../contracts/artifact.js";
import type { ParsedRecord } from "../contracts/canonical.js";
import type { AdapterContext } from "../adapters/types.js";

const EQUIPMENT_PATTERN = /\b([A-Z]{1,12})[- ]?(\d{1,6})\b/gi;
const SEQUENCE_SPLIT = /\b(?:then|later|after that|subsequently)\b|[.!?]+/i;

export function parseOperatorNote(
  text: string,
  artifact: RawArtifact,
  context: AdapterContext
): ParsedRecord[] {
  const records: ParsedRecord[] = [];
  const equipment = new Set<string>();
  for (const match of text.matchAll(EQUIPMENT_PATTERN)) {
    const prefix = match[1]?.toUpperCase();
    const number = match[2];
    if (prefix && number) {
      equipment.add(`${prefix}-${number}`);
    }
  }

  for (const equipmentId of equipment) {
    records.push({
      parsed_id: context.ids.next("parsed"),
      artifact_id: artifact.artifact_id,
      record_kind: "equipment_candidate",
      extracted_at_utc: context.clock.now().toISOString(),
      source_ref: { artifact_id: artifact.artifact_id },
      confidence: 0.72,
      fields: { equipment_id: equipmentId },
      raw_text: text
    });
  }

  const clauses = text
    .split(SEQUENCE_SPLIT)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length >= 4);
  for (let index = 0; index < clauses.length - 1; index += 1) {
    records.push({
      parsed_id: context.ids.next("parsed"),
      artifact_id: artifact.artifact_id,
      record_kind: "causal_edge_candidate",
      extracted_at_utc: context.clock.now().toISOString(),
      source_ref: { artifact_id: artifact.artifact_id },
      confidence: 0.55,
      fields: {
        cause_tag_id: null,
        effect_tag_id: null,
        cause_text: clauses[index],
        effect_text: clauses[index + 1],
        min_delay_sec: null,
        max_delay_sec: null,
        edge_kind: "unknown",
        evidence_source: "operator_note"
      },
      raw_text: `${clauses[index]} -> ${clauses[index + 1]}`
    });
  }

  records.push({
    parsed_id: context.ids.next("parsed"),
    artifact_id: artifact.artifact_id,
    record_kind: "operator_note_candidate",
    extracted_at_utc: context.clock.now().toISOString(),
    source_ref: { artifact_id: artifact.artifact_id },
    confidence: 0.6,
    fields: {
      text,
      equipment_ids: [...equipment]
    },
    raw_text: text
  });

  return records;
}
