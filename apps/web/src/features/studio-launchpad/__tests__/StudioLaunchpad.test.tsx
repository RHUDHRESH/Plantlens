import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioLaunchpad } from "../StudioLaunchpad";

describe("StudioLaunchpad", () => {
  it("renders warning banner and nav when open", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "overview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Draft authoring surface/i)).toBeInTheDocument();
    expect(screen.getByText(/Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/Compile Preview/i)).toBeInTheDocument();
  });

  it("displays target ID for routed surface", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "tag", targetId: "MOTOR_301_CURRENT", mode: "edit_intent" }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/MOTOR_301_CURRENT/)).toBeInTheDocument();
    expect(screen.getByText(/Draft surface not wired yet/i)).toBeInTheDocument();
  });

  it("has no save or apply buttons", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "compile_preview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument();
  });

  it("disabled compile buttons explain why", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "compile_preview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
      />,
    );
    const validateBtn = screen.getByRole("button", { name: /Validate authored bundle/i });
    expect(validateBtn).toBeDisabled();
    expect(validateBtn).toHaveAttribute(
      "title",
      "Validation action will be wired after Studio forms are connected.",
    );
  });
});