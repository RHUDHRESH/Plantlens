/** Rollback gating and revision-timeline helpers (pure). */
import type { RevisionSummary } from "../../api/v2";
import type { Role } from "../../app/session";

export function canRollback(role: Role, rev: number, activeRev: number | null | undefined): { allowed: boolean; reason?: string } {
  if (role !== "admin") return { allowed: false, reason: "Only administrators can roll back. Engineers have read-only access to history." };
  if (activeRev != null && rev === activeRev) return { allowed: false, reason: "This revision is already live." };
  return { allowed: true };
}

export function validateRollbackReason(reason: string): string | null {
  const r = reason.trim();
  if (!r) return "A reason is required. It is written to the audit ledger with the rollback.";
  if (r.length < 3) return "Write a few words explaining why the plant goes back to this revision.";
  if (r.length > 4000) return "Keep the reason under 4000 characters.";
  return null;
}

export function isRollbackRevision(r: Pick<RevisionSummary, "note" | "source_change_id">): boolean {
  return !r.source_change_id && /^Rollback to r\d+/.test(r.note ?? "");
}

export function rollbackTarget(r: Pick<RevisionSummary, "note">): number | null {
  const m = /^Rollback to r(\d+)/.exec(r.note ?? "");
  return m ? Number(m[1]) : null;
}

export function shortHash(hash: string | null | undefined, n = 10): string {
  return hash ? hash.slice(0, n) : "—";
}

/** Strip the "(approved: …)" suffix the pipeline appends so the timeline shows the title. */
export function noteTitle(note: string | null | undefined): { title: string; comment: string | null } {
  if (!note) return { title: "", comment: null };
  const m = /^(.*) \(approved: (.*)\)$/s.exec(note);
  if (m) return { title: m[1]!, comment: m[2]! };
  const rb = /^(Rollback to r\d+): (.*)$/s.exec(note);
  if (rb) return { title: rb[1]!, comment: rb[2]! };
  return { title: note, comment: null };
}
