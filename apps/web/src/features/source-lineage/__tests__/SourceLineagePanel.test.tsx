import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { buildAssetSourceLineage, type AuthoredBundleInput } from "../sourceLineageModel";
import { SourceLineagePanel } from "../SourceLineagePanel";
import { HERO_MOTOR_OVERLOAD } from "../../../test-fixtures/heroSnapshot";

const AUTHORED_BUNDLE: AuthoredBundleInput = {
  plant: {
    assets: [{ id: "MTR-301", type: "load.motor_3phase", display_name: "3-Phase Motor" }],
  },
  tag_map: {
    tags: [{ tag: "MOTOR_301_CURRENT", asset_id: "MTR-301" }],
  },
  alarm_rules: { rules: [] },
  causal_graph: { nodes: [], edges: [] },
  action_envelope: { actions: [] },
};

const LINEAGE = buildAssetSourceLineage({
  assetId: "MTR-301",
  nodes2d: [
    {
      id: "MTR-301",
      label: "Motor",
      asset_type: "load.motor_3phase",
      position: { x: 0, y: 0 },
      status_binding: "asset_status.MTR-301",
    },
  ],
  nodes3d: [
    {
      id: "MTR-301",
      label: "Motor",
      asset_type: "load.motor_3phase",
      position: { x: 0, y: 0, z: 0 },
      status_binding: "asset_status.MTR-301",
    },
  ],
  tags: {},
  alarms: HERO_MOTOR_OVERLOAD.active_alarms.filter((a) => a.asset_id === "MTR-301"),
  activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
  calmCard: HERO_MOTOR_OVERLOAD.latest_calm_card,
  authoredBundle: AUTHORED_BUNDLE,
});

describe("SourceLineagePanel", () => {
  it("shows compact note for operator", () => {
    render(
      <SourceLineagePanel lineage={LINEAGE} role="operator" onOpenStudio={vi.fn()} />,
    );
    expect(screen.getByText(/Source model available to engineering roles/i)).toBeInTheDocument();
    expect(screen.queryByText(/Source lineage/i)).not.toBeInTheDocument();
  });

  it("shows summary counts for manager", () => {
    render(
      <SourceLineagePanel lineage={LINEAGE} role="manager" onOpenStudio={vi.fn()} />,
    );
    expect(screen.getByText(/Source model summary/i)).toBeInTheDocument();
    expect(screen.getByText(/Tags/i)).toBeInTheDocument();
    expect(screen.queryByText(/Authored source/i)).not.toBeInTheDocument();
  });

  it("shows grouped refs for engineer", () => {
    render(
      <SourceLineagePanel lineage={LINEAGE} role="engineer" onOpenStudio={vi.fn()} />,
    );
    expect(screen.getByText(/Source lineage/i)).toBeInTheDocument();
    expect(screen.getByText(/Authored source/i)).toBeInTheDocument();
    expect(screen.getByText(/Compiled HMI output/i)).toBeInTheDocument();
    expect(screen.getByText(/Runtime evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/Compiled HMI is output/i)).toBeInTheDocument();
  });

  it("calls onOpenStudio for editable authored ref", () => {
    const onOpenStudio = vi.fn();
    render(
      <SourceLineagePanel lineage={LINEAGE} role="engineer" onOpenStudio={onOpenStudio} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Open in Studio/i })[0]!);
    expect(onOpenStudio).toHaveBeenCalledOnce();
    expect(onOpenStudio.mock.calls[0]?.[0]?.mode).toBe("edit_intent");
  });

  it("disables inspect for compiled output", () => {
    render(
      <SourceLineagePanel lineage={LINEAGE} role="engineer" onOpenStudio={vi.fn()} />,
    );
    const inspectButtons = screen.getAllByRole("button", { name: /Inspect/i });
    expect(inspectButtons.length).toBeGreaterThan(0);
    for (const btn of inspectButtons) {
      expect(btn).toBeDisabled();
    }
  });
});