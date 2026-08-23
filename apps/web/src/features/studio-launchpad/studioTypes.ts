export type StudioSurface =
  | "overview"
  | "asset"
  | "tag"
  | "alarm_rule"
  | "causal_edge"
  | "action"
  | "fault_matrix"
  | "role_view"
  | "compile_preview";

export interface StudioRouteState {
  surface: StudioSurface;
  targetId: string | null;
  mode: "inspect" | "edit_intent";
}