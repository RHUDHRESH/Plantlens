import type { StatusKind } from "../../components/ui/primitives";
import type {
  HMIAssetStatus,
  HMIOverallStatus,
  HMISeverity,
  HMISignalStatus,
  SafetyLevel,
} from "../../app/schemas/plantHmi";

export function overallStatusLabel(status: HMIOverallStatus): string {
  const labels: Record<HMIOverallStatus, string> = {
    healthy: "Healthy",
    warning: "Warning",
    fault: "Fault",
    offline: "Offline",
    blocked: "Blocked",
  };
  return labels[status];
}

/** Map backend HMI status vocabularies onto the shared StatusBadge kinds (colour + shape + text). */
export function overallStatusKind(status: HMIOverallStatus): StatusKind {
  const kinds: Record<HMIOverallStatus, StatusKind> = {
    healthy: "normal",
    warning: "medium",
    fault: "critical",
    offline: "offline",
    blocked: "sensor_bad",
  };
  return kinds[status];
}

export function assetStatusKind(status: HMIAssetStatus): StatusKind {
  const kinds: Record<HMIAssetStatus, StatusKind> = {
    healthy: "normal",
    warning: "medium",
    fault: "critical",
    offline: "offline",
  };
  return kinds[status];
}

export function signalStatusKind(status: HMISignalStatus): StatusKind {
  const kinds: Record<HMISignalStatus, StatusKind> = {
    normal: "normal",
    warning: "medium",
    fault: "critical",
    stale: "sensor_bad",
    missing: "offline",
  };
  return kinds[status];
}

export function severityKind(severity: HMISeverity | string): StatusKind {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "medium";
  return "low";
}

export function safetyKind(level: SafetyLevel | string): StatusKind {
  if (level === "stop_required") return "critical";
  if (level === "isolate_before_touch") return "high";
  if (level === "caution") return "medium";
  return "normal";
}

export function statusLabel(status: string): string {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatSafetyLevel(level: string): string {
  return level.replace(/_/g, " ");
}
