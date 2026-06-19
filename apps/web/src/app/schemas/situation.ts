/** Mirror of packages/contracts/situation.schema.json */

import type { Confidence, EvidenceRole, Severity } from "./common";

export interface SituationEvidence {
  alarm_id: string;
  asset_id: string;
  /** RFC3339 UTC */
  timestamp: string;
  reason: string;
  role?: EvidenceRole;
}

export interface Situation {
  situation_id: string;
  situation_type: string;
  title: string;
  severity: Severity;
  root_asset_id: string;
  /** RFC3339 UTC */
  created_at: string;
  grouped_alarm_ids: string[];
  evidence: SituationEvidence[];
  root_asset_name?: string;
  confidence?: Confidence;
  affected_asset_ids?: string[];
  causal_path?: string[];
  traversed_edges?: string[];
}