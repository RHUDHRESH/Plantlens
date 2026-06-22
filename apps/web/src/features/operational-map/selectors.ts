import type { MapLayerId, OperationalMapState } from "./mapKernelTypes";
import { getRoleLens } from "./roleLenses";

export function selectVisibleLayers(state: OperationalMapState): Record<MapLayerId, boolean> {
  return state.visibleLayers;
}

export function selectIsLayerVisible(state: OperationalMapState, layerId: MapLayerId): boolean {
  return state.visibleLayers[layerId] ?? false;
}

export function selectRoleLens(state: OperationalMapState) {
  return getRoleLens(state.role);
}

export function selectCanShowTagDetails(state: OperationalMapState): boolean {
  const lens = selectRoleLens(state);
  return lens.showTagDetails && selectIsLayerVisible(state, "tags");
}

export function selectCanShowAuditLayer(state: OperationalMapState): boolean {
  const lens = selectRoleLens(state);
  return lens.showAuditDetails && selectIsLayerVisible(state, "audit");
}

export function selectCanShowMaintenanceLayer(state: OperationalMapState): boolean {
  const lens = selectRoleLens(state);
  return lens.showMaintenanceDetails && selectIsLayerVisible(state, "maintenance");
}

export function selectShouldShowCausalPath(state: OperationalMapState): boolean {
  return selectIsLayerVisible(state, "causal_path");
}

/** Zustand-friendly selector — stable reference via primitive return. */
export function selectCausalPathVisible(s: OperationalMapState): boolean {
  return s.visibleLayers.causal_path;
}

export function selectMapContextForAsset(state: OperationalMapState, assetId: string) {
  return {
    assetId,
    selected: state.selectedAssetId === assetId,
    focused: state.focusedAssetId === assetId,
    role: state.role,
    zoomBand: state.zoomBand,
    visibleLayers: selectVisibleLayers(state),
  };
}