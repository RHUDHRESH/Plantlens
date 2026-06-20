import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HmiStatePanel } from "./HmiStatePanel";
import {
  blockedHmiState,
  healthyHmiState,
  motorObstructionHmiState,
  staleSensorHmiState,
} from "./__fixtures__/plantHmiState.fixture";

describe("HmiStatePanel", () => {
  it("renders suspected root cause and confidence", () => {
    render(<HmiStatePanel state={motorObstructionHmiState} />);
    expect(screen.getByText(/Suspected root cause/i)).toBeInTheDocument();
    expect(screen.getByText("MOTOR_MECHANICAL_OBSTRUCTION")).toBeInTheDocument();
    expect(screen.getAllByText("82%").length).toBeGreaterThan(0);
  });

  it("renders operator actions in priority order", () => {
    render(<HmiStatePanel state={motorObstructionHmiState} />);
    const priorities = screen.getAllByText(/#\d+/).map((el) => el.textContent);
    expect(priorities[0]).toBe("#1");
    expect(screen.getByText("Stop motor safely")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /execute/i })).not.toBeInTheDocument();
  });

  it("renders blocked data quality warning", () => {
    render(<HmiStatePanel state={blockedHmiState} />);
    expect(screen.getByText("HMI projection blocked.")).toBeInTheDocument();
    expect(screen.getAllByText(/artifact_integrity/i).length).toBeGreaterThan(0);
  });

  it("renders stale and missing signal warnings", () => {
    render(<HmiStatePanel state={staleSensorHmiState} />);
    expect(screen.getByText(/Stale signals/i)).toBeInTheDocument();
    expect(screen.getAllByText(/MTR_RPM/).length).toBeGreaterThan(0);
  });

  it("renders no-incident state without crashing", () => {
    render(<HmiStatePanel state={healthyHmiState} />);
    expect(screen.getByText(/All clear/i)).toBeInTheDocument();
    expect(screen.getByText(/No active incident in HMI projection/i)).toBeInTheDocument();
  });

  it("renders active causality cause → effect list", () => {
    render(<HmiStatePanel state={motorObstructionHmiState} />);
    expect(screen.getByText(/Active causality/i)).toBeInTheDocument();
    expect(screen.getByText(/MTR-12V → FAN-01/)).toBeInTheDocument();
  });

  it("calls onHighlightAsset when highlight button clicked", () => {
    const onHighlightAsset = vi.fn();
    render(
      <HmiStatePanel state={motorObstructionHmiState} onHighlightAsset={onHighlightAsset} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Highlight MTR-12V/i }));
    expect(onHighlightAsset).toHaveBeenCalledWith("MTR-12V");
  });

  it("calls onViewRawAlarms when view raw alarms clicked", () => {
    const onViewRawAlarms = vi.fn();
    render(<HmiStatePanel state={motorObstructionHmiState} onViewRawAlarms={onViewRawAlarms} />);
    fireEvent.click(screen.getByRole("button", { name: /View raw alarms/i }));
    expect(onViewRawAlarms).toHaveBeenCalled();
  });
});