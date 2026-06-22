import { describe, expect, it } from "vitest";
import { buildCausalPathViewModel } from "../../causal-path";
import { getDefaultVisibleLayersForRole } from "../../operational-map";
import { HERO_MOTOR_OVERLOAD } from "../../../test-fixtures/heroSnapshot";
import { buildOperationalSearchIndex } from "../searchIndex";
import { scoreOperationalSearch } from "../scoring";

const NODES = [
  {
    id: "MTR-301",
    label: "Motor",
    asset_type: "load.motor_3phase",
    position: { x: 100, y: 100 },
    status_binding: "asset_status.MTR-301",
  },
];

function buildIndex() {
  const causalPathViewModel = buildCausalPathViewModel({
    nodes: NODES,
    assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
    pathAssetIds: ["MTR-301"],
    affectedAssetIds: [],
    selectedAssetId: "MTR-301",
    focusedAssetId: "MTR-301",
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
    alarms: HERO_MOTOR_OVERLOAD.active_alarms,
    activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
    calmCard: HERO_MOTOR_OVERLOAD.latest_calm_card,
  });

  return buildOperationalSearchIndex({
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
    alarms: HERO_MOTOR_OVERLOAD.active_alarms,
    causalPathViewModel,
    role: "engineer",
    visibleLayers: getDefaultVisibleLayersForRole("engineer"),
    rootAssetId: "MTR-301",
    mapMode: "2d",
    showLegend: true,
    density: "comfortable",
  });
}

describe("scoreOperationalSearch", () => {
  it("exact asset ID beats weak alias", () => {
    const index = buildIndex();
    const exact = scoreOperationalSearch(index, "MTR-301", { role: "operator" });
    const weak = scoreOperationalSearch(index, "drive", { role: "operator" });
    expect(exact[0]?.document.assetId).toBe("MTR-301");
    expect(exact[0]!.score).toBeGreaterThan(weak[0]?.score ?? 0);
  });

  it("critical alarm ranks high", () => {
    const index = buildIndex();
    const results = scoreOperationalSearch(index, "motor current", { role: "operator" });
    expect(results[0]?.document.kind).toBe("alarm");
  });

  it("root causal step ranks high on blank query", () => {
    const index = buildIndex();
    const results = scoreOperationalSearch(index, "", { role: "operator" });
    expect(results.some((r) => r.document.kind === "causal_step")).toBe(true);
  });

  it('alias query "fault" finds alarm', () => {
    const index = buildIndex();
    const results = scoreOperationalSearch(index, "fault", { role: "operator" });
    expect(results.some((r) => r.document.kind === "alarm")).toBe(true);
  });

  it('alias query "amps" finds current tag', () => {
    const index = buildIndex();
    const results = scoreOperationalSearch(index, "amps", { role: "engineer" });
    expect(results.some((r) => r.document.kind === "tag" && r.document.tagId === "MOTOR_301_CURRENT")).toBe(
      true,
    );
  });

  it("deterministic tie-break", () => {
    const index = buildIndex();
    const a = scoreOperationalSearch(index, "motor", { role: "operator" });
    const b = scoreOperationalSearch(index, "motor", { role: "operator" });
    expect(a.map((r) => r.document.id)).toEqual(b.map((r) => r.document.id));
  });
});