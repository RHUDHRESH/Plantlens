import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeSnapshot } from "../../api/types";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { defaultRoutes, mockFetch, renderPage, seed } from "../operational-map/testUtils";
import { OverviewPage } from "./OverviewPage";

afterEach(() => vi.unstubAllGlobals());

const SNAP: RuntimeSnapshot = {
  ...HERO_MOTOR_OVERLOAD,
  tags: {
    MOTOR_301_CURRENT: { tag_id: "MOTOR_301_CURRENT", asset_id: "MTR-301", value: 3.4, unit: "A", quality: "GOOD", timestamp: "2026-01-01T10:32:14Z", source: "simulator" },
  },
};

describe("OverviewPage", () => {
  it("composes map, Calm Card and the raw alarm strip from the hero situation", async () => {
    seed(SNAP, "operator");
    mockFetch(defaultRoutes(SNAP));
    renderPage(<OverviewPage />, "/ops");

    // Hero map from compiled coordinates, with live value and status text on the motor.
    const motor = await screen.findByRole("button", { name: /3-Phase Motor, Critical, MOTOR_301_CURRENT 3\.40 A, causal step 1/ });
    expect(motor).toBeInTheDocument();
    expect(screen.getByText(/Causal path/)).toHaveTextContent("3-Phase Motor → DC Bus → Motor Inverter");

    // Calm Card in priority order.
    const card = screen.getByRole("article", { name: "Motor mechanical overload" });
    const text = card.textContent ?? "";
    const order = ["Likely root", "First signal", "Evidence chain", "Check first", "Blocked actions", "raw alarms grouped"].map((k) =>
      text.indexOf(k),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(within(card).getByRole("link", { name: /5 raw alarms grouped — view raw alarms/ })).toHaveAttribute(
      "href",
      "/ops/alarms?tab=grouped",
    );

    // Raw alarm strip is always present.
    const strip = screen.getByRole("region", { name: "Raw alarms" });
    expect(within(strip).getByText("Motor current high")).toBeInTheDocument();
    expect(within(strip).getByText("DC bus low")).toBeInTheDocument();
  });

  it("opens the asset drawer from the map with live tags and links", async () => {
    seed(SNAP, "operator");
    mockFetch(defaultRoutes(SNAP));
    renderPage(<OverviewPage />, "/ops");
    fireEvent.click(await screen.findByRole("button", { name: /^3-Phase Motor, Critical/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("MOTOR_301_CURRENT")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: /Trend all tags/ })).toHaveAttribute(
      "href",
      "/ops/trends?tags=MOTOR_301_CURRENT,MOTOR_301_TEMP&range=15m",
    );
    expect(within(sheet).getByRole("link", { name: /Causal graph/ })).toHaveAttribute("href", "/ops/causal?asset=MTR-301");
  });

  it("stays calm without a situation, and still shows the strip", async () => {
    const calm: RuntimeSnapshot = { ...SNAP, active_alarms: [], active_situations: [], latest_calm_card: null, asset_status: { "MTR-301": "normal" } };
    seed(calm, "operator");
    mockFetch(defaultRoutes(calm));
    renderPage(<OverviewPage />, "/ops");
    expect(screen.getByText("No active situation")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Raw alarms" })).toHaveTextContent("No active alarms");
  });

  it("hides the bench scenario launcher from operators and shows it to engineers", async () => {
    seed(SNAP, "operator");
    mockFetch(defaultRoutes(SNAP, { "/api/scenarios": { scenarios: [], running_scenario_id: null } }));
    const { unmount } = renderPage(<OverviewPage />, "/ops");
    expect(screen.queryByRole("button", { name: "Bench scenarios" })).not.toBeInTheDocument();
    unmount();
    seed(SNAP, "engineer");
    renderPage(<OverviewPage />, "/ops");
    expect(screen.getByRole("button", { name: "Bench scenarios" })).toBeInTheDocument();
  });
});
