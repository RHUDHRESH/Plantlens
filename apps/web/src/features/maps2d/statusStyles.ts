import type { AssetStatus } from "./mapTypes";

export interface StatusVisual {
  border: string;
  fill: string;
  text: string;
  label: string;
  icon: string;
  halo?: boolean;
  haloDuration?: string;
}

export const STATUS_VISUALS: Record<AssetStatus, StatusVisual> = {
  normal: {
    border: "var(--border)",
    fill: "var(--surface)",
    text: "var(--text-muted)",
    label: "",
    icon: "●",
  },
  warning: {
    border: "var(--status-warning)",
    fill: "var(--status-warning-fill, rgba(201, 137, 16, 0.12))",
    text: "var(--status-warning)",
    label: "WARNING",
    icon: "⚠",
    halo: true,
    haloDuration: "2.2s",
  },
  critical: {
    border: "var(--status-critical)",
    fill: "var(--status-critical-fill, rgba(179, 38, 30, 0.14))",
    text: "var(--status-critical)",
    label: "CRITICAL",
    icon: "✕",
    halo: true,
  },
  sensor_bad: {
    border: "var(--status-sensor-bad)",
    fill: "var(--status-sensor-fill, rgba(107, 93, 211, 0.14))",
    text: "var(--status-sensor-bad)",
    label: "SENSOR BAD",
    icon: "◎",
  },
  offline: {
    border: "var(--status-offline)",
    fill: "var(--surface-muted)",
    text: "var(--status-offline)",
    label: "OFFLINE",
    icon: "○",
  },
  unknown: {
    border: "var(--border)",
    fill: "var(--surface-muted)",
    text: "var(--text-muted)",
    label: "UNKNOWN",
    icon: "?",
  },
};

export function statusForAsset(
  assetId: string,
  assetStatus: Record<string, AssetStatus>,
): AssetStatus {
  return assetStatus[assetId] ?? "unknown";
}