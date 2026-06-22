import { describe, expect, it } from "vitest";
import { getInitialStudioDraftBundle } from "../../studio-forms/demoBundleLoader";
import { validateDraftBundle } from "../../studio-forms/studioDraftSchema";
import { compileLocalHmiPreview } from "../localPreviewCompiler";
import { diffPreviewAgainstCompiled } from "../previewDiff";

const COMPILED = {
  plant_id: "demo_microgrid_001",
  hmi_view_model: {
    map_2d: {
      nodes: [
        { id: "PV-101", label: "PV Array", asset_type: "source.solar", position: { x: 0, y: 0 }, status_binding: "x" },
        { id: "GHOST-ASSET", label: "Ghost", asset_type: "unknown", position: { x: 0, y: 0 }, status_binding: "x" },
      ],
      edges: [{ id: "e-old", from: "PV-101", to: "GHOST-ASSET", type: "power_flow" }],
    },
  },
};

describe("previewDiff", () => {
  const preview = compileLocalHmiPreview({
    bundle: getInitialStudioDraftBundle(),
    draftIssues: validateDraftBundle(getInitialStudioDraftBundle()),
    now: () => "fixed",
  }).model!;

  it("no compiled bundle returns empty diff", () => {
    expect(diffPreviewAgainstCompiled({ preview, compiledBundle: undefined })).toEqual([]);
  });

  it("added asset detected", () => {
    const diff = diffPreviewAgainstCompiled({ preview, compiledBundle: COMPILED });
    expect(diff.some((d) => d.change === "added" && d.kind === "asset" && d.id === "BAT-101")).toBe(true);
  });

  it("removed asset detected", () => {
    const diff = diffPreviewAgainstCompiled({ preview, compiledBundle: COMPILED });
    expect(diff.some((d) => d.change === "removed" && d.id === "GHOST-ASSET")).toBe(true);
  });

  it("unchanged asset detected", () => {
    const diff = diffPreviewAgainstCompiled({ preview, compiledBundle: COMPILED });
    expect(diff.some((d) => d.change === "unchanged" && d.id === "PV-101")).toBe(true);
  });

  it("deterministic ordering", () => {
    const first = diffPreviewAgainstCompiled({ preview, compiledBundle: COMPILED });
    const second = diffPreviewAgainstCompiled({ preview, compiledBundle: COMPILED });
    expect(first.map((d) => `${d.change}:${d.kind}:${d.id}`)).toEqual(
      second.map((d) => `${d.change}:${d.kind}:${d.id}`),
    );
    const changes = first.map((d) => d.change);
    const addedIdx = changes.indexOf("added");
    const removedIdx = changes.indexOf("removed");
    const unchangedIdx = changes.indexOf("unchanged");
    expect(addedIdx).toBeLessThan(removedIdx);
    expect(removedIdx).toBeLessThan(unchangedIdx);
  });
});