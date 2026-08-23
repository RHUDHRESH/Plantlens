import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProviderBadge } from "./ProviderBadge";

describe("ProviderBadge", () => {
  it.each([
    ["live", "Live"],
    ["degraded", "Degraded"],
    ["offline", "Offline"],
  ] as const)("renders %s state", (state, label) => {
    render(<ProviderBadge state={state} />);
    const badge = screen.getByTestId("provider-badge");
    expect(badge).toHaveAttribute("data-provider", state);
    expect(badge).toHaveTextContent(label);
  });

  it("uses custom label", () => {
    render(<ProviderBadge state="live" label="Advisor · llama3" />);
    expect(screen.getByTestId("provider-badge")).toHaveTextContent("Advisor · llama3");
  });

  it("becomes a button that opens Copilot when onClick is provided", () => {
    const onClick = vi.fn();
    render(<ProviderBadge state="degraded" onClick={onClick} />);
    const badge = screen.getByRole("button", { name: /open Copilot/i });
    fireEvent.click(badge);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
