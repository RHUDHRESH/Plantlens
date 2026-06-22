import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewStatusStrip } from "../PreviewStatusStrip";
import type { PreviewCompileResult } from "../previewTypes";

const COMPILED: PreviewCompileResult = {
  status: "compiled",
  issues: [{ id: "1", severity: "info", family: "preview", targetId: null, code: "X", message: "ok", source: "local_compile" }],
  model: {
    plantId: "p1",
    generatedAt: "t",
    map2d: { nodes: [], edges: [] },
    map3d: { nodes: [], edges: [] },
    summary: {
      assetCount: 3,
      tagCount: 2,
      alarmRuleCount: 1,
      causalEdgeCount: 4,
      actionCount: 1,
      fallbackCoordinateCount: 0,
    },
  },
};

const INVALID: PreviewCompileResult = {
  status: "invalid",
  issues: [{ id: "e1", severity: "error", family: "plant", targetId: "A", code: "ERR", message: "bad", source: "draft_validation" }],
  model: null,
};

describe("PreviewStatusStrip", () => {
  it("renders compiled status", () => {
    render(
      <PreviewStatusStrip result={COMPILED} draftStatus="clean" dirtyFamilies={{ plant: false, tag_map: false, alarm_rules: false, causal_graph: false, action_envelope: false }} />,
    );
    expect(screen.getByText("Compiled")).toBeInTheDocument();
    expect(screen.getByText(/3 assets/i)).toBeInTheDocument();
  });

  it("renders invalid status", () => {
    render(
      <PreviewStatusStrip result={INVALID} draftStatus="invalid" dirtyFamilies={{ plant: false, tag_map: false, alarm_rules: false, causal_graph: false, action_envelope: false }} />,
    );
    expect(screen.getByText("Invalid")).toBeInTheDocument();
    expect(screen.getByText(/1 errors/i)).toBeInTheDocument();
  });

  it("shows local preview copy", () => {
    render(
      <PreviewStatusStrip result={COMPILED} draftStatus="clean" dirtyFamilies={{ plant: false, tag_map: false, alarm_rules: false, causal_graph: false, action_envelope: false }} />,
    );
    expect(screen.getByText(/Preview is local and read-only/i)).toBeInTheDocument();
  });

  it("shows counts", () => {
    render(
      <PreviewStatusStrip result={COMPILED} draftStatus="dirty" dirtyFamilies={{ plant: true, tag_map: false, alarm_rules: false, causal_graph: false, action_envelope: false }} />,
    );
    expect(screen.getByText(/2 tags/i)).toBeInTheDocument();
    expect(screen.getByText(/Dirty: plant/i)).toBeInTheDocument();
  });
});