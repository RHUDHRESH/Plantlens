import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { resetStudioDraftStoreForTests, useStudioDraftStore } from "../../studio-forms";
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

  it("compile_preview route renders CompilePreviewWorkbench", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    render(
      <StudioLaunchpad
        open
        route={{ surface: "compile_preview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/Local compile preview/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate local preview/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generate local preview/i }));
    expect(screen.getByText("Compiled")).toBeInTheDocument();
  });

  it("warning banner still says no live runtime mutation", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "compile_preview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/no live runtime mutation/i)).toBeInTheDocument();
  });
});