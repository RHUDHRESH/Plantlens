import { describe, expect, it } from "vitest";
import { getInitialStudioDraftBundle } from "../../studio-forms/demoBundleLoader";
import { validateDraftBundle } from "../../studio-forms/studioDraftSchema";
import type { StudioDraftBundle } from "../../studio-forms/studioDraftTypes";
import {
  buildFallback2DPosition,
  compileLocalHmiPreview,
} from "../localPreviewCompiler";

function clone(bundle: StudioDraftBundle): StudioDraftBundle {
  return JSON.parse(JSON.stringify(bundle)) as StudioDraftBundle;
}

describe("localPreviewCompiler", () => {
  it("invalid draft issues block compile", () => {
    const bundle = getInitialStudioDraftBundle();
    const issues = [
      ...validateDraftBundle(bundle),
      {
        id: "plant:TEST:TEST_ERROR",
        family: "plant" as const,
        targetId: "TEST",
        severity: "error" as const,
        code: "TEST_ERROR",
        message: "Forced error for compile gate.",
      },
    ];
    const result = compileLocalHmiPreview({ bundle, draftIssues: issues });
    expect(result.status).toBe("invalid");
    expect(result.model).toBeNull();
  });

  it("valid bundle compiles to model", () => {
    const bundle = getInitialStudioDraftBundle();
    const issues = validateDraftBundle(bundle);
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: issues,
      now: () => "2026-01-01T00:00:00.000Z",
    });
    expect(result.status).toBe("compiled");
    expect(result.model).not.toBeNull();
    expect(result.model!.plantId).toBe("demo_microgrid_001");
    expect(result.model!.generatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("assets become preview nodes", () => {
    const bundle = getInitialStudioDraftBundle();
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: validateDraftBundle(bundle),
      now: () => "fixed",
    });
    expect(result.model!.map2d.nodes.some((n) => n.id === "PV-101")).toBe(true);
    expect(result.model!.map2d.nodes[0]!.id).toBe("BAT-101");
  });

  it("missing coordinates create deterministic fallback positions", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const plant = bundle.plant as Record<string, unknown>;
    plant.assets = (plant.assets as Array<Record<string, unknown>>).map((a) => {
      if (a.id === "LD-201") {
        const { coords_2d: _2d, coords_3d: _3d, ...rest } = a;
        return rest;
      }
      return a;
    });
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: validateDraftBundle(bundle),
      now: () => "fixed",
    });
    const ld = result.model!.map2d.nodes.find((n) => n.id === "LD-201");
    const ldIndex = result.model!.map2d.nodes.findIndex((n) => n.id === "LD-201");
    expect(ld!.position).toEqual(buildFallback2DPosition(ldIndex));
    expect(result.model!.summary.fallbackCoordinateCount).toBe(1);
  });

  it("fallback coordinate warnings appear", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const plant = bundle.plant as Record<string, unknown>;
    plant.assets = (plant.assets as Array<Record<string, unknown>>).map((a) => {
      if (a.id === "LD-201") {
        const { coords_2d: _2d, coords_3d: _3d, ...rest } = a;
        return rest;
      }
      return a;
    });
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: validateDraftBundle(bundle),
      now: () => "fixed",
    });
    expect(result.issues.some((i) => i.code === "FALLBACK_2D_COORDS" && i.targetId === "LD-201")).toBe(
      true,
    );
  });

  it("causal graph edges become causal preview edges", () => {
    const bundle = getInitialStudioDraftBundle();
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: validateDraftBundle(bundle),
      now: () => "fixed",
    });
    expect(result.model!.map2d.edges.some((e) => e.kind === "causal" && e.id === "E1")).toBe(true);
  });

  it("summary counts are correct", () => {
    const bundle = getInitialStudioDraftBundle();
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: validateDraftBundle(bundle),
      now: () => "fixed",
    });
    const s = result.model!.summary;
    expect(s.assetCount).toBe(8);
    expect(s.tagCount).toBe(16);
    expect(s.alarmRuleCount).toBe(6);
    expect(s.causalEdgeCount).toBeGreaterThan(0);
    expect(s.actionCount).toBe(4);
  });

  it("deterministic output with supplied now()", () => {
    const bundle = getInitialStudioDraftBundle();
    const issues = validateDraftBundle(bundle);
    const a = compileLocalHmiPreview({ bundle, draftIssues: issues, now: () => "T1" });
    const b = compileLocalHmiPreview({ bundle, draftIssues: issues, now: () => "T1" });
    expect(JSON.stringify(a.model)).toBe(JSON.stringify(b.model));
  });

  it("does not mutate input bundle", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const before = JSON.stringify(bundle);
    compileLocalHmiPreview({ bundle, draftIssues: validateDraftBundle(bundle), now: () => "fixed" });
    expect(JSON.stringify(bundle)).toBe(before);
  });

  it("warns on unknown connection kind", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const plant = bundle.plant as Record<string, unknown>;
    plant.connections = [
      ...(plant.connections as Array<Record<string, unknown>>),
      { from: "PV-101", to: "BAT-101", kind: "hydraulic" },
    ];
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: validateDraftBundle(bundle),
      now: () => "fixed",
    });
    expect(result.issues.some((i) => i.code === "UNKNOWN_CONNECTION_KIND")).toBe(true);
    expect(result.model!.map2d.edges.find((e) => e.id === "conn:PV-101:BAT-101")?.kind).toBe(
      "unknown",
    );
  });

  it("warns on missing asset type", () => {
    const bundle = clone(getInitialStudioDraftBundle());
    const plant = bundle.plant as Record<string, unknown>;
    plant.assets = (plant.assets as Array<Record<string, unknown>>).map((a) => {
      if (a.id === "LD-201") {
        const { type: _type, ...rest } = a;
        return rest;
      }
      return a;
    });
    const result = compileLocalHmiPreview({
      bundle,
      draftIssues: validateDraftBundle(bundle),
      now: () => "fixed",
    });
    expect(result.issues.some((i) => i.code === "UNKNOWN_ASSET_TYPE" && i.targetId === "LD-201")).toBe(
      true,
    );
    expect(result.model!.map2d.nodes.find((n) => n.id === "LD-201")?.asset_type).toBe("unknown");
  });
});
