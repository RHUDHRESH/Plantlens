import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HmiPreviewPage } from "./HmiPreviewPage";
import { ApiError } from "../../api/types";
import type { PlantHMIState } from "../../app/schemas/plantHmi";

const BASE_STATE: PlantHMIState = {
  plant_id: "PLANTLENS_DEMO_BENCH",
  run_id: "run_test",
  generated_at: "2026-06-20T12:00:05Z",
  overall_status: "healthy",
  active_incident: null,
  assets: [],
  signals: [],
  causality_edges: [],
  root_cause_candidates: [],
  operator_actions: [],
  alarm_groups: [],
  suppressed_symptoms: [],
  data_quality: {
    missing_signals: [],
    stale_signals: [],
    confidence_penalty: 0,
    notes: [],
  },
};

vi.mock("../../api/client", () => ({
  issueDevToken: vi.fn().mockResolvedValue("test-token"),
}));

vi.mock("../../api/hmi", () => ({
  postHmiPreview: vi.fn(),
  getRuntimeHmiState: vi.fn(),
  isRuntimeEndpointUnavailable: (error: unknown) =>
    error instanceof ApiError && (error.status === 404 || error.status === 0),
}));

import { getRuntimeHmiState, postHmiPreview } from "../../api/hmi";

function renderPage(ui: ReactElement = <HmiPreviewPage />) {
  return render(ui);
}

describe("HmiPreviewPage", () => {
  beforeEach(() => {
    vi.mocked(postHmiPreview).mockReset();
    vi.mocked(getRuntimeHmiState).mockReset();
    vi.mocked(postHmiPreview).mockResolvedValue(BASE_STATE);
  });

  it("renders mode switcher", async () => {
    renderPage();
    expect(await screen.findByRole("tab", { name: /Scenario Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Runtime Snapshot/i })).toBeInTheDocument();
  });

  it("renders scenario preview source badge", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Run HMI projection/i });
    fireEvent.click(screen.getByRole("button", { name: /Run HMI projection/i }));
    expect(await screen.findByText(/Source: Scenario Preview/i)).toBeInTheDocument();
  });

  it("shows runtime unavailable message when GET /api/hmi/runtime returns 404", async () => {
    vi.mocked(getRuntimeHmiState).mockRejectedValue(
      new ApiError(404, { message: "Not found" }),
    );
    renderPage();
    await screen.findByRole("tab", { name: /Runtime Snapshot/i });
    fireEvent.click(screen.getByRole("tab", { name: /Runtime Snapshot/i }));
    fireEvent.click(screen.getByRole("button", { name: /Load runtime HMI/i }));
    expect(
      await screen.findByText(/Runtime HMI endpoint is not available yet/i),
    ).toBeInTheDocument();
  });

  it("operator actions do not render Execute button", async () => {
    vi.mocked(postHmiPreview).mockResolvedValue({
      ...BASE_STATE,
      operator_actions: [
        {
          priority: 1,
          title: "Inspect motor coupling",
          instruction: "Inspect before touching.",
          safety_level: "isolate_before_touch",
          target_asset_id: "MTR-12V",
          rationale: "Backend advisory only.",
        },
      ],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Run HMI projection/i }));
    await waitFor(() => {
      expect(screen.getByText(/Inspect motor coupling/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /Execute/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trip/i })).not.toBeInTheDocument();
  });

  it("blocked state renders data-quality notes", async () => {
    vi.mocked(postHmiPreview).mockResolvedValue({
      ...BASE_STATE,
      overall_status: "blocked",
      data_quality: {
        missing_signals: [],
        stale_signals: [],
        confidence_penalty: 1,
        notes: ["Gate artifact_integrity failed; HMI projection blocked."],
      },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Run HMI projection/i }));
    expect(await screen.findByText(/artifact_integrity failed/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Plant HMI status/i)).toHaveTextContent(/Blocked/);
  });

  it("no incident state renders calmly", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Run HMI projection/i }));
    const incidentPanel = await screen.findByLabelText(/Active incident/i);
    expect(incidentPanel).toHaveTextContent(/No active incident/i);
  });
});