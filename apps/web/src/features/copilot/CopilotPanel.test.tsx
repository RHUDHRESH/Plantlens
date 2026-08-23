import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CopilotPanel, isHardRefuseResponse } from "./CopilotPanel";
import type { AiResponse } from "../../api/client";

const postAiMessage = vi.fn();

vi.mock("../../api/client", () => ({
  postAiMessage: (...args: unknown[]) => postAiMessage(...args),
}));

function baseResponse(overrides: Partial<AiResponse> = {}): AiResponse {
  return {
    response_id: "resp-1",
    intent: "explain_situation",
    role: "operator",
    summary: "Motor overload explanation",
    answer: "Current rose first at MTR-301 based on the evidence packet.",
    evidence_refs: [
      {
        ref_type: "evidence_packet",
        ref_id: "EP-1",
        quote_or_value: "root_asset_id=MTR-301",
      },
    ],
    cited_signals: ["MOTOR_301_CURRENT"],
    cited_alarms: ["MOTOR_CURRENT_HIGH"],
    cited_assets: ["MTR-301"],
    cited_edges: [],
    cited_audit_ids: [],
    proposed_actions: [],
    limitations: ["Advisory only — not a control command."],
    confidence: 0.8,
    requires_human_approval: false,
    created_at: "2026-01-01T10:00:00Z",
    ...overrides,
  };
}

describe("isHardRefuseResponse", () => {
  it("detects refuse and hardware wording", () => {
    expect(
      isHardRefuseResponse({
        summary: "Request refused.",
        answer: "PlantLens does not issue hardware commands.",
      }),
    ).toBe(true);
    expect(
      isHardRefuseResponse({
        summary: "Situation summary",
        answer: "Current rose on the motor feeder.",
      }),
    ).toBe(false);
  });
});

describe("CopilotPanel", () => {
  beforeEach(() => {
    postAiMessage.mockReset();
  });

  it("posts a message and renders answer, citations, and limitations", async () => {
    postAiMessage.mockResolvedValue({
      response: baseResponse(),
      intent: "explain_situation",
    });

    render(<CopilotPanel open onOpenChange={vi.fn()} providerState="live" />);

    fireEvent.change(screen.getByTestId("copilot-input"), {
      target: { value: "Why did this fire?" },
    });
    fireEvent.click(screen.getByTestId("copilot-send"));

    expect(screen.getByTestId("copilot-loading")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("copilot-response")).toBeInTheDocument();
    });
    expect(postAiMessage).toHaveBeenCalledWith("Why did this fire?");
    expect(screen.getByText(/Motor overload explanation/i)).toBeInTheDocument();
    expect(screen.getByText(/Current rose first at MTR-301/i)).toBeInTheDocument();
    expect(screen.getByText(/evidence_packet:EP-1/i)).toBeInTheDocument();
    expect(screen.getByText(/Advisory only/i)).toBeInTheDocument();
    expect(screen.queryByTestId("copilot-refuse-banner")).not.toBeInTheDocument();
  });

  it("shows hard-refuse UX when answer mentions refuse/hardware", async () => {
    postAiMessage.mockResolvedValue({
      response: baseResponse({
        summary: "Request refused.",
        answer: "PlantLens does not issue hardware commands or write to PLCs.",
        evidence_refs: [],
        limitations: ["Hardware writes are out of scope."],
      }),
      intent: "control_request",
    });

    render(<CopilotPanel open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByTestId("copilot-input"), {
      target: { value: "Trip the breaker" },
    });
    fireEvent.click(screen.getByTestId("copilot-send"));

    await waitFor(() => {
      expect(screen.getByTestId("copilot-refuse-banner")).toBeInTheDocument();
    });
    expect(screen.getByTestId("copilot-response")).toHaveAttribute("data-refused", "true");
  });

  it("surfaces API errors calmly", async () => {
    postAiMessage.mockRejectedValue(new Error("API unreachable"));
    render(<CopilotPanel open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByTestId("copilot-input"), {
      target: { value: "Explain" },
    });
    fireEvent.click(screen.getByTestId("copilot-send"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/API unreachable/i);
  });
});
