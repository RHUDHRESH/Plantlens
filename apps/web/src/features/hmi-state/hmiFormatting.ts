import type {
  CausalityEdgeHMI,
  HMIAssetStatus,
  HMIOverallStatus,
  PlantHMIState,
  SafetyLevel,
} from "../../app/schemas/plantHmi";
import type { AssetStatus } from "../maps2d/mapTypes";

export function mapHmiAssetStatusToMapStatus(status: HMIAssetStatus | null | undefined): AssetStatus {
  switch (status) {
    case "healthy":
      return "normal";
    case "warning":
      return "warning";
    case "fault":
      return "critical";
    case "offline":
      return "offline";
    default:
      return "unknown";
  }
}

export function formatOverallStatus(status: HMIOverallStatus | null | undefined): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "warning":
      return "Warning";
    case "fault":
      return "Fault";
    case "offline":
      return "Offline";
    case "blocked":
      return "Blocked";
    default:
      return "Unknown";
  }
}

export function formatConfidence(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

export function formatValue(
  value: number | boolean | string | null | undefined,
  unit?: string | null,
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2);
    return unit ? `${rounded} ${unit}` : rounded;
  }
  return unit ? `${value} ${unit}` : value;
}

export function getSafetyLabel(level: SafetyLevel): string {
  switch (level) {
    case "stop_required":
      return "Stop required";
    case "isolate_before_touch":
      return "Isolate before touch";
    case "caution":
      return "Caution";
    case "observe":
      return "Observe";
    default:
      return "Observe";
  }
}

export function getSafetyClassName(level: SafetyLevel): string {
  switch (level) {
    case "stop_required":
      return "operator-action--stop-required";
    case "isolate_before_touch":
      return "operator-action--isolate-before-touch";
    case "caution":
      return "operator-action--caution";
    case "observe":
      return "operator-action--observe";
    default:
      return "operator-action--observe";
  }
}

export function buildHmiAssetStatusMap(state: PlantHMIState | null): Record<string, AssetStatus> {
  const out: Record<string, AssetStatus> = {};
  if (!state) return out;

  for (const asset of state.assets ?? []) {
    out[asset.asset_id] = mapHmiAssetStatusToMapStatus(asset.status);
  }

  return out;
}

export function getActiveCausalityEdges(state: PlantHMIState | null): CausalityEdgeHMI[] {
  return (state?.causality_edges ?? []).filter((edge) => edge.active);
}

export function getActiveCausalityAssetPath(state: PlantHMIState | null): string[] {
  const activeEdges = getActiveCausalityEdges(state);
  if (!activeEdges.length) return [];

  const rootAssetId = getPrimaryRootAssetId(state);
  if (rootAssetId) {
    const path: string[] = [];
    const seen = new Set<string>();
    const outgoing = new Map<string, string[]>();

    for (const edge of activeEdges) {
      const targets = outgoing.get(edge.from_asset_id) ?? [];
      targets.push(edge.to_asset_id);
      outgoing.set(edge.from_asset_id, targets);
    }

    const visit = (assetId: string) => {
      if (seen.has(assetId)) return;
      seen.add(assetId);
      path.push(assetId);
      for (const next of outgoing.get(assetId) ?? []) {
        visit(next);
      }
    };

    visit(rootAssetId);
    for (const edge of activeEdges) {
      visit(edge.from_asset_id);
      visit(edge.to_asset_id);
    }
    return path;
  }

  const path: string[] = [];
  for (const edge of activeEdges) {
    if (!path.includes(edge.from_asset_id)) path.push(edge.from_asset_id);
    if (!path.includes(edge.to_asset_id)) path.push(edge.to_asset_id);
  }
  return path;
}

export function getPrimaryRootAssetId(state: PlantHMIState | null): string | null {
  if (!state) return null;
  const firstCandidate = state.root_cause_candidates?.[0];
  if (firstCandidate?.asset_id) return firstCandidate.asset_id;
  const incidentAsset = state.active_incident?.affected_assets?.[0];
  return incidentAsset ?? null;
}
