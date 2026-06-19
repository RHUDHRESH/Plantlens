import { describe, expect, it } from "vitest";
import { normalizeSourceQuality } from "../normalizers/normalizeSourceQuality.js";

describe("normalizers", () => {
  it("interprets decimal OPC-UA status-code strings", () => {
    expect(normalizeSourceQuality("0")).toBe("GOOD");
    expect(normalizeSourceQuality("1073741824")).toBe("UNCERTAIN");
    expect(normalizeSourceQuality("2147483648")).toBe("BAD");
  });
});
