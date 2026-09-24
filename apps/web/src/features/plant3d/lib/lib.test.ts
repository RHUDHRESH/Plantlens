import { afterEach, describe, expect, it, vi } from "vitest";
import type { Map3DNode } from "../../ops3d/map3dTypes";
import { assetAlarms, assetTagRows, formatTagValue, runningAssets } from "./assetDetails";
import { easeInOutCubic, fitDistanceForBox, focusPose, presetPose } from "./camera";
import { computeNormalisation, EMPTY_MANIFEST, loadGlbManifest, parseManifest, resetGlbManifestCache, resolveGlb } from "./glbManifest";
import { autoLayout, buildPlantLayout, computeLayoutScale, detectAxisConvention, footprintRect } from "./layout";
import { footprintFor, kindForAssetType, kindForModelName, listModelKinds, MODEL_KINDS, resolveModelKind } from "./registry";
import { buildOrthogonalRoute, filletPolyline, isOrthogonal, mediumForEdgeType } from "./routing";
import { normaliseStatus, panelBadge, statusPresentation } from "./status";
import { readSceneTheme } from "./theme";

function node(id: string, type: string, x: number, y: number, z = 0, extra: Partial<Map3DNode> = {}): Map3DNode {
  return { id, label: id, asset_type: type, position: { x, y, z }, status_binding: `asset_status.${id}`, ...extra };
}

describe("registry", () => {
  it("maps the demo plant asset types to equipment kinds", () => {
    expect(kindForAssetType("load.motor_3phase")).toBe("induction_motor");
    expect(kindForAssetType("drive.inverter")).toBe("vfd_cabinet");
    expect(kindForAssetType("storage.battery")).toBe("battery_rack");
    expect(kindForAssetType("source.solar")).toBe("pv_array");
    expect(kindForAssetType("distribution.dc_bus")).toBe("dc_distribution");
    expect(kindForAssetType("control.charge_controller")).toBe("charge_controller");
    expect(kindForAssetType("load.lamp")).toBe("luminaire");
    expect(kindForAssetType("sensor.pressure")).toBe("instrument");
    expect(kindForAssetType("process.pump")).toBe("pump_set");
    expect(kindForAssetType("process.control_valve")).toBe("control_valve");
    expect(kindForAssetType("widget.unknown")).toBeNull();
  });

  it("maps coords_3d model names, with generic `box` falling back to the type", () => {
    expect(kindForModelName("solar_panel")).toBe("pv_array");
    expect(kindForModelName("battery_box")).toBe("battery_rack");
    expect(kindForModelName("busbar_box")).toBe("dc_distribution");
    expect(kindForModelName("inverter_box")).toBe("vfd_cabinet");
    expect(kindForModelName("motor_simple")).toBe("induction_motor");
    expect(kindForModelName("heat_exchanger")).toBe("heat_exchanger");
    expect(kindForModelName("box")).toBeNull();
    expect(resolveModelKind({ model: "box", assetType: "control.charge_controller" })).toBe("charge_controller");
    expect(resolveModelKind({ model: "box", assetType: "load.lamp" })).toBe("luminaire");
    expect(resolveModelKind({ model: null, assetType: "nothing.known" })).toBe("enclosure");
  });

  it("lists every kind with a positive footprint in metres", () => {
    const kinds = listModelKinds();
    expect(kinds.map((k) => k.kind)).toEqual([...MODEL_KINDS]);
    for (const k of kinds) {
      expect(k.footprint.w).toBeGreaterThan(0.2);
      expect(k.footprint.h).toBeLessThan(4);
    }
    expect(footprintFor("induction_motor", 2).w).toBeCloseTo(footprintFor("induction_motor").w * 2);
  });
});

describe("GLB manifest and fallback", () => {
  afterEach(() => resetGlbManifestCache());

  it("parses valid entries and rejects unsafe paths", () => {
    const m = parseManifest({
      version: 1,
      models: {
        induction_motor: { file: "abb_m3bp.glb", footprint: [0.8, 0.4, 0.5], license: "vendor EULA" },
        pump_set: "pump.glb",
        bad: { file: "../../etc/passwd.glb" },
        remote: { file: "https://cdn.example.com/x.glb" },
      },
    });
    expect(Object.keys(m.models).sort()).toEqual(["induction_motor", "pump_set"]);
    expect(m.models.induction_motor?.footprint).toEqual([0.8, 0.4, 0.5]);
    expect(parseManifest(null)).toEqual(EMPTY_MANIFEST);
    expect(parseManifest({ models: 3 })).toEqual(EMPTY_MANIFEST);
  });

  it("resolves asset id → model name → kind, else null (parametric model)", () => {
    const m = parseManifest({ models: { "MTR-301": "mtr301.glb", motor_simple: "m.glb", induction_motor: "k.glb" } });
    expect(resolveGlb(m, ["MTR-301", "motor_simple", "induction_motor"], "/models/")?.url).toBe("/models/mtr301.glb");
    expect(resolveGlb(m, ["MTR-999", "motor_simple", "induction_motor"], "/models/")?.key).toBe("motor_simple");
    expect(resolveGlb(m, [undefined, null, "induction_motor"], "/models/")?.key).toBe("induction_motor");
    expect(resolveGlb(EMPTY_MANIFEST, ["MTR-301", "induction_motor"])).toBeNull();
  });

  it("fetches the manifest once and falls back to empty on failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const first = await loadGlbManifest(fetchImpl as unknown as typeof fetch);
    await loadGlbManifest(fetchImpl as unknown as typeof fetch);
    expect(first).toEqual(EMPTY_MANIFEST);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("normalises an imported model into the footprint, centred and on the floor", () => {
    // a 2000 mm-unit CAD export (mm instead of m) sitting below the origin
    const n = computeNormalisation({ min: { x: 0, y: -500, z: -200 }, max: { x: 800, y: 0, z: 200 } }, { w: 0.8, d: 0.4, h: 0.5 });
    expect(n.scale).toBeCloseTo(0.001);
    expect(n.offset[0]).toBeCloseTo(-0.4);
    expect(n.offset[1]).toBeCloseTo(0.5);
    expect(n.offset[2]).toBeCloseTo(0);
  });
});

describe("layout", () => {
  const demo = [
    node("PV-101", "source.solar", 6, 0, 0, { model_key: "solar_panel", area_id: "yard" }),
    node("MPPT-101", "control.charge_controller", 4, 0, 0, { model_key: "box", area_id: "panel" }),
    node("BAT-101", "storage.battery", 2, 0, 0, { area_id: "panel" }),
    node("INV-101", "drive.inverter", -2, 1, 0, { area_id: "loads" }),
    node("INV-102", "drive.inverter", -2, -1, 0, { area_id: "loads" }),
  ];

  it("treats plant.json coords_3d as plan (x, y) with z elevation unless clearly Y-up", () => {
    expect(detectAxisConvention(demo)).toBe("z_up_plan");
    expect(detectAxisConvention([node("a", "x", 0, 0, 1), node("b", "x", 2, 0, -1)])).toBe("y_up");
  });

  it("scales plan units so real footprints never overlap", () => {
    const layout = buildPlantLayout(demo);
    for (let i = 0; i < layout.assets.length; i++) {
      for (let j = i + 1; j < layout.assets.length; j++) {
        const a = footprintRect(layout.assets[i]!);
        const b = footprintRect(layout.assets[j]!);
        const overlap = a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
        expect(overlap).toBe(false);
      }
    }
    expect(layout.scale).toBeGreaterThan(1);
    // inverters side by side in depth, not stacked in height
    const inv1 = layout.assets.find((a) => a.id === "INV-101")!;
    const inv2 = layout.assets.find((a) => a.id === "INV-102")!;
    expect(inv1.position[1]).toBe(0);
    expect(inv2.position[1]).toBe(0);
    expect(inv1.position[2]).not.toBe(inv2.position[2]);
    expect(layout.assets.find((a) => a.id === "MPPT-101")!.kind).toBe("charge_controller");
    expect(layout.areas.map((z) => z.id).sort()).toEqual(["loads", "panel", "yard"]);
  });

  it("computes the minimal separation scale", () => {
    const f = { w: 2, d: 1, h: 1 };
    expect(computeLayoutScale([{ u: 0, v: 0, footprint: f }, { u: 1, v: 0, footprint: f }], 1)).toBeCloseTo(3);
    expect(computeLayoutScale([{ u: 0, v: 0, footprint: f }, { u: 100, v: 0, footprint: f }], 1)).toBe(1);
  });

  it("auto-lays out assets without coordinates in rows by area, centred", () => {
    const fp = { w: 1, d: 1, h: 1 };
    const pos = autoLayout(
      [
        { id: "a", areaId: "x", footprint: fp },
        { id: "b", areaId: "x", footprint: fp },
        { id: "c", areaId: "y", footprint: fp },
      ],
      ["x", "y"],
      1,
      2,
    );
    expect(pos.get("a")).toEqual([-1, -1.5]);
    expect(pos.get("b")).toEqual([1, -1.5]);
    expect(pos.get("c")).toEqual([0, 1.5]);
  });

  it("places missing-coordinate assets beyond the authored ones", () => {
    const layout = buildPlantLayout([node("A", "load.motor_3phase", 0, 0), { ...node("B", "load.lamp", 0, 0), position: { x: Number.NaN, y: 0, z: 0 } }]);
    const a = footprintRect(layout.assets[0]!);
    const b = footprintRect(layout.assets[1]!);
    expect(b.minZ).toBeGreaterThan(a.maxZ);
  });
});

describe("orthogonal routing", () => {
  const a = { center: [0, 0] as [number, number], half: [0.5, 0.3] as [number, number] };
  const b = { center: [5, 2] as [number, number], half: [0.4, 0.4] as [number, number] };

  it("builds an axis-aligned route leaving and entering the facing sides", () => {
    const r = buildOrthogonalRoute(a, b, 0.05);
    expect(isOrthogonal(r)).toBe(true);
    expect(r[0]).toEqual([0.5, 0.05, 0]);
    expect(r[r.length - 1]).toEqual([4.6, 0.05, 2]);
    expect(r).toHaveLength(4);
  });

  it("is a straight run when aligned, and runs along Z when Z dominates", () => {
    expect(buildOrthogonalRoute(a, { ...b, center: [5, 0] }, 0.05)).toHaveLength(2);
    const r = buildOrthogonalRoute(a, { ...b, center: [1, 6] }, 0.05);
    expect(isOrthogonal(r)).toBe(true);
    expect(r[0]![2]).toBeCloseTo(0.3);
  });

  it("fillets corners without leaving the corner neighbourhood", () => {
    const pts = filletPolyline([[0, 0, 0], [2, 0, 0], [2, 0, 2]], 0.5, 4);
    expect(pts[0]).toEqual([0, 0, 0]);
    expect(pts[pts.length - 1]).toEqual([2, 0, 2]);
    expect(pts.length).toBe(2 + 5);
    for (const p of pts) expect(p[0]).toBeLessThanOrEqual(2 + 1e-9);
  });

  it("classifies edge media", () => {
    expect(mediumForEdgeType("power_flow")).toBe("power");
    expect(mediumForEdgeType("process")).toBe("fluid");
    expect(mediumForEdgeType("signal")).toBe("signal");
    expect(mediumForEdgeType("causal")).toBe("causal");
  });
});

describe("status → outline", () => {
  it("colours only abnormal equipment, with text labels", () => {
    expect(statusPresentation("normal")).toMatchObject({ abnormal: false, outline: null, badge: null });
    expect(statusPresentation("critical")).toMatchObject({ abnormal: true, outline: "critical", badge: "critical", label: "Critical" });
    expect(statusPresentation("warning")).toMatchObject({ outline: "warning", badge: "medium", label: "Warning" });
    expect(statusPresentation("sensor_bad").outline).toBe("sensor_bad");
    expect(statusPresentation("offline").outline).toBe("offline");
    expect(statusPresentation("garbage").outline).toBeNull();
    expect(normaliseStatus(undefined)).toBe("unknown");
    expect(panelBadge("normal")).toEqual({ kind: "normal", label: "Normal" });
  });
});

describe("theme reader", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
  });

  it("reads token CSS variables and the data-theme attribute", () => {
    const root = document.documentElement;
    root.style.setProperty("--canvas", "#101214");
    root.style.setProperty("--status-critical", "#ff0000");
    root.setAttribute("data-theme", "dark");
    const t = readSceneTheme(root);
    expect(t.isDark).toBe(true);
    expect(t.background).toBe("#101214");
    expect(t.status.critical).toBe("#ff0000");
    expect(t.accent).toMatch(/^#/); // fallback when unset
  });
});

describe("camera", () => {
  const bounds = { min: [-8, 0, -2] as [number, number, number], max: [8, 2, 2] as [number, number, number] };

  it("fits every corner of the plant box in the frustum", () => {
    const pose = presetPose(bounds, "iso", 32, 16 / 9);
    const d = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(60);
    const top = presetPose(bounds, "top", 32, 16 / 9);
    expect(top.position[1]).toBeGreaterThan(top.target[1] + 5);
    // a wider screen needs less distance
    expect(fitDistanceForBox(bounds, [0, 0, 0], [0, 0.3, 1], 32, 3)).toBeLessThan(fitDistanceForBox(bounds, [0, 0, 0], [0, 0.3, 1], 32, 1));
  });

  it("focuses an asset keeping the azimuth and a readable elevation", () => {
    const asset = { position: [4, 0, 1] as [number, number, number], footprint: { w: 0.8, d: 0.4, h: 0.5 } };
    const pose = focusPose(asset, { position: [20, 0.1, 1], target: [0, 0, 1] }, 32, 1.6);
    expect(pose.target[0]).toBe(4);
    expect(pose.position[0]).toBeGreaterThan(4);
    expect(pose.position[1]).toBeGreaterThan(pose.target[1]);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5);
  });
});

describe("asset details", () => {
  const frame = (tag_id: string, asset_id: string, value: number | null, unit: string, quality = "GOOD") =>
    ({ tag_id, asset_id, value, unit, quality, timestamp: "2026-01-01T00:00:00Z", source: "simulator" }) as never;

  it("lists live values with units, then configured tags without data", () => {
    const rows = assetTagRows(
      "MTR-301",
      { MOTOR_301_CURRENT: frame("MOTOR_301_CURRENT", "MTR-301", 12.345, "A") },
      { MOTOR_301_TEMP: { asset_id: "MTR-301", unit: "C" } },
      ["MOTOR_301_VIB"],
    );
    expect(rows[0]).toMatchObject({ tagId: "MOTOR_301_CURRENT", value: "12.3", unit: "A" });
    expect(rows.map((r) => r.tagId)).toContain("MOTOR_301_TEMP");
    expect(rows.find((r) => r.tagId === "MOTOR_301_TEMP")?.unit).toBe("C");
    expect(formatTagValue(true)).toBe("On");
    expect(formatTagValue(null)).toBe("—");
  });

  it("derives running only from good current/power readings", () => {
    const running = runningAssets({
      a: frame("a", "MTR-301", 3.4, "A"),
      b: frame("b", "LD-201", 0, "A"),
      c: frame("c", "INV-102", 9, "A", "STALE"),
    });
    expect(running).toEqual({ "MTR-301": true });
  });

  it("filters and orders alarms for the asset", () => {
    const alarms = assetAlarms("MTR-301", [
      { alarm_id: "1", asset_id: "MTR-301", tag_id: "t", severity: "warning", message: "w", raised_at: "2026-01-01T00:00:02Z", acked: false, priority: 3 },
      { alarm_id: "2", asset_id: "BUS-101", tag_id: "t", severity: "critical", message: "c", raised_at: "2026-01-01T00:00:01Z", acked: false, priority: 1 },
      { alarm_id: "3", asset_id: "MTR-301", tag_id: "t", severity: "critical", message: "c", raised_at: "2026-01-01T00:00:03Z", acked: false, priority: 1 },
    ]);
    expect(alarms.map((a) => a.alarm_id)).toEqual(["3", "1"]);
  });
});
