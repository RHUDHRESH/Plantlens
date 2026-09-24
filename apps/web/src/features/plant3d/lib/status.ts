/**
 * Asset status → 3D presentation (pure). ISA-101: normal equipment gets no colour at all; abnormal
 * equipment gets a steady status-coloured outline + a badge with text (never colour alone, never
 * blinking).
 */
import type { StatusKind } from "../../../components/ui/primitives";
import type { AssetStatus } from "../../maps2d/mapTypes";

export type OutlineToken = "critical" | "warning" | "sensor_bad" | "offline";

export interface StatusPresentation {
  abnormal: boolean;
  /** key into SceneTheme.status; null = no outline */
  outline: OutlineToken | null;
  badge: StatusKind | null;
  label: string;
  /** Sort order for lists/legends: lower = more severe */
  rank: number;
}

const PRESENTATION: Record<AssetStatus, StatusPresentation> = {
  critical: { abnormal: true, outline: "critical", badge: "critical", label: "Critical", rank: 0 },
  warning: { abnormal: true, outline: "warning", badge: "medium", label: "Warning", rank: 1 },
  sensor_bad: { abnormal: true, outline: "sensor_bad", badge: "sensor_bad", label: "Sensor bad", rank: 2 },
  offline: { abnormal: true, outline: "offline", badge: "offline", label: "Offline", rank: 3 },
  normal: { abnormal: false, outline: null, badge: null, label: "Normal", rank: 4 },
  unknown: { abnormal: false, outline: null, badge: null, label: "No data", rank: 5 },
};

export function normaliseStatus(value: unknown): AssetStatus {
  return typeof value === "string" && value in PRESENTATION ? (value as AssetStatus) : "unknown";
}

export function statusPresentation(status: AssetStatus | string | null | undefined): StatusPresentation {
  return PRESENTATION[normaliseStatus(status)];
}

/** Status for the side panel badge: normal shows the neutral "Normal" badge. */
export function panelBadge(status: AssetStatus | string | null | undefined): { kind: StatusKind; label: string } {
  const p = statusPresentation(status);
  if (p.badge) return { kind: p.badge, label: p.label };
  return { kind: "normal", label: p.label };
}
