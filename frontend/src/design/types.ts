/**
 * Shared design-system and shell types.
 */

export type ThemeMode = "dark" | "light";

export type Role = "operator" | "maintenance" | "supervisor" | "engineer";

export type SourceMode = "sim" | "modbus" | "opcua";

export type ConnectionStatus = "online" | "degraded" | "offline";

export type BottomSheetMode = "collapsed" | "peek" | "expanded";

export type MobileTab = "map" | "situations" | "copilot" | "role" | "more";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type ButtonSize = "sm" | "md" | "lg";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

export type PanelVariant = "dark" | "light" | "elevated";

export type ToastVariant = "default" | "success" | "warning" | "error";

export interface ShellChildProps {
  className?: string;
}