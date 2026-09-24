import { describe, expect, it } from "vitest";
import { assetStatusKind, formatAge, formatClock, formatOffset, formatValue } from "./format";
import { computeClockOffset } from "./runtimeClock";
import { zoomBoxAt } from "./usePanZoom";

describe("operator formatting", () => {
  it("always carries units and renders booleans as ON/OFF", () => {
    expect(formatValue(3.4, "A")).toBe("3.40 A");
    expect(formatValue(78, "C")).toBe("78.0 °C");
    expect(formatValue(760, "rpm")).toBe("760.0 rpm");
    expect(formatValue(1, "bool")).toBe("ON");
    expect(formatValue(null, "V")).toBe("—");
  });

  it("formats clock, age and offsets", () => {
    expect(formatClock("2026-01-01T10:32:14.500Z", true)).toBe("10:32:14.5");
    expect(formatAge(42_000)).toBe("42 s");
    expect(formatAge(185_000)).toBe("3 min 05 s");
    expect(formatAge(2 * 3600_000 + 14 * 60_000)).toBe("2 h 14 min");
    expect(formatOffset(2000)).toBe("+2.0 s");
  });

  it("maps asset status to status kinds (warning → high, unknown → normal)", () => {
    expect(assetStatusKind("warning")).toBe("high");
    expect(assetStatusKind("unknown")).toBe("normal");
  });
});

describe("runtime clock", () => {
  it("estimates the offset from the request midpoint", () => {
    const sent = Date.parse("2026-09-24T00:00:00Z");
    expect(computeClockOffset("2026-06-18T12:00:00Z", sent, sent + 200)).toBe(Date.parse("2026-06-18T12:00:00Z") - (sent + 100));
    expect(computeClockOffset("nonsense", 0, 0)).toBeNull();
  });
});

describe("pan/zoom", () => {
  it("zooms around a point and clamps the scale", () => {
    const base = { x: 0, y: 0, w: 100, h: 100 };
    expect(zoomBoxAt(base, 2, 50, 50, base)).toEqual({ x: 25, y: 25, w: 50, h: 50 });
    const max = zoomBoxAt(base, 100, 0, 0, base);
    expect(max.w).toBeCloseTo(25);
  });
});
