import { describe, expect, it } from "vitest";
import type { Situation } from "../../../app/schemas/situation";
import type { TagFrame } from "../../../app/schemas/tagFrame";
import {
  alarmsInLastTenMinutes,
  buildCausalPath,
  getUnitForTag,
  tagNumericValue,
  walkTreeForQuality,
  walkTreeForValues,
} from "../treeHelpers";
import { DEMO_TREE_STRUCTURE } from "../treeStructure";

describe("atlas treeHelpers", () => {
  it("returns units for known tags", () => {
    expect(getUnitForTag("MOTOR_301_RPM")).toBe("rpm");
    expect(getUnitForTag("UNKNOWN")).toBe("");
  });

  it("reads numeric values only when quality is GOOD", () => {
    const good: TagFrame = {
      tag_id: "MOTOR_301_RPM",
      asset_id: "MTR-301",
      value: 900,
      unit: "rpm",
      quality: "GOOD",
      timestamp: "2026-01-01T10:00:00Z",
      source: "simulator",
      seq: 1,
    };
    const bad: TagFrame = { ...good, quality: "BAD", value: 0 };
    expect(tagNumericValue(good)).toBe(900);
    expect(tagNumericValue(bad)).toBeNull();
  });

  it("walks tree values from frames", () => {
    const tags: Record<string, TagFrame> = {
      MOTOR_301_RPM: {
        tag_id: "MOTOR_301_RPM",
        asset_id: "MTR-301",
        value: 1100,
        unit: "rpm",
        quality: "GOOD",
        timestamp: "2026-01-01T10:00:00Z",
        source: "simulator",
        seq: 1,
      },
    };
    const values: Record<string, number | null> = {};
    DEMO_TREE_STRUCTURE.forEach((node) => walkTreeForValues(node, tags, values));
    expect(values.MOTOR_301_RPM).toBe(1100);
  });

  it("marks equipment uncertain when in an active situation with good tags", () => {
    const situations: Situation[] = [
      {
        situation_id: "sit-1",
        situation_type: "TEST",
        title: "Test",
        severity: "warning",
        root_asset_id: "MTR-301",
        created_at: "2026-01-01T10:00:00Z",
        grouped_alarm_ids: [],
        evidence: [],
        affected_asset_ids: ["BUS-101"],
      },
    ];
    const tags: Record<string, TagFrame> = {
      BUS_101_V: {
        tag_id: "BUS_101_V",
        asset_id: "BUS-101",
        value: 24,
        unit: "V",
        quality: "GOOD",
        timestamp: "2026-01-01T10:00:00Z",
        source: "simulator",
        seq: 1,
      },
    };
    const quality: Record<string, "GOOD" | "UNCERTAIN" | "BAD"> = {};
    DEMO_TREE_STRUCTURE.forEach((node) =>
      walkTreeForQuality(node, tags, situations, {}, quality),
    );
    expect(quality["BUS-101"]).toBe("UNCERTAIN");
  });

  it("builds causal path from situation fields", () => {
    const situation: Situation = {
      situation_id: "sit-1",
      situation_type: "TEST",
      title: "Test",
      severity: "critical",
      root_asset_id: "MTR-301",
      created_at: "2026-01-01T10:00:00Z",
      grouped_alarm_ids: [],
      evidence: [],
      causal_path: ["MTR-301", "BUS-101", "INV-102"],
      affected_asset_ids: ["BUS-101"],
    };
    expect(buildCausalPath(situation)).toEqual(["MTR-301", "BUS-101", "INV-102"]);
    expect(buildCausalPath(null)).toEqual([]);
  });

  it("counts alarms in the last ten minutes", () => {
    const now = Date.parse("2026-01-01T10:30:00Z");
    const alarms = [
      { raised_at: "2026-01-01T10:25:00Z" },
      { raised_at: "2026-01-01T10:00:00Z" },
      { raised_at: "2026-01-01T09:00:00Z" },
    ];
    expect(alarmsInLastTenMinutes(alarms, now)).toBe(1);
  });
});