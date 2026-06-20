import { describe, expect, it, beforeEach } from "vitest";
import { useRuntimeStore } from "./runtime";
import { motorObstructionHmiState } from "../../features/hmi-state/__fixtures__/plantHmiState.fixture";
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

  it("applyHmiState stores state and timestamp", () => {
    useRuntimeStore.getState().applyHmiState(motorObstructionHmiState, "2026-06-20T12:00:05Z");
    const s = useRuntimeStore.getState();
    expect(s.hmiState?.overall_status).toBe("fault");
    expect(s.lastHmiStateTs).toBe("2026-06-20T12:00:05Z");
  });

  it("applyHmiState falls back to generated_at when ts omitted", () => {
    useRuntimeStore.getState().applyHmiState(motorObstructionHmiState);
    expect(useRuntimeStore.getState().lastHmiStateTs).toBe(motorObstructionHmiState.generated_at);
  });

  it("reset clears hmiState and lastHmiStateTs", () => {
    useRuntimeStore.getState().applyHmiState(motorObstructionHmiState);
    useRuntimeStore.getState().reset();
    const s = useRuntimeStore.getState();
    expect(s.hmiState).toBeNull();
    expect(s.lastHmiStateTs).toBeNull();
  });

  it("unknown asset status maps to unknown fallback", () => {
    useRuntimeStore.getState().applySnapshot({
      ...HERO_MOTOR_OVERLOAD,
      asset_status: { "X-1": "bogus" as never },
    });
    expect(useRuntimeStore.getState().assetStatus["X-1"]).toBe("unknown");
  });
});