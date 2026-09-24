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

const ACTIONS = {
  situation_id: "sit-motor-1",
  situation_type: "MOTOR_MECHANICAL_OVERLOAD",
  role: "operator",
  actions: [
    {
      action_id: "REQUEST_SAFE_STOP_MOTOR",
      label: "Request PLC safe stop for motor",
      allowed: false,
      reason: "Role 'operator' is not permitted; allowed: maintenance.",
      allowed_roles: ["maintenance"],
      blocking_alarms: [],
      risk_level: "high",
      requires_isolation: false,
      requires_operator_confirm: true,
      plc_permission_required: true,
      safety_note: null,
      target_asset_id: "MTR-301",
    },
    {
      action_id: "CHECK_COUPLING_GUARD",
      label: "Check the coupling guard temperature by hand-held IR",
      allowed: true,
      reason: null,
      allowed_roles: ["operator"],
      blocking_alarms: [],
      risk_level: "low",
      requires_isolation: false,
      requires_operator_confirm: false,
      plc_permission_required: false,
      safety_note: null,
      target_asset_id: "MTR-301",
    },
    {
      action_id: "INSPECT_SHAFT_LOAD",
      label: "Inspect shaft load, coupling, and bearing drag",
      allowed: true,
      reason: null,
      allowed_roles: ["operator", "maintenance"],
      blocking_alarms: [],
      risk_level: "medium",
      requires_isolation: true,
      requires_operator_confirm: false,
      plc_permission_required: false,
      safety_note: "Follow site isolation procedure before touching rotating equipment.",
      target_asset_id: "MTR-301",
    },
  ],
};

describe("OverviewPage", () => {
  it("composes map, Calm Card and the raw alarm strip from the hero situation", async () => {
    seed(SNAP, "operator");
    mockFetch(defaultRoutes(SNAP, { "/api/runtime/actions": ACTIONS }));
    renderPage(<OverviewPage />, "/ops");

    // Hero map from compiled coordinates, with live value and status text on the motor.
    const motor = await screen.findByRole("button", { name: /3-Phase Motor, Critical, MOTOR_301_CURRENT 3\.40 A, causal step 1/ });
    expect(motor).toBeInTheDocument();
    expect(screen.getByText(/Causal path/)).toHaveTextContent("3-Phase Motor → DC Bus → Motor Inverter");

    // Calm Card in priority order.
    const card = screen.getByRole("article", { name: "Motor mechanical overload" });
    await within(card).findByText("Check the coupling guard temperature by hand-held IR");
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

  it("lists role-gated checks: permitted first, blocked greyed with the reason, nothing executable", async () => {
    seed(SNAP, "operator");
    const { calls } = mockFetch(defaultRoutes(SNAP, { "/api/runtime/actions": ACTIONS }));
    renderPage(<OverviewPage />, "/ops");
    const checks = await screen.findByRole("region", { name: "Recommended checks" });
    await within(checks).findByText("Check the coupling guard temperature by hand-held IR");
    const items = within(checks).getAllByRole("listitem");
    // The featured first check (INSPECT_SHAFT_LOAD) is not repeated; other permitted checks lead.
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Recommended check");
    expect(items[0]).toHaveTextContent("Risk low");
    expect(items[1]).toHaveTextContent("Request PLC safe stop for motor");
    expect(items[1]).toHaveTextContent("Not for the Operator role. Maintenance can carry this out.");
    expect(items[1]).toHaveClass("is-blocked");
    expect(within(checks).queryAllByRole("button")).toHaveLength(0);
    expect(calls.some((c) => c.url.includes("/api/runtime/actions?situation_id=sit-motor-1"))).toBe(true);
  });

  it("switches between several active situations and refetches their actions", async () => {
    const second = {
      ...SNAP.active_situations[0]!,
      situation_id: "sit-bus-2",
      title: "DC bus undervoltage",
      root_asset_id: "BUS-101",
      root_asset_name: "DC Bus",
      severity: "warning" as const,
      grouped_alarm_ids: ["DC_BUS_LOW"],
    };
    const multi: RuntimeSnapshot = { ...SNAP, active_situations: [SNAP.active_situations[0]!, second] };
    seed(multi, "operator");
    const { calls } = mockFetch(defaultRoutes(multi, { "/api/runtime/actions": ACTIONS }));
    renderPage(<OverviewPage />, "/ops");
    const switcher = screen.getByRole("navigation", { name: "Active situations" });
    const buttons = within(switcher).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(switcher).getByRole("button", { name: /DC bus undervoltage/ }));
    expect(await screen.findByRole("article", { name: "DC bus undervoltage" })).toBeInTheDocument();
    expect(within(switcher).getByRole("button", { name: /DC bus undervoltage/ })).toHaveAttribute("aria-pressed", "true");
    await vi.waitFor(() => expect(calls.some((c) => c.url.includes("situation_id=sit-bus-2"))).toBe(true));
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
