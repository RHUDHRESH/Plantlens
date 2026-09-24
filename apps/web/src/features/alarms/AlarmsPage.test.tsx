import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeSnapshot } from "../../api/types";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { defaultRoutes, mockFetch, renderPage, seed } from "../operational-map/testUtils";
import { AlarmsPage } from "./AlarmsPage";

const SNAPSHOT: RuntimeSnapshot = {
  ...HERO_MOTOR_OVERLOAD,
  active_alarms: [
    ...HERO_MOTOR_OVERLOAD.active_alarms,
    {
      alarm_id: "INV_UNDERVOLTAGE",
      asset_id: "INV-102",
      tag_id: "INV_102_UNDERVOLTAGE",
      severity: "warning",
      priority: 2,
      message: "Inverter undervoltage",
      raised_at: "2026-01-01T10:32:19Z",
      acked: false,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("AlarmsPage", () => {
  it("renders every raw alarm with priority, state and first-out marker", async () => {
    seed(SNAPSHOT, "operator");
    mockFetch(defaultRoutes(SNAPSHOT));
    renderPage(<AlarmsPage />, "/ops/alarms");
    const table = screen.getByRole("table", { name: "Active alarms" });
    expect(within(table).getByText("Motor current high")).toBeInTheDocument();
    expect(within(table).getByText("DC bus low")).toBeInTheDocument();
    expect(within(table).getByText("Inverter undervoltage")).toBeInTheDocument();
    // Motor current rose first in the flood.
    const firstRow = within(table).getByText("Motor current high").closest("tr")!;
    expect(within(firstRow).getByText("First out")).toBeInTheDocument();
    expect(within(table).getAllByText("Unacked").length).toBe(3);
  });

  it("filters by text search", () => {
    seed(SNAPSHOT, "operator");
    mockFetch(defaultRoutes(SNAPSHOT));
    renderPage(<AlarmsPage />, "/ops/alarms");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search alarms" }), { target: { value: "bus" } });
    const table = screen.getByRole("table", { name: "Active alarms" });
    expect(within(table).queryByText("Motor current high")).not.toBeInTheDocument();
    expect(within(table).getByText("DC bus low")).toBeInTheDocument();
  });

  it("is read-only for viewers (no selection, no ack)", () => {
    seed(SNAPSHOT, "viewer");
    mockFetch(defaultRoutes(SNAPSHOT));
    renderPage(<AlarmsPage />, "/ops/alarms");
    expect(screen.queryByRole("button", { name: /Acknowledge selected/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ack" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.getByText(/Read-only/)).toBeInTheDocument();
  });

  it("acks a P2 alarm directly but asks to confirm a P1", async () => {
    seed(SNAPSHOT, "operator");
    const { calls } = mockFetch(
      defaultRoutes(SNAPSHOT, { "/ack": { status: "ok", alarm_id: "x", audit_id: "a1" } }),
    );
    renderPage(<AlarmsPage />, "/ops/alarms");
    const table = screen.getByRole("table", { name: "Active alarms" });

    const p2Row = within(table).getByText("Motor current high").closest("tr")!;
    // Priority comes from the rule (P2) once rules have loaded.
    await within(p2Row).findByText("P2");
    fireEvent.click(within(p2Row).getByRole("button", { name: "Ack" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/alarms/MOTOR_CURRENT_HIGH/ack") && c.method === "POST")).toBe(true));

    const p1Row = within(table).getByText("DC bus low").closest("tr")!;
    fireEvent.click(within(p1Row).getByRole("button", { name: "Ack" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/priority 1/)).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("/alarms/DC_BUS_LOW/ack"))).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: /Acknowledge/ }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/alarms/DC_BUS_LOW/ack"))).toBe(true));
  });

  it("validates the shelve dialog: reason required, presets limited by rule", async () => {
    seed(SNAPSHOT, "operator");
    const { calls } = mockFetch(defaultRoutes(SNAPSHOT, { "/INV_UNDERVOLTAGE/shelve": { status: "ok", until: "2026-01-01T10:48:00Z", audit_id: "a" } }));
    renderPage(<AlarmsPage />, "/ops/alarms?alarm=INV_UNDERVOLTAGE");
    // Rules load asynchronously; the Shelve button enables once the rule says it is shelvable.
    const shelve = await screen.findByRole("button", { name: "Shelve…" });
    await waitFor(() => expect(shelve).not.toBeDisabled());
    fireEvent.click(shelve);
    const dialog = await screen.findByRole("dialog", { name: "Shelve alarm" });
    expect(within(dialog).getByRole("radio", { name: "15 min" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "1 h" })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Shelve alarm" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/reason/i);
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/shelve"))).toBe(false);

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Sensor recalibration" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Shelve alarm" }));
    await waitFor(() => expect(calls.some((c) => c.url.includes("/alarms/INV_UNDERVOLTAGE/shelve") && c.method === "POST")).toBe(true));
  });

  it("groups alarms under every active situation, with a link to each Calm Card", async () => {
    const second = {
      ...SNAPSHOT.active_situations[0]!,
      situation_id: "sit-inv-2",
      title: "Inverter undervoltage trip risk",
      root_asset_id: "INV-102",
      root_asset_name: "Motor Inverter",
      severity: "warning" as const,
      grouped_alarm_ids: ["INV_UNDERVOLTAGE"],
    };
    const first = { ...SNAPSHOT.active_situations[0]!, grouped_alarm_ids: ["MOTOR_CURRENT_HIGH", "DC_BUS_LOW"] };
    const snap: RuntimeSnapshot = { ...SNAPSHOT, active_situations: [first, second] };
    seed(snap, "operator");
    mockFetch(defaultRoutes(snap));
    renderPage(<AlarmsPage />, "/ops/alarms?tab=grouped");
    const motor = await screen.findByRole("region", { name: "Motor mechanical overload" });
    expect(within(motor).getByText("Motor current high")).toBeInTheDocument();
    expect(within(motor).queryByText("Inverter undervoltage")).not.toBeInTheDocument();
    const inv = screen.getByRole("region", { name: "Inverter undervoltage trip risk" });
    expect(within(inv).getByText("Inverter undervoltage")).toBeInTheDocument();
    expect(within(inv).getByText(/Root: Motor Inverter/)).toBeInTheDocument();
    expect(within(inv).getByRole("link", { name: "Open Calm Card" })).toHaveAttribute("href", "/ops?situation=sit-inv-2");
    expect(screen.queryByRole("region", { name: "Not grouped" })).not.toBeInTheDocument();
  });

  it("lists shelved alarms with who, why and until", async () => {
    seed(SNAPSHOT, "operator");
    mockFetch(
      defaultRoutes(SNAPSHOT, {
        "/api/runtime/alarms/shelved": {
          shelved: [{ alarm_id: "INV_UNDERVOLTAGE", reason: "Recalibration WO-1", by: "operator-local", at: "2026-01-01T10:30:00Z", until: "2026-01-01T10:45:00Z" }],
        },
      }),
    );
    renderPage(<AlarmsPage />, "/ops/alarms?tab=shelved");
    expect(await screen.findByText("Recalibration WO-1")).toBeInTheDocument();
    expect(screen.getByText("operator-local")).toBeInTheDocument();
    expect(screen.getByText("10:45:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unshelve" })).toBeInTheDocument();
  });
});
