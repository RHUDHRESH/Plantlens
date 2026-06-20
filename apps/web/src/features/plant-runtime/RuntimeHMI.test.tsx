import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RuntimeHMI } from "./RuntimeHMI";
import { useRuntimeStore } from "../../app/store/runtime";
import { motorObstructionHmiState } from "../hmi-state/__fixtures__/plantHmiState.fixture";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";

vi.mock("../../api/client", () => ({
  issueDevToken: vi.fn().mockResolvedValue("test-token"),
  getCompiledBundle: vi.fn().mockRejectedValue(new Error("offline")),
}));

vi.mock("../../api/ws", () => ({
  connectRuntimeSocket: vi.fn(() => ({ close: vi.fn() })),
}));

vi.mock("../../api/hmi", () => ({
  getRuntimeHmiState: vi.fn().mockRejectedValue(new Error("hmi offline")),
  isRuntimeEndpointUnavailable: vi.fn(() => true),
}));

import { getRuntimeHmiState } from "../../api/hmi";

function wrap(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("RuntimeHMI", () => {
  beforeEach(() => {
    useRuntimeStore.getState().reset();
    vi.mocked(getRuntimeHmiState).mockReset();
    vi.mocked(getRuntimeHmiState).mockRejectedValue(new Error("hmi offline"));
  });

  it("renders shell with no-situation and connection strip when HMI runtime fails", async () => {
    useRuntimeStore.getState().setConnection("disconnected");
    wrap(<RuntimeHMI />);
    expect(await screen.findByText(/All clear/i)).toBeInTheDocument();
    expect(screen.getByText(/OFFLINE/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Raw alarms/i)).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveClass("runtime-top-strip");
  });

  it("shows stale badge without layout-breaking duplicate conn labels", async () => {
    useRuntimeStore.getState().setConnection("stale");
    wrap(<RuntimeHMI />);
    const badges = await screen.findAllByText(/DATA STALE/i);
    expect(badges).toHaveLength(1);
  });

  it("renders HMI root cause panel when runtime HMI resolves", async () => {
    vi.mocked(getRuntimeHmiState).mockResolvedValue(motorObstructionHmiState);
    wrap(<RuntimeHMI />);
    expect(
      await screen.findByRole("heading", { name: /Motor-side mechanical obstruction/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("MOTOR_MECHANICAL_OBSTRUCTION")).toBeInTheDocument();
  });

  it("shows CalmCard fallback and warning when HMI runtime fails but snapshot has calm card", async () => {
    useRuntimeStore.getState().applySnapshot(HERO_MOTOR_OVERLOAD);
    wrap(<RuntimeHMI />);
    await waitFor(
      () => {
        expect(screen.getByText(/HMI runtime projection unavailable/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole("heading", { name: /Motor mechanical overload/i })).toBeInTheDocument();
  });
});