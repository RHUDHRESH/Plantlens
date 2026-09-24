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

  it("keeps every active situation and picks the Calm Card's as primary", () => {
    const first = HERO_MOTOR_OVERLOAD.active_situations[0]!;
    const other = { ...first, situation_id: "sit-bus-2", title: "Bus sag", root_asset_id: "BUS-101", grouped_alarm_ids: ["DC_BUS_LOW"] };
    useRuntimeStore.getState().applySnapshot({
      ...HERO_MOTOR_OVERLOAD,
      active_situations: [other, first],
    });
    const s = useRuntimeStore.getState();
    expect(s.activeSituations.map((x) => x.situation_id)).toEqual(["sit-bus-2", "sit-motor-1"]);
    // latest_calm_card describes sit-motor-1, so it stays primary even though it is listed second.
    expect(s.activeSituation?.situation_id).toBe("sit-motor-1");

    useRuntimeStore.getState().applySnapshot({ ...HERO_MOTOR_OVERLOAD, active_situations: [other], latest_calm_card: null });
    expect(useRuntimeStore.getState().activeSituation?.situation_id).toBe("sit-bus-2");

    useRuntimeStore.getState().applySnapshot({ ...HERO_MOTOR_OVERLOAD, active_situations: [] });
    expect(useRuntimeStore.getState().activeSituations).toEqual([]);
    expect(useRuntimeStore.getState().activeSituation).toBeNull();
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