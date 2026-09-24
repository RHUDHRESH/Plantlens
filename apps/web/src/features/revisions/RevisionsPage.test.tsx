import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt, setRole } from "../approvals/testUtils";
import { RevisionsPage } from "./RevisionsPage";
import { canRollback, isRollbackRevision, noteTitle, rollbackTarget, validateRollbackReason } from "./revisionModel";

const rollbackMutate = vi.fn();

vi.mock("../../api/queries", () => ({
  useRevisions: () => ({
    data: {
      revisions: [
        { rev: 3, parent_rev: 2, bundle_hash: "c".repeat(64), created_by: "admin-local", source_change_id: null, note: "Rollback to r1: nuisance trips", deployed_at: "2026-09-24T04:00:00+00:00" },
        { rev: 2, parent_rev: 1, bundle_hash: "b".repeat(64), created_by: "eng-2", source_change_id: "c-1", note: "Motor overload (approved: Checked nameplate)", deployed_at: "2026-09-24T03:30:05+00:00" },
        { rev: 1, parent_rev: null, bundle_hash: "a".repeat(64), created_by: "system", source_change_id: null, note: "Seeded from authored bundle files", deployed_at: null },
      ],
    },
    isLoading: false,
    error: null,
  }),
  useActiveRevision: () => ({ data: { runtime: { bundle_rev: 3, source: "revision" }, latest_revision: { rev: 3 } } }),
  useRollback: () => ({ mutate: rollbackMutate, isPending: false, error: null }),
}));

vi.mock("../approvals/engData", () => ({
  useUnitFor: () => () => undefined,
  useEntityLookup: () => () => undefined,
  useRevisionDiff: (from: number | null, to: number | null) => ({
    data:
      from != null && to != null
        ? {
            from: { rev: from },
            to: { rev: to },
            identical: false,
            diff: [{ doc: "causal_graph", collection: "edges", id: "E9", kind: "removed", before: { from: "MTR-301", to: "INV-102", lag_ms: [0, 500] } }],
          }
        : undefined,
    isLoading: false,
    error: null,
  }),
}));

describe("revision helpers", () => {
  it("gates rollback to admins and non-live revisions", () => {
    expect(canRollback("admin", 1, 3).allowed).toBe(true);
    expect(canRollback("admin", 3, 3)).toEqual({ allowed: false, reason: "This revision is already live." });
    expect(canRollback("engineer", 1, 3).allowed).toBe(false);
    expect(canRollback("operator", 1, 3).reason).toMatch(/Only administrators/);
  });
  it("requires a reason", () => {
    expect(validateRollbackReason("")).toMatch(/required/);
    expect(validateRollbackReason("ok")).toMatch(/few words/);
    expect(validateRollbackReason("Nuisance trips on start")).toBeNull();
  });
  it("parses notes", () => {
    expect(noteTitle("Motor overload (approved: Checked nameplate)")).toEqual({ title: "Motor overload", comment: "Checked nameplate" });
    expect(noteTitle("Rollback to r1: nuisance")).toEqual({ title: "Rollback to r1", comment: "nuisance" });
    expect(isRollbackRevision({ note: "Rollback to r1: x", source_change_id: null })).toBe(true);
    expect(rollbackTarget({ note: "Rollback to r12: x" })).toBe(12);
  });
});

describe("RevisionsPage", () => {
  beforeEach(() => rollbackMutate.mockReset());

  it("renders the timeline with the live revision and the diff against its parent", () => {
    setRole("admin");
    renderAt(<RevisionsPage />, { path: "/admin/revisions", route: "/admin/revisions" });
    expect(screen.getByText("Live", { selector: ".rev-live" })).toBeInTheDocument();
    expect(screen.getByText("rollback of r1")).toBeInTheDocument();
    expect(screen.getByText("Changes in r3")).toBeInTheDocument();
    expect(screen.getByText("MTR-301 → INV-102 · lag [0–500 ms]")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "source change" })).toHaveAttribute("href", "/eng/approvals/c-1");
  });

  it("lets admins roll back only with a reason, explaining a new revision is created", () => {
    setRole("admin");
    renderAt(<RevisionsPage />, { path: "/admin/revisions", route: "/admin/revisions" });
    expect(screen.queryByRole("button", { name: "Roll back to r3" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Roll back to r1" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/Creates a new revision/);
    expect(dialog).toHaveTextContent(/never rewrites history/);
    fireEvent.click(within(dialog).getByRole("button", { name: /Deploy r1 as r4/ }));
    expect(within(dialog).getByText(/A reason is required/)).toBeInTheDocument();
    expect(rollbackMutate).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Reason/ }), { target: { value: "Nuisance trips on start-up" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Deploy r1 as r4/ }));
    expect(rollbackMutate).toHaveBeenCalledWith({ toRev: 1, comment: "Nuisance trips on start-up" }, expect.anything());
  });

  it("is read-only for engineers", () => {
    setRole("engineer");
    renderAt(<RevisionsPage />, { path: "/admin/revisions", route: "/admin/revisions" });
    expect(screen.getByText(/Read-only for engineers/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Roll back/ })).not.toBeInTheDocument();
  });
});
