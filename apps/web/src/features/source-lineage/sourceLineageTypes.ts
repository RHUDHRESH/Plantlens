export type SourceContractFamily =
  | "plant"
  | "tag_map"
  | "alarm_rules"
  | "causal_graph"
  | "action_envelope"
  | "hmi_view_model"
  | "runtime";

export type SourceEditTargetKind =
  | "asset"
  | "tag"
  | "alarm_rule"
  | "causal_edge"
  | "action"
  | "role_view"
  | "compiled_hmi_node";

export interface SourceLineageRef {
  family: SourceContractFamily;
  kind: SourceEditTargetKind;
  id: string;
  label: string;
  path: string;
  authored: boolean;
  editable: boolean;
  reason: string;
}

export interface AssetSourceLineage {
  assetId: string;
  assetLabel: string;
  assetType: string;
  refs: SourceLineageRef[];
  tagIds: string[];
  alarmIds: string[];
  causalEdgeIds: string[];
  actionIds: string[];
  warnings: string[];
}

export interface StudioOpenIntent {
  targetKind: SourceEditTargetKind;
  targetId: string;
  family: SourceContractFamily;
  mode: "inspect" | "edit_intent";
}