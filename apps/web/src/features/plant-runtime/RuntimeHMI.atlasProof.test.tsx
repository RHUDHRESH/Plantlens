import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAtlasStore } from "../../app/store/atlas";
import { useOperationalMapStore, getDefaultVisibleLayersForRole } from "../operational-map";

vi.mock("../connection", () => ({
  ConnectionScreen: ({
    onOpenAtlas,
  }: {
    onOpenAtlas?: (assetId?: string | null) => void;
  }) => (
    <div>
      <h1>Connection / Commissioning</h1>
      <button type="button" onClick={() => onOpenAtlas?.("MTR-301")}>
        Open in Atlas
      </button>
    </div>
  ),
}));

vi.mock("../maps3d/LazyPlantMap3D", () => ({
  LazyPlantMap3D: () => <div data-testid="plant-map-3d" />,
}));

vi.mock("../../api/client", () => ({
  issueDevToken: vi.fn().mockResolvedValue("test-token"),
  getCompiledBundle: vi.fn().mockResolvedValue({
    plant_id: "demo_microgrid_001",
    hmi_view_model: { map_2d: { nodes: [], edges: [] }, map_3d: { nodes: [], edges: [] } },
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

import { RuntimeHMI } from "./RuntimeHMI";

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("RuntimeHMI connection atlas proof", () => {
  beforeEach(() => {
    useAtlasStore.setState({ selectedEquipmentId: null, mapOrientation: "vertical", mapScale: 1 });
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
  });

  it("returns to atlas and focuses asset when connection screen opens atlas", async () => {
    wrap(<RuntimeHMI />);
    await screen.findByText("Plant hierarchy");
    fireEvent.click(screen.getByRole("button", { name: "Connection" }));
    await screen.findByText("Connection / Commissioning");
    fireEvent.click(screen.getByRole("button", { name: "Open in Atlas" }));
    await screen.findByText("Plant hierarchy");
    expect(useOperationalMapStore.getState().selectedAssetId).toBe("MTR-301");
    expect(useOperationalMapStore.getState().focusedAssetId).toBe("MTR-301");
    expect(useAtlasStore.getState().selectedEquipmentId).toBe("MTR-301");
  });
});