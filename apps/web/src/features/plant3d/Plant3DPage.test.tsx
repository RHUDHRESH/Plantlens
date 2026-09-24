import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSession } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { TooltipProvider } from "../../components/ui/primitives";

const webgl = vi.hoisted(() => ({ available: false }));
vi.mock("./lib/webgl", () => ({ isWebGLAvailable: () => webgl.available }));

// The real scene needs WebGL; the page chrome is what we test here.
vi.mock("./scene/PlantScene", () => ({
  default: (props: { layout: { assets: Array<{ id: string }> }; onSelect: (id: string) => void }) => (
    <div data-testid="scene-stub">
      {props.layout.assets.map((a) => (
        <button key={a.id} type="button" onClick={() => props.onSelect(a.id)}>
          select {a.id}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../../api/client", () => ({
  getRuntimeSnapshot: vi.fn().mockResolvedValue({ tags: {}, active_alarms: [], active_situations: [], latest_calm_card: null, asset_status: {} }),
  getCompiledBundle: vi.fn().mockResolvedValue({
    plant_id: "demo",
    content_hash: "x",
    version: "1",
    tag_index: { MOTOR_301_CURRENT: { asset_id: "MTR-301", unit: "A", signal_type: "electrical.current" } },
    hmi_view_model: {
      view_id: "v",
      version: "1",
      map_2d: { nodes: [], edges: [] },
      map_3d: {
        nodes: [
          { id: "MTR-301", label: "3-Phase Motor", asset_type: "load.motor_3phase", model_key: "motor_simple", area_id: "loads", position: { x: -4, y: -1, z: 0 }, status_binding: "asset_status.MTR-301", tags: ["MOTOR_301_CURRENT"] },
          { id: "INV-102", label: "Motor Inverter", asset_type: "drive.inverter", model_key: "inverter_box", area_id: "loads", position: { x: -2, y: -1, z: 0 }, status_binding: "asset_status.INV-102" },
        ],
        edges: [{ id: "INV-102->MTR-301", from: "INV-102", to: "MTR-301", type: "power_flow" }],
      },
    },
  }),
}));

import { Plant3DPage } from "./Plant3DPage";

function wrap(ui: ReactNode, path = "/ops/3d") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe("Plant3DPage", () => {
  beforeEach(() => {
    useSession.setState({ status: "ready" } as never);
    useRuntimeStore.getState().reset();
  });
  afterEach(() => {
    webgl.available = false;
  });

  it("shows a friendly fallback with a link to the 2D overview when WebGL is unavailable (jsdom)", () => {
    wrap(<Plant3DPage />);
    expect(screen.getByText("3D view unavailable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /2D overview/i })).toHaveAttribute("href", "/ops");
    expect(screen.queryByTestId("scene-stub")).not.toBeInTheDocument();
  });

  it("renders the chrome, lists abnormal equipment and opens the details panel with live values", async () => {
    webgl.available = true;
    useRuntimeStore.setState({
      connection: "live",
      assetStatus: { "MTR-301": "critical", "INV-102": "normal" },
      tags: { MOTOR_301_CURRENT: { tag_id: "MOTOR_301_CURRENT", asset_id: "MTR-301", value: 3.4, unit: "A", quality: "GOOD", timestamp: "2026-01-01T00:00:00Z", source: "simulator" } as never },
      activeAlarms: [{ alarm_id: "a1", asset_id: "MTR-301", tag_id: "MOTOR_301_TEMP", severity: "critical", message: "Motor temperature high", raised_at: "2026-01-01T00:00:00Z", acked: false, priority: 1 }],
    });
    wrap(<Plant3DPage />);
    expect(await screen.findByTestId("scene-stub")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "3D plant" })).toBeInTheDocument();
    expect(screen.getByLabelText("Legend")).toHaveTextContent("Normal equipment has no outline");
    const abnormal = screen.getByLabelText("Abnormal equipment");
    expect(abnormal).toHaveTextContent("MTR-301");
    expect(abnormal).not.toHaveTextContent("INV-102");

    fireEvent.click(within(abnormal).getByRole("button", { name: /MTR-301/ }));
    const panel = await screen.findByLabelText("3-Phase Motor details");
    expect(panel).toHaveTextContent("TEFC induction motor");
    expect(panel).toHaveTextContent("3.40");
    expect(panel).toHaveTextContent("A");
    expect(panel).toHaveTextContent("Motor temperature high");
    // read-only advisory: no acknowledge / control actions in the 3D view
    expect(screen.queryByRole("button", { name: /acknowledge|ack|start|stop/i })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("3-Phase Motor details")).not.toBeInTheDocument());
  });

  it("offers keyboard access to every asset through the equipment picker", async () => {
    webgl.available = true;
    wrap(<Plant3DPage />);
    await screen.findByTestId("scene-stub");
    const picker = screen.getByLabelText("Go to equipment");
    fireEvent.change(picker, { target: { value: "INV-102" } });
    expect(await screen.findByLabelText("Motor Inverter details")).toBeInTheDocument();
  });
});
