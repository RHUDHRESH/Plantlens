export type MapMode = "2d" | "3d";

export type UserRole = "operator" | "engineer" | "maintenance" | "manager";

export type MapZoomBand = "plant" | "area" | "asset" | "component";

export type MapLayerId =
  | "status"
  | "causal_path"
  | "raw_alarms"
  | "tags"
  | "actions"
  | "maintenance"
  | "audit"
  | "geometry";

export type MapCommand =
  | { type: "fit_plant" }
  | { type: "focus_root" }
  | { type: "focus_asset"; assetId: string }
  | { type: "select_asset"; assetId: string }
  | { type: "clear_selection" }
  | { type: "set_zoom_band"; band: MapZoomBand }
  | { type: "toggle_layer"; layerId: MapLayerId }
  | { type: "set_role"; role: UserRole }
  | { type: "set_mode"; mode: MapMode }
  | { type: "show_causal_path"; visible: boolean };

export interface LayerDefinition {
  id: MapLayerId;
  label: string;
  description: string;
  safetyCritical: boolean;
  lockedWhenActiveSituation: boolean;
  defaultVisibleByRole: Record<UserRole, boolean>;
  minZoomBand: MapZoomBand;
}

export interface RoleLens {
  role: UserRole;
  label: string;
  intent: string;
  visibleLayerDefaults: Partial<Record<MapLayerId, boolean>>;
  detailBias: MapZoomBand;
  showTagDetails: boolean;
  showAuditDetails: boolean;
  showMaintenanceDetails: boolean;
  showManagerSummary: boolean;
}

export interface MapSelectionState {
  selectedAssetId: string | null;
  focusedAssetId: string | null;
}

export interface OperationalMapState {
  mode: MapMode;
  role: UserRole;
  zoomBand: MapZoomBand;
  visibleLayers: Record<MapLayerId, boolean>;
  selectedAssetId: string | null;
  focusedAssetId: string | null;
  lastCommand: MapCommand | null;
  activeSituationLocked: boolean;
}

export const ALL_MAP_LAYERS = [
  "status",
  "causal_path",
  "raw_alarms",
  "tags",
  "actions",
  "maintenance",
  "audit",
  "geometry",
] as const satisfies readonly MapLayerId[];

export const ALL_USER_ROLES = ["operator", "engineer", "maintenance", "manager"] as const satisfies readonly UserRole[];

export const ALL_ZOOM_BANDS = ["plant", "area", "asset", "component"] as const satisfies readonly MapZoomBand[];