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
    fill: "#FDF6E8",
    text: "var(--status-warning)",
    label: "WARNING",
    icon: "⚠",
    halo: true,
    haloDuration: "2.2s",
  },
  critical: {
    border: "var(--status-critical)",
    fill: "#FCECEB",
    text: "var(--status-critical)",
    label: "CRITICAL",
    icon: "✕",
    halo: true,
    haloDuration: "1.4s",
  },
  sensor_bad: {
    border: "var(--status-sensor-bad)",
    fill: "#F0EDFC",
    text: "var(--status-sensor-bad)",
    label: "SENSOR BAD",
    icon: "◎",
  },
  offline: {
    border: "var(--status-offline)",
    fill: "#EFEFEF",
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