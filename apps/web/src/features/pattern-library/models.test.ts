import { describe, expect, it } from "vitest";
import type { InstantiationResult, PatternLibrarySummary } from "../../api/v2";
import { ambiguousRoles, bindingRows, explicitBindings, hasPendingChoices, previewState, unobservableRoles } from "./bindings";
import { ambiguousRolesInRow, coverageMatrix, rampPercent, rankRecommendations, ratio } from "./coverageModel";
import type { AssetCoverage } from "./coverageModel";
import { searchPatterns, severityStatus, shortName, symbolForLibrary } from "./libraryModel";
import { barExtent, makeTimeScale, MIN_TICK_GAP, niceMax, thresholdText, weightOpacity } from "./timelineScale";

describe("symptom timeline scale", () => {
  it("picks a nice axis end of at least 10 s", () => {
    expect(niceMax(0)).toBe(10_000);
    expect(niceMax(4_000)).toBe(10_000);
    expect(niceMax(30_000)).toBe(60_000);
    expect(niceMax(1_800_000)).toBe(3_600_000);
    expect(niceMax(31_536_000_000)).toBe(31_536_000_000);
  });

  it("is monotonic, maps 0 → 0 and max → 1, and is log-like beyond t0", () => {
    const s = makeTimeScale(1_800_000);
    expect(s.max).toBe(3_600_000);
    expect(s.pos(0)).toBe(0);
    expect(s.pos(s.max)).toBeCloseTo(1);
    expect(s.pos(1_000)).toBeLessThan(s.pos(10_000));
    // Each decade gets a similar share of the axis (log behaviour), unlike a linear scale.
    const d1 = s.pos(10_000) - s.pos(1_000);
    const d2 = s.pos(100_000) - s.pos(10_000);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.03);
    expect(s.pos(-5)).toBe(0);
    expect(s.pos(10 * s.max)).toBeCloseTo(1);
  });

  it("labels 0 and the end, with non-colliding ticks in between", () => {
    const s = makeTimeScale(1_800_000);
    expect(s.ticks[0]).toMatchObject({ label: "0", pos: 0 });
    expect(s.ticks.at(-1)).toMatchObject({ label: "1 h", pos: 1 });
    expect(s.ticks.map((t) => t.label)).toEqual(["0", "1 s", "10 s", "1 min", "10 min", "1 h"]);
    for (let i = 1; i < s.ticks.length; i += 1) expect(s.ticks[i]!.pos - s.ticks[i - 1]!.pos).toBeGreaterThanOrEqual(MIN_TICK_GAP - 1e-9);
  });

  it("gives instant symptoms a visible marker", () => {
    const s = makeTimeScale(4_000);
    expect(barExtent(s, [0, 0])).toMatchObject({ start: 0, instant: true });
    const e = barExtent(s, [0, 4_000]);
    expect(e.instant).toBe(false);
    expect(e.start + e.width).toBeCloseTo(s.pos(4_000));
  });

  it("formats threshold hints and weight opacity", () => {
    expect(thresholdText({ direction: "rise", threshold_hint: { relative_to_nominal: 1.15, for_ms: 2000 } })).toBe("> 1.15× nominal for 2 s");
    expect(thresholdText({ direction: "fall", threshold_hint: { absolute: 42 } })).toBe("< 42");
    expect(thresholdText({ direction: "rise" })).toBe("");
    expect(weightOpacity(1)).toBe(1);
    expect(weightOpacity(0)).toBe(0.3);
    expect(weightOpacity(0.5)).toBe(0.65);
  });
});

const ambiguousResult: InstantiationResult = {
  pattern_id: "vfd.overcurrent_trip",
  pattern_version: "1.0.0",
  asset_id: "INV-102",
  ok: false,
  bindings: {
    current: { tag_id: null, method: "ambiguous", candidates: ["INV_102_I", "VFD_I"] },
    drive_trip: { tag_id: "INV_102_UNDERVOLTAGE", method: "signal_type", candidates: [] },
    speed: { tag_id: null, method: "unbound", candidates: [] },
  },
  missing_required: ["current"],
  missing_optional: ["speed"],
  neighbours: {},
  change_set: null,
  unresolved: ["Role 'current' matches several tags ['INV_102_I', 'VFD_I']: set tag_map role or pass a binding"],
  notes: [],
};

describe("bindings resolution flow (ambiguous → explicit)", () => {
  it("lists ambiguous roles first and treats them as resolvable, not an observability gap", () => {
    const rows = bindingRows(ambiguousResult, ["current", "drive_trip"], {});
    expect(rows.map((r) => [r.role, r.method, r.required])).toEqual([
      ["current", "ambiguous", true],
      ["drive_trip", "signal_type", true],
      ["speed", "unbound", false],
    ]);
    expect(ambiguousRoles(ambiguousResult)).toEqual(["current"]);
    expect(unobservableRoles(ambiguousResult)).toEqual([]);
    expect(previewState(ambiguousResult, {})).toBe("needs_resolution");
  });

  it("a choice becomes an explicit binding for the re-preview", () => {
    const choices = { current: "VFD_I" };
    expect(hasPendingChoices(ambiguousResult, choices)).toBe(true);
    expect(explicitBindings(ambiguousResult, choices)).toEqual({ current: "VFD_I" });
  });

  it("after the re-preview the result is ready and explicit bindings are kept for submit", () => {
    const resolved: InstantiationResult = {
      ...ambiguousResult,
      ok: true,
      bindings: { ...ambiguousResult.bindings, current: { tag_id: "VFD_I", method: "explicit", candidates: [] } },
      missing_required: [],
      change_set: { title: "t", source: "pattern_library", ops: [] },
    };
    expect(hasPendingChoices(resolved, {})).toBe(false);
    expect(previewState(resolved, {})).toBe("ready");
    expect(explicitBindings(resolved, {})).toEqual({ current: "VFD_I" });
  });

  it("a truly missing required role is a gap", () => {
    const gap: InstantiationResult = {
      ...ambiguousResult,
      bindings: { ...ambiguousResult.bindings, current: { tag_id: null, method: "unbound", candidates: [] } },
      unresolved: [],
    };
    expect(unobservableRoles(gap)).toEqual(["current"]);
    expect(previewState(gap, {})).toBe("gap");
  });
});

const cov = (asset_id: string, rows: Partial<AssetCoverage["patterns"][number]>[]): AssetCoverage => {
  const patterns = rows.map((r, i) => ({
    pattern_id: `p${i}`,
    title: `Pattern ${asset_id} ${i}`,
    category: "electrical",
    severity: "warning",
    observable: false,
    missing_required: [],
    missing_optional: [],
    unresolved: [],
    ...r,
  }));
  return { asset_id, asset_type: "t", observable: patterns.filter((p) => p.observable).length, total: patterns.length, patterns };
};

describe("coverage recommendations", () => {
  const coverages = [
    cov("MTR-301", [
      { missing_required: ["bearing_envelope"] },
      { missing_required: ["bearing_envelope", "shaft_voltage"] },
      { missing_required: ["voltage"], category: "supply" },
      { observable: true, category: "mechanical" },
    ]),
    cov("BUS-101", [{ missing_required: ["insulation_resistance"] }, { missing_required: ["voltage"] }]),
    cov("INV-102", [
      {
        missing_required: ["current"],
        unresolved: ["Role 'current' matches several tags ['INV_102_I', 'VFD_I']: set tag_map role or pass a binding"],
      },
    ]),
  ];

  it("ranks roles by failure modes unlocked across assets", () => {
    const recs = rankRecommendations(coverages);
    expect(recs.map((r) => [r.role, r.unlocks, r.contributes])).toEqual([
      ["voltage", 2, 0],
      ["bearing_envelope", 1, 1],
      ["insulation_resistance", 1, 0],
      ["shaft_voltage", 0, 1],
    ]);
    expect(recs[0]!.assets).toEqual(["BUS-101", "MTR-301"]);
  });

  it("never recommends a sensor for roles that are only ambiguous", () => {
    expect(ambiguousRolesInRow(coverages[2]!.patterns[0]!)).toEqual(["current"]);
    expect(rankRecommendations(coverages).some((r) => r.role === "current")).toBe(false);
  });

  it("builds an asset × category matrix with a neutral→accent ramp", () => {
    const m = coverageMatrix(coverages);
    expect(m.categories).toEqual(["electrical", "mechanical", "supply"]);
    const mtr = m.rows.find((r) => r.asset_id === "MTR-301")!;
    expect(mtr.cells.mechanical).toEqual({ observable: 1, total: 1, ratio: 1 });
    expect(m.rows.find((r) => r.asset_id === "BUS-101")!.cells.mechanical!.ratio).toBeNull();
    expect(rampPercent(null)).toBe(0);
    expect(rampPercent(0)).toBe(0);
    expect(rampPercent(1)).toBe(80);
    expect(ratio(0, 0)).toBe(0);
  });
});

describe("library search", () => {
  const libs: PatternLibrarySummary[] = [
    {
      component_type: "induction_motor",
      display_name: "AC induction motor (squirrel cage, 3-phase)",
      description: "",
      asset_type_aliases: ["load.motor_3phase"],
      pattern_count: 2,
      patterns: [
        { pattern_id: "induction_motor.mechanical_overload", title: "Mechanical overload", category: "mechanical", severity: "warning", required_roles: ["current", "speed"] },
        { pattern_id: "induction_motor.single_phasing", title: "Single phasing", category: "supply", severity: "critical", required_roles: ["current_unbalance"] },
      ],
    },
    {
      component_type: "dc_bus",
      display_name: "DC bus",
      description: "",
      asset_type_aliases: ["distribution.dc_bus"],
      pattern_count: 1,
      patterns: [{ pattern_id: "dc_bus.ground_fault", title: "Ground fault", category: "insulation", severity: "critical", required_roles: ["insulation_resistance"] }],
    },
  ];
  const base = { query: "", componentType: null, category: null, severity: null };

  it("searches titles, failure modes and roles (AND across words)", () => {
    expect(searchPatterns(libs, { ...base, query: "overload" }).map((p) => p.pattern_id)).toEqual(["induction_motor.mechanical_overload"]);
    expect(searchPatterns(libs, { ...base, query: "single phasing" })).toHaveLength(1);
    expect(searchPatterns(libs, { ...base, query: "insulation resistance" }).map((p) => p.component_type)).toEqual(["dc_bus"]);
    expect(searchPatterns(libs, { ...base, query: "current speed" })).toHaveLength(1);
  });

  it("filters by type, category and severity", () => {
    expect(searchPatterns(libs, { ...base, componentType: "dc_bus" })).toHaveLength(1);
    expect(searchPatterns(libs, { ...base, severity: "critical" })).toHaveLength(2);
    expect(searchPatterns(libs, { ...base, category: "supply", severity: "critical" })).toHaveLength(1);
  });

  it("maps symbols, severities and names", () => {
    expect(symbolForLibrary(libs[0]!)).toBe("motor");
    expect(symbolForLibrary({ component_type: "unknown", asset_type_aliases: ["storage.battery"] })).toBe("battery");
    expect(severityStatus("critical")).toBe("critical");
    expect(severityStatus("warning")).toBe("medium");
    expect(shortName("AC induction motor (squirrel cage, 3-phase)")).toBe("AC induction motor");
  });
});
