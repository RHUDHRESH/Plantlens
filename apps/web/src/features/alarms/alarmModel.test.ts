import { describe, expect, it } from "vitest";
import type { RuntimeAlarm, RuntimeAlarmRule } from "./alarmModel";
import {
  EMPTY_FILTER,
  ackNeedsConfirm,
  alarmPriority,
  alarmState,
  allowedShelvePresets,
  buildAlarmRows,
  computeFirstOut,
  conditionHolds,
  filterRows,
  sortRows,
  validateShelve,
} from "./alarmModel";

const A = (id: string, onset: string, extra: Partial<RuntimeAlarm> = {}): RuntimeAlarm => ({
  alarm_id: id,
  asset_id: extra.asset_id ?? "MTR-301",
  tag_id: extra.tag_id ?? `${id}_TAG`,
  severity: extra.severity ?? "warning",
  message: extra.message ?? id.toLowerCase().replace(/_/g, " "),
  raised_at: extra.raised_at ?? onset,
  onset_at: onset,
  acked: extra.acked ?? false,
  ...extra,
});

const rules: RuntimeAlarmRule[] = [
  { id: "CUR_HIGH", tag: "CUR", severity: "warning", priority: 2, message: "Current high", condition: { op: ">", threshold: 3 } },
  { id: "BUS_LOW", tag: "BUS", severity: "critical", priority: 1, message: "Bus low", condition: { op: "<", warning: 42, critical: 38 } },
  { id: "UV", tag: "UV", severity: "warning", message: "UV", condition: { op: "bool_true" }, shelvable: true, max_shelve_seconds: 900 },
  { id: "NOSHELF", tag: "X", severity: "warning", message: "x", condition: { op: ">", threshold: 1 }, shelvable: false },
];

describe("first-out", () => {
  it("marks the earliest onset in each flood, using onset_at not raised_at", () => {
    const map = computeFirstOut([
      A("B", "2026-01-01T10:00:04Z", { raised_at: "2026-01-01T10:00:04Z" }),
      A("A", "2026-01-01T10:00:02Z", { raised_at: "2026-01-01T10:00:09Z" }),
      A("C", "2026-01-01T10:00:06Z"),
      // 30 min later: a new, independent flood
      A("D", "2026-01-01T10:30:00Z"),
      A("E", "2026-01-01T10:30:05Z"),
    ]);
    expect(map.get("A")).toEqual({ floodId: 0, firstOut: true });
    expect(map.get("B")?.firstOut).toBe(false);
    expect(map.get("C")?.floodId).toBe(0);
    expect(map.get("D")).toEqual({ floodId: 1, firstOut: true });
    expect(map.get("E")?.firstOut).toBe(false);
  });

  it("does not mark a lone alarm as first out", () => {
    expect(computeFirstOut([A("A", "2026-01-01T10:00:00Z")]).get("A")?.firstOut).toBe(false);
  });

  it("breaks onset ties deterministically", () => {
    const m = computeFirstOut([A("Z", "2026-01-01T10:00:00Z"), A("Y", "2026-01-01T10:00:00Z")]);
    expect(m.get("Y")?.firstOut).toBe(true);
    expect(m.get("Z")?.firstOut).toBe(false);
  });
});

describe("priority and state", () => {
  it("uses alarm priority, then rule priority, then severity", () => {
    expect(alarmPriority({ priority: 3, severity: "critical" })).toBe(3);
    expect(alarmPriority({ severity: "warning" }, { priority: 1, severity: "warning" })).toBe(1);
    expect(alarmPriority({ severity: "critical" })).toBe(1);
    expect(alarmPriority({ severity: "info" })).toBe(4);
  });

  it("evaluates comparator and band limits", () => {
    expect(conditionHolds(rules[0], 3.4)).toBe(true);
    expect(conditionHolds(rules[0], 2.9)).toBe(false);
    expect(conditionHolds(rules[1], 40.5)).toBe(true); // below the warning band
    expect(conditionHolds(rules[2], true)).toBe(true);
    expect(conditionHolds(rules[2], 0)).toBe(false);
    expect(conditionHolds(undefined, 1)).toBeNull();
  });

  it("reports a cleared-but-unacked alarm as latched", () => {
    expect(alarmState({ acked: false, value: 3.4 }, rules[0])).toBe("unacked");
    expect(alarmState({ acked: false, value: 3.4 }, rules[0], 1.2)).toBe("latched");
    expect(alarmState({ acked: true, value: 3.4 }, rules[0])).toBe("acked");
  });
});

describe("rows, sort and filter", () => {
  const alarms = [
    A("CUR_HIGH", "2026-01-01T10:00:02Z", { tag_id: "CUR", asset_id: "MTR-301", message: "Motor current high" }),
    A("BUS_LOW", "2026-01-01T10:00:06Z", { tag_id: "BUS", asset_id: "BUS-101", severity: "critical", message: "DC bus low" }),
    A("UV", "2026-01-01T10:00:07Z", { tag_id: "UV", asset_id: "INV-102", acked: true, message: "Inverter undervoltage" }),
  ];
  const rows = buildAlarmRows({
    alarms,
    rules,
    situations: [
      {
        situation_id: "S1",
        situation_type: "T",
        title: "Motor overload",
        severity: "critical",
        root_asset_id: "MTR-301",
        created_at: "2026-01-01T10:00:10Z",
        grouped_alarm_ids: ["CUR_HIGH", "BUS_LOW"],
        evidence: [],
      },
    ],
  });

  it("joins rules, first-out and situation membership", () => {
    const cur = rows.find((r) => r.id === "CUR_HIGH")!;
    expect(cur.priority).toBe(2);
    expect(cur.firstOut).toBe(true);
    expect(cur.situationTitle).toBe("Motor overload");
    expect(rows.find((r) => r.id === "UV")!.situationId).toBeNull();
    expect(rows.find((r) => r.id === "BUS_LOW")!.priority).toBe(1);
  });

  it("sorts by priority (then state, onset) and by onset", () => {
    expect(sortRows(rows, "priority", "asc").map((r) => r.id)).toEqual(["BUS_LOW", "CUR_HIGH", "UV"]);
    expect(sortRows(rows, "onset", "desc").map((r) => r.id)).toEqual(["UV", "BUS_LOW", "CUR_HIGH"]);
    expect(sortRows(rows, "state", "asc").at(-1)!.id).toBe("UV");
  });

  it("filters by priority, state, asset and text", () => {
    expect(filterRows(rows, { ...EMPTY_FILTER, priorities: [1] }).map((r) => r.id)).toEqual(["BUS_LOW"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, state: "acked" }).map((r) => r.id)).toEqual(["UV"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, assetId: "MTR-301" }).map((r) => r.id)).toEqual(["CUR_HIGH"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, text: "bus" }).map((r) => r.id)).toEqual(["BUS_LOW"]);
    expect(filterRows(rows, { ...EMPTY_FILTER, text: "inv-102" }).map((r) => r.id)).toEqual(["UV"]);
  });

  it("requires confirmation only when a P1 is in the ack set", () => {
    expect(ackNeedsConfirm(rows.filter((r) => r.id === "CUR_HIGH"))).toBe(false);
    expect(ackNeedsConfirm(rows)).toBe(true);
  });
});

describe("shelve validation", () => {
  it("limits presets to the rule maximum", () => {
    expect(allowedShelvePresets(rules[2])).toEqual([900]);
    expect(allowedShelvePresets(undefined)).toEqual([900, 3600, 14400, 28800]);
  });

  it("requires a duration and a reason", () => {
    const v = validateShelve({ seconds: null, reason: " ", rule: undefined });
    expect(v.ok).toBe(false);
    expect(v.errors.map((e) => e.field).sort()).toEqual(["duration", "reason"]);
  });

  it("rejects durations above the rule maximum and unshelvable rules", () => {
    expect(validateShelve({ seconds: 3600, reason: "maintenance", rule: rules[2] }).errors[0]?.field).toBe("duration");
    expect(validateShelve({ seconds: 900, reason: "maintenance", rule: rules[3] }).errors[0]?.field).toBe("rule");
  });

  it("accepts a valid request", () => {
    expect(validateShelve({ seconds: 900, reason: "Sensor recalibration", rule: rules[2] }).ok).toBe(true);
  });
});
