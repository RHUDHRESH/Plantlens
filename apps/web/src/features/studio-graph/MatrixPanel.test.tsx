import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MatrixPanel } from "./MatrixPanel";

const SAMPLE_ANALYSIS = {
  status: "ok" as const,
  fault_signature_matrix: { assembly_id: "demo", fault_count: 12, faults: [] },
  observability_matrix: {
    summary: {
      total_faults: 12,
      observable_faults: 5,
      weakly_observable_faults: 4,
      unobservable_faults: 3,
      average_confidence_ceiling: 0.61,
    },
    fault_observability: [
      {
        fault_key: "dc_motor_12v_1.mechanical_obstruction",
        observability_class: "weakly_observable",
        confidence_ceiling: 0.45,
        missing_required_signals: ["motor_current"],
        explanation: "Weakly observable: missing motor_current.",
      },
      {
        fault_key: "dc_motor_12v_1.bearing_friction",
        observability_class: "unobservable",
        confidence_ceiling: 0.1,
        missing_required_signals: [],
        explanation: "Unobservable: no required evidence available.",
      },
    ],
  },
  causal_propagation_matrix: {
    monitoring_edges_excluded_count: 6,
    unapproved_edges_excluded_count: 1,
    errors: [{ code: "CAUSAL_CYCLE_DETECTED", message: "Cycle in test graph" }],
    active_propagation_paths: [{ from_asset_id: "a", to_asset_id: "b" }],
  },
  sensor_recommendations: {
    coverage_before: 0.55,
    coverage_after: 0.78,
    recommended_sensors: [
      {
        component_type_id: "current_sensor",
        measured_quantity: "current",
        placement_hint: "Mount in series with motor feed.",
        marginal_gain: 0.24,
        faults_improved: ["dc_motor_12v_1.mechanical_obstruction"],
      },
    ],
  },
};

describe("MatrixPanel", () => {
  it("renders observability summary", () => {
    render(<MatrixPanel analysis={SAMPLE_ANALYSIS} loading={false} error={null} />);
    expect(screen.getByText("Observable")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/Avg confidence ceiling/i)).toBeInTheDocument();
  });

  it("displays missing sensors and confidence ceiling", () => {
    render(<MatrixPanel analysis={SAMPLE_ANALYSIS} loading={false} error={null} />);
    expect(screen.getByText(/current_sensor/)).toBeInTheDocument();
    expect(screen.getByText(/Confidence ceiling: 0.45/)).toBeInTheDocument();
    expect(screen.getByText(/Marginal gain: 0.24/)).toBeInTheDocument();
  });

  it("displays causal graph warnings and unobservable faults honestly", () => {
    render(<MatrixPanel analysis={SAMPLE_ANALYSIS} loading={false} error={null} />);
    expect(screen.getByText(/Cycle in test graph/)).toBeInTheDocument();
    expect(screen.getAllByText(/unobservable/i).length).toBeGreaterThan(0);
  });

  it("does not use AI-confirmed language", () => {
    render(<MatrixPanel analysis={SAMPLE_ANALYSIS} loading={false} error={null} />);
    expect(screen.queryByText(/AI confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/AI detected/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Engineering Analysis/i)).toBeInTheDocument();
  });
});

describe("Analyze Assembly button wiring", () => {
  it("calls analyze handler from AssemblyStudioPage button label", () => {
    const onAnalyze = vi.fn();
    render(
      <button type="button" onClick={onAnalyze}>
        Analyze Assembly
      </button>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Analyze Assembly/i }));
    expect(onAnalyze).toHaveBeenCalled();
  });
});