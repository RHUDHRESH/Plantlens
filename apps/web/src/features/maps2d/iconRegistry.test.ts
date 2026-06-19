import { describe, expect, it } from "vitest";
import { DEMO_ASSET_TYPES, resolveIconKey } from "./iconRegistry";

describe("iconRegistry", () => {
  it("resolves every demo asset type to a known icon", () => {
    for (const assetType of DEMO_ASSET_TYPES) {
      expect(resolveIconKey(assetType)).not.toBe("generic");
    }
  });

  it("falls back for unknown asset types", () => {
    expect(resolveIconKey("unknown.widget")).toBe("generic");
  });

  it("maps sensor.* variants to sensor icon", () => {
    expect(resolveIconKey("sensor.temperature")).toBe("sensor");
  });
});