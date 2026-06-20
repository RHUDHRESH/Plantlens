import type { HMIAssetStatus, HMISignalStatus, HMIOverallStatus } from "../../app/schemas/plantHmi";

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

export function assetStatusClass(status: HMIAssetStatus): string {
  return `hmi-status hmi-status--asset-${status}`;
}

export function signalStatusClass(status: HMISignalStatus): string {
  return `hmi-status hmi-status--signal-${status}`;
}

export function overallStatusClass(status: HMIOverallStatus): string {
  return `hmi-status hmi-status--overall-${status}`;
}

export function formatSafetyLevel(level: string): string {
  return level.replace(/_/g, " ");
}