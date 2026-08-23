import type { MatrixMatchState } from "../../components/plant";
import type { FaultMatrix, FaultMatrixScore } from "../../app/schemas/faultMatrix";

export interface MatrixRow {
  faultId: string;
  faultName: string;
  assetId: string;
  confidence: number;
  coverage: number;
  contradicted: boolean;
}

export interface MatrixCell {
  faultId: string;
  tagId: string;
  match: MatrixMatchState;
  weight: number;
  /** Human label from runtime (band/trend) when available. */
  detail?: string;
}

export interface MatrixViewModel {
  rows: MatrixRow[];
  tagIds: string[];
  cells: Record<string, MatrixCell>;
}

function cellKey(faultId: string, tagId: string): string {
  return `${faultId}::${tagId}`;
}

function scoreMap(scores: FaultMatrixScore[]): Map<string, FaultMatrixScore> {
  return new Map(scores.map((s) => [s.fault_id, s]));
}

/**
 * Runtime scores emit labels like
 * `MOTOR_301_CURRENT HIGH (band=warning_high, …)` or
 * `MOTOR_301_TEMP (no usable data)`. Columns must stay clean tag ids.
 */
export function extractTagIdFromSymptom(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return trimmed;
  const m = /^([A-Za-z][A-Za-z0-9_]*)/.exec(trimmed);
  return m?.[1] ?? trimmed;
}

function listMentionsTag(labels: readonly string[], tagId: string): string | undefined {
  for (const label of labels) {
    if (label === tagId || extractTagIdFromSymptom(label) === tagId) {
      return label;
    }
  }
  return undefined;
}

function matchForTag(
  score: FaultMatrixScore | undefined,
  tagId: string,
  authoredWeight: number | undefined,
): { match: MatrixMatchState; weight: number; detail?: string } {
  if (!score) {
    return { match: "none", weight: authoredWeight ?? 0 };
  }
  const supporting = score.supporting_symptoms ?? [];
  const contradicting = score.contradicting_symptoms ?? [];
  const missing = score.missing_symptoms ?? [];
  const weight = authoredWeight ?? score.confidence;

  const contradictLabel = listMentionsTag(contradicting, tagId);
  if (contradictLabel) {
    return { match: "contradict", weight, detail: contradictLabel };
  }
  const supportLabel = listMentionsTag(supporting, tagId);
  if (supportLabel) {
    return {
      match: score.confidence >= 0.7 ? "exact" : "partial",
      weight,
      detail: supportLabel,
    };
  }
  const missingLabel = listMentionsTag(missing, tagId);
  if (missingLabel) {
    return { match: "missing", weight: authoredWeight ?? 0, detail: missingLabel };
  }
  if (authoredWeight != null) return { match: "none", weight: authoredWeight };
  return { match: "none", weight: 0 };
}

function collectScoreTagIds(score: FaultMatrixScore): string[] {
  const out = new Set<string>();
  for (const label of [
    ...(score.supporting_symptoms ?? []),
    ...(score.contradicting_symptoms ?? []),
    ...(score.missing_symptoms ?? []),
  ]) {
    out.add(extractTagIdFromSymptom(label));
  }
  return [...out];
}

/** Build faults×tags grid from authored matrix and/or live scores. */
export function buildMatrixViewModel(
  scores: FaultMatrixScore[],
  matrix?: FaultMatrix | null,
): MatrixViewModel {
  const byId = scoreMap(scores);
  const rows: MatrixRow[] = [];
  const tagSet = new Set<string>();
  const cells: Record<string, MatrixCell> = {};

  if (matrix?.faults?.length) {
    for (const fault of matrix.faults) {
      const score = byId.get(fault.id);
      rows.push({
        faultId: fault.id,
        faultName: fault.name,
        assetId: fault.asset_id,
        confidence: score?.confidence ?? 0,
        coverage: score?.coverage ?? 0,
        contradicted: score?.contradicted ?? false,
      });
      for (const symptom of fault.symptoms) {
        tagSet.add(symptom.tag_id);
        const { match, weight, detail } = matchForTag(score, symptom.tag_id, symptom.weight);
        cells[cellKey(fault.id, symptom.tag_id)] = {
          faultId: fault.id,
          tagId: symptom.tag_id,
          match,
          weight,
          ...(detail ? { detail } : {}),
        };
      }
      if (score) {
        for (const tagId of collectScoreTagIds(score)) {
          if (cells[cellKey(fault.id, tagId)]) continue;
          tagSet.add(tagId);
          const { match, weight, detail } = matchForTag(score, tagId, undefined);
          cells[cellKey(fault.id, tagId)] = {
            faultId: fault.id,
            tagId,
            match,
            weight,
            ...(detail ? { detail } : {}),
          };
        }
      }
    }
  } else {
    const sorted = [...scores].sort((a, b) => b.confidence - a.confidence);
    for (const score of sorted) {
      rows.push({
        faultId: score.fault_id,
        faultName: score.fault_name,
        assetId: score.asset_id,
        confidence: score.confidence,
        coverage: score.coverage,
        contradicted: score.contradicted,
      });
      for (const tagId of collectScoreTagIds(score)) {
        tagSet.add(tagId);
        const { match, weight, detail } = matchForTag(score, tagId, undefined);
        cells[cellKey(score.fault_id, tagId)] = {
          faultId: score.fault_id,
          tagId,
          match,
          weight,
          ...(detail ? { detail } : {}),
        };
      }
    }
  }

  // Prefer columns with directional evidence; missing-only tags stay out of the hero grid.
  let tagIds = [...tagSet].sort();
  if (scores.length) {
    const active = new Set<string>();
    for (const score of scores) {
      for (const label of [
        ...(score.supporting_symptoms ?? []),
        ...(score.contradicting_symptoms ?? []),
      ]) {
        active.add(extractTagIdFromSymptom(label));
      }
    }
    // Keep missing symptoms only for the top-ranked fault so coverage gaps stay visible.
    const top = [...scores].sort((a, b) => b.confidence - a.confidence)[0];
    if (top && top.confidence >= 0.5) {
      for (const label of top.missing_symptoms ?? []) {
        active.add(extractTagIdFromSymptom(label));
      }
    }
    if (active.size > 0) {
      tagIds = [...active].sort();
    }
  }

  if (matrix?.faults?.length) {
    for (const row of rows) {
      const fault = matrix.faults.find((f) => f.id === row.faultId);
      const score = byId.get(row.faultId);
      for (const tagId of tagIds) {
        const key = cellKey(row.faultId, tagId);
        if (cells[key]) continue;
        const authoredWeight = fault?.symptoms.find((s) => s.tag_id === tagId)?.weight;
        if (authoredWeight == null && !score) {
          cells[key] = { faultId: row.faultId, tagId, match: "none", weight: 0 };
          continue;
        }
        const { match, weight, detail } = matchForTag(score, tagId, authoredWeight);
        cells[key] = {
          faultId: row.faultId,
          tagId,
          match,
          weight,
          ...(detail ? { detail } : {}),
        };
      }
    }
  }

  if (scores.length) {
    rows.sort((a, b) => b.confidence - a.confidence || a.faultName.localeCompare(b.faultName));
  }

  return { rows, tagIds, cells };
}

export function getMatrixCell(
  model: MatrixViewModel,
  faultId: string,
  tagId: string,
): MatrixCell {
  return (
    model.cells[cellKey(faultId, tagId)] ?? {
      faultId,
      tagId,
      match: "none",
      weight: 0,
    }
  );
}

export function shortTagLabel(tagId: string): string {
  if (tagId.length <= 14) return tagId;
  const parts = tagId.split("_");
  if (parts.length <= 2) return tagId.slice(0, 12) + "…";
  return `${parts[0]}_…_${parts[parts.length - 1]}`;
}

export { cellKey };
