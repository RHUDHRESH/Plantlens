import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { PlantHealthPanel } from "./PlantHealthPanel";

describe("PlantHealthPanel", () => {
  it("shows Live data degraded when tags are BAD and no alarms", () => {
    const tags: Record<string, TagFrame> = {
      BUS_101_V: {
        tag_id: "BUS_101_V",
        asset_id: "BUS-101",
        value: null,
        unit: "V",
        quality: "BAD",
        timestamp: "2026-01-01T10:00:00Z",
        source: "modbus_rtu",
      },
    };
    render(<PlantHealthPanel tags={tags} alarms={[]} />);
    expect(screen.getByText("Live data degraded")).toBeInTheDocument();
    expect(screen.getByText(/1 tag\(s\) not good/i)).toBeInTheDocument();
    expect(screen.queryByText("All nominal")).not.toBeInTheDocument();
  });

  it("shows em dash for BAD bus voltage, not zero", () => {
    const tags: Record<string, TagFrame> = {
      BUS_101_V: {
        tag_id: "BUS_101_V",
        asset_id: "BUS-101",
        value: 0,
        unit: "V",
        quality: "BAD",
        timestamp: "2026-01-01T10:00:00Z",
        source: "modbus_rtu",
      },
    };
    render(<PlantHealthPanel tags={tags} alarms={[]} />);
    const dcBlock = screen.getByText("DC Bus").nextElementSibling as HTMLElement;
    expect(within(dcBlock).getByText("—")).toBeInTheDocument();
    expect(within(dcBlock).queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it("shows All nominal when tags are GOOD", () => {
    const tags: Record<string, TagFrame> = {
      BUS_101_V: {
        tag_id: "BUS_101_V",
        asset_id: "BUS-101",
        value: 24,
        unit: "V",
        quality: "GOOD",
        timestamp: "2026-01-01T10:00:00Z",
        source: "simulator",
      },
    };
    render(<PlantHealthPanel tags={tags} alarms={[]} />);
    expect(screen.getByText("All nominal")).toBeInTheDocument();
  });
});