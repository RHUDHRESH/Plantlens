import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudioFormShell } from "../StudioFormShell";
import { resetStudioDraftStoreForTests } from "../useStudioDraftStore";

describe("StudioFormShell", () => {
  beforeEach(() => {
    resetStudioDraftStoreForTests();
  });

  it("renders status strip", () => {
    render(<StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />);
    expect(screen.getByText(/Draft status:/i)).toBeInTheDocument();
  });

  it("renders entity list", () => {
    render(<StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />);
    expect(screen.getByLabelText("Entity list")).toBeInTheDocument();
    expect(screen.getByText("PV-101")).toBeInTheDocument();
  });

  it("routes asset target", () => {
    render(
      <StudioFormShell route={{ surface: "asset", targetId: "BAT-101", mode: "edit_intent" }} />,
    );
    expect(screen.getByDisplayValue("Battery Bank")).toBeInTheDocument();
  });

  it("shows disabled Save/Submit/Compile actions with reasons", () => {
    render(<StudioFormShell route={{ surface: "tag", targetId: null, mode: "inspect" }} />);
    const save = screen.getByRole("button", { name: /Save draft/i });
    const submit = screen.getByRole("button", { name: /Submit for approval/i });
    const compile = screen.getByRole("button", { name: /Compile preview/i });
    expect(save).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(compile).toBeDisabled();
    expect(save).toHaveAttribute("title", "Backend save is not wired in this prompt.");
    expect(submit).toHaveAttribute("title", "Approval workflow comes after draft persistence.");
    expect(compile).toHaveAttribute("title", "Compile preview comes after forms validation.");
  });

  it("renders validation panel", () => {
    render(<StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />);
    expect(screen.getByLabelText("Validation")).toBeInTheDocument();
  });

  it("has no fake success copy", () => {
    render(<StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />);
    expect(screen.queryByText(/successfully saved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compile complete/i)).not.toBeInTheDocument();
  });
});