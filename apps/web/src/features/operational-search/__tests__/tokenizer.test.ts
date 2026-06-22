import { describe, expect, it } from "vitest";
import { normalizeText, tokenize, uniqueTokens } from "../tokenizer";

describe("tokenizer", () => {
  it("normalizes punctuation", () => {
    expect(normalizeText("  Motor-301!  ")).toBe("motor 301");
  });

  it("tokenizes MTR-301 into mtr, 301, mtr301", () => {
    const tokens = tokenize("MTR-301");
    expect(tokens).toContain("mtr");
    expect(tokens).toContain("301");
    expect(tokens).toContain("mtr301");
  });

  it("tokenizes tag IDs", () => {
    const tokens = tokenize("TAG_MTR_301_CURRENT");
    expect(tokens).toContain("tag");
    expect(tokens).toContain("mtr");
    expect(tokens).toContain("301");
    expect(tokens).toContain("current");
    expect(tokens).toContain("tagmtr301current");
  });

  it("unique tokens are deterministic", () => {
    expect(uniqueTokens(["mtr", "mtr", "301", ""])).toEqual(["mtr", "301"]);
  });
});