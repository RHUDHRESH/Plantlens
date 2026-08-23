import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MonitorScreen } from "./MonitorScreen";

describe("MonitorScreen", () => {
  it("shows the secondary plant map slot when showMap is true", () => {
    const { rerender } = render(
      <MonitorScreen
        tags={{}}
        showMap={false}
        onToggleMap={vi.fn()}
        mapSlot={<div>Map canvas</div>}
        mapToolbarSlot={<div data-testid="map-toolbar-slot">Toolbar</div>}
      />,
    );

    expect(screen.queryByTestId("monitor-map-slot")).not.toBeInTheDocument();

    rerender(
      <MonitorScreen
        tags={{}}
        showMap
        onToggleMap={vi.fn()}
        mapSlot={<div>Map canvas</div>}
        mapToolbarSlot={<div data-testid="map-toolbar-slot">Toolbar</div>}
      />,
    );

    expect(screen.getByTestId("monitor-map-slot")).toBeInTheDocument();
    expect(screen.getByTestId("map-toolbar-slot")).toBeInTheDocument();
    expect(screen.getByText("Map canvas")).toBeInTheDocument();
  });

  it("keeps Calm Card slot interactive for raw-alarm open without leaving monitor", () => {
    const onOpenRaw = vi.fn();
    render(
      <MonitorScreen
        tags={{}}
        calmCardSlot={
          <button type="button" onClick={onOpenRaw}>
            view raw alarms
          </button>
        }
      />,
    );

    expect(screen.getByTestId("monitor-screen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /view raw alarms/i }));
    expect(onOpenRaw).toHaveBeenCalledOnce();
    expect(screen.getByTestId("monitor-screen")).toBeInTheDocument();
  });
});
