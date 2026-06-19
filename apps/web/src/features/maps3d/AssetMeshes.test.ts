import { describe, expect, it } from "vitest";
import { resolveIconKey } from "../maps2d/iconRegistry";

const ASSET_MESH_KEYS = [
  "source.solar",
  "control.charge_controller",
  "storage.battery",
  "distribution.dc_bus",
  "drive.inverter",
  "load.motor_3phase",
  "load.lamp",
  "distribution.breaker",
];

describe("3D asset type mapping", () => {
  it("maps demo asset types to schematic component keys", () => {
    for (const assetType of ASSET_MESH_KEYS) {
      expect(resolveIconKey(assetType)).not.toBe("generic");
    }
  });

  it("unknown types use generic fallback key", () => {
    expect(resolveIconKey("widget.unknown")).toBe("generic");
  });
});