import { describe, expect, it } from "vitest";
import type { EntityDiff } from "../../api/v2";
import {
  affectedGraph,
  describeEntity,
  describeOp,
  diffTotals,
  formatAlarmRule,
  formatDuration,
  formatEdge,
  formatLagWindow,
  groupDiff,
  groupOps,
  isOutdated,
  parseApiTime,
  tabForChange,
  validationStatus,
} from "./diffFormat";
import { makeChange } from "./testUtils";

describe("durations", () => {
  it("formats ms → human units", () => {
    expect(formatDuration(0)).toBe("0 ms");
    expect(formatDuration(500)).toBe("500 ms");
    expect(formatDuration(1500)).toBe("1.5 s");
    expect(formatDuration(2000)).toBe("2 s");
    expect(formatDuration(90_000)).toBe("1.5 min");
    expect(formatDuration(7_200_000)).toBe("2 h");
    expect(formatDuration(2 * 86_400_000)).toBe("2 d");
  });

  it("formats lag windows with one unit", () => {
    expect(formatLagWindow([0, 500])).toBe("0–500 ms");
    expect(formatLagWindow([0, 4000])).toBe("0–4 s");
    expect(formatLagWindow([60_000, 1_800_000])).toBe("1–30 min");
    expect(formatLagWindow([200, 200])).toBe("200 ms");
    expect(formatLagWindow(null)).toBe("—");
  });

  it("treats zone-less API timestamps as UTC", () => {
    expect(parseApiTime("2026-09-24T03:30:05")?.toISOString()).toBe("2026-09-24T03:30:05.000Z");
    expect(parseApiTime("2026-09-24T03:30:05Z")?.toISOString()).toBe("2026-09-24T03:30:05.000Z");
    expect(parseApiTime(null)).toBeNull();
  });
});

describe("alarm rules and edges read like sentences", () => {
  const unit = (tag: string) => (tag === "MOTOR_301_CURRENT" ? "A" : tag === "BUS_101_V" ? "V" : undefined);

  it("threshold rule", () => {
    expect(
      formatAlarmRule({ tag: "MOTOR_301_CURRENT", severity: "warning", condition: { op: ">", threshold: 3.4, for_ms: 2000 } }, unit),
    ).toBe("MOTOR_301_CURRENT > 3.4 A for 2 s, warning");
  });

  it("tiered warning/critical rule", () => {
    expect(formatAlarmRule({ tag: "BUS_101_V", severity: "critical", condition: { op: "<", warning: 42, critical: 38, for_ms: 500 } }, unit)).toBe(
      "BUS_101_V < 42 V warning / < 38 V critical for 500 ms",
    );
  });

  it("boolean rule", () => {
    expect(formatAlarmRule({ tag: "INV_102_UNDERVOLTAGE", severity: "warning", condition: { op: "bool_true" } })).toBe(
      "INV_102_UNDERVOLTAGE is true, warning",
    );
  });

  it("edge with lag, polarity and loop", () => {
    expect(formatEdge({ from: "MTR-301", to: "INV-102", lag_ms: [0, 500], polarity: "+", loop_ok: true, loop_id: "drive_current_limit" })).toBe(
      "MTR-301 → INV-102 · lag [0–500 ms] · polarity + · loop drive_current_limit",
    );
    expect(formatEdge({ from: "A", to: "B", polarity: "-" })).toBe("A → B · polarity −");
  });
});

describe("groupDiff", () => {
  const diff: EntityDiff[] = [
    { doc: "causal_graph", collection: "situation_types", id: "S1", kind: "added", after: { title: "Overload" } },
    { doc: "causal_graph", collection: "edges", id: "E2", kind: "removed", before: { from: "A", to: "B" } },
    { doc: "causal_graph", collection: "edges", id: "E1", kind: "added", after: { from: "A", to: "C" } },
    { doc: "alarm_rules", collection: "rules", id: "R1", kind: "changed", fields: { severity: { before: "warning", after: "critical" } } },
    { doc: "causal_graph", collection: "nodes", id: "MTR-301", kind: "changed", fields: { evidence_tags: { before: [], after: ["X"] } } },
  ];

  it("orders collections for review and items added → changed → removed", () => {
    const groups = groupDiff(diff);
    expect(groups.map((g) => g.label)).toEqual(["Alarm rules", "Graph nodes (evidence)", "Causal edges", "Situation types"]);
    const edges = groups.find((g) => g.collection === "edges")!;
    expect(edges.items.map((i) => i.id)).toEqual(["E1", "E2"]);
    expect(edges.counts).toEqual({ added: 1, changed: 0, removed: 1 });
  });

  it("totals", () => {
    expect(diffTotals(diff)).toEqual({ added: 2, changed: 2, removed: 1 });
  });

  it("describes field-level changes using the current entity", () => {
    const rule = diff[3]!;
    expect(describeEntity(rule)).toBe("R1 — severity changed");
    const lookup = () => ({ tag: "MOTOR_301_CURRENT", condition: { op: ">", threshold: 3 } });
    expect(describeEntity(rule, () => "A", lookup)).toBe("MOTOR_301_CURRENT > 3 A, critical");
  });
});

describe("affectedGraph", () => {
  it("collects endpoints and marks additions; resolves changed edges via lookup", () => {
    const diff: EntityDiff[] = [
      { doc: "causal_graph", collection: "edges", id: "E1", kind: "added", after: { from: "A", to: "B", lag_ms: [0, 100], polarity: "+" } },
      { doc: "causal_graph", collection: "edges", id: "E5", kind: "changed", fields: { loop_ok: { before: false, after: true } } },
      { doc: "causal_graph", collection: "nodes", id: "A", kind: "changed", fields: {} },
    ];
    const withoutLookup = affectedGraph(diff);
    expect(withoutLookup.edges.map((e) => e.id)).toEqual(["E1"]);
    const g = affectedGraph(diff, (id) => (id === "E5" ? { from: "B", to: "A" } : undefined));
    expect(g.edges.map((e) => [e.id, e.state, e.loop])).toEqual([
      ["E1", "added", false],
      ["E5", "changed", true],
    ]);
    expect(g.nodes).toEqual([
      { id: "A", state: "changed" },
      { id: "B", state: "context" },
    ]);
  });
});

describe("ops and lifecycle", () => {
  it("groups draft ops for the apply preview", () => {
    const change = makeChange();
    const groups = groupOps(change.change_set);
    expect(groups.map((g) => g.key)).toEqual(["alarm_rules", "edges"]);
    expect(describeOp(change.change_set.ops[1]!, () => "A")).toBe("MTR_301_CURRENT_HIGH: MOTOR_301_CURRENT > 3.4 A for 2 s, warning");
  });

  it("maps statuses to queue tabs", () => {
    expect(tabForChange({ status: "pending" })).toBe("pending");
    expect(tabForChange({ status: "stale" })).toBe("stale");
    expect(tabForChange({ status: "deployed" })).toBe("deployed");
    expect(tabForChange({ status: "failed" })).toBe("rejected");
  });

  it("flags pending drafts written against an older revision", () => {
    expect(isOutdated({ status: "pending", base_rev: 1 }, 2)).toBe(true);
    expect(isOutdated({ status: "pending", base_rev: 2 }, 2)).toBe(false);
    expect(isOutdated({ status: "deployed", base_rev: 1 }, 2)).toBe(false);
  });

  it("summarises validation", () => {
    expect(validationStatus(makeChange())).toBe("valid");
    expect(validationStatus(makeChange({ preview: { applies: false, error: "x", diff: [], validation: null } }))).toBe("does_not_apply");
  });
});
