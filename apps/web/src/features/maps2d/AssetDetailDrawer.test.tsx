import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssetDetailDrawer } from "./AssetDetailDrawer";
import { getDefaultVisibleLayersForRole } from "../operational-map";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import type { TagFrame } from "../../app/schemas/tagFrame";

const NODE = {
  id: "MTR-301",
  label: "Motor",
  asset_type: "load.motor_3phase",
  position: { x: 100, y: 100 },
  status_binding: "asset_status.MTR-301",
};

const TAGS: Record<string, TagFrame> = {
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

const baseProps = {
  node: NODE,
  status: "critical" as const,
  zoomBand: "component" as const,
  tags: TAGS,
  alarms: HERO_MOTOR_OVERLOAD.active_alarms,
  rootAssetId: "MTR-301",
  affectedAssetIds: ["BUS-101"],
  open: true,
  onClose: () => {},
};

describe("AssetDetailDrawer", () => {
  it("operator hides full tag table", () => {
    render(
      <AssetDetailDrawer
        {...baseProps}
        role="operator"
        visibleLayers={getDefaultVisibleLayersForRole("operator")}
      />,
    );
    expect(screen.getByText(/Operator summary/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Live tags$/i })).not.toBeInTheDocument();
  });

  it("engineer shows full tag table at asset zoom", () => {
    render(
      <AssetDetailDrawer
        {...baseProps}
        role="engineer"
        zoomBand="asset"
        visibleLayers={getDefaultVisibleLayersForRole("engineer")}
      />,
    );
    expect(screen.getByRole("heading", { name: /^Live tags$/i })).toBeInTheDocument();
    expect(screen.getByText("MOTOR_301_CURRENT")).toBeInTheDocument();
  });

  it("maintenance shows bad quality section at area zoom", () => {
    render(
      <AssetDetailDrawer
        {...baseProps}
        role="maintenance"
        zoomBand="area"
        visibleLayers={getDefaultVisibleLayersForRole("maintenance")}
      />,
    );
    expect(screen.getByRole("heading", { name: /^Maintenance$/i })).toBeInTheDocument();
    expect(screen.getByText(/MOTOR_301_TEMP/)).toBeInTheDocument();
  });

  it("manager hides tag spam", () => {
    render(
      <AssetDetailDrawer
        {...baseProps}
        role="manager"
        visibleLayers={getDefaultVisibleLayersForRole("manager")}
      />,
    );
    expect(screen.getByText(/Manager summary/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Live tags$/i })).not.toBeInTheDocument();
    expect(screen.queryByText("MOTOR_301_CURRENT")).not.toBeInTheDocument();
  });

  it("shows muted message when Calm Card absent for recommended actions", () => {
    render(
      <AssetDetailDrawer
        {...baseProps}
        role="operator"
        visibleLayers={getDefaultVisibleLayersForRole("operator")}
        calmCard={null}
        activeSituation={null}
      />,
    );
    expect(
      screen.getByText(/No recommended action attached to this asset/i),
    ).toBeInTheDocument();
  });

  it("shows Calm Card recommended action for root asset", () => {
    render(
      <AssetDetailDrawer
        {...baseProps}
        role="operator"
        visibleLayers={getDefaultVisibleLayersForRole("operator")}
        calmCard={HERO_MOTOR_OVERLOAD.latest_calm_card}
        activeSituation={HERO_MOTOR_OVERLOAD.active_situations[0] ?? null}
      />,
    );
    expect(screen.getByText(/Inspect shaft load/i)).toBeInTheDocument();
  });
});