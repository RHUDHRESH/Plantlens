import { describe, expect, it } from "vitest";
import type { PlantAssembly, PlantConnection } from "../../../app/schemas/plantAssembly";
import type { ComponentTemplate } from "../componentLibraryTypes";
import {
  addAsset,
  addConnection,
  asDraft,
  buildConnectionFromPorts,
  emptyAssembly,
  moveAssets,
  nextAssetId,
  nextConnectionId,
  reconnect,
  removeElements,
  setLoopOk,
  updateAsset,
  updateConnection,
} from "./assemblyOps";
import { copySelection, isClipboardPayload, pasteClipboard } from "./clipboard";
import {
  alignRects,
  boundsOf,
  computeAlignment,
  distributeRects,
  findFreeSpot,
  nearbyRects,
  overlaps,
  snap,
  snapPoint,
  type Rect,
} from "./geometry";
import { canRedo, canUndo, createHistory, historyReducer, redoLabel, undoLabel } from "./history";
import { layoutPorts, NODE_HEADER, NODE_WIDTH, PORT_ROW, portSummary } from "./portLayout";
import { isEditableTarget, resolveShortcut } from "./shortcuts";

const TEMPLATE: ComponentTemplate = {
  component_type_id: "dc_motor_12v",
  display_name: "12V DC Motor",
  category: "actuation_mechanical",
  description: "",
  version: "1",
  manufacturer_neutral: true,
  physical_domain: "electromechanical",
  ports: [
    { port_id: "power_in", name: "Power", direction: "input", medium: "dc_power", quantity_kind: "voltage", required: true },
    { port_id: "shaft_out", name: "Shaft", direction: "output", medium: "mechanical_rotation", quantity_kind: "rpm", required: true },
    { port_id: "sense_out", name: "Sense", direction: "output", medium: "analog_signal", quantity_kind: "current", required: true },
  ],
  signal_templates: [{ signal_template_id: "s1", name: "S", quantity_kind: "current", unit: "A" }],
  fault_modes: [{ fault_mode_id: "f1", title: "F", severity: "warning", operator_actions: [] }],
  recommended_sensors: [],
  safety_notes: [],
  tags: [],
  visual_asset: { icon_kind: "render_hint", node_shape: "", low_poly_shape: "", accent_role: "", preview_label: "", size_hint: { width: 1, height: 1 } },
};

function conn(id: string, from: string, to: string, approved = false): PlantConnection {
  return { connection_id: id, from_asset_id: from, from_port_id: "shaft_out", to_asset_id: to, to_port_id: "power_in", connection_kind: "mechanical", approved, lag_min_ms: 0, lag_max_ms: 100, notes: "" };
}

function withAssets(n: number): PlantAssembly {
  let a = emptyAssembly("p1");
  for (let i = 0; i < n; i += 1) a = addAsset(a, TEMPLATE, { x: i * 300, y: 0 }).assembly;
  return a;
}

describe("assemblyOps", () => {
  it("allocates ids without reuse after deletion", () => {
    expect(nextAssetId("m", ["m_1", "m_3", "x_9"])).toBe("m_4");
    expect(nextConnectionId([{ connection_id: "C001" }, { connection_id: "C010" }, { connection_id: "weird" }])).toBe("C011");
  });

  it("adds assets with every port/signal/fault configured and rounded positions", () => {
    const { assembly, assetId } = addAsset(emptyAssembly(), TEMPLATE, { x: 10.6, y: 20.2 });
    expect(assetId).toBe("dc_motor_12v_1");
    expect(assembly.assets[0]).toMatchObject({ position_2d: { x: 11, y: 20 }, configured_ports: ["power_in", "shaft_out", "sense_out"], configured_signals: ["s1"], enabled_fault_modes: ["f1"] });
  });

  it("moveAssets is a no-op (same object) when nothing moved", () => {
    const a = withAssets(2);
    expect(moveAssets(a, { dc_motor_12v_1: { x: 0, y: 0 } })).toBe(a);
    const moved = moveAssets(a, { dc_motor_12v_1: { x: 16, y: 32 } });
    expect(moved).not.toBe(a);
    expect(moved.assets[1]).toBe(a.assets[1]); // structural sharing
  });

  it("removing a node removes its connections and loop flags", () => {
    let a = withAssets(3);
    a = addConnection(a, conn("C001", "dc_motor_12v_1", "dc_motor_12v_2"));
    a = addConnection(a, conn("C002", "dc_motor_12v_2", "dc_motor_12v_3"));
    a = setLoopOk(a, "C001", true);
    const b = removeElements(a, ["dc_motor_12v_1"], []);
    expect(b.assets.map((x) => x.asset_id)).toEqual(["dc_motor_12v_2", "dc_motor_12v_3"]);
    expect(b.connections.map((c) => c.connection_id)).toEqual(["C002"]);
    expect(b.metadata.loop_ok_connection_ids).toBeUndefined();
    expect(removeElements(b, [], [])).toBe(b);
  });

  it("new connections are drafts with non-colliding ids", () => {
    const c = buildConnectionFromPorts("A", "dc_out", "B", "power_in", "dc_power", [{ connection_id: "C001" }, { connection_id: "C003" }]);
    expect(c).toMatchObject({ connection_id: "C004", approved: false, connection_kind: "power" });
    const a = addConnection(withAssets(2), { ...c, approved: true });
    expect(a.connections[0]!.approved).toBe(false);
  });

  it("updateConnection edits lag/notes only and keeps the window ordered", () => {
    const a = addConnection(withAssets(2), conn("C001", "dc_motor_12v_1", "dc_motor_12v_2"));
    const b = updateConnection(a, "C001", { lag_min_ms: 500 });
    expect(b.connections[0]).toMatchObject({ lag_min_ms: 500, lag_max_ms: 500 });
    expect(updateConnection(b, "C001", { lag_min_ms: 500 })).toBe(b);
  });

  it("reconnect returns the connection to draft", () => {
    const a = { ...withAssets(3), connections: [conn("C001", "dc_motor_12v_1", "dc_motor_12v_2", true)] };
    const b = reconnect(a, "C001", { fromAssetId: "dc_motor_12v_1", fromPortId: "sense_out", toAssetId: "dc_motor_12v_3", toPortId: "power_in" }, "analog_signal");
    expect(b.connections[0]).toMatchObject({ to_asset_id: "dc_motor_12v_3", approved: false, connection_kind: "signal" });
  });

  it("updateAsset trims labels, ignores blanks and stores notes in overrides", () => {
    const a = withAssets(1);
    expect(updateAsset(a, "dc_motor_12v_1", { display_name: "   " })).toBe(a);
    const b = updateAsset(a, "dc_motor_12v_1", { display_name: " Fan motor ", notes: "belt side" });
    expect(b.assets[0]).toMatchObject({ display_name: "Fan motor", overrides: { notes: "belt side" } });
    expect(updateAsset(b, "dc_motor_12v_1", { notes: "" }).assets[0]!.overrides).toEqual({});
  });

  it("asDraft strips approvals from imported assemblies", () => {
    const a = { ...withAssets(2), connections: [conn("C001", "dc_motor_12v_1", "dc_motor_12v_2", true)] };
    expect(asDraft(a, "p2")).toMatchObject({ plant_id: "p2", connections: [{ approved: false }] });
  });
});

describe("history (undo/redo)", () => {
  it("commits, undoes and redoes with labels", () => {
    let h = createHistory(1);
    h = historyReducer(h, { type: "commit", next: 2, label: "two" });
    h = historyReducer(h, { type: "commit", next: 3, label: "three" });
    expect(undoLabel(h)).toBe("three");
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(2);
    expect(redoLabel(h)).toBe("three");
    expect(undoLabel(h)).toBe("two");
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(3);
    expect(canRedo(h)).toBe(false);
  });

  it("a new commit clears the redo stack; identical states are ignored", () => {
    let h = createHistory("a");
    h = historyReducer(h, { type: "commit", next: "b", label: "b" });
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "commit", next: "c", label: "c" });
    expect(canRedo(h)).toBe(false);
    expect(historyReducer(h, { type: "commit", next: "c", label: "same" })).toBe(h);
  });

  it("caps the stack", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 250; i += 1) h = historyReducer(h, { type: "commit", next: i, label: `${i}` });
    expect(h.past).toHaveLength(200);
    expect(h.past[0]!.state).toBe(50);
  });

  it("undo/redo on empty stacks are no-ops and reset clears", () => {
    const h = createHistory(1);
    expect(historyReducer(h, { type: "undo" })).toBe(h);
    expect(historyReducer(h, { type: "redo" })).toBe(h);
    const r = historyReducer(historyReducer(h, { type: "commit", next: 2, label: "x" }), { type: "reset", present: 9 });
    expect(r.present).toBe(9);
    expect(canUndo(r)).toBe(false);
  });
});

describe("clipboard", () => {
  const base = (() => {
    let a = withAssets(3);
    a = addConnection(a, conn("C001", "dc_motor_12v_1", "dc_motor_12v_2", true));
    a = addConnection(a, conn("C002", "dc_motor_12v_2", "dc_motor_12v_3"));
    return a;
  })();

  it("copies only internal connections", () => {
    const clip = copySelection(base, ["dc_motor_12v_1", "dc_motor_12v_2"])!;
    expect(clip.assets).toHaveLength(2);
    expect(clip.connections.map((c) => c.connection_id)).toEqual(["C001"]);
    expect(isClipboardPayload(clip)).toBe(true);
    expect(copySelection(base, [])).toBeNull();
  });

  it("pastes with remapped ids, offset, fresh connection ids and drafts", () => {
    const clip = copySelection(base, ["dc_motor_12v_1", "dc_motor_12v_2"])!;
    const r = pasteClipboard(base, clip, { offset: { x: 32, y: 32 } });
    expect(r.assetIds).toEqual(["dc_motor_12v_4", "dc_motor_12v_5"]);
    expect(r.idMap).toEqual({ dc_motor_12v_1: "dc_motor_12v_4", dc_motor_12v_2: "dc_motor_12v_5" });
    const pasted = r.assembly.connections.find((c) => c.connection_id === r.connectionIds[0])!;
    expect(pasted).toMatchObject({ connection_id: "C003", from_asset_id: "dc_motor_12v_4", to_asset_id: "dc_motor_12v_5", approved: false });
    expect(r.assembly.assets.find((a) => a.asset_id === "dc_motor_12v_4")!.position_2d).toEqual({ x: 32, y: 32 });
    // The source is untouched.
    expect(base.assets).toHaveLength(3);
  });

  it("pastes at an anchor (top-left of the copied bounds)", () => {
    const clip = copySelection(base, ["dc_motor_12v_2", "dc_motor_12v_3"])!;
    const r = pasteClipboard(base, clip, { anchor: { x: 1000, y: 500 } });
    expect(r.assembly.assets.slice(-2).map((a) => a.position_2d)).toEqual([{ x: 1000, y: 500 }, { x: 1300, y: 500 }]);
  });

  it("pasting twice never collides", () => {
    const clip = copySelection(base, ["dc_motor_12v_1"])!;
    const once = pasteClipboard(base, clip, { offset: { x: 32, y: 32 } }).assembly;
    const twice = pasteClipboard(once, clip, { offset: { x: 64, y: 64 } });
    expect(new Set(twice.assembly.assets.map((a) => a.asset_id)).size).toBe(5);
  });
});

describe("geometry", () => {
  const R = (id: string, x: number, y: number, width = 100, height = 50): Rect => ({ id, x, y, width, height });

  it("snaps to the 16 px grid", () => {
    expect(snap(7)).toBe(0);
    expect(snap(8)).toBe(16);
    expect(snap(-9)).toBe(-16);
    expect(snapPoint({ x: 31, y: 33 })).toEqual({ x: 32, y: 32 });
  });

  it("aligns left edges within the threshold and draws a vertical guide", () => {
    const res = computeAlignment(R("m", 104, 300, 60), [R("a", 100, 0)], 6);
    expect(res.dx).toBe(-4);
    expect(res.dy).toBe(0);
    expect(res.guides).toEqual([{ orientation: "vertical", pos: 100, from: 0, to: 350 }]);
    // Same-width nodes: left, centre and right all line up → three guides.
    expect(computeAlignment(R("m", 104, 300), [R("a", 100, 0)], 6).guides.map((g) => g.pos)).toEqual([100, 150, 200]);
  });

  it("aligns centres and picks the closest candidate per axis", () => {
    const res = computeAlignment(R("m", 300, 13, 100, 60), [R("a", 0, 0, 100, 80), R("b", 0, 12, 100, 50)], 6);
    // centre y of a = 40, moving centre = 43 → dy -3; top of b = 12 vs 13 → dy -1 (closer wins)
    expect(res.dy).toBe(-1);
    expect(res.guides.every((g) => g.orientation === "horizontal")).toBe(true);
  });

  it("does nothing outside the threshold", () => {
    expect(computeAlignment(R("m", 150, 300), [R("a", 0, 0)], 6)).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it("filters to nearby rects", () => {
    expect(nearbyRects(R("m", 0, 0), [R("a", 50, 50), R("b", 5000, 5000)], 200).map((r) => r.id)).toEqual(["a"]);
  });

  it("aligns and distributes", () => {
    const rects = [R("a", 0, 0), R("b", 50, 100, 200), R("c", 400, 40)];
    expect(alignRects(rects, "left")).toEqual({ a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, c: { x: 0, y: 40 } });
    expect(alignRects(rects, "right").b).toEqual({ x: 300, y: 100 });
    expect(alignRects(rects, "vcenter").a).toEqual({ x: 0, y: 50 });
    expect(alignRects([rects[0]!], "left")).toEqual({});
    const d = distributeRects([R("a", 0, 0), R("b", 130, 0), R("c", 400, 0)], "horizontal");
    // span 500, widths 300 → gap 100
    expect(d).toEqual({ a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 400, y: 0 } });
    expect(distributeRects(rects.slice(0, 2), "vertical")).toEqual({});
    expect(boundsOf(rects)).toMatchObject({ x: 0, y: 0, width: 500, height: 150 });
  });

  it("finds the nearest free spot", () => {
    const others = [R("a", 0, 0, 100, 100)];
    expect(overlaps(R("x", 50, 50), others[0]!)).toBe(true);
    const p = findFreeSpot({ x: 0, y: 0 }, { width: 100, height: 100 }, others);
    expect(others.some((o) => overlaps({ id: "p", ...p, width: 100, height: 100 }, o, 16))).toBe(false);
    expect(findFreeSpot({ x: 500, y: 500 }, { width: 10, height: 10 }, others)).toEqual({ x: 500, y: 500 });
  });
});

describe("port layout", () => {
  it("puts inputs left, outputs right and bidirectional on the shorter side", () => {
    const l = layoutPorts([
      ...TEMPLATE.ports,
      { port_id: "bus", name: "Bus", direction: "bidirectional", medium: "ethernet", quantity_kind: "data", required: false },
    ]);
    expect(l.left.map((p) => p.port.port_id)).toEqual(["power_in", "bus"]);
    expect(l.right.map((p) => p.port.port_id)).toEqual(["shaft_out", "sense_out"]);
    expect(l.byId.bus!.offsetY).toBe(NODE_HEADER + PORT_ROW + PORT_ROW / 2);
    expect(l.width).toBe(NODE_WIDTH);
    expect(l.byId.power_in!.fullWidth).toBe(false);
  });

  it("gives a label the full width when the opposite row is empty", () => {
    const l = layoutPorts(TEMPLATE.ports);
    expect(l.byId.sense_out!.fullWidth).toBe(true);
    expect(portSummary(TEMPLATE.ports)).toBe("1 in · 2 out");
  });
});

describe("shortcuts", () => {
  const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  });

  it("maps edit shortcuts on both platforms", () => {
    expect(resolveShortcut(k("z", { ctrlKey: true }), false)).toEqual({ type: "undo" });
    expect(resolveShortcut(k("Z", { ctrlKey: true, shiftKey: true }), false)).toEqual({ type: "redo" });
    expect(resolveShortcut(k("y", { ctrlKey: true }), false)).toEqual({ type: "redo" });
    expect(resolveShortcut(k("z", { metaKey: true }), true)).toEqual({ type: "undo" });
    expect(resolveShortcut(k("z", { ctrlKey: true }), true)).toBeNull();
    expect(resolveShortcut(k("a", { ctrlKey: true }), false)).toEqual({ type: "selectAll" });
    expect(resolveShortcut(k("c", { ctrlKey: true }), false)).toEqual({ type: "copy" });
    expect(resolveShortcut(k("v", { ctrlKey: true }), false)).toEqual({ type: "paste" });
    expect(resolveShortcut(k("d", { ctrlKey: true }), false)).toEqual({ type: "duplicate" });
  });

  it("maps plain keys", () => {
    expect(resolveShortcut(k("Delete"))).toEqual({ type: "delete" });
    expect(resolveShortcut(k("Backspace"))).toEqual({ type: "delete" });
    expect(resolveShortcut(k("Escape"))).toEqual({ type: "clearSelection" });
    expect(resolveShortcut(k("F2"))).toEqual({ type: "rename" });
    expect(resolveShortcut(k("?", { shiftKey: true }))).toEqual({ type: "help" });
    expect(resolveShortcut(k("ArrowLeft"))).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(resolveShortcut(k("ArrowDown", { shiftKey: true }))).toEqual({ type: "nudge", dx: 0, dy: 10 });
    expect(resolveShortcut(k("!", { shiftKey: true }))).toEqual({ type: "fitView" });
    expect(resolveShortcut(k("@", { shiftKey: true }))).toEqual({ type: "zoomToSelection" });
    expect(resolveShortcut(k("g"))).toEqual({ type: "toggleSnap" });
    expect(resolveShortcut(k("x"))).toBeNull();
    expect(resolveShortcut(k("Delete", { altKey: true }))).toBeNull();
  });

  it("recognises text fields", () => {
    const input = document.createElement("input");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(checkbox)).toBe(false);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("div"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
