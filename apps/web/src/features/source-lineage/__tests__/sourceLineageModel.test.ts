import { describe, expect, it } from "vitest";
import { HERO_MOTOR_OVERLOAD } from "../../../test-fixtures/heroSnapshot";
import type { MapNode } from "../../maps2d/mapTypes";
import type { Map3DNode } from "../../ops3d/map3dTypes";
import {
  buildAssetSourceLineage,
  buildStudioOpenIntent,
  isEditableSourceRef,
  type AuthoredBundleInput,
} from "../sourceLineageModel";

const NODE_2D: MapNode = {
  id: "MTR-301",
  label: "Motor",
  asset_type: "load.motor_3phase",
  position: { x: 1020, y: 210 },
  status_binding: "asset_status.MTR-301",
};

const NODE_3D: Map3DNode = {
  id: "MTR-301",
  label: "Motor",
  asset_type: "load.motor_3phase",
  position: { x: -4, y: -1, z: 0 },
  status_binding: "asset_status.MTR-301",
};

const AUTHORED_BUNDLE: AuthoredBundleInput = {
  plant: {
    assets: [{ id: "MTR-301", type: "load.motor_3phase", display_name: "3-Phase Motor" }],
  },
  tag_map: {
    tags: [{ tag: "MOTOR_301_CURRENT", asset_id: "MTR-301" }],
  },
  alarm_rules: {
    rules: [
      {
        id: "MOTOR_CURRENT_HIGH",
        tag: "MOTOR_301_CURRENT",
        asset_id: "MTR-301",
        message: "Motor current high",
      },
    ],
  },
  causal_graph: {
    nodes: [{ id: "MTR-301", label: "Motor" }],
    edges: [{ id: "E7", from: "INV-102", to: "MTR-301" }],
  },
  action_envelope: {
    actions: [{ id: "INSPECT_SHAFT_LOAD", label: "Inspect shaft load", target_asset_id: "MTR-301" }],
  },
};

const BASE_PARAMS = {
  assetId: "MTR-301",
  nodes2d: [NODE_2D],
  nodes3d: [NODE_3D],
  tags: {
    MOTOR_301_CURRENT: {
      tag_id: "MOTOR_301_CURRENT",
      asset_id: "MTR-301",
      value: 4.2,
      unit: "A",
      quality: "GOOD" as const,
      timestamp: "2026-01-01T00:00:00Z",
      source: "simulator" as const,
    },
  },
  alarms: HERO_MOTOR_OVERLOAD.active_alarms.filter((a) => a.asset_id === "MTR-301"),
  activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
  calmCard: HERO_MOTOR_OVERLOAD.latest_calm_card,
};

describe("buildAssetSourceLineage", () => {
  it("creates non-editable compiled 2D and 3D HMI refs", () => {
    const lineage = buildAssetSourceLineage(BASE_PARAMS);
    const compiled = lineage.refs.filter((r) => r.family === "hmi_view_model");
    expect(compiled).toHaveLength(2);
    for (const ref of compiled) {
      expect(ref.authored).toBe(false);
      expect(ref.editable).toBe(false);
      expect(isEditableSourceRef(ref)).toBe(false);
    }
  });

  it("creates runtime tag and alarm refs", () => {
    const lineage = buildAssetSourceLineage(BASE_PARAMS);
    expect(lineage.refs.some((r) => r.family === "runtime" && r.kind === "tag")).toBe(true);
    expect(lineage.refs.some((r) => r.family === "runtime" && r.kind === "alarm_rule")).toBe(true);
  });

  it("creates situation and calm card refs for root asset", () => {
    const lineage = buildAssetSourceLineage(BASE_PARAMS);
    expect(
      lineage.refs.some(
        (r) => r.family === "runtime" && r.reason.includes("Active situation root"),
      ),
    ).toBe(true);
    expect(
      lineage.refs.some((r) => r.family === "runtime" && r.reason.includes("Calm Card root")),
    ).toBe(true);
  });

  it("emits warnings when authored contracts are not loaded", () => {
    const lineage = buildAssetSourceLineage(BASE_PARAMS);
    expect(lineage.warnings).toContain("Authored plant contract not loaded in frontend yet.");
    expect(lineage.warnings).toContain("Authored tag map not loaded in frontend yet.");
  });

  it("creates authored refs when bundle is provided", () => {
    const lineage = buildAssetSourceLineage({
      ...BASE_PARAMS,
      authoredBundle: AUTHORED_BUNDLE,
    });
    const authored = lineage.refs.filter((r) => r.authored);
    expect(authored.length).toBeGreaterThan(0);
    expect(authored.some((r) => r.family === "plant" && r.kind === "asset")).toBe(true);
    expect(authored.some((r) => r.family === "tag_map")).toBe(true);
    expect(authored.some((r) => r.family === "alarm_rules")).toBe(true);
    expect(authored.some((r) => r.family === "causal_graph")).toBe(true);
    expect(authored.some((r) => r.family === "action_envelope")).toBe(true);
  });

  it("sorts refs deterministically", () => {
    const first = buildAssetSourceLineage({ ...BASE_PARAMS, authoredBundle: AUTHORED_BUNDLE });
    const second = buildAssetSourceLineage({ ...BASE_PARAMS, authoredBundle: AUTHORED_BUNDLE });
    expect(first.refs.map((r) => `${r.family}:${r.id}`)).toEqual(
      second.refs.map((r) => `${r.family}:${r.id}`),
    );
    expect(first.refs[0]?.authored).toBe(true);
  });

  it("does not mutate input arrays", () => {
    const nodes2d = [NODE_2D];
    const nodes3d = [NODE_3D];
    const alarms = [...BASE_PARAMS.alarms];
    buildAssetSourceLineage({ ...BASE_PARAMS, nodes2d, nodes3d, alarms });
    expect(nodes2d).toEqual([NODE_2D]);
    expect(nodes3d).toEqual([NODE_3D]);
    expect(alarms).toEqual(BASE_PARAMS.alarms);
  });
});

describe("buildStudioOpenIntent and isEditableSourceRef", () => {
  it("maps editable authored refs to edit_intent", () => {
    const lineage = buildAssetSourceLineage({
      ...BASE_PARAMS,
      authoredBundle: AUTHORED_BUNDLE,
    });
    const authored = lineage.refs.find((r) => r.family === "plant");
    expect(authored).toBeDefined();
    expect(isEditableSourceRef(authored!)).toBe(true);
    expect(buildStudioOpenIntent(authored!).mode).toBe("edit_intent");
  });

  it("marks compiled and runtime refs as non-editable", () => {
    const lineage = buildAssetSourceLineage(BASE_PARAMS);
    const compiled = lineage.refs.find((r) => r.family === "hmi_view_model");
    const runtime = lineage.refs.find((r) => r.family === "runtime");
    expect(compiled && isEditableSourceRef(compiled)).toBe(false);
    expect(runtime && isEditableSourceRef(runtime)).toBe(false);
    if (compiled) expect(buildStudioOpenIntent(compiled).mode).toBe("inspect");
  });
});