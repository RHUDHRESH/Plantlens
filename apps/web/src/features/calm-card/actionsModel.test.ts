import { describe, expect, it } from "vitest";
import type { RuntimeAction } from "../../api/v2";
import { orderActions } from "./actionsModel";

const base: RuntimeAction = {
  action_id: "A",
  label: "Action",
  allowed: true,
  reason: null,
  allowed_roles: ["operator", "maintenance"],
  blocking_alarms: [],
  risk_level: "medium",
  requires_isolation: false,
  requires_operator_confirm: false,
  plc_permission_required: false,
  safety_note: null,
  target_asset_id: "MTR-301",
};

describe("orderActions", () => {
  it("puts permitted checks first and keeps envelope order within each group", () => {
    const out = orderActions(
      [
        { ...base, action_id: "B1", allowed: false, reason: "x" },
        { ...base, action_id: "P1" },
        { ...base, action_id: "B2", allowed: false, reason: "y", allowed_roles: [] },
        { ...base, action_id: "P2" },
      ],
      "operator",
    );
    expect(out.map((a) => a.id)).toEqual(["P1", "P2", "B1", "B2"]);
    expect(out[0]!.reason).toBeNull();
  });

  it("explains role blocks in plain language and passes envelope messages through", () => {
    const [role] = orderActions([{ ...base, allowed: false, reason: "Role 'viewer' is not permitted" }], "viewer");
    expect(role!.reason).toBe("Not for the Viewer role. Operator or Maintenance can carry this out.");
    const [alarm] = orderActions(
      [{ ...base, allowed: false, reason: "Blocked while motor hot.", blocking_alarms: ["MOTOR_TEMP_HIGH"] }],
      "operator",
    );
    expect(alarm!.reason).toBe("Blocked while motor hot.");
  });

  it("carries safety notes, isolation and on-site confirmation, never a control affordance", () => {
    const [a] = orderActions(
      [{ ...base, requires_isolation: true, requires_operator_confirm: true, plc_permission_required: true, safety_note: "Follow LOTO." }],
      "operator",
    );
    expect(a!.notes).toEqual([
      "Isolate before touching",
      "Needs operator confirmation on site",
      "Done from the plant's own controls, not PlantLens",
      "Follow LOTO.",
    ]);
  });

  it("handles no data", () => {
    expect(orderActions(undefined, "operator")).toEqual([]);
  });
});
