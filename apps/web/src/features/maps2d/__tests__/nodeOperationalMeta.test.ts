import { describe, expect, it } from "vitest";
import type { ActiveAlarm } from "../../../api/types";
import type { TagFrame } from "../../../app/schemas/tagFrame";
import { buildNodeOperationalMeta } from "../nodeOperationalMeta";

const TAGS: Record<string, TagFrame> = {
  "tag-b": {
    tag_id: "TAG-B",
    asset_id: "ASSET-1",
    value: 10,
    unit: "A",
    quality: "BAD",
    timestamp: "2026-01-01T00:00:00Z",
    source: "simulator",
  },
  "tag-a": {
    tag_id: "TAG-A",
    asset_id: "ASSET-1",
    value: 5,
    unit: "V",
    quality: "GOOD",
    timestamp: "2026-01-01T00:00:00Z",
    source: "simulator",
  },
};

const ALARMS: ActiveAlarm[] = [
  {
    alarm_id: "ALM-B",
    asset_id: "ASSET-1",
    tag_id: "TAG-A",
    severity: "warning",
    message: "warn",
    raised_at: "2026-01-01T00:00:00Z",
    acked: false,
  },
  {
    alarm_id: "ALM-A",
    asset_id: "ASSET-1",
    tag_id: "TAG-A",
    severity: "critical",
    message: "crit",
    raised_at: "2026-01-01T00:00:00Z",
    acked: false,
  },
];

describe("buildNodeOperationalMeta", () => {
  it("computes deterministic tag and alarm counts", () => {
    const meta = buildNodeOperationalMeta({
      assetIds: ["ASSET-1"],
      tags: TAGS,
      alarms: ALARMS,
    });
    expect(meta["ASSET-1"]!.tagCount).toBe(2);
    expect(meta["ASSET-1"]!.alarmCount).toBe(2);
    expect(meta["ASSET-1"]!.criticalAlarmCount).toBe(1);
    expect(meta["ASSET-1"]!.badQualityCount).toBe(1);
  });

  it("primaryValueLabel chooses GOOD tag first", () => {
    const meta = buildNodeOperationalMeta({
      assetIds: ["ASSET-1"],
      tags: TAGS,
      alarms: [],
    });
    expect(meta["ASSET-1"]!.primaryValueLabel).toBe("TAG-A: 5 V");
  });

  it("falls back primaryValueLabel when all tags bad", () => {
    const badOnly: Record<string, TagFrame> = {
      z: { ...TAGS["tag-b"]!, tag_id: "Z-TAG" },
      a: { ...TAGS["tag-b"]!, tag_id: "A-TAG" },
    };
    const meta = buildNodeOperationalMeta({
      assetIds: ["ASSET-1"],
      tags: badOnly,
      alarms: [],
    });
    expect(meta["ASSET-1"]!.primaryValueLabel).toBe("A-TAG: 10 A");
  });

  it("asset with no tags or alarms gets zeros", () => {
    const meta = buildNodeOperationalMeta({
      assetIds: ["EMPTY"],
      tags: {},
      alarms: [],
    });
    expect(meta["EMPTY"]).toEqual({
      assetId: "EMPTY",
      alarmCount: 0,
      criticalAlarmCount: 0,
      tagCount: 0,
      badQualityCount: 0,
      primaryValueLabel: null,
    });
  });

  it("does not mutate input objects", () => {
    const tags = { ...TAGS };
    const alarms = [...ALARMS];
    buildNodeOperationalMeta({ assetIds: ["ASSET-1"], tags, alarms });
    expect(Object.keys(tags)).toEqual(Object.keys(TAGS));
    expect(alarms).toHaveLength(2);
  });
});