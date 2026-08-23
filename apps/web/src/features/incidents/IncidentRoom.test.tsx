import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IncidentRoom } from "./IncidentRoom";

vi.mock("../../api/client", () => ({
  getIncidentRoom: vi.fn().mockResolvedValue({
    incident_id: "inc-1",
    title: "Motor overload",
    severity: "critical",
    status: "open",
    root_asset: { asset_id: "MTR-301", name: "Motor" },
    live_state: { still_active: true, active_alarm_count: 3 },
    calm_card: { title: "Motor Mechanical Overload" },
    evidence_bundle: { raw_alarms: [{ alarm_id: "A1" }] },
    checklist: [{ id: "c1", label: "Verify shaft load", status: "pending" }],
    timeline: [
      {
        id: "t1",
        timestamp: "2026-01-01T10:32:14Z",
        actor: "system",
        message: "Escalated from Calm Card",
      },
    ],
  }),
  addIncidentComment: vi.fn(),
  completeChecklistItem: vi.fn(),
  updateIncidentStatus: vi.fn(),
}));

function wrap(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("IncidentRoom", () => {
  it("renders escalate evidence and timeline events", async () => {
    wrap(<IncidentRoom incidentId="inc-1" onClose={vi.fn()} />);
    expect(await screen.findByText("Motor overload")).toBeInTheDocument();
    expect(screen.getByText("Motor Mechanical Overload")).toBeInTheDocument();
    expect(screen.getByLabelText(/Append-only timeline/i)).toBeInTheDocument();
    expect(screen.getByText(/system: Escalated from Calm Card/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Acknowledge/i })).toBeInTheDocument();
  });
});
