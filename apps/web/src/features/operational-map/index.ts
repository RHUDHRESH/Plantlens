export type {
  LayerDefinition,
  MapCommand,
  MapLayerId,
  MapMode,
  MapSelectionState,
  MapZoomBand,
  OperationalMapState,
  RoleLens,
  UserRole,
} from "./mapKernelTypes";
export { ALL_MAP_LAYERS, ALL_USER_ROLES, ALL_ZOOM_BANDS } from "./mapKernelTypes";

export {
  getDefaultVisibleLayersForRole,
  getLayerDefinition,
  getLockedLayers,
  isSafetyCriticalLayer,
  MAP_LAYER_REGISTRY,
  UnknownMapLayerError,
} from "./layerRegistry";

export { getRoleLabel, getRoleLens, ROLE_LENSES, UnknownUserRoleError } from "./roleLenses";

export {
  getNextZoomBand,
  getPreviousZoomBand,
  getZoomBandFromScale,
  isZoomBandAtLeast,
  ZOOM_BAND_ORDER,
} from "./zoomBands";

export { useOperationalMapStore } from "./useOperationalMapStore";
export type { OperationalMapStore } from "./useOperationalMapStore";

export {
  selectCanShowAuditLayer,
  selectCanShowMaintenanceLayer,
  selectCanShowTagDetails,
  selectIsLayerVisible,
  selectMapContextForAsset,
  selectRoleLens,
  selectCausalPathVisible,
  selectShouldShowCausalPath,
  selectVisibleLayers,
} from "./selectors";