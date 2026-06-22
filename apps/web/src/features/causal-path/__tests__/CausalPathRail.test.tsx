import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CausalPathRail } from "../CausalPathRail";
import { buildCausalPathViewModel } from "../causalPathModel";
import { HERO_MOTOR_OVERLOAD } from "../../../test-fixtures/heroSnapshot";

const NODES = [
  {
    id: "MTR-301",
    label: "Motor",
    asset_type: "load.motor_3phase",
    position: { x: 100, y: 100 },
    status_binding: "asset_status.MTR-301",
  },
  {
    id: "BUS-101",
    label: "DC Bus",
    asset_type: "distribution.dc_bus",
    position: { x: 300, y: 100 },
    status_binding: "asset_status.BUS-101",
  },
];

const ACTIVE_VM = buildCausalPathViewModel({
  nodes: NODES,
  assetStatus: HERO_MOTOR_OVERLOAD.asset_status,
  pathAssetIds: ["MTR-301", "BUS-101"],
  affectedAssetIds: ["BUS-101"],
  selectedAssetId: "MTR-301",
  focusedAssetId: "MTR-301",
  tags: {},
  alarms: HERO_MOTOR_OVERLOAD.active_alarms,
  activeSituation: HERO_MOTOR_OVERLOAD.active_situations[0] ?? null,
  calmCard: HERO_MOTOR_OVERLOAD.latest_calm_card,
});

const EMPTY_VM = buildCausalPathViewModel({
  nodes: NODES,
  assetStatus: {},
  pathAssetIds: [],
  affectedAssetIds: [],
  selectedAssetId: null,
  focusedAssetId: null,
  tags: {},
  alarms: [],
  activeSituation: null,
  calmCard: null,
});

const railProps = {
  role: "operator" as const,
  zoomBand: "plant" as const,
  onSelectAsset: vi.fn(),
  onFocusAsset: vi.fn(),
};

describe("CausalPathRail", () => {
  it("shows quiet empty state when no active path", () => {
    render(
      <CausalPathRail
        viewModel={EMPTY_VM}
        visible
        {...railProps}
      />,
    );
    expect(screen.getByText(/No active causal path/i)).toBeInTheDocument();
  });

  it("renders path steps with root badge", () => {
    render(
      <CausalPathRail
        viewModel={ACTIVE_VM}
        visible
        {...railProps}
      />,
    );
    expect(screen.getByRole("navigation", { name: /causal path explorer/i })).toBeInTheDocument();
    expect(screen.getByText(/▲ ROOT/)).toBeInTheDocument();
    expect(screen.getByText("Motor")).toBeInTheDocument();
    expect(screen.getByText("DC Bus")).toBeInTheDocument();
  });

  it("clicking a step calls select and focus callbacks", () => {
    const onSelect = vi.fn();
    const onFocus = vi.fn();
    render(
      <CausalPathRail
        viewModel={ACTIVE_VM}
        visible
        role="operator"
        zoomBand="plant"
        onSelectAsset={onSelect}
        onFocusAsset={onFocus}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Step 2: DC Bus/i }));
    expect(onSelect).toHaveBeenCalledWith("BUS-101");
    expect(onFocus).toHaveBeenCalledWith("BUS-101");
  });

  it("step buttons are keyboard accessible", () => {
    render(
      <CausalPathRail
        viewModel={ACTIVE_VM}
        visible
        {...railProps}
      />,
    );
    const stepBtn = screen.getByRole("button", { name: /Step 1: Motor/i });
    expect(stepBtn).toHaveAttribute("aria-pressed");
    expect(stepBtn.getAttribute("aria-label")).toMatch(/Root/);
    expect(stepBtn.getAttribute("aria-label")).toMatch(/CRIT/);
    expect(stepBtn.tagName).toBe("BUTTON");
  });

  it("arrow keys move between path steps", () => {
    const onSelect = vi.fn();
    const onFocus = vi.fn();
    render(
      <CausalPathRail
        viewModel={ACTIVE_VM}
        visible
        role="operator"
        zoomBand="plant"
        onSelectAsset={onSelect}
        onFocusAsset={onFocus}
      />,
    );
    const first = screen.getByRole("button", { name: /Step 1: Motor/i });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(onSelect).toHaveBeenCalledWith("BUS-101");
    expect(onFocus).toHaveBeenCalledWith("BUS-101");
  });

  it("renders nothing when not visible", () => {
    const { container } = render(
      <CausalPathRail
        viewModel={ACTIVE_VM}
        visible={false}
        {...railProps}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});