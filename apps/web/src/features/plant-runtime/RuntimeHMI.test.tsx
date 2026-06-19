import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuntimeHMI } from "./RuntimeHMI";
import { useRuntimeStore } from "../../app/store/runtime";

vi.mock("../../api/client", () => ({
  issueDevToken: vi.fn().mockResolvedValue("test-token"),
  getCompiledBundle: vi.fn().mockRejectedValue(new Error("offline")),
}));

vi.mock("../../api/ws", () => ({
  connectRuntimeSocket: vi.fn(() => ({ close: vi.fn() })),
}));

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("RuntimeHMI", () => {
  beforeEach(() => {
    useRuntimeStore.getState().reset();
  });

  it("renders shell with no-situation and connection strip", () => {
    useRuntimeStore.getState().setConnection("disconnected");
    wrap(<RuntimeHMI />);
    expect(screen.getByText(/No active situation/i)).toBeInTheDocument();
    expect(screen.getByText(/OFFLINE/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Raw alarms/i)).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("top-strip");
  });

  it("shows stale badge without layout-breaking duplicate conn labels", () => {
    useRuntimeStore.getState().setConnection("stale");
    wrap(<RuntimeHMI />);
    const badges = screen.getAllByText(/DATA STALE/i);
    expect(badges).toHaveLength(1);
  });
});