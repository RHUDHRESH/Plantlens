import { describe, expect, it } from "vitest";
import {
  buildCausalPathViewModel,
  getNextPathAssetId,
  getPreviousPathAssetId,
} from "../causalPathModel";
import { HERO_MOTOR_OVERLOAD } from "../../../test-fixtures/heroSnapshot";
import type { TagFrame } from "../../../app/schemas/tagFrame";

const NODES = [
  {
    id: "MTR-301",
    label: "Motor",
    asset_type: "load.motor_3phase",
    position: { x: 100, y: 100 },
    status_binding: "asset_status.MTR-301",
  },
  {
    id: "BUS-101",
    label: "DC Bus",
    asset_type: "distribution.dc_bus",
    position: { x: 300, y: 100 },
    status_binding: "asset_status.BUS-101",
  },
];

const TAGS: Record<string, TagFrame> = {
  t1: {
    tag_id: "TAG-B",
    asset_id: "MTR-301",
    value: 1,
    unit: "A",
    quality: "BAD",
    timestamp: "2026-01-01T00:00:00Z",
    source: "simulator",
  },
  t2: {
    tag_id: "TAG-A",
    asset_id: "MTR-301",
    value: 2,
    unit: "V",
    quality: "GOOD",
    timestamp: "2026-01-01T00:00:00Z",
    source: "simulator",
  },
};

describe("buildCausalPathViewModel", () => {
  it("returns hasActivePath false for empty path", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: [],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: {},
      alarms: [],
      activeSituation: null,
      calmCard: null,
    });
    expect(vm.hasActivePath).toBe(false);
    expect(vm.steps).toEqual([]);
  });

  it("builds steps in path order", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
      pathAssetIds: ["MTR-301", "BUS-101"],
      affectedAssetIds: ["BUS-101"],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: {},
      alarms: HERO_MOTOR_OVERLOAD.active_alarms,
      activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
      calmCard: HERO_MOTOR_OVERLOAD.latest_calm_card,
    });
    expect(vm.steps.map((s) => s.assetId)).toEqual(["MTR-301", "BUS-101"]);
    expect(vm.steps[0]!.kind).toBe("root");
    expect(vm.steps[1]!.kind).toBe("effect");
  });

  it("creates safe fallback step for missing node", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["MISSING-1"],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: {},
      alarms: [],
      activeSituation: null,
      calmCard: null,
    });
    expect(vm.steps[0]!.label).toBe("MISSING-1");
    expect(vm.steps[0]!.assetType).toBe("unknown");
  });

  it("detects root from activeSituation or Calm Card", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["MTR-301", "BUS-101"],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: {},
      alarms: [],
      activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
      calmCard: HERO_MOTOR_OVERLOAD.latest_calm_card,
    });
    expect(vm.rootAssetId).toBe("MTR-301");
    expect(vm.steps[0]!.isRoot).toBe(true);
  });

  it("selectedStep prefers selectedAssetId", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["MTR-301", "BUS-101"],
      affectedAssetIds: [],
      selectedAssetId: "BUS-101",
      focusedAssetId: "MTR-301",
      tags: {},
      alarms: [],
      activeSituation: null,
      calmCard: null,
    });
    expect(vm.selectedStep?.assetId).toBe("BUS-101");
  });

  it("selectedStep falls back to focusedAssetId", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["MTR-301", "BUS-101"],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: "BUS-101",
      tags: {},
      alarms: [],
      activeSituation: null,
      calmCard: null,
    });
    expect(vm.selectedStep?.assetId).toBe("BUS-101");
  });

  it("selectedStep falls back to root then first", () => {
    const withRoot = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["MTR-301", "BUS-101"],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: {},
      alarms: [],
      activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
      calmCard: null,
    });
    expect(withRoot.selectedStep?.assetId).toBe("MTR-301");

    const firstOnly = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["BUS-101"],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: {},
      alarms: [],
      activeSituation: null,
      calmCard: null,
    });
    expect(firstOnly.selectedStep?.assetId).toBe("BUS-101");
  });

  it("attaches alarms and tags only to matching asset", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["MTR-301", "BUS-101"],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: TAGS,
      alarms: HERO_MOTOR_OVERLOAD.active_alarms,
      activeSituation: null,
      calmCard: null,
    });
    expect(vm.steps[0]!.alarms.every((a) => a.assetId === "MTR-301")).toBe(true);
    expect(vm.steps[1]!.alarms.every((a) => a.assetId === "BUS-101")).toBe(true);
    expect(vm.steps[0]!.tags.map((t) => t.tagId)).toEqual(["TAG-A", "TAG-B"]);
    expect(vm.steps[1]!.tags).toEqual([]);
  });

  it("keeps recommendedActionLabel null when absent", () => {
    const vm = buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: ["MTR-301"],
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags: {},
      alarms: [],
      activeSituation: null,
      calmCard: null,
    });
    expect(vm.recommendedActionLabel).toBeNull();
  });

  it("does not mutate input objects", () => {
    const path = ["MTR-301", "BUS-101"];
    const tags = { ...TAGS };
    const alarms = [...HERO_MOTOR_OVERLOAD.active_alarms];
    buildCausalPathViewModel({
      nodes: NODES,
      assetStatus: {},
      pathAssetIds: path,
      affectedAssetIds: [],
      selectedAssetId: null,
      focusedAssetId: null,
      tags,
      alarms,
      activeSituation: null,
      calmCard: null,
    });
    expect(path).toEqual(["MTR-301", "BUS-101"]);
    expect(Object.keys(tags)).toHaveLength(2);
    expect(alarms).toHaveLength(2);
  });
});

describe("path navigation helpers", () => {
  const vm = buildCausalPathViewModel({
    nodes: NODES,
    assetStatus: {},
    pathAssetIds: ["MTR-301", "BUS-101", "INV-102"],
    affectedAssetIds: [],
    selectedAssetId: null,
    focusedAssetId: null,
    tags: {},
    alarms: [],
    activeSituation: null,
    calmCard: null,
  });

  it("getNextPathAssetId and getPreviousPathAssetId", () => {
    expect(getNextPathAssetId(vm, "MTR-301")).toBe("BUS-101");
    expect(getPreviousPathAssetId(vm, "BUS-101")).toBe("MTR-301");
    expect(getNextPathAssetId(vm, "INV-102")).toBeNull();
    expect(getPreviousPathAssetId(vm, "MTR-301")).toBeNull();
  });
});