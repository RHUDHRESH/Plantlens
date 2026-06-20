/** Mirrors apps/api/app/hmi/contracts.py — renderer-only types. */

export type HMIOverallStatus = "healthy" | "warning" | "fault" | "offline" | "blocked";
export type HMIAssetStatus = "healthy" | "warning" | "fault" | "offline";
export type HMISignalStatus = "normal" | "warning" | "fault" | "stale" | "missing";
export type HMISeverity = "info" | "warning" | "critical";
export type SafetyLevel = "observe" | "caution" | "isolate_before_touch" | "stop_required";

export interface ExpectedRange {
  min?: number | null;
  max?: number | null;
}

export interface EvidenceItem {
  evidence_id: string;
  signal_id: string;
  asset_id: string;
  description: string;
  observed_value: number | boolean | string | null;
  unit: string | null;
  status: HMISignalStatus;
  weight: number;
  timestamp: string | null;
}

export interface SignalHMIState {
  signal_id: string;
  asset_id: string;
  name: string;
  value: number | boolean | string | null;
  unit: string;
  status: HMISignalStatus;
  expected_range: ExpectedRange | null;
  evidence_weight: number;
  timestamp: string | null;
}

export interface AssetHMIState {
  asset_id: string;
  name: string;
  kind: string;
  status: HMIAssetStatus;
  health_score: number;
  primary_signals: string[];
  active_faults: string[];
  downstream_impacts: string[];
}

export interface RootCauseCandidate {
  cause_id: string;
  title: string;
  asset_id: string;
  confidence: number;
  evidence: EvidenceItem[];
  rejected_alternatives: string[];
}

export interface IncidentHMIState {
  incident_id: string;
  severity: HMISeverity;
  title: string;
  summary: string;
  suspected_root_cause: string;
  confidence: number;
  started_at: string;
  affected_assets: string[];
  primary_alarms: string[];
  secondary_symptoms: string[];
  evidence: EvidenceItem[];
}

export interface OperatorAction {
  priority: number;
  title: string;
  instruction: string;
  safety_level: SafetyLevel;
  target_asset_id: string | null;
  rationale: string;
}

export interface AlarmGroup {
  group_id: string;
  title: string;
  severity: HMISeverity;
  root_alarm: string | null;
  grouped_alarms: string[];
  suppressed_duplicates: string[];
}

export interface DataQualityState {
  missing_signals: string[];
  stale_signals: string[];
  confidence_penalty: number;
  notes: string[];
}

export interface CausalityEdgeHMI {
  edge_id: string;
  from_asset_id: string;
  to_asset_id: string;
  relation: string;
  active: boolean;
}

export interface PlantHMIState {
  plant_id: string;
  run_id: string;
  generated_at: string;
  overall_status: HMIOverallStatus;
  active_incident: IncidentHMIState | null;
  assets: AssetHMIState[];
  signals: SignalHMIState[];
  causality_edges: CausalityEdgeHMI[];
  root_cause_candidates: RootCauseCandidate[];
  operator_actions: OperatorAction[];
  alarm_groups: AlarmGroup[];
  suppressed_symptoms: string[];
  data_quality: DataQualityState;
}

export interface HmiPreviewInput {
  canonical_payload: Record<string, unknown>;
  gate_results?: unknown[] | Record<string, unknown> | null;
  generated_at?: string;
}