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
    border: "rgba(28, 200, 255, 0.35)",
    fill: "rgba(14, 26, 42, 0.9)",
    text: "var(--status-normal)",
    label: "",
    icon: "●",
  },
  warning: {
    border: "var(--status-warning)",
    fill: "rgba(245, 158, 11, 0.1)",
    text: "var(--status-warning)",
    label: "WARN",
    icon: "⚠",
    halo: true,
    haloDuration: "2.2s",
  },
  critical: {
    border: "var(--status-critical)",
    fill: "rgba(239, 68, 68, 0.12)",
    text: "var(--status-critical)",
    label: "CRIT",
    icon: "✕",
    halo: true,
  },
  sensor_bad: {
    border: "var(--status-sensor-bad)",
    fill: "rgba(167, 139, 250, 0.1)",
    text: "var(--status-sensor-bad)",
    label: "SENSOR",
    icon: "◎",
  },
  offline: {
    border: "var(--status-offline)",
    fill: "rgba(8, 17, 31, 0.95)",
    text: "var(--status-offline)",
    label: "OFFLINE",
    icon: "○",
  },
  unknown: {
    border: "rgba(28, 200, 255, 0.15)",
    fill: "rgba(8, 17, 31, 0.8)",
    text: "var(--text-muted)",
    label: "",
    icon: "?",
  },
};

export function statusForAsset(
  assetId: string,
  assetStatus: Record<string, AssetStatus>,
): AssetStatus {
  return assetStatus[assetId] ?? "unknown";
}