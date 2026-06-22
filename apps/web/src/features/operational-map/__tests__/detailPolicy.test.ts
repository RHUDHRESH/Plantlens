import { describe, expect, it } from "vitest";
import { getDefaultVisibleLayersForRole } from "../layerRegistry";
import { getAssetInspectorPolicy, getMapNodeDetailPolicy } from "../detailPolicy";

const allLayersOn = getDefaultVisibleLayersForRole("engineer");

describe("getMapNodeDetailPolicy", () => {
  it("operator at plant sees clean overview without tags", () => {
    const policy = getMapNodeDetailPolicy({
      role: "operator",
      zoomBand: "plant",
      visibleLayers: getDefaultVisibleLayersForRole("operator"),
    });
    expect(policy.showAssetLabel).toBe(true);
    expect(policy.showTagCount).toBe(false);
    expect(policy.showPrimaryValue).toBe(false);
    expect(policy.showActionCue).toBe(false);
  });

  it("engineer at component sees tag details and audit", () => {
    const policy = getMapNodeDetailPolicy({
      role: "engineer",
      zoomBand: "component",
      visibleLayers: allLayersOn,
    });
    expect(policy.showTagCount).toBe(true);
    expect(policy.showPrimaryValue).toBe(true);
    expect(policy.showAuditCue).toBe(true);
  });

  it("manager hides tag spam at asset zoom", () => {
    const policy = getMapNodeDetailPolicy({
      role: "manager",
      zoomBand: "asset",
      visibleLayers: getDefaultVisibleLayersForRole("manager"),
    });
    expect(policy.showTagCount).toBe(false);
    expect(policy.showPrimaryValue).toBe(false);
    expect(policy.showAssetType).toBe(false);
  });

  it("maintenance sees maintenance cue and bad quality count at area zoom", () => {
    const layers = { ...getDefaultVisibleLayersForRole("maintenance"), maintenance: true };
    const policy = getMapNodeDetailPolicy({
      role: "maintenance",
      zoomBand: "area",
      visibleLayers: layers,
    });
    expect(policy.showMaintenanceCue).toBe(true);
    expect(policy.showBadQualityCount).toBe(true);
  });

  it("hidden layer suppresses corresponding cue", () => {
    const layers = { ...allLayersOn, actions: false, maintenance: false, audit: false };
    const policy = getMapNodeDetailPolicy({
      role: "engineer",
      zoomBand: "asset",
      visibleLayers: layers,
    });
    expect(policy.showActionCue).toBe(false);
    expect(policy.showMaintenanceCue).toBe(false);
    expect(policy.showAuditCue).toBe(false);
  });

  it("audit cue requires audit layer visible", () => {
    const withAudit = getMapNodeDetailPolicy({
      role: "engineer",
      zoomBand: "area",
      visibleLayers: { ...allLayersOn, audit: true },
    });
    const withoutAudit = getMapNodeDetailPolicy({
      role: "engineer",
      zoomBand: "area",
      visibleLayers: { ...allLayersOn, audit: false },
    });
    expect(withAudit.showAuditCue).toBe(true);
    expect(withoutAudit.showAuditCue).toBe(false);
  });

  it("actions cue requires actions layer visible", () => {
    const on = getMapNodeDetailPolicy({
      role: "engineer",
      zoomBand: "area",
      visibleLayers: { ...allLayersOn, actions: true },
    });
    const off = getMapNodeDetailPolicy({
      role: "engineer",
      zoomBand: "area",
      visibleLayers: { ...allLayersOn, actions: false },
    });
    expect(on.showActionCue).toBe(true);
    expect(off.showActionCue).toBe(false);
  });

  it("raw alarm count requires raw_alarms layer visible", () => {
    const on = getMapNodeDetailPolicy({
      role: "operator",
      zoomBand: "area",
      visibleLayers: { ...getDefaultVisibleLayersForRole("operator"), raw_alarms: true },
    });
    const off = getMapNodeDetailPolicy({
      role: "operator",
      zoomBand: "area",
      visibleLayers: { ...getDefaultVisibleLayersForRole("operator"), raw_alarms: false },
    });
    expect(on.showAlarmCount).toBe(true);
    expect(off.showAlarmCount).toBe(false);
  });
});

describe("getAssetInspectorPolicy", () => {
  it("operator hides full tag table", () => {
    const policy = getAssetInspectorPolicy({
      role: "operator",
      zoomBand: "component",
      visibleLayers: getDefaultVisibleLayersForRole("operator"),
    });
    expect(policy.showFullTagTable).toBe(false);
    expect(policy.showOperatorSummary).toBe(true);
  });

  it("engineer shows full tag table at asset zoom", () => {
    const policy = getAssetInspectorPolicy({
      role: "engineer",
      zoomBand: "asset",
      visibleLayers: allLayersOn,
    });
    expect(policy.showFullTagTable).toBe(true);
    expect(policy.showEngineeringSection).toBe(true);
  });

  it("maintenance shows maintenance section at area zoom", () => {
    const policy = getAssetInspectorPolicy({
      role: "maintenance",
      zoomBand: "area",
      visibleLayers: getDefaultVisibleLayersForRole("maintenance"),
    });
    expect(policy.showMaintenanceSection).toBe(true);
  });

  it("manager hides tag spam", () => {
    const policy = getAssetInspectorPolicy({
      role: "manager",
      zoomBand: "component",
      visibleLayers: getDefaultVisibleLayersForRole("manager"),
    });
    expect(policy.showFullTagTable).toBe(false);
    expect(policy.showLiveTagSummary).toBe(false);
    expect(policy.showManagerSummary).toBe(true);
  });
});