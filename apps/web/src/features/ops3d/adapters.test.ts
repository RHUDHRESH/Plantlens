import { describe, expect, it } from "vitest";
import { adaptMap3DViewModel } from "./adapters";

describe("adaptMap3DViewModel", () => {
  it("normalizes missing tags and alarms to empty arrays", () => {
    const view = adaptMap3DViewModel({
      nodes: [
        {
          id: "MTR-301",
          label: "Motor",
          asset_type: "load.motor_3phase",
          position: { x: 1, y: 2, z: 3 },
          status_binding: "asset_status.MTR-301",
        },
      ],
      edges: [],
    });

    expect(view.nodes[0]?.tags).toEqual([]);
    expect(view.nodes[0]?.alarms).toEqual([]);
  });

  it("does not invent status_binding when id exists", () => {
    const view = adaptMap3DViewModel({
      nodes: [
        {
          id: "BAT-101",
          label: "Battery",
          asset_type: "storage.battery",
          position: { x: 0, y: 0, z: 0 },
        },
      ],
      edges: [],
    });

    expect(view.nodes[0]?.status_binding).toBe("asset_status.BAT-101");
  });

  it("normalizes malformed position to zero fallback", () => {
    const view = adaptMap3DViewModel({
      nodes: [
        {
          id: "BUS-101",
          label: "Bus",
          asset_type: "distribution.dc_bus",
          position: { x: "bad" },
          status_binding: "asset_status.BUS-101",
        },
      ],
      edges: [],
    });

    expect(view.nodes[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});