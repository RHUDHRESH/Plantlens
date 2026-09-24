import { describe, expect, it } from "vitest";
import { formatClock, formatDateTime, timeTitle, toMs, utcOffsetLabel, zoneAbbreviation } from "./time";

const TS = "2026-07-01T10:32:14.560Z";

describe("time display policy", () => {
  it("formats clock times in the requested zone, 24 h", () => {
    expect(formatClock(TS, false, "UTC")).toBe("10:32:14");
    expect(formatClock(TS, true, "UTC")).toBe("10:32:14.5");
    expect(formatClock(TS, false, "Europe/Oslo")).toBe("12:32:14");
    expect(formatClock(TS, false, "Asia/Kolkata")).toBe("16:02:14");
    expect(formatClock("2026-07-01T22:00:00Z", false, "Europe/Oslo")).toBe("00:00:00");
  });

  it("formats date-times with a date roll-over in the local zone", () => {
    expect(formatDateTime("2026-07-01T23:30:00Z", "UTC")).toBe("2026-07-01 23:30:00");
    expect(formatDateTime("2026-07-01T23:30:00Z", "Europe/Oslo")).toBe("2026-07-02 01:30:00");
  });

  it("names the zone and offset for hover titles", () => {
    expect(zoneAbbreviation(TS, "UTC")).toBe("UTC");
    expect(utcOffsetLabel(TS, "UTC")).toBe("UTC+00:00");
    expect(utcOffsetLabel(TS, "Europe/Oslo")).toBe("UTC+02:00");
    expect(utcOffsetLabel("2026-01-15T12:00:00Z", "Europe/Oslo")).toBe("UTC+01:00");
    expect(timeTitle(TS, "Asia/Kolkata")).toContain("2026-07-01 16:02:14");
    expect(timeTitle(TS, "Asia/Kolkata")).toContain("UTC+05:30");
  });

  it("treats missing or invalid input as no time", () => {
    expect(formatClock(null)).toBe("—");
    expect(formatDateTime("nonsense")).toBe("—");
    expect(timeTitle(undefined)).toBe("");
    expect(toMs(new Date(Number.NaN))).toBeNull();
    expect(toMs(0)).toBe(0);
  });
});
