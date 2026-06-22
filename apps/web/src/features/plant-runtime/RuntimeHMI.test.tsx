import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuntimeHMI } from "./RuntimeHMI";
import { useRuntimeStore } from "../../app/store/runtime";
import { motorObstructionHmiState } from "../hmi-state/__fixtures__/plantHmiState.fixture";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { getDefaultVisibleLayersForRole, useOperationalMapStore } from "../operational-map";
import type { PlantMap2DProps } from "../maps2d/PlantMap2D";
import type { PlantMap3DProps } from "../maps3d/PlantMap3D";

let latestMap2dProps: PlantMap2DProps | null = null;
let latestMap3dProps: PlantMap3DProps | null = null;

vi.mock("../maps2d/PlantMap2D", () => ({
  PlantMap2D: (props: PlantMap2DProps) => {
    latestMap2dProps = props;
    return (
      <div data-testid="plant-map-2d">
        <button type="button" onClick={() => props.onSelectAsset?.("MTR-301")}>
          Select MTR-301
        </button>
      </div>
    );
  },
}));

vi.mock("../maps3d/LazyPlantMap3D", () => ({
  LazyPlantMap3D: (props: PlantMap3DProps & { webglAvailable: boolean; onSwitch2D: () => void }) => {
    latestMap3dProps = props;
    return <div data-testid="plant-map-3d" />;
  },
}));

vi.mock("../../api/client", () => ({
  issueDevToken: vi.fn().mockResolvedValue("test-token"),
  getCompiledBundle: vi.fn(),
  escalateIncident: vi.fn(),
}));

vi.mock("../../api/ws", () => ({
  connectRuntimeSocket: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock("../../api/hmi", () => ({
  getRuntimeHmiState: vi.fn().mockRejectedValue(new Error("hmi offline")),
  isRuntimeEndpointUnavailable: vi.fn(() => true),
}));

import { getCompiledBundle } from "../../api/client";
import { getRuntimeHmiState } from "../../api/hmi";

const COMPILED_FIXTURE = {
  plant_id: "demo_microgrid_001",
  content_hash: "abc123",
  version: "1.0.0",
  hmi_view_model: {
    view_id: "demo",
    version: "1.0.0",
    map_2d: {
      nodes: [
        {
          id: "MTR-301",
          label: "Motor",
          asset_type: "load.motor_3phase",
          position: { x: 1020, y: 210 },
          status_binding: "asset_status.MTR-301",
        },
      ],
      edges: [{ id: "e-2d", from: "INV-102", to: "MTR-301", type: "power_flow" as const }],
    },
    map_3d: {
      nodes: [
        {
          id: "MTR-301",
          label: "Motor",
          asset_type: "load.motor_3phase",
          position: { x: -4, y: -1, z: 0 },
          status_binding: "asset_status.MTR-301",
          tags: ["MOTOR_301_RPM"],
          alarms: ["MOTOR_CURRENT_HIGH"],
        },
      ],
      edges: [{ id: "e-3d", from: "INV-102", to: "MTR-301", type: "power_flow" as const }],
    },
  },
};

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("RuntimeHMI", () => {
  beforeEach(() => {
    useRuntimeStore.getState().reset();
    useOperationalMapStore.setState({
      mode: "2d",
      role: "operator",
      zoomBand: "plant",
      visibleLayers: getDefaultVisibleLayersForRole("operator"),
      selectedAssetId: null,
      focusedAssetId: null,
      lastCommand: null,
      activeSituationLocked: false,
    });
    latestMap2dProps = null;
    latestMap3dProps = null;
    vi.mocked(getRuntimeHmiState).mockReset();
    vi.mocked(getRuntimeHmiState).mockRejectedValue(new Error("hmi offline"));
    vi.mocked(getCompiledBundle).mockReset();
    vi.mocked(getCompiledBundle).mockResolvedValue(COMPILED_FIXTURE);
  });

  it("renders shell with no-situation and connection strip when HMI runtime fails", async () => {
    useRuntimeStore.getState().setConnection("disconnected");
    wrap(<RuntimeHMI />);
    expect(await screen.findByText(/All clear/i)).toBeInTheDocument();
    expect(screen.getByText(/OFFLINE/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Raw alarms/i)).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("runtime-top-strip");
  });

  it("shows stale badge without layout-breaking duplicate conn labels", async () => {
    useRuntimeStore.getState().setConnection("stale");
    wrap(<RuntimeHMI />);
    const badges = await screen.findAllByText(/DATA STALE/i);
    expect(badges).toHaveLength(1);
  });

  it("renders HMI root cause panel when runtime HMI resolves", async () => {
    vi.mocked(getRuntimeHmiState).mockResolvedValue(motorObstructionHmiState);
    wrap(<RuntimeHMI />);
    expect(
      await screen.findByRole("heading", { name: /Motor-side mechanical obstruction/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("MOTOR_MECHANICAL_OBSTRUCTION")).toBeInTheDocument();
  });

  it("shows CalmCard fallback and warning when HMI runtime fails but snapshot has calm card", async () => {
    useRuntimeStore.getState().applySnapshot(HERO_MOTOR_OVERLOAD);
    wrap(<RuntimeHMI />);
    await waitFor(
      () => {
        expect(screen.getByText(/HMI runtime projection unavailable/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole("heading", { name: /Motor mechanical overload/i })).toBeInTheDocument();
  });

  it("passes map_2d data to PlantMap2D", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByTestId("plant-map-2d");
    expect(latestMap2dProps?.nodes).toEqual(COMPILED_FIXTURE.hmi_view_model.map_2d.nodes);
    expect(latestMap2dProps?.edges).toEqual(COMPILED_FIXTURE.hmi_view_model.map_2d.edges);
  });

  it("passes map_3d data to LazyPlantMap3D when 3D mode is selected", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByTestId("plant-map-2d");
    fireEvent.click(screen.getByRole("button", { name: /3D/i }));
    await screen.findByTestId("plant-map-3d");
    expect(latestMap3dProps?.nodes[0]?.position).toEqual({ x: -4, y: -1, z: 0 });
    expect(latestMap3dProps?.edges).toEqual(COMPILED_FIXTURE.hmi_view_model.map_3d.edges);
    expect(latestMap3dProps?.nodes[0]?.position.x).not.toBe(
      COMPILED_FIXTURE.hmi_view_model.map_2d.nodes[0]!.position.x,
    );
  });

  it("passes operational 3D viewport props to LazyPlantMap3D", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByTestId("plant-map-2d");
    fireEvent.click(screen.getByRole("button", { name: /3D/i }));
    await screen.findByTestId("plant-map-3d");
    expect(latestMap3dProps?.onViewportReady).toBeTypeOf("function");
    expect(latestMap3dProps?.onZoomBandChange).toBeTypeOf("function");
    expect(latestMap3dProps?.visibleLayers).toBeDefined();
    expect(latestMap3dProps?.focusAssetId).toBeNull();
  });

  it("renders causal path rail when active path exists", async () => {
    useRuntimeStore.getState().applySnapshot(HERO_MOTOR_OVERLOAD);
    wrap(<RuntimeHMI />);
    await screen.findByTestId("plant-map-2d");
    expect(
      await screen.findByRole("navigation", { name: /causal path explorer/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Step 1: Motor/i })).toBeInTheDocument();
  });

  it("clicking a causal path step selects and focuses the asset", async () => {
    useRuntimeStore.getState().applySnapshot(HERO_MOTOR_OVERLOAD);
    wrap(<RuntimeHMI />);
    await screen.findByTestId("plant-map-2d");
    fireEvent.click(await screen.findByRole("button", { name: /Step 1: Motor/i }));
    expect(useOperationalMapStore.getState().selectedAssetId).toBe("MTR-301");
    expect(useOperationalMapStore.getState().focusedAssetId).toBe("MTR-301");
    expect(await screen.findByLabelText(/Asset detail Motor/i)).toBeInTheDocument();
  });

  it("opens the asset detail drawer when selecting an asset from the 2D map", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByTestId("plant-map-2d");
    fireEvent.click(screen.getByRole("button", { name: /Select MTR-301/i }));
    expect(await screen.findByLabelText(/Asset detail Motor/i)).toBeInTheDocument();
  });
});