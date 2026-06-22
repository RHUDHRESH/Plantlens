import { describe, expect, it } from "vitest";
import { expandAliases, getAliasesForToken } from "../thesaurus";

describe("thesaurus", () => {
  it("expands motor/mtr", () => {
    expect(getAliasesForToken("motor")).toContain("mtr");
    expect(getAliasesForToken("mtr")).toContain("motor");
  });

  it("expands alarm/fault", () => {
    expect(expandAliases(["fault"])).toContain("alarm");
    expect(expandAliases(["alarm"])).toContain("fault");
  });

  it("returns no duplicates", () => {
    const expanded = expandAliases(["motor", "mtr"]);
    expect(new Set(expanded).size).toBe(expanded.length);
  });

  it("preserves deterministic order", () => {
    expect(expandAliases(["motor"])).toEqual(expandAliases(["motor"]));
  });
});