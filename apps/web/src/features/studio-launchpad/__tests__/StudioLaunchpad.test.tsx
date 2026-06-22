import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resetStudioDraftStoreForTests } from "../../studio-forms";
import { StudioLaunchpad } from "../StudioLaunchpad";

describe("StudioLaunchpad", () => {
  beforeEach(() => {
    resetStudioDraftStoreForTests();
  });

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

  it("asset route renders StudioFormShell", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "asset", targetId: "PV-101", mode: "edit_intent" }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Draft status:/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Entity list")).toBeInTheDocument();
    expect(screen.queryByText(/Draft surface not wired yet/i)).not.toBeInTheDocument();
  });

  it("has no enabled save or apply buttons", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "asset", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
      />,
    );
    const save = screen.getByRole("button", { name: /Save draft/i });
    expect(save).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^apply/i })).not.toBeInTheDocument();
  });

  it("compile preview remains disabled", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "compile_preview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
      />,
    );
    const validateBtn = screen.getByRole("button", { name: /Validate authored bundle/i });
    const compileBtn = screen.getByRole("button", { name: /Compile preview/i });
    expect(validateBtn).toBeDisabled();
    expect(compileBtn).toBeDisabled();
    expect(screen.getByText(/Forms validation is local only in Prompt 8/i)).toBeInTheDocument();
    expect(screen.getByText(/Compile preview is still disabled until Prompt 9/i)).toBeInTheDocument();
  });
});