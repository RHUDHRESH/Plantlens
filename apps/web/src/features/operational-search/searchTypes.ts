export type OperationalSearchKind =
  | "asset"
  | "tag"
  | "alarm"
  | "causal_step"
  | "command";

export type OperationalCommandId =
  | "fit_plant"
  | "focus_root"
  | "open_raw_alarms"
  | "switch_2d"
  | "switch_3d"
  | "role_operator"
  | "role_engineer"
  | "role_maintenance"
  | "role_manager"
  | "toggle_legend"
  | "toggle_compact_density";

export interface OperationalSearchDocument {
  id: string;
  kind: OperationalSearchKind;
  title: string;
  subtitle: string;
  assetId?: string;
  tagId?: string;
  alarmId?: string;
  commandId?: OperationalCommandId;
  status?: string;
  severity?: string;
  tokens: string[];
  aliases: string[];
  boost: number;
}

export interface OperationalSearchResult {
  document: OperationalSearchDocument;
  score: number;
  matchedTokens: string[];
  reason: string;
}

export interface OperationalSearchIndex {
  documents: OperationalSearchDocument[];
  builtAt: string;
}

export interface OperationalSearchActionContext {
  selectAsset: (assetId: string) => void;
  focusAsset: (assetId: string) => void;
  fitPlant: () => void;
  focusRoot: () => void;
  openRawAlarms: () => void;
  setMapMode: (mode: "2d" | "3d") => void;
  setRole: (role: "operator" | "engineer" | "maintenance" | "manager") => void;
  toggleLegend: () => void;
  toggleCompactDensity: () => void;
}