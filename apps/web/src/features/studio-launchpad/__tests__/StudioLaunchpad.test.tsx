import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { resetStudioDraftStoreForTests, useStudioDraftStore } from "../../studio-forms";
import { StudioLaunchpad } from "../StudioLaunchpad";

const onNavigate = vi.fn();

describe("StudioLaunchpad", () => {
  beforeEach(() => {
    resetStudioDraftStoreForTests();
    onNavigate.mockReset();
  });

  it("renders authoring chrome and nav when open", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "overview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByText(/Authoring · local draft/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Compile Preview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fault Matrix/i })).toBeInTheDocument();
  });

  it("navigates when a surface button is clicked", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "overview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Assets/i }));
    expect(onNavigate).toHaveBeenCalledWith("asset", null);
  });

  it("asset route renders StudioFormShell", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "asset", targetId: "PV-101", mode: "edit_intent" }}
        onClose={vi.fn()}
        onNavigate={onNavigate}
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
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent(/Local draft only/i);
    expect(screen.queryByRole("button", { name: /Save draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^apply/i })).not.toBeInTheDocument();
  });

  it("compile_preview route renders CompilePreviewWorkbench", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    render(
      <StudioLaunchpad
        open
        route={{ surface: "compile_preview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByText(/Local compile preview/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate local preview/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generate local preview/i }));
    expect(screen.getByText("Compiled")).toBeInTheDocument();
  });

  it("header states local draft authoring (no live mutation)", () => {
    render(
      <StudioLaunchpad
        open
        route={{ surface: "compile_preview", targetId: null, mode: "inspect" }}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      />,
    );
    expect(screen.getByText(/Authoring · local draft · Esc to close/i)).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <StudioLaunchpad
        open
        route={{ surface: "overview", targetId: null, mode: "inspect" }}
        onClose={onClose}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
