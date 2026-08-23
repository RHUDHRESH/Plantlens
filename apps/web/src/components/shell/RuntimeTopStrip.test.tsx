import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RuntimeTopStrip } from "./RuntimeTopStrip";
import type { RuntimeTopStripProps } from "./RuntimeTopStrip";

const BASE_PROPS = {
  plantName: "Demo Plant",
  plantHealth: "Normal",
  mode: "Monitor",
  dataSource: "HMI Projection",
  timeLabel: "10:00",
  role: "engineer",
  connection: "live" as const,
  apiAvailable: true,
} satisfies RuntimeTopStripProps;

describe("RuntimeTopStrip", () => {
  it("shows plant meta cluster (mode, source, time, health)", () => {
    render(<RuntimeTopStrip {...BASE_PROPS} />);
    expect(screen.getByText("Mode")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Health")).toBeInTheDocument();
  });

  it("does not expose a Studio button (Studio lives on the sidebar)", () => {
    render(<RuntimeTopStrip {...BASE_PROPS} />);
    expect(screen.queryByRole("button", { name: /^Studio$/i })).not.toBeInTheDocument();
  });

  it("toggles map when onToggleMap is provided", () => {
    const onToggleMap = vi.fn();
    render(
      <RuntimeTopStrip {...BASE_PROPS} showMap={false} onToggleMap={onToggleMap} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Map/i }));
    expect(onToggleMap).toHaveBeenCalledOnce();
  });
});
