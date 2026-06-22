import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { getInitialStudioDraftBundle } from "../../studio-forms/demoBundleLoader";
import { validateDraftBundle } from "../../studio-forms/studioDraftSchema";
import { compileLocalHmiPreview } from "../localPreviewCompiler";
import { PreviewReportPanel } from "../PreviewReportPanel";

const MODEL = compileLocalHmiPreview({
  bundle: getInitialStudioDraftBundle(),
  draftIssues: validateDraftBundle(getInitialStudioDraftBundle()),
  now: () => "2026-06-22T12:00:00.000Z",
}).model!;

describe("PreviewReportPanel", () => {
  it("renders nothing without model", () => {
    const { container } = render(<PreviewReportPanel model={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders preview report with plant ID and generated timestamp", () => {
    render(<PreviewReportPanel model={MODEL} />);
    expect(screen.getByRole("region", { name: /Preview report/i })).toBeInTheDocument();
    expect(screen.getByText("demo_microgrid_001")).toBeInTheDocument();
    expect(screen.getByText("2026-06-22T12:00:00.000Z")).toBeInTheDocument();
    expect(screen.getByText(/8 assets/i)).toBeInTheDocument();
    expect(screen.getByText(/Not saved and not applied/i)).toBeInTheDocument();
  });
});