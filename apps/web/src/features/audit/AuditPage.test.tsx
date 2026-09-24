import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditRecord } from "../../api/v2";
import { renderAt, setRole } from "../approvals/testUtils";
import { AuditPage } from "./AuditPage";
import { entityHref, nextOffset, pageInfo, prevOffset, setEntity, setPageSize, togglePrefix, truncateHash } from "./auditModel";

const getAudit = vi.fn();
vi.mock("../../api/v2", () => ({ getAudit: (...args: unknown[]) => getAudit(...args) }));

const record = (i: number, action: string): AuditRecord => ({
  audit_id: `a-${i}`,
  ts: "2026-09-24T03:30:05Z",
  actor_type: "user",
  actor_id: "web-operator",
  actor_role: "engineer",
  action,
  entity_type: "bundle_revision",
  entity_id: "2",
  before: { rev: 1 },
  after: { rev: 2, hash: "e7546b" },
  ...(i === 0 ? { reason: "Checked nameplate" } : {}),
  hash_prev: "df4e05b0fa421040aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa290be47d065e",
  hash_self: "f62b8b230d4dd76ebbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba7ef4a7dc473",
});

describe("audit model", () => {
  const base = { action: null, entityId: "", limit: 50, offset: 100 };
  it("filter changes reset paging", () => {
    expect(togglePrefix(base, "change.")).toMatchObject({ action: "change.", offset: 0 });
    expect(togglePrefix({ ...base, action: "change." }, "change.")).toMatchObject({ action: null, offset: 0 });
    expect(setEntity(base, "x").offset).toBe(0);
    expect(setPageSize(base, 25)).toMatchObject({ limit: 25, offset: 0 });
  });
  it("computes pages", () => {
    expect(pageInfo(0, 50, 0)).toEqual({ page: 1, pages: 1, from: 0, to: 0, hasPrev: false, hasNext: false });
    expect(pageInfo(120, 50, 50)).toEqual({ page: 2, pages: 3, from: 51, to: 100, hasPrev: true, hasNext: true });
    expect(pageInfo(120, 50, 100)).toMatchObject({ to: 120, hasNext: false });
    expect(nextOffset({ ...base, offset: 50 }, 120)).toBe(100);
    expect(nextOffset({ ...base, offset: 100 }, 120)).toBe(100);
    expect(prevOffset({ ...base, offset: 30 })).toBe(0);
  });
  it("links entities and truncates hashes", () => {
    expect(entityHref({ entity_type: "change_request", entity_id: "c-1" })).toBe("/eng/approvals/c-1");
    expect(entityHref({ entity_type: "bundle_revision", entity_id: "3" })).toBe("/admin/revisions?rev=3");
    expect(entityHref({ entity_type: "alarm", entity_id: "x" })).toBeNull();
    expect(truncateHash("0123456789abcdef0123456789")).toBe("01234567…456789");
  });
});

describe("AuditPage", () => {
  beforeEach(() => {
    setRole("admin");
    getAudit.mockReset();
    getAudit.mockImplementation((params: { action?: string; offset?: number }) =>
      Promise.resolve({
        total: 120,
        records: [record(0, params.action ? `${params.action}review.approve` : "bundle.revision.create"), record(1, "runtime.deploy")],
        chain: { valid: true, checked_records: 120, broken_index: null, reason: null },
      }),
    );
  });

  it("shows the integrity banner and rows, and filters by action prefix", async () => {
    renderAt(<AuditPage />, { path: "/admin/audit", route: "/admin/audit" });
    expect(await screen.findByText(/Chain intact/)).toBeInTheDocument();
    expect(screen.getByText(/All 120 records verified/)).toBeInTheDocument();
    expect(screen.getByText("1–50 of 120")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "change." }));
    expect(screen.getByRole("button", { name: "change." })).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByText("change.review.approve")).toBeInTheDocument();
    expect(getAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "change.", offset: 0, limit: 50 }), expect.anything());
  });

  it("pages with limit/offset", async () => {
    renderAt(<AuditPage />, { path: "/admin/audit", route: "/admin/audit" });
    await screen.findByText("1–50 of 120");
    fireEvent.click(screen.getByRole("button", { name: /Older/ }));
    expect(await screen.findByText("51–100 of 120")).toBeInTheDocument();
    expect(getAudit).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 50 }), expect.anything());
    expect(screen.getByRole("button", { name: /Newer/ })).toBeEnabled();
  });

  it("opens a detail drawer with before/after and the hash chain", async () => {
    renderAt(<AuditPage />, { path: "/admin/audit", route: "/admin/audit" });
    fireEvent.click(await screen.findByRole("button", { name: "bundle.revision.create" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("hash_prev")).toBeInTheDocument();
    expect(within(dialog).getByText("df4e05b0fa421040…290be47d065e")).toBeInTheDocument();
    expect(within(dialog).getByText(/"hash": "e7546b"/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Open bundle revision" })).toHaveAttribute("href", "/admin/revisions?rev=2");
  });

  it("explains a broken chain", async () => {
    getAudit.mockResolvedValue({ total: 0, records: [], chain: { valid: false, checked_records: 9, broken_index: 4, reason: "hash_self mismatch" } });
    renderAt(<AuditPage />, { path: "/admin/audit", route: "/admin/audit" });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Chain broken at record #4.");
    expect(alert).toHaveTextContent("hash_self mismatch");
  });
});
