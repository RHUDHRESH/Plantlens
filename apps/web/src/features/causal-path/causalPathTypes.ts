export type CausalPathStepKind = "root" | "cause" | "effect" | "downstream" | "unknown";

export interface CausalPathAlarmEvidence {
  alarmId: string;
  severity: string;
  message: string;
  assetId: string | null;
}

export interface CausalPathTagEvidence {
  tagId: string;
  valueLabel: string;
  quality: string;
  unit?: string;
  assetId: string | null;
}

export interface CausalPathStepViewModel {
  assetId: string;
  label: string;
  assetType: string;
  index: number;
  kind: CausalPathStepKind;
  status: string;
  alarmCount: number;
  criticalAlarmCount: number;
  badQualityCount: number;
  primaryTagLabel: string | null;
  alarms: CausalPathAlarmEvidence[];
  tags: CausalPathTagEvidence[];
  isRoot: boolean;
  isAffected: boolean;
  isSelected: boolean;
  isFocused: boolean;
}

export interface CausalPathViewModel {
  hasActivePath: boolean;
  situationTitle: string | null;
  rootAssetId: string | null;
  firstSignalLabel: string | null;
  recommendedActionLabel: string | null;
  pathAssetIds: string[];
  steps: CausalPathStepViewModel[];
  selectedStep: CausalPathStepViewModel | null;
}