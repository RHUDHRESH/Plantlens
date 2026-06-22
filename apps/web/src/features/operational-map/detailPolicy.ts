import type { MapLayerId, MapZoomBand, UserRole } from "./mapKernelTypes";
import { ZOOM_BAND_ORDER } from "./zoomBands";

export interface MapNodeDetailPolicy {
  showAssetLabel: boolean;
  showAssetId: boolean;
  showAssetType: boolean;
  showStatusText: boolean;
  showRootBadge: boolean;
  showCausalStep: boolean;
  showAlarmCount: boolean;
  showCriticalAlarmCount: boolean;
  showTagCount: boolean;
  showPrimaryValue: boolean;
  showBadQualityCount: boolean;
  showActionCue: boolean;
  showMaintenanceCue: boolean;
  showAuditCue: boolean;
}

export interface AssetInspectorPolicy {
  showOperatorSummary: boolean;
  showLiveTagSummary: boolean;
  showFullTagTable: boolean;
  showAlarmSummary: boolean;
  showFullAlarmList: boolean;
  showRecommendedActions: boolean;
  showMaintenanceSection: boolean;
  showAuditSection: boolean;
  showEngineeringSection: boolean;
  showManagerSummary: boolean;
}

function layerOn(visibleLayers: Record<MapLayerId, boolean>, id: MapLayerId): boolean {
  return visibleLayers[id] ?? false;
}

function isEngOrMaint(role: UserRole): boolean {
  return role === "engineer" || role === "maintenance";
}

function bandAtLeast(zoomBand: MapZoomBand, minimum: MapZoomBand): boolean {
  return ZOOM_BAND_ORDER[zoomBand] >= ZOOM_BAND_ORDER[minimum];
}

function mapPolicyForBand(
  zoomBand: MapZoomBand,
  role: UserRole,
  visibleLayers: Record<MapLayerId, boolean>,
): MapNodeDetailPolicy {
  const rawAlarms = layerOn(visibleLayers, "raw_alarms");
  const tags = layerOn(visibleLayers, "tags");
  const actions = layerOn(visibleLayers, "actions");
  const maintenance = layerOn(visibleLayers, "maintenance");
  const audit = layerOn(visibleLayers, "audit");

  if (zoomBand === "plant") {
    return {
      showAssetLabel: true,
      showAssetId: role === "engineer",
      showAssetType: false,
      showStatusText: false,
      showRootBadge: true,
      showCausalStep: true,
      showAlarmCount: role === "operator",
      showCriticalAlarmCount: true,
      showTagCount: false,
      showPrimaryValue: false,
      showBadQualityCount: false,
      showActionCue: false,
      showMaintenanceCue: false,
      showAuditCue: false,
    };
  }

  if (zoomBand === "area") {
    return {
      showAssetLabel: true,
      showAssetId: role === "engineer",
      showAssetType: role === "engineer" || role === "maintenance",
      showStatusText: true,
      showRootBadge: true,
      showCausalStep: true,
      showAlarmCount:
        (role === "operator" || role === "engineer" || role === "maintenance") && rawAlarms,
      showCriticalAlarmCount: rawAlarms,
      showTagCount: isEngOrMaint(role) && tags,
      showPrimaryValue: false,
      showBadQualityCount: isEngOrMaint(role),
      showActionCue: actions,
      showMaintenanceCue: isEngOrMaint(role) && maintenance,
      showAuditCue: (role === "manager" || role === "engineer") && audit,
    };
  }

  // asset and component share maximum detail allowed by role/layers
  return {
    showAssetLabel: true,
    showAssetId: role === "engineer" || role === "maintenance",
    showAssetType: role !== "manager",
    showStatusText: true,
    showRootBadge: true,
    showCausalStep: true,
    showAlarmCount: rawAlarms,
    showCriticalAlarmCount: rawAlarms,
    showTagCount: isEngOrMaint(role) && tags,
    showPrimaryValue: isEngOrMaint(role) && tags,
    showBadQualityCount: isEngOrMaint(role),
    showActionCue: actions,
    showMaintenanceCue: maintenance,
    showAuditCue: (role === "manager" || role === "engineer") && audit,
  };
}

export function getMapNodeDetailPolicy(params: {
  role: UserRole;
  zoomBand: MapZoomBand;
  visibleLayers: Record<MapLayerId, boolean>;
}): MapNodeDetailPolicy {
  return mapPolicyForBand(params.zoomBand, params.role, params.visibleLayers);
}

export function getAssetInspectorPolicy(params: {
  role: UserRole;
  zoomBand: MapZoomBand;
  visibleLayers: Record<MapLayerId, boolean>;
}): AssetInspectorPolicy {
  const { role, zoomBand, visibleLayers } = params;
  const tags = layerOn(visibleLayers, "tags");
  const rawAlarms = layerOn(visibleLayers, "raw_alarms");
  const actions = layerOn(visibleLayers, "actions");
  const maintenance = layerOn(visibleLayers, "maintenance");
  const audit = layerOn(visibleLayers, "audit");

  switch (role) {
    case "operator":
      return {
        showOperatorSummary: true,
        showLiveTagSummary: false,
        showFullTagTable: false,
        showAlarmSummary: true,
        showFullAlarmList: bandAtLeast(zoomBand, "asset") && rawAlarms,
        showRecommendedActions: true,
        showMaintenanceSection: false,
        showAuditSection: false,
        showEngineeringSection: false,
        showManagerSummary: false,
      };
    case "engineer":
      return {
        showOperatorSummary: false,
        showLiveTagSummary: bandAtLeast(zoomBand, "area") && tags,
        showFullTagTable: bandAtLeast(zoomBand, "asset") && tags,
        showAlarmSummary: true,
        showFullAlarmList: bandAtLeast(zoomBand, "asset") && rawAlarms,
        showRecommendedActions: bandAtLeast(zoomBand, "area") && actions,
        showMaintenanceSection: bandAtLeast(zoomBand, "area") && maintenance,
        showAuditSection: audit && bandAtLeast(zoomBand, "area"),
        showEngineeringSection: bandAtLeast(zoomBand, "asset"),
        showManagerSummary: false,
      };
    case "maintenance":
      return {
        showOperatorSummary: false,
        showLiveTagSummary: bandAtLeast(zoomBand, "area") && tags,
        showFullTagTable: bandAtLeast(zoomBand, "asset") && tags,
        showAlarmSummary: true,
        showFullAlarmList: bandAtLeast(zoomBand, "asset") && rawAlarms,
        showRecommendedActions: true,
        showMaintenanceSection: bandAtLeast(zoomBand, "area") && maintenance,
        showAuditSection: false,
        showEngineeringSection: false,
        showManagerSummary: false,
      };
    case "manager":
      return {
        showOperatorSummary: false,
        showLiveTagSummary: false,
        showFullTagTable: false,
        showAlarmSummary: bandAtLeast(zoomBand, "area"),
        showFullAlarmList: false,
        showRecommendedActions: false,
        showMaintenanceSection: false,
        showAuditSection: audit,
        showEngineeringSection: false,
        showManagerSummary: true,
      };
  }
}