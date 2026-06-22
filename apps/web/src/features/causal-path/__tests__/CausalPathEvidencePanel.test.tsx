import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CausalPathEvidencePanel } from "../CausalPathEvidencePanel";
import { buildCausalPathViewModel } from "../causalPathModel";
import { getDefaultVisibleLayersForRole } from "../../operational-map";
import { HERO_MOTOR_OVERLOAD } from "../../../test-fixtures/heroSnapshot";
import type { TagFrame } from "../../../app/schemas/tagFrame";

const NODES = [
  {
    id: "MTR-301",
    label: "Motor",
    asset_type: "load.motor_3phase",
    position: { x: 100, y: 100 },
    status_binding: "asset_status.MTR-301",
  },
];

const TAGS: Record<string, TagFrame> = {
  t1: {
    tag_id: "MOTOR_301_CURRENT",
    asset_id: "MTR-301",
    value: 42,
    unit: "A",
    quality: "GOOD",
    timestamp: "2026-01-01T00:00:00Z",
    source: "simulator",
  },
  t2: {
    tag_id: "MOTOR_301_TEMP",
    asset_id: "MTR-301",
    value: 90,
    unit: "C",
    quality: "BAD",
    timestamp: "2026-01-01T00:00:00Z",
    source: "simulator",
  },
};

function buildVm(calmCard = HERO_MOTOR_OVERLOAD.latest_calm_card) {
  return buildCausalPathViewModel({
    nodes: NODES,
    assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
    pathAssetIds: ["MTR-301"],
    affectedAssetIds: [],
    selectedAssetId: "MTR-301",
    focusedAssetId: "MTR-301",
    tags: TAGS,
    alarms: HERO_MOTOR_OVERLOAD.active_alarms,
    activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
    calmCard,
  });
}

const panelProps = {
  zoomBand: "plant" as const,
  onSelectAsset: vi.fn(),
  onFocusAsset: vi.fn(),
};

describe("CausalPathEvidencePanel", () => {
  it("operator hides full tag evidence", () => {
    render(
      <CausalPathEvidencePanel
        viewModel={buildVm()}
        role="operator"
        visibleLayers={getDefaultVisibleLayersForRole("operator")}
        {...panelProps}
      />,
    );
    expect(screen.getByText(/Summary/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Tag evidence$/i })).not.toBeInTheDocument();
    expect(screen.queryByText("MOTOR_301_CURRENT")).not.toBeInTheDocument();
  });

  it("engineer shows tag evidence", () => {
    render(
      <CausalPathEvidencePanel
        viewModel={buildVm()}
        role="engineer"
        visibleLayers={getDefaultVisibleLayersForRole("engineer")}
        {...panelProps}
      />,
    );
    expect(screen.getByRole("heading", { name: /^Tag evidence$/i })).toBeInTheDocument();
    expect(screen.getByText("MOTOR_301_CURRENT")).toBeInTheDocument();
  });

  it("maintenance shows bad quality evidence", () => {
    render(
      <CausalPathEvidencePanel
        viewModel={buildVm()}
        role="maintenance"
        visibleLayers={getDefaultVisibleLayersForRole("maintenance")}
        {...panelProps}
      />,
    );
    expect(screen.getByRole("heading", { name: /^Bad quality tags$/i })).toBeInTheDocument();
    expect(screen.getByText(/MOTOR_301_TEMP/)).toBeInTheDocument();
  });

  it("manager hides tag spam", () => {
    render(
      <CausalPathEvidencePanel
        viewModel={buildVm()}
        role="manager"
        visibleLayers={getDefaultVisibleLayersForRole("manager")}
        {...panelProps}
      />,
    );
    expect(screen.getByText(/Path summary/i)).toBeInTheDocument();
    expect(screen.queryByText("MOTOR_301_CURRENT")).not.toBeInTheDocument();
  });

  it("shows no fake recommended action when absent", () => {
    render(
      <CausalPathEvidencePanel
        viewModel={buildVm(null)}
        role="operator"
        visibleLayers={getDefaultVisibleLayersForRole("operator")}
        {...panelProps}
      />,
    );
    expect(screen.queryByText(/Inspect shaft load/i)).not.toBeInTheDocument();
  });

  it("open raw alarms callback appears when alarms exist", () => {
    const onOpen = vi.fn();
    render(
      <CausalPathEvidencePanel
        viewModel={buildVm()}
        role="operator"
        visibleLayers={getDefaultVisibleLayersForRole("operator")}
        onSelectAsset={vi.fn()}
        onFocusAsset={vi.fn()}
        zoomBand="plant"
        onOpenRawAlarms={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Open raw alarms/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("open asset detail calls onSelectAsset", () => {
    const onSelect = vi.fn();
    render(
      <CausalPathEvidencePanel
        viewModel={buildVm()}
        role="operator"
        visibleLayers={getDefaultVisibleLayersForRole("operator")}
        onSelectAsset={onSelect}
        onFocusAsset={vi.fn()}
        zoomBand="plant"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Open asset detail/i }));
    expect(onSelect).toHaveBeenCalledWith("MTR-301");
  });
});