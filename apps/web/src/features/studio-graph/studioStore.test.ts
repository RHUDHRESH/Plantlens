import { beforeEach, describe, expect, it } from "vitest";
import { decideConnect, decideDropOnNode, makeIsValidConnection } from "./canvas/connectionHandlers";
import { runShortcut } from "./canvas/useStudioKeyboard";
import { canUndo } from "./model/history";
import { resetStudioStore, useStudioStore } from "./studioStore";
import { LIBRARY, assemblyWith, snapshotFor } from "./testUtils";

const S = () => useStudioStore.getState();

beforeEach(() => {
  resetStudioStore();
  S().setLibrary(LIBRARY);
});

describe("studio store commands", () => {
  it("addComponent is one undoable command and selects the new node", () => {
    const id = S().addComponent("dc_power_supply", { x: 32, y: 48 });
    expect(id).toBe("dc_power_supply_1");
    expect(S().history.present.assets).toHaveLength(1);
    expect(S().selection.nodes).toEqual([id]);
    S().undo();
    expect(S().history.present.assets).toHaveLength(0);
    expect(S().selection.nodes).toEqual([]);
    S().redo();
    expect(S().history.present.assets).toHaveLength(1);
    expect(S().addComponent("does_not_exist", { x: 0, y: 0 })).toBeNull();
  });

  it("a multi-node drag commits a single entry", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v", "bldc_fan"]));
    S().moveNodes({ dc_power_supply_1: { x: 16, y: 16 }, dc_motor_12v_1: { x: 400, y: 16 }, bldc_fan_1: { x: 800, y: 16 } });
    expect(S().history.past).toHaveLength(1);
    expect(S().history.presentLabel).toBe("Move 3 components");
    S().undo();
    expect(S().history.present.assets.map((a) => a.position_2d.y)).toEqual([0, 0, 0]);
  });

  it("no-op moves do not create undo entries", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply"]));
    S().moveNodes({ dc_power_supply_1: { x: 0, y: 0 } });
    expect(canUndo(S().history)).toBe(false);
  });

  it("deleting a selection removes attached connections in one undoable step", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v", "bldc_fan"]));
    S().connect({ fromAssetId: "dc_power_supply_1", fromPortId: "dc_out", toAssetId: "dc_motor_12v_1", toPortId: "power_in" }, "dc_power");
    S().connect({ fromAssetId: "dc_power_supply_1", fromPortId: "dc_out", toAssetId: "bldc_fan_1", toPortId: "power_in" }, "dc_power");
    S().setSelection({ nodes: ["dc_power_supply_1"], edges: [] });
    S().deleteSelection();
    expect(S().history.present.assets.map((a) => a.asset_id)).toEqual(["dc_motor_12v_1", "bldc_fan_1"]);
    expect(S().history.present.connections).toEqual([]);
    expect(S().history.presentLabel).toBe("Delete 1 component");
    S().undo();
    expect(S().history.present.connections).toHaveLength(2);
  });

  it("connect creates unapproved drafts with sequential ids", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v"]));
    const c = S().connect({ fromAssetId: "dc_power_supply_1", fromPortId: "dc_out", toAssetId: "dc_motor_12v_1", toPortId: "power_in" }, "dc_power")!;
    expect(c).toMatchObject({ connection_id: "C001", approved: false, connection_kind: "power" });
    expect(S().selection.edges).toEqual(["C001"]);
  });

  it("copy/paste and duplicate remap ids and select the copies; each is one entry", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v"]));
    S().connect({ fromAssetId: "dc_power_supply_1", fromPortId: "dc_out", toAssetId: "dc_motor_12v_1", toPortId: "power_in" }, "dc_power");
    S().setSelection({ nodes: ["dc_power_supply_1", "dc_motor_12v_1"], edges: [] });
    expect(S().copy()).toBe(true);
    const before = S().history.past.length;
    S().paste();
    expect(S().history.past.length).toBe(before + 1);
    expect(S().selection.nodes).toEqual(["dc_power_supply_2", "dc_motor_12v_2"]);
    expect(S().selection.edges).toEqual(["C002"]);
    expect(S().history.present.connections.find((c) => c.connection_id === "C002")).toMatchObject({ from_asset_id: "dc_power_supply_2", approved: false });
    S().duplicate();
    expect(S().selection.nodes).toEqual(["dc_power_supply_3", "dc_motor_12v_3"]);
  });

  it("cut removes after copying", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply"]));
    S().setSelection({ nodes: ["dc_power_supply_1"] });
    S().cut();
    expect(S().history.present.assets).toHaveLength(0);
    S().paste();
    expect(S().history.present.assets.map((a) => a.asset_id)).toEqual(["dc_power_supply_1"]);
  });

  it("rename and notes are undoable and blank names are ignored", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply"]));
    S().startRename("dc_power_supply_1");
    S().renameAsset("dc_power_supply_1", "Bench PSU");
    expect(S().renamingId).toBeNull();
    expect(S().history.present.assets[0]!.display_name).toBe("Bench PSU");
    S().renameAsset("dc_power_supply_1", "  ");
    expect(S().history.present.assets[0]!.display_name).toBe("Bench PSU");
    S().setAssetNotes("dc_power_supply_1", "left rack");
    S().undo();
    S().undo();
    expect(S().history.present.assets[0]!.display_name).toBe("DC Power Supply");
  });

  it("selectAll / clearSelection", () => {
    S().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v"]));
    S().connect({ fromAssetId: "dc_power_supply_1", fromPortId: "dc_out", toAssetId: "dc_motor_12v_1", toPortId: "power_in" }, "dc_power");
    S().selectAll();
    expect(S().selection).toEqual({ nodes: ["dc_power_supply_1", "dc_motor_12v_1"], edges: ["C001"] });
    S().clearSelection();
    expect(S().selection).toEqual({ nodes: [], edges: [] });
  });
});

describe("isValidConnection wiring", () => {
  const a = assemblyWith(["dc_power_supply", "dc_motor_12v", "plc_analog_input_module"]);
  const ref = { current: snapshotFor(a) };
  const isValid = makeIsValidConnection(ref);

  it("accepts compatible and rejects incompatible handles synchronously", () => {
    expect(isValid({ source: "dc_power_supply_1", sourceHandle: "dc_out", target: "dc_motor_12v_1", targetHandle: "power_in" })).toBe(true);
    expect(isValid({ source: "dc_power_supply_1", sourceHandle: "sense_out", target: "dc_motor_12v_1", targetHandle: "power_in" })).toBe(false);
    // Drag started at the input (loose mode): still valid, stored oriented.
    expect(isValid({ source: "dc_motor_12v_1", sourceHandle: "power_in", target: "dc_power_supply_1", targetHandle: "dc_out" })).toBe(true);
    expect(isValid({ source: "dc_power_supply_1", sourceHandle: null, target: "dc_motor_12v_1", targetHandle: "power_in" })).toBe(false);
  });

  it("read-only sessions cannot connect", () => {
    const ro = makeIsValidConnection({ current: snapshotFor(a, { readOnly: true }) });
    expect(ro({ source: "dc_power_supply_1", sourceHandle: "dc_out", target: "dc_motor_12v_1", targetHandle: "power_in" })).toBe(false);
  });

  it("decideConnect: deny never creates, warn creates", () => {
    const denied = decideConnect(ref.current, { source: "dc_power_supply_1", sourceHandle: "sense_out", target: "dc_motor_12v_1", targetHandle: "power_in" });
    expect(denied.kind).toBe("rejected");
    if (denied.kind === "rejected") {
      expect(denied.message).toMatch(/cannot connect/);
      expect(denied.fix).toBeTruthy();
    }
    const rules = snapshotFor(a).rules;
    rules.custom = [{ id: "w", name: "w", enabled: true, priority: 1, source: { categories: [], component_type_ids: [], directions: [], tags_any: [], port_ids: [] }, target: { categories: [], component_type_ids: [], directions: [], tags_any: [], port_ids: [] }, media: [], action: "warn", message: "check", fix: "" }];
    const warned = decideConnect({ ...ref.current, rules }, { source: "dc_motor_12v_1", sourceHandle: "power_in", target: "dc_power_supply_1", targetHandle: "dc_out" });
    expect(warned.kind).toBe("created");
    if (warned.kind === "created") {
      expect(warned.evaluation.verdict).toBe("warn");
      expect(warned.evaluation.proposal.fromAssetId).toBe("dc_power_supply_1");
    }
  });

  it("dropping on a node body auto-picks the best port", () => {
    const res = decideDropOnNode(ref.current, "dc_power_supply_1", "sense_out", "plc_analog_input_module_1");
    expect(res.kind).toBe("created");
    if (res.kind === "created") expect(res.evaluation.proposal.toPortId).toBe("ai_ch1");
    const none = decideDropOnNode(ref.current, "dc_motor_12v_1", "shaft_out", "plc_analog_input_module_1");
    expect(none.kind).toBe("rejected");
    expect(decideDropOnNode(ref.current, "dc_motor_12v_1", "shaft_out", "dc_motor_12v_1").kind).toBe("ignored");
  });
});

describe("keyboard shortcuts", () => {
  const actions = { nudge: (dx: number, dy: number) => calls.push(`nudge ${dx},${dy}`), fitView: () => calls.push("fit"), zoomToSelection: () => calls.push("zoomSel"), zoomIn: () => calls.push("in"), zoomOut: () => calls.push("out") };
  let calls: string[] = [];
  beforeEach(() => {
    calls = [];
    S().loadAssembly(assemblyWith(["dc_power_supply", "dc_motor_12v"]));
  });
  const opts = { readOnly: false, onOpenHelp: () => calls.push("help") };

  it("delete, undo, redo, select all, escape", () => {
    runShortcut({ type: "selectAll" }, actions, opts);
    runShortcut({ type: "delete" }, actions, opts);
    expect(S().history.present.assets).toHaveLength(0);
    runShortcut({ type: "undo" }, actions, opts);
    expect(S().history.present.assets).toHaveLength(2);
    runShortcut({ type: "redo" }, actions, opts);
    expect(S().history.present.assets).toHaveLength(0);
    runShortcut({ type: "undo" }, actions, opts);
    S().setSelection({ nodes: ["dc_motor_12v_1"] });
    runShortcut({ type: "clearSelection" }, actions, opts);
    expect(S().selection.nodes).toEqual([]);
  });

  it("rename only with exactly one node, help and view actions delegate", () => {
    S().setSelection({ nodes: ["dc_motor_12v_1"] });
    runShortcut({ type: "rename" }, actions, opts);
    expect(S().renamingId).toBe("dc_motor_12v_1");
    runShortcut({ type: "help" }, actions, opts);
    runShortcut({ type: "fitView" }, actions, opts);
    runShortcut({ type: "nudge", dx: 1, dy: 0 }, actions, opts);
    expect(calls).toEqual(["help", "fit", "nudge 1,0"]);
    runShortcut({ type: "toggleSnap" }, actions, opts);
    expect(S().snapEnabled).toBe(false);
  });

  it("read-only blocks mutating shortcuts but allows viewing ones", () => {
    const ro = { ...opts, readOnly: true };
    S().selectAll();
    expect(runShortcut({ type: "delete" }, actions, ro)).toBe(false);
    expect(S().history.present.assets).toHaveLength(2);
    expect(runShortcut({ type: "fitView" }, actions, ro)).toBe(true);
    expect(runShortcut({ type: "copy" }, actions, ro)).toBe(true);
  });
});
