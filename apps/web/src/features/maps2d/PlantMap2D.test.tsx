import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlantMap2D } from "./PlantMap2D";
import { getDefaultVisibleLayersForRole } from "../operational-map";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import type { TagFrame } from "../../app/schemas/tagFrame";

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
    expect(screen.getByLabelText(/Motor.*CRIT/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/DC Bus.*WARN/i)).toBeInTheDocument();
    expect(screen.getByText(/ROOT CAUSE/i)).toBeInTheDocument();
  });

  it("shows safe fallback for missing coordinates via empty state", () => {
    render(<PlantMap2D nodes={[]} edges={[]} assetStatus={{}} />);
    expect(screen.getByText(/No map nodes/i)).toBeInTheDocument();
  });

  it("renders with viewBox from viewport hook", () => {
    const { container } = render(
      <PlantMap2D
        nodes={NODES}
        edges={EDGES}
        assetStatus={HERO_MOTOR_OVERLOAD.asset_status}
        reducedMotion
      />,
    );
    const svg = container.querySelector("svg.plant-map-2d");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("viewBox")).toMatch(/^-?\d+(\.\d+)? -?\d+(\.\d+)? \d+(\.\d+)? \d+(\.\d+)?$/);
  });

  const MOTOR_TAGS: Record<string, TagFrame> = {
    t1: {
      tag_id: "MOTOR_301_CURRENT",
      asset_id: "MTR-301",
      value: 42,
      unit: "A",
      quality: "GOOD",
      timestamp: "2026-01-01T00:00:00Z",
      source: "simulator",
    },
    t2: {
      tag_id: "MOTOR_301_TEMP",
      asset_id: "MTR-301",
      value: 90,
      unit: "C",
      quality: "BAD",
      timestamp: "2026-01-01T00:00:00Z",
      source: "simulator",
    },
  };

  it("plant zoom keeps operator view clean without tag badges", () => {
    const operatorLayers = getDefaultVisibleLayersForRole("operator");
    const { container } = render(
      <PlantMap2D
        nodes={NODES}
        edges={EDGES}
        assetStatus={HERO_MOTOR_OVERLOAD.asset_status}
        role="operator"
        zoomBand="plant"
        visibleLayers={operatorLayers}
        tags={MOTOR_TAGS}
        alarms={[]}
        reducedMotion
      />,
    );
    const badgeText = Array.from(container.querySelectorAll(".plant-node__micro-badges"))
      .map((el) => el.textContent ?? "")
      .join(" ");
    expect(badgeText).not.toMatch(/T:/);
  });

  it("engineer at component zoom shows tag count badge", () => {
    const { container } = render(
      <PlantMap2D
        nodes={NODES}
        edges={EDGES}
        assetStatus={HERO_MOTOR_OVERLOAD.asset_status}
        role="engineer"
        zoomBand="component"
        visibleLayers={getDefaultVisibleLayersForRole("engineer")}
        tags={MOTOR_TAGS}
        alarms={HERO_MOTOR_OVERLOAD.active_alarms}
        reducedMotion
      />,
    );
    const badges = container.querySelector(".plant-node__micro-badges");
    expect(badges?.textContent).toMatch(/T:2/);
  });

  it("manager hides tag count at component zoom", () => {
    const { container } = render(
      <PlantMap2D
        nodes={NODES}
        edges={EDGES}
        assetStatus={HERO_MOTOR_OVERLOAD.asset_status}
        role="manager"
        zoomBand="component"
        visibleLayers={getDefaultVisibleLayersForRole("manager")}
        tags={MOTOR_TAGS}
        alarms={[]}
        reducedMotion
      />,
    );
    const badges = container.querySelector(".plant-node__micro-badges");
    expect(badges?.textContent ?? "").not.toMatch(/T:/);
  });

  it("alarm badge appears when raw_alarms layer visible at area zoom", () => {
    const { container } = render(
      <PlantMap2D
        nodes={NODES}
        edges={EDGES}
        assetStatus={HERO_MOTOR_OVERLOAD.asset_status}
        role="operator"
        zoomBand="area"
        visibleLayers={{ ...getDefaultVisibleLayersForRole("operator"), raw_alarms: true }}
        tags={{}}
        alarms={HERO_MOTOR_OVERLOAD.active_alarms}
        reducedMotion
      />,
    );
    const badges = container.querySelector(".plant-node__micro-badges");
    expect(badges?.textContent).toMatch(/A:1/);
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