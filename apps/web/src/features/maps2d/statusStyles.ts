import type { AssetStatus } from "./mapTypes";

export interface StatusVisual {
  border: string;
  fill: string;
  text: string;
  label: string;
  icon: string;
  pulse?: boolean;
}

/** ISA-101: healthy assets are neutral greyscale; color only when abnormal. */
export const STATUS_VISUALS: Record<AssetStatus, StatusVisual> = {
  normal: {
    border: "var(--line-strong)",
    fill: "var(--surface)",
    text: "var(--ink-700)",
    label: "",
    icon: "●",
  },
  warning: {
    border: "var(--warning)",
    fill: "var(--warning-tint)",
    text: "var(--warning)",
    label: "WARN",
    icon: "⚠",
    pulse: true,
  },
  critical: {
    border: "var(--critical)",
    fill: "var(--critical-tint)",
    text: "var(--critical)",
    label: "CRIT",
    icon: "✕",
    pulse: true,
  },
  sensor_bad: {
    border: "var(--advisory)",
    fill: "var(--advisory-tint)",
    text: "var(--advisory)",
    label: "SENSOR",
    icon: "◎",
    pulse: true,
  },
  offline: {
    border: "var(--ink-300)",
    fill: "var(--surface-sunken)",
    text: "var(--ink-300)",
    label: "OFFLINE",
    icon: "○",
  },
  unknown: {
    border: "var(--line)",
    fill: "var(--surface)",
    text: "var(--ink-500)",
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