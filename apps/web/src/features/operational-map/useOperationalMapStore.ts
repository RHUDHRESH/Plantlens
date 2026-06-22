import { create } from "zustand";
import type { MapCommand, MapLayerId, MapMode, MapZoomBand, UserRole } from "./mapKernelTypes";
import {
  getDefaultVisibleLayersForRole,
  getLayerDefinition,
  isSafetyCriticalLayer,
} from "./layerRegistry";
import { getRoleLens } from "./roleLenses";

export interface OperationalMapStore {
  mode: MapMode;
  role: UserRole;
  zoomBand: MapZoomBand;
  visibleLayers: Record<MapLayerId, boolean>;
  selectedAssetId: string | null;
  focusedAssetId: string | null;
  lastCommand: MapCommand | null;
  activeSituationLocked: boolean;
  dispatchMapCommand: (command: MapCommand) => void;
  setRole: (role: UserRole) => void;
  setMode: (mode: MapMode) => void;
  setZoomBand: (band: MapZoomBand) => void;
  setActiveSituationLocked: (locked: boolean) => void;
  selectAsset: (assetId: string) => void;
  focusAsset: (assetId: string) => void;
  clearSelection: () => void;
  toggleLayer: (layerId: MapLayerId) => void;
  resetForRole: (role: UserRole) => void;
}

function enforceSafetyLayers(
  layers: Record<MapLayerId, boolean>,
  activeSituationLocked: boolean,
): Record<MapLayerId, boolean> {
  const next = { ...layers };
  next.status = true;
  next.geometry = true;
  if (activeSituationLocked) {
    next.causal_path = true;
  }
  return next;
}

function applyRoleLayerDefaults(role: UserRole): Record<MapLayerId, boolean> {
  const lens = getRoleLens(role);
  const defaults = getDefaultVisibleLayersForRole(role);
  const merged = { ...defaults };
  for (const [layerId, visible] of Object.entries(lens.visibleLayerDefaults)) {
    if (visible !== undefined) {
      merged[layerId as MapLayerId] = visible;
    }
  }
  return merged;
}

export const useOperationalMapStore = create<OperationalMapStore>((set, get) => ({
  mode: "2d",
  role: "operator",
  zoomBand: "plant",
  visibleLayers: getDefaultVisibleLayersForRole("operator"),
  selectedAssetId: null,
  focusedAssetId: null,
  lastCommand: null,
  activeSituationLocked: false,

  dispatchMapCommand: (command) => {
    set({ lastCommand: command });
    const store = get();
    switch (command.type) {
      case "fit_plant":
        store.setZoomBand("plant");
        break;
      case "focus_root":
        break;
      case "focus_asset":
        store.focusAsset(command.assetId);
        break;
      case "select_asset":
        store.selectAsset(command.assetId);
        break;
      case "clear_selection":
        store.clearSelection();
        break;
      case "set_zoom_band":
        store.setZoomBand(command.band);
        break;
      case "toggle_layer":
        store.toggleLayer(command.layerId);
        break;
      case "set_role":
        store.setRole(command.role);
        break;
      case "set_mode":
        store.setMode(command.mode);
        break;
      case "show_causal_path": {
        const { activeSituationLocked, visibleLayers } = get();
        if (activeSituationLocked && !command.visible) return;
        if (isSafetyCriticalLayer("causal_path") && !command.visible) return;
        set({
          visibleLayers: enforceSafetyLayers(
            { ...visibleLayers, causal_path: command.visible },
            activeSituationLocked,
          ),
        });
        break;
      }
    }
  },

  setRole: (role) => {
    const { selectedAssetId, focusedAssetId, mode, activeSituationLocked } = get();
    const visibleLayers = enforceSafetyLayers(applyRoleLayerDefaults(role), activeSituationLocked);
    set({
      role,
      visibleLayers,
      selectedAssetId,
      focusedAssetId,
      mode,
    });
  },

  setMode: (mode) => set({ mode }),

  setZoomBand: (band) => set({ zoomBand: band }),

  setActiveSituationLocked: (locked) => {
    const { visibleLayers, activeSituationLocked } = get();
    if (activeSituationLocked === locked) return;
    set({
      activeSituationLocked: locked,
      visibleLayers: enforceSafetyLayers(visibleLayers, locked),
    });
  },

  selectAsset: (assetId) => {
    set({ selectedAssetId: assetId, focusedAssetId: assetId });
  },

  focusAsset: (assetId) => {
    if (get().focusedAssetId === assetId) return;
    set({ focusedAssetId: assetId });
  },

  clearSelection: () => {
    set({ selectedAssetId: null });
  },

  toggleLayer: (layerId) => {
    const def = getLayerDefinition(layerId);
    const { activeSituationLocked, visibleLayers } = get();

    if (def.safetyCritical) return;
    if (activeSituationLocked && def.lockedWhenActiveSituation) return;

    set({
      visibleLayers: enforceSafetyLayers(
        { ...visibleLayers, [layerId]: !visibleLayers[layerId] },
        activeSituationLocked,
      ),
    });
  },

  resetForRole: (role) => {
    const lens = getRoleLens(role);
    const visibleLayers = enforceSafetyLayers(applyRoleLayerDefaults(role), get().activeSituationLocked);
    set({
      role,
      zoomBand: lens.detailBias,
      visibleLayers,
    });
  },
}));