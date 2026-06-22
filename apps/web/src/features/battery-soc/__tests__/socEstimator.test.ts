import { describe, expect, it } from "vitest";
import { estimateCoulombSoc, resolveBatterySoc, resolveDirectSoc } from "../socEstimator";
import type { BatterySocSample } from "../socTypes";

describe("socEstimator", () => {
  it("reports direct BMS SOC tag", () => {
    const samples: BatterySocSample[] = [
      {
        tag_id: "BAT_101_SOC",
        value: 72.5,
        unit: "%",
        quality: "GOOD",
        timestamp: "2026-01-01T00:00:00Z",
        signal_type: "battery.state_of_charge",
      },
    ];
    const reading = resolveDirectSoc(samples);
    expect(reading?.confidence).toBe("reported");
    expect(reading?.percent).toBe(72.5);
    expect(reading?.detail).toMatch(/BMS/i);
  });

  it("warns when direct SOC quality is not GOOD", () => {
    const reading = resolveDirectSoc([
      {
        tag_id: "BMS_SOC",
        value: 50,
        unit: "%",
        quality: "STALE",
        timestamp: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(reading?.warnings.some((w) => w.includes("STALE"))).toBe(true);
  });

  it("does not estimate coulomb SOC without all inputs", () => {
    const reading = resolveBatterySoc({
      assetId: "BAT-101",
      assetType: "storage.battery",
      samples: [
        {
          tag_id: "BAT_101_V",
          value: 24.1,
          unit: "V",
          quality: "GOOD",
          timestamp: "2026-01-01T00:00:00Z",
          signal_type: "electrical.voltage.dc",
        },
      ],
      config: { chemistry: "LiFePO4" },
    });
    expect(reading.confidence).toBe("unavailable");
    expect(reading.detail).toMatch(/missing required authored inputs/i);
    expect(reading.percent).toBeNull();
  });

  it("estimates coulomb SOC when inputs and history exist", () => {
    const samples: BatterySocSample[] = [
      {
        tag_id: "BAT_101_I",
        value: 2,
        unit: "A",
        quality: "GOOD",
        timestamp: "2026-01-01T01:00:00Z",
      },
    ];
    const reading = estimateCoulombSoc(
      samples,
      {
        capacity_Ah: 100,
        initial_soc_percent: 80,
        current_sign: "positive_discharge",
      },
      [
        { current_A: 2, timestamp: "2026-01-01T00:00:00Z" },
        { current_A: 2, timestamp: "2026-01-01T01:00:00Z" },
      ],
    );
    expect(reading?.confidence).toBe("estimated");
    expect(reading?.percent).toBe(78);
  });

  it("refuses unknown current sign convention", () => {
    const reading = estimateCoulombSoc(
      [{ tag_id: "BAT_I", value: 1, unit: "A", quality: "GOOD", timestamp: "t" }],
      { capacity_Ah: 10, initial_soc_percent: 50 },
      [
        { current_A: 1, timestamp: "2026-01-01T00:00:00Z" },
        { current_A: 1, timestamp: "2026-01-01T01:00:00Z" },
      ],
    );
    expect(reading?.confidence).toBe("unavailable");
    expect(reading?.warnings.some((w) => w.includes("sign convention"))).toBe(true);
  });

  it("does not fake SOC from voltage alone", () => {
    const reading = resolveBatterySoc({
      assetId: "BAT-101",
      assetType: "storage.battery",
      samples: [
        {
          tag_id: "BAT_101_V",
          value: 25.6,
          unit: "V",
          quality: "GOOD",
          timestamp: "2026-01-01T00:00:00Z",
        },
      ],
      config: {
        chemistry: "LiFePO4",
        ocv_table: [{ voltage_v: 24, soc_percent: 50 }],
        ocv_rest_valid: true,
      },
    });
    expect(reading.confidence).toBe("unavailable");
    expect(reading.percent).toBeNull();
  });
});