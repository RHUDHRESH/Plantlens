/**
 * Connection rule set — the customisable policy that decides whether two ports may be connected.
 * Mirrors the pydantic `ConnectionRuleSet` in apps/api/app/routers/studio.py (the server re-validates).
 */

export const MEDIA = [
  "dc_power",
  "ac_power",
  "mechanical_rotation",
  "airflow",
  "fluid_flow",
  "pneumatic_air",
  "thermal",
  "digital_signal",
  "analog_signal",
  "serial_comm",
  "ethernet",
  "mounting",
] as const;
export type Medium = (typeof MEDIA)[number];

export const DIRECTIONS = ["input", "output", "bidirectional"] as const;
export type PortDirection = (typeof DIRECTIONS)[number];

export type Verdict = "allow" | "warn" | "deny";
export type Enforcement = "warn" | "deny";
export type Severity = "deny" | "warn" | "info";

export interface FanLimit {
  fan_out?: number | null | undefined;
  fan_in?: number | null | undefined;
}

export interface BuiltinRules {
  medium_compatibility: { enabled: boolean; check_quantity: boolean; matrix: Partial<Record<Medium, Partial<Record<Medium, Verdict>>>> };
  direction: { enabled: boolean; severity: Enforcement };
  max_connections: { enabled: boolean; severity: Enforcement; default: FanLimit; limits: Partial<Record<Medium, FanLimit>> };
  nominal_range: { enabled: boolean; severity: Enforcement; safety_media: Medium[] };
  self_connection: { enabled: boolean; allow_same_node: boolean };
  duplicate_edge: { enabled: boolean };
  cycle_policy: { enabled: boolean; default: Verdict; per_medium: Partial<Record<Medium, Verdict>> };
  required_ports: { enabled: boolean; severity: Enforcement };
  tag_compatibility: { enabled: boolean; severity: Enforcement };
}

export type BuiltinRuleKey = keyof BuiltinRules;

export interface SideCondition {
  categories: string[];
  component_type_ids: string[];
  directions: PortDirection[];
  tags_any: string[];
  port_ids: string[];
}

export interface CustomRule {
  id: string;
  name: string;
  enabled: boolean;
  /** Higher runs first. An `allow` stops evaluation of lower-priority custom rules. */
  priority: number;
  source: SideCondition;
  target: SideCondition;
  media: Medium[];
  action: Verdict;
  message: string;
  fix: string;
}

export interface ConnectionRuleSet {
  schema_version: 1;
  builtins: BuiltinRules;
  custom: CustomRule[];
}

// ---- Inputs the engine reads (structural; the Studio's library/assembly types satisfy them) ----

export interface RulePort {
  port_id: string;
  name: string;
  direction: PortDirection;
  medium: string;
  quantity_kind: string;
  required: boolean;
  nominal_range?: { min?: number | null | undefined; max?: number | null | undefined } | undefined;
  compatibility_tags?: string[] | undefined;
}

export interface RuleComponent {
  component_type_id: string;
  display_name: string;
  category: string;
  tags: string[];
  ports: RulePort[];
}

export interface RuleAsset {
  asset_id: string;
  component_type_id: string;
  display_name: string;
}

export interface RuleConnection {
  connection_id: string;
  from_asset_id: string;
  from_port_id: string;
  to_asset_id: string;
  to_port_id: string;
}

export interface RuleAssembly {
  assets: readonly RuleAsset[];
  connections: readonly RuleConnection[];
  metadata?: Record<string, unknown> | undefined;
}

// ---- Outputs -------------------------------------------------------------------------------------

export interface Reason {
  ruleId: string;
  severity: Severity;
  message: string;
  fix: string;
  /** True when a custom `allow` rule suppressed this reason; kept for transparency. */
  overridden?: boolean;
}

export interface Proposal {
  fromAssetId: string;
  fromPortId: string;
  toAssetId: string;
  toPortId: string;
}

export interface Evaluation {
  verdict: Verdict;
  reasons: Reason[];
  /** The proposal as it will be stored (output → input), after orientation. */
  proposal: Proposal;
  swapped: boolean;
  medium: string | null;
  overriddenBy: string | null;
}

export type IssueTarget =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "port"; id: string; portId: string };

export interface Issue {
  key: string;
  severity: Enforcement;
  ruleId: string;
  message: string;
  fix: string;
  target: IssueTarget;
  source: "rules" | "server";
}
