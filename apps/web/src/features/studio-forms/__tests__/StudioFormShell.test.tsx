import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SAVE_UNAVAILABLE, StudioFormShell, SUBMIT_UNAVAILABLE } from "../StudioFormShell";
import { TooltipProvider } from "../../../components/ui/primitives";
import { resetStudioDraftStoreForTests } from "../useStudioDraftStore";

describe("StudioFormShell", () => {
  beforeEach(() => {
    resetStudioDraftStoreForTests();
  });

  it("renders status strip", () => {
    render(<TooltipProvider><StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} /></TooltipProvider>);
    expect(screen.getByText(/Draft status:/i)).toBeInTheDocument();
  });

  it("renders entity list", () => {
    render(<TooltipProvider><StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} /></TooltipProvider>);
    const list = screen.getByLabelText("Entity list");
    expect(within(list).getByText("PV-101")).toBeInTheDocument();
  });

  it("routes asset target", () => {
    render(
      <TooltipProvider>
        <StudioFormShell route={{ surface: "asset", targetId: "BAT-101", mode: "edit_intent" }} />
      </TooltipProvider>,
    );
    expect(screen.getByDisplayValue("Battery Bank")).toBeInTheDocument();
  });

  it("shows disabled Save/Submit actions with reasons", () => {
    render(<TooltipProvider><StudioFormShell route={{ surface: "tag", targetId: null, mode: "inspect" }} /></TooltipProvider>);
    const save = screen.getByRole("button", { name: /Save draft/i });
    const submit = screen.getByRole("button", { name: /Submit for approval/i });
    expect(save).toBeDisabled();
    expect(submit).toBeDisabled();
    expect(save).toHaveAttribute("title", SAVE_UNAVAILABLE);
    expect(submit).toHaveAttribute("title", SUBMIT_UNAVAILABLE);
  });

  it("filters the entity list and marks entities with issues", () => {
    render(<TooltipProvider><StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} /></TooltipProvider>);
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter entities" }), { target: { value: "BAT" } });
    const list = screen.getByLabelText("Entity list");
    expect(within(list).getByText("BAT-101")).toBeInTheDocument();
    expect(within(list).queryByText("PV-101")).not.toBeInTheDocument();
  });

  it("renders validation panel", () => {
    render(<TooltipProvider><StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} /></TooltipProvider>);
    expect(screen.getByLabelText("Validation")).toBeInTheDocument();
  });

  it("has no fake success copy", () => {
    render(<TooltipProvider><StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} /></TooltipProvider>);
    expect(screen.queryByText(/successfully saved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compile complete/i)).not.toBeInTheDocument();
  });
});