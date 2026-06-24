/**
 * HMI Compiler types — generated screen preview (Screen 06).
 * All output is draft preview only; no runtime deployment.
 */

export type GeneratedScreenKind =
  | "overview"
  | "line"
  | "asset"
  | "evidence"
  | "dag"
  | "mobile";

export type HmiRoleTarget = "operator" | "maintenance" | "supervisor" | "engineer";
export type HmiDeviceTarget = "desktop" | "tablet" | "mobile";
export type HmiVariant = "normal" | "warning" | "degraded" | "offline";
export type HmiValidationStatus = "valid" | "warning" | "error" | "unknown";

export interface GeneratedScreenSpec {
  id: string;
  label: string;
  kind: GeneratedScreenKind;
  roleTargets: HmiRoleTarget[];
  deviceTargets: HmiDeviceTarget[];
  widgetCount: number;
  bindingCount: number;
  status: "generated" | "warning" | "error" | "draft";
}

export interface GeneratedWidgetBinding {
  id: string;
  widget: string;
  boundTo: string;
  sourceFile: string;
  reason: string;
  status: "bound" | "warning" | "missing";
}

export interface SourceModelFile {
  id: string;
  filename: string;
  purpose: string;
  status: "valid" | "warning" | "missing";
}

export interface CompilerValidationItem {
  id: string;
  severity: "info" | "warning" | "error";
  message: string;
  sourceFile?: string;
  widgetId?: string;
}

export interface HmiCompilerSummary {
  screensGenerated: number;
  widgetsGenerated: number;
  bindingsCreated: number;
  roleVariants: number;
  deviceVariants: number;
}