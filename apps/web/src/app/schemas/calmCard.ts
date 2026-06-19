/** Mirror of packages/contracts/calm_card.schema.json */

import type { Confidence, RiskLevel, Severity, TimeToConsequenceState } from "./common";

export interface CalmCardFirstSignal {
  alarm_id: string;
  asset_id: string;
  /** RFC3339 UTC */
  timestamp: string;
  message: string;
  tag_id?: string | null;
  value?: number | boolean | null;
  unit?: string | null;
}

export interface CalmCardEvidenceItem {
  order: number;
  alarm_id: string;
  asset_id: string;
  message: string;
  /** RFC3339 UTC */
  timestamp: string;
}

export interface CalmCardRecommendedCheck {
  action_id: string;
  label: string;
  risk_level: RiskLevel;
  requires_isolation?: boolean;
}

export interface CalmCardBlockedAction {
  action_id: string;
  label: string;
  reason: string;
}

export interface CalmCardTimeToConsequence {
  target_tag: string;
  target_label: string;
  state: TimeToConsequenceState;
  seconds_low?: number | null;
  seconds_high?: number | null;
}

export interface CalmCard {
  card_id: string;
  situation_id: string;
  title: string;
  severity: Severity;
  root_asset_id: string;
  /** RFC3339 UTC */
  created_at: string;
  evidence_chain: CalmCardEvidenceItem[];
  recommended_first_check: CalmCardRecommendedCheck;
  raw_alarm_count: number;
  operator_authority: string;
  root_asset_name?: string;
  confidence?: Confidence;
  first_signal?: CalmCardFirstSignal | null;
  why_it_matters?: string;
  blocked_actions?: CalmCardBlockedAction[];
  time_to_consequence?: CalmCardTimeToConsequence | null;
  raw_alarm_ids?: string[];
}