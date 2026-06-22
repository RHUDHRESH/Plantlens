import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapToolbar } from "./MapToolbar";
import { getDefaultVisibleLayersForRole, type MapLayerId } from "../operational-map";

const baseProps = {
  mapMode: "2d" as const,
  onMapModeChange: vi.fn(),
  role: "operator" as const,
  onRoleChange: vi.fn(),
  visibleLayers: getDefaultVisibleLayersForRole("operator"),
  lockedLayers: ["causal_path", "status", "geometry"] as MapLayerId[],
  onToggleLayer: vi.fn(),
  showLegend: true,
  onToggleLegend: vi.fn(),
  showCausalPath: true,
  onToggleCausalPath: vi.fn(),
  causalPathLocked: false,
  density: "comfortable" as const,
  onDensityChange: vi.fn(),
  reducedMotion: false,
  canNavigateCurrentMap: true,
  zoomBand: "area" as const,
};

describe("MapToolbar", () => {
  it("renders role controls and navigation controls", () => {
    render(
      <MapToolbar
        {...baseProps}
        onFitPlant={vi.fn()}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        onFocusRoot={vi.fn()}
        hasRoot
      />,
    );
    expect(screen.getByRole("group", { name: /role lens/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /fit plant/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /zoom out/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /focus root/i })).toBeInTheDocument();
  });

  it("shows zoom band label", () => {
    render(<MapToolbar {...baseProps} onFitPlant={vi.fn()} />);
    expect(screen.getByLabelText(/zoom band: area/i)).toHaveTextContent("Area");
  });

  it("calls fit and zoom callbacks", () => {
    const onFitPlant = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    render(
      <MapToolbar
        {...baseProps}
        onFitPlant={onFitPlant}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /fit plant/i }));
    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    fireEvent.click(screen.getByRole("button", { name: /zoom out/i }));
    expect(onFitPlant).toHaveBeenCalledOnce();
    expect(onZoomIn).toHaveBeenCalledOnce();
    expect(onZoomOut).toHaveBeenCalledOnce();
  });

  it("enables navigation in 3D when current map controls exist", () => {
    render(
      <MapToolbar
        {...baseProps}
        mapMode="3d"
        canNavigateCurrentMap
        onFitPlant={vi.fn()}
        onZoomIn={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /fit plant/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /zoom in/i })).toBeEnabled();
  });

  it("disables navigation when current map controls are missing", () => {
    render(
      <MapToolbar
        {...baseProps}
        mapMode="3d"
        canNavigateCurrentMap={false}
        onFitPlant={vi.fn()}
        onZoomIn={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /fit plant/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /zoom in/i })).toHaveAttribute(
      "title",
      "Map controls loading",
    );
  });

  it("shows causal path safety lock title when not in active situation", () => {
    render(<MapToolbar {...baseProps} onFitPlant={vi.fn()} />);
    expect(screen.getByRole("button", { name: /causal path/i })).toHaveAttribute(
      "title",
      "Causal path locked by safety layer",
    );
  });

  it("shows causal path situation lock title when situation active", () => {
    render(<MapToolbar {...baseProps} causalPathLocked onFitPlant={vi.fn()} />);
    expect(screen.getByRole("button", { name: /causal path/i })).toHaveAttribute(
      "title",
      "Causal path locked while Situation is active",
    );
  });
});