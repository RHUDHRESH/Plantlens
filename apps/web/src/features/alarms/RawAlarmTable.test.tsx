import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RawAlarmTable } from "./RawAlarmTable";

vi.mock("../../api/client", () => ({
  ackAlarm: vi.fn().mockResolvedValue({ status: "ok", alarm_id: "A1", audit_id: "audit-1" }),
}));

function wrap(ui: ReactElement) {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("RawAlarmTable", () => {
  const alarms = [
    {
      alarm_id: "MOTOR_CURRENT_HIGH",
      asset_id: "MTR-301",
      tag_id: "MOTOR_301_CURRENT",
      severity: "critical" as const,
      message: "Motor current high",
      raised_at: "2026-01-01T10:32:14Z",
      acked: false,
    },
  ];

  it("expands raw alarms on toggle", () => {
    wrap(<RawAlarmTable alarms={alarms} situationTitle="Motor overload" />);
    fireEvent.click(screen.getByText(/1 raw alarm grouped — view raw alarms/i));
    expect(screen.getByText(/Motor current high/i)).toBeInTheDocument();
    expect(screen.getByText(/Grouping receipt.*Motor overload/i)).toBeInTheDocument();
  });

  it("shows ack control for unacked alarms", () => {
    wrap(<RawAlarmTable alarms={alarms} defaultExpanded />);
    expect(screen.getByRole("button", { name: /Acknowledge alarm/i })).toBeInTheDocument();
  });
});