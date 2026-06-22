import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { resetStudioDraftStoreForTests, useStudioDraftStore } from "../../studio-forms";
import { CompilePreviewWorkbench } from "../CompilePreviewWorkbench";

describe("CompilePreviewWorkbench", () => {
  beforeEach(() => {
    resetStudioDraftStoreForTests();
  });

  it("validates draft", () => {
    render(<CompilePreviewWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: /Validate draft/i }));
    expect(useStudioDraftStore.getState().lastValidatedAt).toBeTruthy();
  });

  it("Generate local preview disabled when errors exist", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    useStudioDraftStore.setState({
      issues: [
        {
          id: "plant:A:ERR",
          family: "plant",
          targetId: "A",
          severity: "error",
          code: "ERR",
          message: "broken",
        },
      ],
      status: "invalid",
    });
    render(<CompilePreviewWorkbench />);
    expect(screen.getByRole("button", { name: /Generate local preview/i })).toBeDisabled();
  });

  it("Generate local preview compiles valid draft", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    render(<CompilePreviewWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: /Generate local preview/i }));
    expect(screen.getByText("Compiled")).toBeInTheDocument();
    expect(screen.getByLabelText(/Live plant map/i)).toBeInTheDocument();
    expect(screen.getByText(/local preview only/i)).toBeInTheDocument();
  });

  it("Reset local preview clears model", () => {
    useStudioDraftStore.getState().loadInitialBundle();
    render(<CompilePreviewWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: /Generate local preview/i }));
    expect(screen.getByLabelText(/Live plant map/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Reset local preview/i }));
    expect(screen.getByText(/Generate a local preview to render/i)).toBeInTheDocument();
  });

  it("has no Save Submit or Apply buttons", () => {
    render(<CompilePreviewWorkbench />);
    expect(screen.queryByRole("button", { name: /Save/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Submit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Apply/i })).not.toBeInTheDocument();
  });
});