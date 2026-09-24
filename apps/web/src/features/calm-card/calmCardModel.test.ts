import { describe, expect, it } from "vitest";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { buildPlantModel } from "../operational-map/plantModel";
import { COMPILED_FIXTURE } from "../operational-map/testUtils";
import type { RuntimeCalmCard, RuntimeSituation } from "./calmCardModel";
import { composeCalmCard, scoreTerms } from "./calmCardModel";

const card = HERO_MOTOR_OVERLOAD.latest_calm_card as RuntimeCalmCard;
const situation: RuntimeSituation = {
  ...HERO_MOTOR_OVERLOAD.active_situations[0]!,
  confidence: "high",
  confidence_score: 0.92,
  score_breakdown: { timing: 1, coverage: 0.8, fingerprint: 1, quality_penalty: 0.25, contradictions: 1, margin: 0.6, competitor: "BUS-101" },
  loop_note: "Loop entered at BUS-101.",
  unexplained_alarm_ids: ["DC_BUS_LOW"],
  deterministic_trace_id: "TRACE_1",
};
const model = buildPlantModel(COMPILED_FIXTURE as never);

describe("composeCalmCard", () => {
  const view = composeCalmCard(card, situation, { alarms: HERO_MOTOR_OVERLOAD.active_alarms, model })!;

  it("puts title, root and first signal first", () => {
    expect(view.title).toBe("Motor mechanical overload");
    expect(view.status).toBe("critical");
    expect(view.rootAssetId).toBe("MTR-301");
    expect(view.rootAssetName).toBe("3-Phase Motor");
    expect(view.rootAssetType).toBe("load.motor_3phase");
    expect(view.firstSignal).toMatchObject({ message: "Motor current rose first", assetName: "3-Phase Motor" });
  });

  it("orders the evidence chain by onset with offsets from the first signal", () => {
    expect(view.evidence.map((e) => e.alarmId)).toEqual(["MOTOR_CURRENT_HIGH", "MOTOR_SPEED_LOW", "DC_BUS_LOW"]);
    expect(view.evidence.map((e) => e.offset)).toEqual(["t₀", "+2.0 s", "+4.0 s"]);
    expect(view.evidence[0]!.isFirst).toBe(true);
    expect(view.evidence[2]!.assetName).toBe("DC Bus");
  });

  it("re-sorts an out-of-order chain", () => {
    const shuffled = { ...card, evidence_chain: [...card.evidence_chain].reverse() };
    const v = composeCalmCard(shuffled, situation)!;
    expect(v.evidence.map((e) => e.order)).toEqual([1, 2, 3]);
    expect(v.evidence[0]!.alarmId).toBe("MOTOR_CURRENT_HIGH");
  });

  it("carries best check, blocked actions and grouped raw alarm count", () => {
    expect(view.bestCheck).toEqual({ label: "Inspect shaft load, coupling, and bearing drag", risk: "medium", requiresIsolation: true });
    expect(view.blocked).toEqual([{ label: "Restart inverter", reason: "Blocked while motor thermal alarm is active" }]);
    expect(view.rawCount).toBe(5);
  });

  it("explains confidence from the score breakdown and margin", () => {
    expect(view.confidence.bucket).toBe("high");
    expect(view.confidence.terms.map((t) => t.key)).toEqual(["timing", "coverage", "fingerprint", "quality", "contradictions"]);
    const quality = view.confidence.terms.find((t) => t.key === "quality")!;
    expect(quality.display).toBe("75%");
    expect(quality.concern).toBe(true);
    expect(view.confidence.terms.find((t) => t.key === "contradictions")!.concern).toBe(true);
    expect(view.confidence.margin).toEqual({ value: 0.6, competitor: "BUS-101", competitorName: "DC Bus" });
  });

  it("calls out loop notes and unexplained alarms", () => {
    expect(view.loopNote).toBe("Loop entered at BUS-101.");
    expect(view.unexplained).toEqual([{ id: "DC_BUS_LOW", message: "DC bus low", assetName: "DC Bus" }]);
  });

  it("falls back to situation evidence when no card has arrived yet", () => {
    const v = composeCalmCard(null, {
      ...situation,
      evidence: [
        { alarm_id: "B", asset_id: "BUS-101", timestamp: "2026-01-01T10:00:05Z", reason: "Bus low" },
        { alarm_id: "A", asset_id: "MTR-301", timestamp: "2026-01-01T10:00:01Z", reason: "Current high" },
      ],
    })!;
    expect(v.evidence.map((e) => e.alarmId)).toEqual(["A", "B"]);
    expect(v.firstSignal?.message).toBe("Current high");
    expect(v.rawCount).toBe(5);
  });

  it("returns null without a situation or card", () => {
    expect(composeCalmCard(null, null)).toBeNull();
  });

  it("scores concern thresholds", () => {
    const t = scoreTerms({ timing: 0.5, coverage: 1, fingerprint: 1, quality_penalty: 0, contradictions: 0, margin: 1 });
    expect(t.find((x) => x.key === "timing")!.concern).toBe(true);
    expect(t.find((x) => x.key === "coverage")!.concern).toBe(false);
  });
});
