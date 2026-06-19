import { describe, expect, it, beforeEach } from "vitest";
import { useRuntimeStore } from "./runtime";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";

describe("useRuntimeStore", () => {
  beforeEach(() => {
    useRuntimeStore.getState().reset();
  });

  it("applySnapshot maps backend snapshot without diagnosis", () => {
    useRuntimeStore.getState().applySnapshot(HERO_MOTOR_OVERLOAD, "2026-01-01T10:32:20Z");
    const s = useRuntimeStore.getState();
    expect(s.assetStatus["MTR-301"]).toBe("critical");
    expect(s.assetStatus["BUS-101"]).toBe("warning");
    expect(s.activeAlarms).toHaveLength(2);
    expect(s.activeSituation?.root_asset_id).toBe("MTR-301");
    expect(s.calmCard?.raw_alarm_count).toBe(5);
    expect(s.hasSnapshot).toBe(true);
  });

  it("setConnection does not clear frozen snapshot", () => {
    useRuntimeStore.getState().applySnapshot(HERO_MOTOR_OVERLOAD);
    useRuntimeStore.getState().setConnection("stale");
    expect(useRuntimeStore.getState().activeAlarms.length).toBeGreaterThan(0);
    expect(useRuntimeStore.getState().connection).toBe("stale");
  });

  it("unknown asset status maps to unknown fallback", () => {
    useRuntimeStore.getState().applySnapshot({
      ...HERO_MOTOR_OVERLOAD,
      asset_status: { "X-1": "bogus" as never },
    });
    expect(useRuntimeStore.getState().assetStatus["X-1"]).toBe("unknown");
  });
});