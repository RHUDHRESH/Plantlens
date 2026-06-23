import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RuntimeTopStrip } from "./RuntimeTopStrip";
import type { RuntimeTopStripProps } from "./RuntimeTopStrip";

const BASE_PROPS = {
  plantName: "Demo Plant",
  plantHealth: "Normal",
  mode: "Runtime",
  dataSource: "HMI Projection",
  timeLabel: "10:00",
  role: "engineer",
  connection: "live" as const,
  apiAvailable: true,
} satisfies RuntimeTopStripProps;

describe("RuntimeTopStrip", () => {
  it("hides Studio button when showStudio is false", () => {
    render(
      <RuntimeTopStrip
        {...BASE_PROPS}
        showStudio={false}
        onOpenStudio={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Studio/i })).not.toBeInTheDocument();
  });

  it("calls onOpenStudio when Studio button is shown", () => {
    const onOpenStudio = vi.fn();
    render(
      <RuntimeTopStrip
        {...BASE_PROPS}
        showStudio
        onOpenStudio={onOpenStudio}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Studio/i }));
    expect(onOpenStudio).toHaveBeenCalledOnce();
  });
});
