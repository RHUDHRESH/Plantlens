import { describe, expect, it } from "vitest";
import { formatLiveValue, getRuntimeTag, verifyLiveTag } from "./liveVerification";

describe("liveVerification", () => {
  it("returns not_bound when tagId is missing", () => {
    const result = verifyLiveTag({
      tagId: null,
      pending: false,
      committed: false,
      runtimeTags: {},
    });
    expect(result.state).toBe("not_bound");
    expect(result.label).toBe("Not bound");
  });

  it("returns pending_commit when binding is staged", () => {
    const result = verifyLiveTag({
      tagId: "MOTOR_301_RPM",
      pending: true,
      committed: false,
      runtimeTags: {},
    });
    expect(result.state).toBe("pending_commit");
    expect(result.label).toBe("Pending commit");
  });

  it("returns committed_waiting when committed but runtime tag missing", () => {
    const result = verifyLiveTag({
      tagId: "MOTOR_301_RPM",
      pending: false,
      committed: true,
      runtimeTags: {},
    });
    expect(result.state).toBe("committed_waiting");
    expect(result.detail).toContain("waiting for the first runtime TagFrame");
  });

  it("returns live_good with formatted value for GOOD runtime tag", () => {
    const result = verifyLiveTag({
      tagId: "MOTOR_301_RPM",
      pending: false,
      committed: true,
      runtimeTags: {
        MOTOR_301_RPM: {
          tag_id: "MOTOR_301_RPM",
          asset_id: "MTR-301",
          value: 842,
          unit: "rpm",
          quality: "GOOD",
          timestamp: "2026-01-01T10:32:14Z",
          source: "modbus_rtu",
        },
      },
    });
    expect(result.state).toBe("live_good");
    expect(formatLiveValue(result.value, result.unit, result.quality)).toBe("842 rpm");
  });

  it("formats BAD runtime tag value as em dash", () => {
    const result = verifyLiveTag({
      tagId: "MOTOR_301_RPM",
      pending: false,
      committed: true,
      runtimeTags: {
        MOTOR_301_RPM: {
          value: 0,
          unit: "rpm",
          quality: "BAD",
          timestamp: "2026-01-01T10:32:14Z",
        },
      },
    });
    expect(result.state).toBe("live_bad");
    expect(formatLiveValue(result.value, result.unit, result.quality)).toBe("—");
  });

  it("formats STALE runtime tag value as em dash", () => {
    expect(
      formatLiveValue(120, "rpm", "STALE"),
    ).toBe("—");
  });

  it("reads runtime tag via ts fallback", () => {
    const frame = getRuntimeTag(
      {
        BUS_101_V: {
          tag_id: "BUS_101_V",
          value: 24.1,
          quality: "GOOD",
          ts: "2026-01-01T10:00:00Z",
        },
      },
      "BUS_101_V",
    );
    expect(frame?.ts).toBe("2026-01-01T10:00:00Z");
  });

  it("reads runtime tag via timestamp fallback", () => {
    const result = verifyLiveTag({
      tagId: "BUS_101_V",
      pending: false,
      committed: false,
      runtimeTags: {
        BUS_101_V: {
          value: 24,
          quality: "GOOD",
          timestamp: "2026-01-01T10:15:00Z",
        },
      },
    });
    expect(result.timestamp).toBe("2026-01-01T10:15:00Z");
  });

  it("does not turn null value into 0", () => {
    expect(formatLiveValue(null, "rpm", "GOOD")).toBe("—");
    expect(formatLiveValue(undefined, "V", "GOOD")).toBe("—");
  });
});