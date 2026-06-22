export type StudioSurface =
  | "overview"
  | "asset"
  | "tag"
  | "alarm_rule"
  | "causal_edge"
  | "action"
  | "role_view"
  | "compile_preview";

export interface StudioRouteState {
  surface: StudioSurface;
  targetId: string | null;
  mode: "inspect" | "edit_intent";
}