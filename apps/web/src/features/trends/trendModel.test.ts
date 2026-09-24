import { describe, expect, it } from "vitest";
import type { AlarmRule, TrendSeries } from "../../api/v2";
import {
  alignSeries,
  assignSlots,
  extractLimits,
  groupByUnit,
  parseTrendParams,
  toCsv,
  trendsHref,
  valueAt,
  withCarryIn,
} from "./trendModel";

const s = (tag: string, points: TrendSeries["points"], unit = "A"): TrendSeries => ({ tag_id: tag, unit, asset_id: "MTR-301", points });

describe("alignSeries (points → uPlot arrays)", () => {
  it("unions timestamps; missing samples are undefined, non-GOOD samples are null gaps", () => {
    const a = alignSeries([
      s("A", [
        ["2026-01-01T10:00:00Z", 1, "GOOD"],
        ["2026-01-01T10:00:02Z", null, "BAD"],
        ["2026-01-01T10:00:04Z", 3, "GOOD"],
      ]),
      s("B", [
        ["2026-01-01T10:00:01Z", 10, "GOOD"],
        ["2026-01-01T10:00:04Z", 12, "STALE"],
      ]),
    ]);
    const t0 = Date.parse("2026-01-01T10:00:00Z") / 1000;
    expect(a.xs).toEqual([t0, t0 + 1, t0 + 2, t0 + 4]);
    expect(a.ys[0]).toEqual([1, undefined, null, 3]);
    // A STALE sample with a value still breaks the line.
    expect(a.ys[1]).toEqual([undefined, 10, undefined, null]);
    expect(a.qualityMarks).toEqual([
      { series: 0, x: t0 + 2, quality: "BAD" },
      { series: 1, x: t0 + 4, quality: "STALE" },
    ]);
  });

  it("maps booleans to 0/1", () => {
    const a = alignSeries([{ points: [["2026-01-01T10:00:00Z", true as unknown as number, "GOOD"]] }]);
    expect(a.ys[0]).toEqual([1]);
  });
});

describe("valueAt (readout)", () => {
  const xs = [0, 1, 2, 4];
  const ys = [1, undefined, null, 3];
  it("holds the latest sample at or before x", () => {
    expect(valueAt(xs, ys, 1.5)).toEqual({ value: 1, at: 0, gap: false });
    expect(valueAt(xs, ys, 3)).toEqual({ value: null, at: 2, gap: true });
    expect(valueAt(xs, ys, 10)).toEqual({ value: 3, at: 4, gap: false });
    expect(valueAt(xs, ys, -1)).toBeNull();
  });
});

describe("withCarryIn", () => {
  const fromS = Date.parse("2026-01-01T10:30:00Z") / 1000;
  it("carries a GOOD live value into an empty window", () => {
    const out = withCarryIn(s("A", []), { value: 3.4, quality: "GOOD", timestamp: "2026-01-01T10:00:02Z" }, fromS);
    expect(out.points).toEqual([["2026-01-01T10:30:00.000Z", 3.4, "GOOD"]]);
  });
  it("never invents values for bad quality or when samples exist", () => {
    expect(withCarryIn(s("A", []), { value: 3.4, quality: "STALE", timestamp: "2026-01-01T10:00:02Z" }, fromS).points).toEqual([]);
    const withPts = s("A", [["2026-01-01T10:31:00Z", 2, "GOOD"]]);
    expect(withCarryIn(withPts, { value: 3.4, quality: "GOOD", timestamp: "2026-01-01T10:00:02Z" }, fromS)).toBe(withPts);
  });
});

describe("extractLimits", () => {
  const rules: AlarmRule[] = [
    { id: "CUR_HIGH", tag: "CUR", severity: "warning", priority: 2, message: "", condition: { op: ">", threshold: 3 } },
    { id: "BUS_LOW", tag: "BUS", severity: "critical", priority: 1, message: "", condition: { op: "<", warning: 42, critical: 38 } },
    { id: "UV", tag: "UV", severity: "warning", message: "", condition: { op: "bool_true" } },
  ];
  it("returns labelled limits for selected tags only, with band tones", () => {
    const l = extractLimits(rules, ["CUR", "BUS", "UV"]);
    expect(l).toEqual([
      { tagId: "CUR", alarmId: "CUR_HIGH", value: 3, tone: "high", label: "CUR_HIGH > 3" },
      { tagId: "BUS", alarmId: "BUS_LOW", value: 42, tone: "high", label: "BUS_LOW (warn) < 42" },
      { tagId: "BUS", alarmId: "BUS_LOW", value: 38, tone: "critical", label: "BUS_LOW (crit) < 38" },
    ]);
    expect(extractLimits(rules, ["CUR"])).toHaveLength(1);
    expect(extractLimits(undefined, ["CUR"])).toEqual([]);
  });
});

describe("panes, colours, CSV and URL", () => {
  it("groups tags into one pane per unit in selection order", () => {
    const units: Record<string, string> = { A: "A", B: "V", C: "A" };
    expect(groupByUnit(["A", "B", "C"], (t) => units[t])).toEqual([
      { unit: "A", tagIds: ["A", "C"] },
      { unit: "V", tagIds: ["B"] },
    ]);
  });

  it("keeps a tag's colour slot when others are removed", () => {
    const first = assignSlots({}, ["A", "B", "C"]);
    expect(first).toEqual({ A: 0, B: 1, C: 2 });
    const next = assignSlots(first, ["A", "C"]);
    expect(next).toEqual({ A: 0, C: 2 });
    expect(assignSlots(next, ["A", "C", "D"])).toEqual({ A: 0, C: 2, D: 1 });
  });

  it("exports samples in long format with quality", () => {
    const csv = toCsv([s("A", [["2026-01-01T10:00:02Z", null, "BAD"], ["2026-01-01T10:00:00Z", 1.5, "GOOD"]])]);
    expect(csv.split("\n")).toEqual([
      "timestamp,tag_id,value,unit,quality,asset_id",
      "2026-01-01T10:00:00Z,A,1.5,A,GOOD,MTR-301",
      "2026-01-01T10:00:02Z,A,,A,BAD,MTR-301",
      "",
    ]);
  });

  it("round-trips URL state and caps at 8 tags", () => {
    const href = trendsHref(["A", "B"], "1h");
    expect(href).toBe("/ops/trends?tags=A,B&range=1h");
    const parsed = parseTrendParams(new URLSearchParams("tags=A,B,A,C,D,E,F,G,H,I&range=bogus"));
    expect(parsed.tags).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(parsed.range).toBe("15m");
  });
});
