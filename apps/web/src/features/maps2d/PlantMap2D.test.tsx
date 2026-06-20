import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlantMap2D } from "./PlantMap2D";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";

const NODES = [
  { id: "MTR-301", label: "Motor", asset_type: "load.motor_3phase", position: { x: 100, y: 100 }, status_binding: "asset_status.MTR-301" },
  { id: "BUS-101", label: "DC Bus", asset_type: "distribution.dc_bus", position: { x: 300, y: 100 }, status_binding: "asset_status.BUS-101" },
  { id: "INV-102", label: "Inverter", asset_type: "drive.inverter", position: { x: 500, y: 100 }, status_binding: "asset_status.INV-102" },
];

const EDGES = [
  { id: "e1", from: "MTR-301", to: "BUS-101", type: "power_flow" as const },
  { id: "e2", from: "BUS-101", to: "INV-102", type: "power_flow" as const },
];

describe("PlantMap2D", () => {
  it("renders hero statuses from runtime snapshot projection", () => {
    render(
      <PlantMap2D
        nodes={NODES}
        edges={EDGES}
        assetStatus={HERO_MOTOR_OVERLOAD.asset_status}
        causalPath={HERO_MOTOR_OVERLOAD.active_situations[0]!.causal_path ?? []}
        rootAssetId="MTR-301"
        affectedAssetIds={["BUS-101", "INV-102"]}
        reducedMotion
      />,
    );
    expect(screen.getByLabelText(/Live plant map/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Motor CRIT/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/DC Bus WARN/i)).toBeInTheDocument();
    expect(screen.getByText(/ROOT CAUSE/i)).toBeInTheDocument();
  });

  it("shows safe fallback for missing coordinates via empty state", () => {
    render(<PlantMap2D nodes={[]} edges={[]} assetStatus={{}} />);
    expect(screen.getByText(/No map nodes/i)).toBeInTheDocument();
  });

  it("orders causal path steps 1-2-3", () => {
    render(
      <PlantMap2D
        nodes={NODES}
        edges={EDGES}
        assetStatus={HERO_MOTOR_OVERLOAD.asset_status}
        causalPath={["MTR-301", "BUS-101", "INV-102"]}
        reducedMotion
      />,
    );
    expect(screen.getByLabelText(/Causal path overlay/i)).toBeInTheDocument();
  });
});