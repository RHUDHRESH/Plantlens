import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";
import { defaultRoutes, mockFetch, renderPage, seed } from "../operational-map/testUtils";
import { IncidentsPage } from "./IncidentsPage";

afterEach(() => vi.unstubAllGlobals());

const ROOM = {
  incident_id: "INC-001",
  title: "Motor mechanical overload",
  status: "open",
  severity: "critical",
  root_asset: { asset_id: "MTR-301", name: "3-Phase Motor", status: "critical" },
  live_state: {
    still_active: true,
    active_alarm_count: 5,
    latest_value_summary: [{ tag_id: "MOTOR_301_CURRENT", value: 3.4, unit: "A", quality: "GOOD" }],
  },
  checklist: [
    { id: "c1", label: "Inspect shaft load", status: "pending" },
    { id: "c2", label: "Confirm isolation", status: "done" },
  ],
  timeline: [{ id: "t1", type: "created", timestamp: "2026-01-01T10:33:00Z", actor: "operator-local", message: "Escalated from Calm Card." }],
};

describe("IncidentsPage", () => {
  it("lists rooms and opens one by id with checklist and timeline", async () => {
    seed(HERO_MOTOR_OVERLOAD, "operator");
    const { calls } = mockFetch(
      defaultRoutes(HERO_MOTOR_OVERLOAD, {
        "/api/incidents": { incident_ids: ["INC-001"] },
        "/api/incidents/INC-001": ROOM,
        "/api/incidents/INC-001/checklist": { incident: { ...ROOM, checklist: ROOM.checklist.map((c) => ({ ...c, status: "done" })) }, audit_id: "a" },
      }),
    );
    renderPage(<IncidentsPage />, "/ops/incidents?id=INC-001");
    expect(await screen.findByRole("heading", { name: "Motor mechanical overload" })).toBeInTheDocument();
    expect(screen.getByText("Inspect shaft load")).toBeInTheDocument();
    expect(screen.getByText(/Escalated from Calm Card/)).toBeInTheDocument();
    expect(screen.getByText("1/2 done")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/checklist") && c.method === "POST")).toBe(true));
  });

  it("offers to open a room from the active situation (operators) but not to viewers", async () => {
    seed(HERO_MOTOR_OVERLOAD, "operator");
    mockFetch(defaultRoutes(HERO_MOTOR_OVERLOAD, { "/api/incidents": { incident_ids: [] } }));
    const { unmount } = renderPage(<IncidentsPage />, "/ops/incidents");
    expect(screen.getByRole("button", { name: /Open room for/ })).toBeInTheDocument();
    unmount();
    seed(HERO_MOTOR_OVERLOAD, "viewer");
    renderPage(<IncidentsPage />, "/ops/incidents");
    expect(screen.queryByRole("button", { name: /Open room for/ })).not.toBeInTheDocument();
  });
});
