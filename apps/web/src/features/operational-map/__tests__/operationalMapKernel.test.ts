import { beforeEach, describe, expect, it } from "vitest";
import {
  getDefaultVisibleLayersForRole,
  getLayerDefinition,
  isSafetyCriticalLayer,
  UnknownMapLayerError,
} from "../layerRegistry";
import { getRoleLens } from "../roleLenses";
import {
  getZoomBandFromScale,
  isZoomBandAtLeast,
} from "../zoomBands";
import { useOperationalMapStore } from "../useOperationalMapStore";
import {
  selectCanShowAuditLayer,
  selectCanShowTagDetails,
  selectShouldShowCausalPath,
} from "../selectors";
import type { OperationalMapState } from "../mapKernelTypes";

function snapshotState(): OperationalMapState {
  const s = useOperationalMapStore.getState();
  return {
    mode: s.mode,
    role: s.role,
    zoomBand: s.zoomBand,
    visibleLayers: { ...s.visibleLayers },
    selectedAssetId: s.selectedAssetId,
    focusedAssetId: s.focusedAssetId,
    lastCommand: s.lastCommand,
    activeSituationLocked: s.activeSituationLocked,
  };
}

beforeEach(() => {
  useOperationalMapStore.setState({
    mode: "2d",
    role: "operator",
    zoomBand: "plant",
    visibleLayers: getDefaultVisibleLayersForRole("operator"),
    selectedAssetId: null,
    focusedAssetId: null,
    lastCommand: null,
    activeSituationLocked: false,
  });
});

describe("layer registry", () => {
  it("marks status, causal_path, geometry as safety-critical", () => {
    expect(isSafetyCriticalLayer("status")).toBe(true);
    expect(isSafetyCriticalLayer("causal_path")).toBe(true);
    expect(isSafetyCriticalLayer("geometry")).toBe(true);
    expect(isSafetyCriticalLayer("tags")).toBe(false);
  });

  it("operator default hides tags, audit, maintenance", () => {
    const layers = getDefaultVisibleLayersForRole("operator");
    expect(layers.tags).toBe(false);
    expect(layers.audit).toBe(false);
    expect(layers.maintenance).toBe(false);
    expect(layers.status).toBe(true);
    expect(layers.causal_path).toBe(true);
  });

  it("engineer default shows tags, audit, maintenance", () => {
    const layers = getDefaultVisibleLayersForRole("engineer");
    expect(layers.tags).toBe(true);
    expect(layers.audit).toBe(true);
    expect(layers.maintenance).toBe(true);
  });

  it("manager default hides tag spam", () => {
    const layers = getDefaultVisibleLayersForRole("manager");
    expect(layers.tags).toBe(false);
    expect(layers.raw_alarms).toBe(false);
    expect(layers.actions).toBe(false);
    expect(layers.maintenance).toBe(false);
    expect(layers.audit).toBe(true);
  });

  it("getLayerDefinition throws on unknown layer", () => {
    expect(() => getLayerDefinition("unknown" as never)).toThrow(UnknownMapLayerError);
  });
});

describe("zoom bands", () => {
  it("maps invalid scales to plant", () => {
    expect(getZoomBandFromScale(-1)).toBe("plant");
    expect(getZoomBandFromScale(0)).toBe("plant");
    expect(getZoomBandFromScale(Number.NaN)).toBe("plant");
  });

  it("maps scale thresholds", () => {
    expect(getZoomBandFromScale(0.5)).toBe("plant");
    expect(getZoomBandFromScale(1)).toBe("area");
    expect(getZoomBandFromScale(2)).toBe("asset");
    expect(getZoomBandFromScale(3)).toBe("component");
  });

  it("isZoomBandAtLeast works", () => {
    expect(isZoomBandAtLeast("asset", "area")).toBe(true);
    expect(isZoomBandAtLeast("plant", "component")).toBe(false);
  });
});

describe("operational map store", () => {
  it("initial state is operator/2d/plant", () => {
    const state = snapshotState();
    expect(state.role).toBe("operator");
    expect(state.mode).toBe("2d");
    expect(state.zoomBand).toBe("plant");
  });

  it("safety-critical layers cannot be toggled off", () => {
    useOperationalMapStore.getState().toggleLayer("status");
    useOperationalMapStore.getState().toggleLayer("geometry");
    const { visibleLayers } = snapshotState();
    expect(visibleLayers.status).toBe(true);
    expect(visibleLayers.geometry).toBe(true);
  });

  it("setRole engineer enables tag and audit visibility", () => {
    useOperationalMapStore.getState().setRole("engineer");
    const { visibleLayers } = snapshotState();
    expect(visibleLayers.tags).toBe(true);
    expect(visibleLayers.audit).toBe(true);
    expect(visibleLayers.maintenance).toBe(true);
  });

  it("setRole manager disables tag visibility", () => {
    useOperationalMapStore.getState().setRole("manager");
    const { visibleLayers } = snapshotState();
    expect(visibleLayers.tags).toBe(false);
  });

  it("selecting an asset also focuses it", () => {
    useOperationalMapStore.getState().selectAsset("ASSET-1");
    const state = snapshotState();
    expect(state.selectedAssetId).toBe("ASSET-1");
    expect(state.focusedAssetId).toBe("ASSET-1");
  });

  it("focus_asset command does not select", () => {
    useOperationalMapStore.getState().dispatchMapCommand({ type: "focus_asset", assetId: "ASSET-2" });
    const state = snapshotState();
    expect(state.focusedAssetId).toBe("ASSET-2");
    expect(state.selectedAssetId).toBeNull();
  });

  it("select_asset command selects and focuses", () => {
    useOperationalMapStore.getState().dispatchMapCommand({ type: "select_asset", assetId: "ASSET-3" });
    const state = snapshotState();
    expect(state.selectedAssetId).toBe("ASSET-3");
    expect(state.focusedAssetId).toBe("ASSET-3");
  });

  it("setActiveSituationLocked forces causal_path visible", () => {
    useOperationalMapStore.getState().toggleLayer("causal_path");
    useOperationalMapStore.getState().setActiveSituationLocked(true);
    expect(snapshotState().visibleLayers.causal_path).toBe(true);
  });

  it("toggle causal_path while active situation locked does not turn it off", () => {
    useOperationalMapStore.getState().setActiveSituationLocked(true);
    useOperationalMapStore.getState().toggleLayer("causal_path");
    expect(snapshotState().visibleLayers.causal_path).toBe(true);
  });

  it("resetForRole applies role detailBias and layer defaults", () => {
    useOperationalMapStore.getState().resetForRole("engineer");
    const state = snapshotState();
    expect(state.role).toBe("engineer");
    expect(state.zoomBand).toBe(getRoleLens("engineer").detailBias);
    expect(state.visibleLayers.tags).toBe(true);
  });

  it("setZoomBand skips update when band unchanged", () => {
    useOperationalMapStore.getState().setZoomBand("plant");
    const before = snapshotState().zoomBand;
    useOperationalMapStore.getState().setZoomBand("plant");
    expect(snapshotState().zoomBand).toBe(before);
  });

  it("setZoomBandFromScale derives band from scale", () => {
    useOperationalMapStore.getState().setZoomBandFromScale(2);
    expect(snapshotState().zoomBand).toBe("asset");
    useOperationalMapStore.getState().setZoomBandFromScale(2);
    expect(snapshotState().zoomBand).toBe("asset");
  });

  it("focus_root command records lastCommand", () => {
    useOperationalMapStore.getState().dispatchMapCommand({ type: "focus_root" });
    expect(snapshotState().lastCommand).toEqual({ type: "focus_root" });
  });

  it("setRole preserves selection and mode", () => {
    useOperationalMapStore.getState().setMode("3d");
    useOperationalMapStore.getState().selectAsset("ASSET-9");
    useOperationalMapStore.getState().setRole("maintenance");
    const state = snapshotState();
    expect(state.mode).toBe("3d");
    expect(state.selectedAssetId).toBe("ASSET-9");
    expect(state.focusedAssetId).toBe("ASSET-9");
  });
});

describe("selectors", () => {
  it("selectCanShowTagDetails false for operator, true for engineer", () => {
    useOperationalMapStore.getState().setRole("operator");
    expect(selectCanShowTagDetails(snapshotState())).toBe(false);
    useOperationalMapStore.getState().setRole("engineer");
    expect(selectCanShowTagDetails(snapshotState())).toBe(true);
  });

  it("selectCanShowAuditLayer true for manager when audit visible", () => {
    useOperationalMapStore.getState().setRole("manager");
    expect(selectCanShowAuditLayer(snapshotState())).toBe(true);
  });

  it("selectShouldShowCausalPath reflects causal_path layer (safety-critical, always visible)", () => {
    expect(selectShouldShowCausalPath(snapshotState())).toBe(true);
    useOperationalMapStore.getState().toggleLayer("causal_path");
    expect(selectShouldShowCausalPath(snapshotState())).toBe(true);
  });
});