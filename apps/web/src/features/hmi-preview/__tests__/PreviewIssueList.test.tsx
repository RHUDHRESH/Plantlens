import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PreviewIssueList } from "../PreviewIssueList";
import type { PreviewCompileIssue } from "../previewTypes";

const ISSUES: PreviewCompileIssue[] = [
  { id: "e1", severity: "error", family: "tag_map", targetId: "T1", code: "ERR", message: "bad tag", source: "draft_validation" },
  { id: "w1", severity: "warning", family: "plant", targetId: "A1", code: "WARN", message: "fallback", source: "preview_projection" },
  { id: "i1", severity: "info", family: "preview", targetId: null, code: "INFO", message: "local only", source: "local_compile" },
];

describe("PreviewIssueList", () => {
  it("groups errors warnings info", () => {
    render(<PreviewIssueList issues={ISSUES} />);
    expect(screen.getByText(/Errors \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Warnings \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Info \(1\)/i)).toBeInTheDocument();
  });

  it("renders source badge and target ID", () => {
    render(<PreviewIssueList issues={ISSUES} />);
    expect(screen.getByText("draft_validation")).toBeInTheDocument();
    expect(screen.getByText("T1")).toBeInTheDocument();
    expect(screen.getByText("bad tag")).toBeInTheDocument();
  });

  it("has no fake fix button", () => {
    render(<PreviewIssueList issues={ISSUES} onSelectIssue={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /fix/i })).not.toBeInTheDocument();
  });
});