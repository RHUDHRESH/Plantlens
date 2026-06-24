/**
 * Shared design-system and shell types.
 */

export type ThemeMode = "dark" | "light";

export type Role = "operator" | "maintenance" | "supervisor" | "engineer";

export type SourceMode = "sim" | "modbus" | "opcua";

export type ConnectionStatus = "online" | "degraded" | "offline";

export type BottomSheetMode = "collapsed" | "peek" | "expanded";

export type MobileTab = "map" | "situations" | "copilot" | "studio" | "more";

export type AppScreen =
  | "map"
  | "evidence"
  | "dag"
  | "assetStudio"
  | "plantLayoutStudio"
  | "hmiPreview";

export type LayoutValidationStatus = "valid" | "warning" | "error" | "unknown";

export type AssetValidationStatus = "valid" | "warning" | "error" | "unknown";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warning";

export type ButtonSize = "sm" | "md" | "lg";

export type BadgeVariant =
  | "default"
  | "normal"
  | "success"
  | "warning"
  | "critical"
  | "danger"
  | "unknown"
  | "readonly"
  | "info";

export type PanelVariant = "dark" | "light" | "elevated";

export type ToastVariant = "default" | "success" | "warning" | "error";

export interface ShellChildProps {
  className?: string;
}