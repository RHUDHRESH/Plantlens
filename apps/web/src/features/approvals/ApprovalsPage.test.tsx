import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApprovalsPage } from "./ApprovalsPage";
import { makeChange, renderAt, setRole } from "./testUtils";

const mutate = vi.fn();
const reviewState: { error: unknown; isPending: boolean } = { error: null, isPending: false };

const changes = [
  makeChange({ change_id: "c-pending", base_rev: 2 }),
  makeChange({ change_id: "c-old", title: "Bus imbalance on DC Bus", base_rev: 1, source: "agent", created_by: "agent-drafter" }),
  makeChange({ change_id: "c-dep", status: "deployed", title: "Deployed one", result_rev: 2, reviewed_by: "eng-2", review_comment: "Looks right" }),
  makeChange({ change_id: "c-rej", status: "rejected", title: "Rejected one", reviewed_by: "eng-2", review_comment: "Duplicate" }),
];

vi.mock("../../api/queries", () => ({
  useChanges: () => ({ data: { changes }, isLoading: false, error: null }),
  useChange: () => ({ data: undefined, isLoading: false, error: null }),
  useActiveRevision: () => ({ data: { runtime: { bundle_rev: 2 }, latest_revision: { rev: 2 } } }),
  useCausalGraph: () => ({ data: { edges: [] } }),
  useReviewChange: () => ({ mutate, reset: vi.fn(), ...reviewState }),
}));

vi.mock("./engData", () => ({
  useUnitFor: () => (tag: string) => (tag === "MOTOR_301_CURRENT" ? "A" : undefined),
  useEntityLookup: () => () => undefined,
}));

vi.mock("./elkLayout", () => ({
  useGraphLayout: () => ({ layout: null, error: false }),
  pathFor: () => "",
}));

describe("ApprovalsPage", () => {
  beforeEach(() => {
    mutate.mockReset();
    reviewState.error = null;
    setRole("engineer");
  });

  it("renders queue tabs with counts and opens the first pending change", () => {
    renderAt(<ApprovalsPage />, { path: "/eng/approvals", route: "/eng/approvals" });
    const tabs = screen.getByRole("tablist", { name: "Queue" });
    expect(within(tabs).getByRole("tab", { name: /Pending\s*2/ })).toHaveAttribute("aria-selected", "true");
    expect(within(tabs).getByRole("tab", { name: /Deployed\s*1/ })).toBeInTheDocument();
    expect(within(tabs).getByRole("tab", { name: /Rejected\s*1/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mechanical overload on 3-Phase Motor" })).toBeInTheDocument();
    // Alarm rule rendered as a sentence with units; edge with lag/polarity/loop.
    expect(screen.getAllByText("MOTOR_301_CURRENT > 3.4 A for 2 s, warning").length).toBeGreaterThan(0);
    expect(screen.getAllByText("MTR-301 → INV-102 · lag [0–500 ms] · polarity + · loop drive_current_limit").length).toBeGreaterThan(0);
  });

  it("warns when a pending draft is based on an older revision", () => {
    renderAt(<ApprovalsPage />, { path: "/eng/approvals/:changeId", route: "/eng/approvals/c-old" });
    expect(screen.getByText(/Drafted against r1; r2 is now the latest revision/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Re-submit against r2/ })).toBeInTheDocument();
  });

  it("requires a comment before confirming, then submits the decision", () => {
    renderAt(<ApprovalsPage />, { path: "/eng/approvals/:changeId", route: "/eng/approvals/c-pending" });
    fireEvent.click(screen.getByLabelText(/Approve & deploy/));
    fireEvent.click(screen.getByRole("button", { name: "Approve & deploy…" }));
    expect(screen.getByText(/A review comment is required/)).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: /Review comment/ }), { target: { value: "Checked against the P&ID" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve & deploy…" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Creates revision r3 and hot-deploys it/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Approve & deploy" }));
    expect(mutate).toHaveBeenCalledWith(
      { id: "c-pending", decision: "approve", comment: "Checked against the P&ID", approve_edges: true },
      expect.anything(),
    );
  });

  it("sends approve_edges=false when the reviewer unticks edge admission", () => {
    renderAt(<ApprovalsPage />, { path: "/eng/approvals/:changeId", route: "/eng/approvals/c-pending" });
    fireEvent.click(screen.getByLabelText(/Approve & deploy/));
    fireEvent.click(screen.getByRole("checkbox", { name: /Admit proposed edges/ }));
    fireEvent.change(screen.getByRole("textbox", { name: /Review comment/ }), { target: { value: "Rules only for now" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve & deploy…" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Approve & deploy" }));
    expect(mutate.mock.calls[0]![0]).toMatchObject({ approve_edges: false });
  });

  it("renders the four-eyes refusal with a fix", () => {
    reviewState.error = { status: 403, body: { message: "Four-eyes policy: the author cannot review their own change" } };
    renderAt(<ApprovalsPage />, { path: "/eng/approvals/:changeId", route: "/eng/approvals/c-pending" });
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot approve it yourself/);
    expect(screen.getByRole("alert")).toHaveTextContent(/another engineer or an administrator/);
  });

  it("hides the review form from roles that cannot review", () => {
    setRole("operator");
    renderAt(<ApprovalsPage />, { path: "/eng/approvals/:changeId", route: "/eng/approvals/c-pending" });
    expect(screen.queryByRole("form", { name: "Review this change" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only engineers and administrators can review/)).toBeInTheDocument();
  });

  it("shows the review record for deployed changes", () => {
    renderAt(<ApprovalsPage />, { path: "/eng/approvals/:changeId", route: "/eng/approvals/c-dep?tab=deployed" });
    expect(screen.getByText("Looks right")).toBeInTheDocument();
    expect(screen.getByText(/edges stored unapproved|edges admitted/)).toBeInTheDocument();
  });
});
