import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { getInitialStudioDraftBundle } from "../../studio-forms/demoBundleLoader";
import { validateDraftBundle } from "../../studio-forms/studioDraftSchema";
import { compileLocalHmiPreview } from "../localPreviewCompiler";
import { PreviewMapPanel } from "../PreviewMapPanel";

const MODEL = compileLocalHmiPreview({
  bundle: getInitialStudioDraftBundle(),
  draftIssues: validateDraftBundle(getInitialStudioDraftBundle()),
  now: () => "fixed",
}).model!;

describe("PreviewMapPanel", () => {
  it("shows invalid/no model state", () => {
    render(<PreviewMapPanel model={null} invalid />);
    expect(screen.getByText(/Fix draft validation errors/i)).toBeInTheDocument();
  });

  it("model renders preview map", () => {
    render(<PreviewMapPanel model={MODEL} />);
    expect(screen.getByLabelText(/Live plant map/i)).toBeInTheDocument();
  });

  it("shows no live telemetry note", () => {
    render(<PreviewMapPanel model={MODEL} />);
    expect(screen.getByText(/Preview has no live telemetry/i)).toBeInTheDocument();
    expect(screen.queryByText(/ROOT CAUSE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Calm Card/i)).not.toBeInTheDocument();
  });

  it("selecting preview asset calls callback", () => {
    const onSelect = vi.fn();
    render(<PreviewMapPanel model={MODEL} onSelectAsset={onSelect} />);
    fireEvent.click(screen.getByLabelText(/PV Array/i));
    expect(onSelect).toHaveBeenCalledWith("PV-101");
  });
});