import { describe, expect, it } from "vitest";
import { buildCausalPathViewModel } from "../../causal-path";
import { getDefaultVisibleLayersForRole } from "../../operational-map";
import { HERO_MOTOR_OVERLOAD } from "../../../test-fixtures/heroSnapshot";
import { buildOperationalSearchIndex } from "../searchIndex";

const NODES = [
  {
    id: "MTR-301",
    label: "Motor",
    asset_type: "load.motor_3phase",
    position: { x: 100, y: 100 },
    status_binding: "asset_status.MTR-301",
  },
];

const CAUSAL_VM = buildCausalPathViewModel({
  nodes: NODES,
  assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
  pathAssetIds: ["MTR-301"],
  affectedAssetIds: [],
  selectedAssetId: "MTR-301",
  focusedAssetId: "MTR-301",
  tags: {},
  alarms: HERO_MOTOR_OVERLOAD.active_alarms,
  activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
  calmCard: HERO_MOTOR_OVERLOAD.latest_calm_card,
});

describe("buildOperationalSearchIndex", () => {
  it("builds asset docs", () => {
    const index = buildOperationalSearchIndex({
      nodes: NODES,
      assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
      tags: {},
      alarms: [],
      causalPathViewModel: CAUSAL_VM,
      role: "operator",
      visibleLayers: getDefaultVisibleLayersForRole("operator"),
      rootAssetId: "MTR-301",
      mapMode: "2d",
      showLegend: true,
      density: "comfortable",
    });
    const asset = index.documents.find((d) => d.id === "asset:MTR-301");
    expect(asset).toBeDefined();
    expect(asset?.title).toBe("Motor");
  });

  it("hides tag docs for manager", () => {
    const index = buildOperationalSearchIndex({
      nodes: NODES,
      assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
      tags: {
        t1: {
          tag_id: "MOTOR_301_CURRENT",
          asset_id: "MTR-301",
          value: 42,
          unit: "A",
          quality: "GOOD",
          timestamp: "2026-01-01T00:00:00Z",
          source: "simulator",
        },
      },
      alarms: [],
      causalPathViewModel: CAUSAL_VM,
      role: "manager",
      visibleLayers: getDefaultVisibleLayersForRole("manager"),
      rootAssetId: "MTR-301",
      mapMode: "2d",
      showLegend: true,
      density: "comfortable",
    });
    expect(index.documents.some((d) => d.kind === "tag")).toBe(false);
  });

  it("includes alarm docs", () => {
    const index = buildOperationalSearchIndex({
      nodes: NODES,
      assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
      tags: {},
      alarms: HERO_MOTOR_OVERLOAD.active_alarms,
      causalPathViewModel: CAUSAL_VM,
      role: "operator",
      visibleLayers: getDefaultVisibleLayersForRole("operator"),
      rootAssetId: "MTR-301",
      mapMode: "2d",
      showLegend: true,
      density: "comfortable",
    });
    expect(index.documents.some((d) => d.kind === "alarm")).toBe(true);
  });

  it("boosts root/critical docs", () => {
    const index = buildOperationalSearchIndex({
      nodes: NODES,
      assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
      tags: {},
      alarms: HERO_MOTOR_OVERLOAD.active_alarms,
      causalPathViewModel: CAUSAL_VM,
      role: "operator",
      visibleLayers: getDefaultVisibleLayersForRole("operator"),
      rootAssetId: "MTR-301",
      mapMode: "2d",
      showLegend: true,
      density: "comfortable",
    });
    const asset = index.documents.find((d) => d.id === "asset:MTR-301");
    const alarm = index.documents.find((d) => d.alarmId === "MOTOR_CURRENT_HIGH");
    expect(asset?.boost).toBeGreaterThan(40);
    expect(alarm?.boost).toBeGreaterThan(50);
  });

  it("command docs are safe UI-only", () => {
    const index = buildOperationalSearchIndex({
      nodes: NODES,
      assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
      tags: {},
      alarms: HERO_MOTOR_OVERLOAD.active_alarms,
      causalPathViewModel: CAUSAL_VM,
      role: "operator",
      visibleLayers: getDefaultVisibleLayersForRole("operator"),
      rootAssetId: "MTR-301",
      mapMode: "2d",
      showLegend: true,
      density: "comfortable",
    });
    const commands = index.documents.filter((d) => d.kind === "command");
    expect(commands.length).toBeGreaterThan(0);
    for (const cmd of commands) {
      expect(cmd.commandId).toBeTruthy();
      expect(cmd.title.length).toBeGreaterThan(0);
    }
  });
});