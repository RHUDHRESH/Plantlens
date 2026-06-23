import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuntimeHMI } from "./RuntimeHMI";
import { useRuntimeStore } from "../../app/store/runtime";
import { useAtlasStore } from "../../app/store/atlas";
import { motorObstructionHmiState } from "../hmi-state/__fixtures__/plantHmiState.fixture";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { getDefaultVisibleLayersForRole, useOperationalMapStore } from "../operational-map";
import type { PlantMap3DProps } from "../maps3d/PlantMap3D";

let latestMap3dProps: PlantMap3DProps | null = null;

vi.mock("../maps3d/LazyPlantMap3D", () => ({
  LazyPlantMap3D: (props: PlantMap3DProps & { webglAvailable: boolean; onSwitch2D: () => void }) => {
    latestMap3dProps = props;
    return <div data-testid="plant-map-3d" />;
  },
}));

vi.mock("../../api/client", () => ({
  issueDevToken: vi.fn().mockResolvedValue("test-token"),
  getCompiledBundle: vi.fn(),
  getGatewayStatus: vi.fn().mockResolvedValue({
    status: "ok",
    checked_at: "2026-01-01T10:00:00Z",
    api_runtime: { tag_count: 0, alarm_count: 0, latest_frame: null },
    gateway_health: { reachable: false, status_code: null, detail: "not running" },
  }),
  getRuntimeSnapshot: vi.fn().mockResolvedValue({
    tags: {},
    active_alarms: [],
    active_situations: [],
    latest_calm_card: null,
    asset_status: {},
  }),
  escalateIncident: vi.fn(),
}));

vi.mock("../../api/ws", () => ({
  connectRuntimeSocket: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock("../../api/hmi", () => ({
  getRuntimeHmiState: vi.fn().mockRejectedValue(new Error("hmi offline")),
  isRuntimeEndpointUnavailable: vi.fn(() => true),
}));

vi.mock("../connection/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../connection/api")>();
  return {
    ...actual,
    listPorts: vi.fn().mockResolvedValue([]),
    getConnectionStatus: vi.fn().mockResolvedValue({
      connected: false,
      port: null,
      slaveId: null,
      pollHz: null,
      lastPollTs: null,
      okCount: 0,
      errorCount: 0,
      lastError: null,
    }),
    getModelBundle: vi.fn().mockResolvedValue({ tags: [] }),
    connectModbus: vi.fn(),
    disconnectModbus: vi.fn(),
    scanRegisters: vi.fn().mockResolvedValue([]),
    testRead: vi.fn(),
    commitBindings: vi.fn(),
  };
});

import { getCompiledBundle, getGatewayStatus, getRuntimeSnapshot } from "../../api/client";
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
    useAtlasStore.setState({
      selectedEquipmentId: null,
      mapOrientation: "vertical",
      mapScale: 1,
    });
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
    latestMap3dProps = null;
    vi.mocked(getRuntimeHmiState).mockReset();
    vi.mocked(getRuntimeHmiState).mockRejectedValue(new Error("hmi offline"));
    vi.mocked(getCompiledBundle).mockReset();
    vi.mocked(getCompiledBundle).mockResolvedValue(COMPILED_FIXTURE);
    vi.mocked(getRuntimeSnapshot).mockReset();
    vi.mocked(getRuntimeSnapshot).mockResolvedValue({
      tags: {},
      active_alarms: [],
      active_situations: [],
      latest_calm_card: null,
      asset_status: {},
    });
    vi.mocked(getGatewayStatus).mockReset();
    vi.mocked(getGatewayStatus).mockResolvedValue({
      status: "ok",
      checked_at: "2026-01-01T10:00:00Z",
      api_runtime: { tag_count: 0, alarm_count: 0, latest_frame: null },
      gateway_health: { reachable: false, status_code: null, detail: "not running" },
    });
  });

  it("renders atlas shell with plant hierarchy and offline strip when HMI runtime fails", async () => {
    useRuntimeStore.getState().setConnection("disconnected");
    wrap(<RuntimeHMI />);
    expect(await screen.findByText("Plant hierarchy")).toBeInTheDocument();
    expect(screen.getByText(/All nominal/i)).toBeInTheDocument();
    expect(screen.getByText(/OFFLINE/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Raw alarms/i)).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("runtime-top-strip");
    expect(screen.getByRole("contentinfo", { name: /Plant status/i })).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole("button", { name: /EVENT/i }));
    expect(
      await screen.findByRole("heading", { name: /Motor-side mechanical obstruction/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("MOTOR_MECHANICAL_OBSTRUCTION")).toBeInTheDocument();
  });

  it("shows CalmCard on atlas when HMI runtime fails but snapshot has calm card", async () => {
    vi.mocked(getRuntimeSnapshot).mockResolvedValue(HERO_MOTOR_OVERLOAD);
    wrap(<RuntimeHMI />);
    await waitFor(
      () => {
        expect(screen.getAllByRole("heading", { name: /Motor mechanical overload/i }).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/alarms grouped/i).length).toBeGreaterThan(0);
      },
      { timeout: 3000 },
    );
  });

  it("renders latest live tag values in the atlas tree", async () => {
    vi.mocked(getRuntimeSnapshot).mockResolvedValue({
      ...HERO_MOTOR_OVERLOAD,
      active_situations: [],
      latest_calm_card: null,
      tags: {
        MOTOR_301_RPM: {
          tag_id: "MOTOR_301_RPM",
          asset_id: "MTR-301",
          value: 842,
          unit: "rpm",
          quality: "GOOD",
          timestamp: "2026-01-01T10:32:14Z",
          source: "modbus_rtu",
          seq: 1,
        },
      },
    });
    wrap(<RuntimeHMI />);
    await waitFor(() => {
      expect(screen.getAllByText(/842/).length).toBeGreaterThan(0);
    });
  });

  it("passes map_3d data to LazyPlantMap3D when twin screen is selected", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByText("Plant hierarchy");
    fireEvent.click(screen.getByRole("button", { name: /TWIN/i }));
    await screen.findByTestId("plant-map-3d");
    expect(latestMap3dProps?.nodes[0]?.position).toEqual({ x: -4, y: -1, z: 0 });
    expect(latestMap3dProps?.edges).toEqual(COMPILED_FIXTURE.hmi_view_model.map_3d.edges);
    expect(latestMap3dProps?.nodes[0]?.position.x).not.toBe(
      COMPILED_FIXTURE.hmi_view_model.map_2d.nodes[0]!.position.x,
    );
  });

  it("passes operational 3D viewport props to LazyPlantMap3D", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByText("Plant hierarchy");
    fireEvent.click(screen.getByRole("button", { name: /TWIN/i }));
    await screen.findByTestId("plant-map-3d");
    expect(latestMap3dProps?.onViewportReady).toBeTypeOf("function");
    expect(latestMap3dProps?.onZoomBandChange).toBeTypeOf("function");
    expect(latestMap3dProps?.visibleLayers).toBeDefined();
    expect(latestMap3dProps?.focusAssetId).toBeNull();
  });

  it("slides situation panel in when active situation exists", async () => {
    vi.mocked(getRuntimeSnapshot).mockResolvedValue(HERO_MOTOR_OVERLOAD);
    wrap(<RuntimeHMI />);
    await screen.findByText("Plant hierarchy");
    await waitFor(() => {
      expect(screen.getAllByText(/alarms grouped/i).length).toBeGreaterThan(0);
      expect(
        screen.getAllByRole("heading", { name: /Motor mechanical overload/i }).length,
      ).toBeGreaterThan(0);
    });
  });

  it("clicking a tree node selects and focuses the asset", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByText("Plant hierarchy");
    fireEvent.click(screen.getAllByText("Motor M-301")[0]!);
    expect(useOperationalMapStore.getState().selectedAssetId).toBe("MTR-301");
    expect(useOperationalMapStore.getState().focusedAssetId).toBe("MTR-301");
    expect(useAtlasStore.getState().selectedEquipmentId).toBe("MTR-301");
    expect(await screen.findByLabelText(/Asset detail Motor/i)).toBeInTheDocument();
  });

  it("renders atlas map controls for orientation and zoom", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByText("Plant hierarchy");
    expect(screen.getByRole("button", { name: /Vertical/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Horizontal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zoom in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Zoom out/i })).toBeInTheDocument();
  });

  it("navigates to COMMS connection screen", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByText("Plant hierarchy");
    fireEvent.click(screen.getByRole("button", { name: "Connection" }));
    expect(await screen.findByText("Connection / Commissioning")).toBeInTheDocument();
    expect(screen.getByText(/No control writes/i)).toBeInTheDocument();
    expect(screen.queryByText("Plant hierarchy")).not.toBeInTheDocument();
  });
});