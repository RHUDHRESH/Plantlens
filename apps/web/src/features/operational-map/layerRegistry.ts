import type { LayerDefinition, MapLayerId, UserRole } from "./mapKernelTypes";
import { ALL_MAP_LAYERS } from "./mapKernelTypes";

const ALL_ROLES_TRUE: Record<UserRole, boolean> = {
  operator: true,
  engineer: true,
  maintenance: true,
  manager: true,
};

export class UnknownMapLayerError extends Error {
  constructor(layerId: string) {
    super(`Unknown map layer: ${layerId}`);
    this.name = "UnknownMapLayerError";
  }
}

export const MAP_LAYER_REGISTRY: Record<MapLayerId, LayerDefinition> = {
  status: {
    id: "status",
    label: "Status",
    description: "Live asset health/status rendering.",
    safetyCritical: true,
    lockedWhenActiveSituation: true,
    minZoomBand: "plant",
    defaultVisibleByRole: ALL_ROLES_TRUE,
  },
  causal_path: {
    id: "causal_path",
    label: "Causal path",
    description: "Root-to-effect path for the active Situation.",
    safetyCritical: true,
    lockedWhenActiveSituation: true,
    minZoomBand: "plant",
    defaultVisibleByRole: ALL_ROLES_TRUE,
  },
  raw_alarms: {
    id: "raw_alarms",
    label: "Raw alarms",
    description: "Grouped alarm disclosure and alarm-count context.",
    safetyCritical: false,
    lockedWhenActiveSituation: false,
    minZoomBand: "area",
    defaultVisibleByRole: {
      operator: true,
      engineer: true,
      maintenance: true,
      manager: false,
    },
  },
  tags: {
    id: "tags",
    label: "Tags",
    description: "Tag IDs, current values, and signal names.",
    safetyCritical: false,
    lockedWhenActiveSituation: false,
    minZoomBand: "asset",
    defaultVisibleByRole: {
      operator: false,
      engineer: true,
      maintenance: true,
      manager: false,
    },
  },
  actions: {
    id: "actions",
    label: "Actions",
    description: "Recommended checks and blocked actions from the action envelope.",
    safetyCritical: false,
    lockedWhenActiveSituation: false,
    minZoomBand: "area",
    defaultVisibleByRole: {
      operator: true,
      engineer: true,
      maintenance: true,
      manager: false,
    },
  },
  maintenance: {
    id: "maintenance",
    label: "Maintenance",
    description: "Sensor health, maintenance notes, and component-service context.",
    safetyCritical: false,
    lockedWhenActiveSituation: false,
    minZoomBand: "asset",
    defaultVisibleByRole: {
      operator: false,
      engineer: true,
      maintenance: true,
      manager: false,
    },
  },
  audit: {
    id: "audit",
    label: "Audit",
    description: "Receipts, approvals, and trace context.",
    safetyCritical: false,
    lockedWhenActiveSituation: false,
    minZoomBand: "component",
    defaultVisibleByRole: {
      operator: false,
      engineer: true,
      maintenance: false,
      manager: true,
    },
  },
  geometry: {
    id: "geometry",
    label: "Geometry",
    description: "Plant layout, assets, connectors, zones, and structural map context.",
    safetyCritical: true,
    lockedWhenActiveSituation: true,
    minZoomBand: "plant",
    defaultVisibleByRole: ALL_ROLES_TRUE,
  },
};

export function getLayerDefinition(layerId: MapLayerId): LayerDefinition {
  const def = MAP_LAYER_REGISTRY[layerId];
  if (!def) throw new UnknownMapLayerError(layerId);
  return def;
}

export function getDefaultVisibleLayersForRole(role: UserRole): Record<MapLayerId, boolean> {
  const layers = {} as Record<MapLayerId, boolean>;
  for (const id of ALL_MAP_LAYERS) {
    layers[id] = MAP_LAYER_REGISTRY[id].defaultVisibleByRole[role];
  }
  return layers;
}

export function isSafetyCriticalLayer(layerId: MapLayerId): boolean {
  return getLayerDefinition(layerId).safetyCritical;
}

export function getLockedLayers(activeSituationLocked: boolean): MapLayerId[] {
  const locked: MapLayerId[] = [];
  for (const id of ALL_MAP_LAYERS) {
    const def = MAP_LAYER_REGISTRY[id];
    if (def.safetyCritical) locked.push(id);
    if (activeSituationLocked && def.lockedWhenActiveSituation) locked.push(id);
  }
  return [...new Set(locked)];
}