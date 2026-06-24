/**
 * Asset Studio types — parameterized block editor (Screen 04).
 * Model drafts only; no runtime plant control.
 */

export type AssetCategory = "motors" | "air" | "power" | "sensors" | "valves";

export type ParameterVisibility = "engineer" | "readonly" | "hidden";

export type SignalBindingStatus = "bound" | "missing" | "optional" | "derived";

export type ValidationLevel = "valid" | "warning" | "error";

export type AssetValidationStatus = "valid" | "warning" | "error" | "unknown";

export type FaultSeverity = "warning" | "critical" | "info";

export interface AssetParameter {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  visibility: ParameterVisibility;
  min?: number;
  max?: number;
  description?: string;
}

export interface AssetSignal {
  key: string;
  label: string;
  unit?: string;
  status: SignalBindingStatus;
  source?: string;
}

export interface DerivedRule {
  id: string;
  expression: string;
  description: string;
  resultKey: string;
}

export interface FaultMode {
  id: string;
  label: string;
  severity: FaultSeverity;
  expectedSymptoms: string[];
  contradictions?: string[];
}

export interface AssetTemplate {
  typeId: string;
  label: string;
  category: AssetCategory;
  assetClass: string;
  geometryRef: string;
  description?: string;
  parameters: AssetParameter[];
  signals: AssetSignal[];
  derivedRules: DerivedRule[];
  faultModes: FaultMode[];
}

export interface ValidationItem {
  id: string;
  label: string;
  level: ValidationLevel;
  detail?: string;
}

export interface DerivedThreshold {
  key: string;
  label: string;
  value: string;
}

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  motors: "Motors",
  air: "Air",
  power: "Power",
  sensors: "Sensors",
  valves: "Valves",
};