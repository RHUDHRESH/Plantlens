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

  it("shows local-draft note instead of dead Save/Submit chrome", () => {
    render(<StudioFormShell route={{ surface: "tag", targetId: null, mode: "inspect" }} />);
    expect(screen.getByRole("note")).toHaveTextContent(/Local draft only/i);
    expect(screen.queryByRole("button", { name: /Save draft/i })).not.toBeInTheDocument();
  });

  it("renders validation panel", () => {
    render(<StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />);
    expect(screen.getByLabelText("Validation")).toBeInTheDocument();
  });

  it("routes fault matrix target", () => {
    render(
      <StudioFormShell
        route={{ surface: "fault_matrix", targetId: "F_MOTOR_MECHANICAL_OVERLOAD", mode: "inspect" }}
      />,
    );
    expect(screen.getByLabelText("Fault definition")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Motor Mechanical Overload")).toBeInTheDocument();
    expect(screen.getByDisplayValue("3-Phase Motor")).toBeInTheDocument();
  });

  it("has no fake success copy", () => {
    render(<StudioFormShell route={{ surface: "asset", targetId: null, mode: "inspect" }} />);
    expect(screen.queryByText(/successfully saved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/compile complete/i)).not.toBeInTheDocument();
  });
});