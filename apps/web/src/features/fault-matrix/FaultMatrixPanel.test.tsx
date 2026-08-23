import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { FaultMatrixPanel } from "./FaultMatrixPanel";
import { SignalRail } from "./SignalRail";
import type { FaultMatrix, FaultMatrixScore } from "../../app/schemas/faultMatrix";
import type { TagFrame } from "../../app/schemas/tagFrame";

const MATRIX: FaultMatrix = {
  version: "1.0.0",
  matrix_id: "test_matrix",
  faults: [
    {
      id: "F_MOTOR_OVERLOAD",
      name: "Motor Overload",
      asset_id: "MTR-301",
      symptoms: [
        { tag_id: "MOTOR_301_CURRENT", expected_direction: "HIGH", weight: 1, required: true },
        { tag_id: "MOTOR_301_RPM", expected_direction: "LOW", weight: 0.8, required: true },
      ],
    },
  ],
};

const SCORES: FaultMatrixScore[] = [
  {
    fault_id: "F_MOTOR_OVERLOAD",
    fault_name: "Motor Overload",
    asset_id: "MTR-301",
    confidence: 0.86,
    coverage: 1,
    contradicted: false,
    supporting_symptoms: ["MOTOR_301_CURRENT"],
    contradicting_symptoms: [],
    missing_symptoms: ["MOTOR_301_RPM"],
  },
];

describe("FaultMatrixPanel", () => {
  it("renders fault×tag grid and selects a fault", () => {
    const onSelect = vi.fn();
    render(
      <FaultMatrixPanel
        matrix={MATRIX}
        scores={SCORES}
        selectedFaultId={null}
        onSelectFault={onSelect}
      />,
    );

    expect(screen.getByTestId("fault-matrix-panel")).toBeInTheDocument();
    expect(screen.getByText("Motor Overload")).toBeInTheDocument();
    expect(screen.getByText("0.86")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Motor Overload\s*F_MOTOR_OVERLOAD/i }));
    expect(onSelect).toHaveBeenCalledWith("F_MOTOR_OVERLOAD");
  });

  it("shows match-state legend", () => {
    render(
      <FaultMatrixPanel matrix={MATRIX} scores={SCORES} selectedFaultId={null} />,
    );
    const legend = screen.getByTestId("fault-matrix-legend");
    expect(within(legend).getByText("Exact")).toBeInTheDocument();
    expect(within(legend).getByText("Partial")).toBeInTheDocument();
    expect(within(legend).getByText("Contradict")).toBeInTheDocument();
    expect(within(legend).getByText("Missing")).toBeInTheDocument();
  });

  it("activates row and cell via keyboard", () => {
    const onSelect = vi.fn();
    render(
      <FaultMatrixPanel
        matrix={MATRIX}
        scores={SCORES}
        selectedFaultId={null}
        onSelectFault={onSelect}
      />,
    );

    const row = document.querySelector('[data-fault-id="F_MOTOR_OVERLOAD"]')!;
    fireEvent.keyDown(row, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("F_MOTOR_OVERLOAD");

    onSelect.mockClear();
    const cellBtn = screen.getByRole("button", {
      name: /Motor Overload · MOTOR_301_CURRENT/i,
    });
    fireEvent.keyDown(cellBtn, { key: " " });
    expect(onSelect).toHaveBeenCalledWith("F_MOTOR_OVERLOAD");
  });

  it("shows empty state when no rows", () => {
    render(<FaultMatrixPanel scores={[]} matrix={null} />);
    expect(screen.getByText(/Waiting for symptom evidence/i)).toBeInTheDocument();
  });
});

describe("SignalRail", () => {
  it("renders live tags with quality chips", () => {
    const tags: Record<string, TagFrame> = {
      MOTOR_301_CURRENT: {
        tag_id: "MOTOR_301_CURRENT",
        asset_id: "MTR-301",
        value: 48.2,
        unit: "A",
        quality: "GOOD",
        timestamp: "2026-01-01T10:00:00Z",
        source: "simulator",
      },
      BUS_101_V: {
        tag_id: "BUS_101_V",
        asset_id: "BUS-101",
        value: null,
        unit: "V",
        quality: "STALE",
        timestamp: "2026-01-01T09:59:00Z",
        source: "simulator",
      },
    };

    render(<SignalRail tags={tags} />);
    expect(screen.getByTestId("signal-rail")).toBeInTheDocument();
    expect(screen.getByText("MOTOR_301_CURRENT")).toBeInTheDocument();
    expect(screen.getByText("48.20")).toBeInTheDocument();
    expect(screen.getByTitle("GOOD")).toBeInTheDocument();
    expect(screen.getByText("STALE")).toBeInTheDocument();
  });

  it("prefers bad/stale first, shows +N more, and age on non-GOOD", () => {
    const now = Date.now();
    const tags: Record<string, TagFrame> = {
      GOOD_TAG: {
        tag_id: "GOOD_TAG",
        asset_id: "A",
        value: 1,
        unit: "",
        quality: "GOOD",
        timestamp: new Date(now).toISOString(),
        source: "simulator",
      },
      BAD_TAG: {
        tag_id: "BAD_TAG",
        asset_id: "B",
        value: null,
        unit: "",
        quality: "BAD",
        timestamp: new Date(now - 90_000).toISOString(),
        source: "simulator",
      },
      STALE_TAG: {
        tag_id: "STALE_TAG",
        asset_id: "C",
        value: 2,
        unit: "",
        quality: "STALE",
        timestamp: new Date(now - 5_000).toISOString(),
        source: "simulator",
      },
      EXTRA_TAG: {
        tag_id: "EXTRA_TAG",
        asset_id: "D",
        value: 3,
        unit: "",
        quality: "GOOD",
        timestamp: new Date(now).toISOString(),
        source: "simulator",
      },
    };

    render(<SignalRail tags={tags} maxItems={2} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveAttribute("data-tag-id", "BAD_TAG");
    expect(items[1]).toHaveAttribute("data-tag-id", "STALE_TAG");
    expect(screen.getByTestId("signal-rail-more")).toHaveTextContent("+2");
    expect(screen.getByTestId("signal-age-BAD_TAG")).toHaveTextContent(/m ago|s ago/);
    expect(screen.queryByTestId("signal-age-GOOD_TAG")).not.toBeInTheDocument();
  });
});
