export type StudioDraftFamily =
  | "plant"
  | "tag_map"
  | "alarm_rules"
  | "causal_graph"
  | "action_envelope";

export type StudioDraftStatus = "clean" | "dirty" | "invalid";

export interface StudioDraftIssue {
  id: string;
  family: StudioDraftFamily;
  targetId: string | null;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  fixHint?: string;
}

export interface StudioDraftBundle {
  plant: unknown;
  tag_map: unknown;
  alarm_rules: unknown;
  causal_graph: unknown;
  action_envelope: unknown;
}

export interface StudioDraftState {
  bundle: StudioDraftBundle;
  status: StudioDraftStatus;
  selectedFamily: StudioDraftFamily | null;
  selectedTargetId: string | null;
  issues: StudioDraftIssue[];
  dirtyFamilies: Record<StudioDraftFamily, boolean>;
  lastValidatedAt: string | null;
}

export interface StudioDraftPatch {
  family: StudioDraftFamily;
  targetId: string | null;
  reason: string;
  apply: (bundle: StudioDraftBundle) => StudioDraftBundle;
}