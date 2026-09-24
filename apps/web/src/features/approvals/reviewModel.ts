/**
 * Review-form rules (R5): a human engineer/admin decides, always with a comment. The API enforces
 * all of this again; these helpers keep the UI honest and explain refusals with a fix.
 */
import type { ChangeRequest } from "../../api/v2";
import type { Role } from "../../app/session";
import { ENGINEER_ROLES } from "../../app/session";

export type Decision = "approve" | "reject";

export interface ReviewDraft {
  decision: Decision | null;
  comment: string;
  approveEdges: boolean;
}

export interface ReviewErrors {
  decision?: string;
  comment?: string;
}

export const MIN_COMMENT = 3;

export function validateReview(draft: ReviewDraft): ReviewErrors {
  const errors: ReviewErrors = {};
  if (!draft.decision) errors.decision = "Choose Approve or Reject.";
  const c = draft.comment.trim();
  if (!c) errors.comment = "A review comment is required. Say what you checked (P&ID, nameplate, thresholds).";
  else if (c.length < MIN_COMMENT) errors.comment = "Write a few words so the audit ledger explains the decision.";
  else if (c.length > 4000) errors.comment = "Keep the comment under 4000 characters.";
  return errors;
}

export function canReview(role: Role, change: Pick<ChangeRequest, "status"> | null | undefined): { allowed: boolean; reason?: string } {
  if (!ENGINEER_ROLES.includes(role)) {
    return { allowed: false, reason: "Only engineers and administrators can review changes. Switch role or ask an engineer." };
  }
  if (!change) return { allowed: false };
  if (change.status !== "pending") return { allowed: false, reason: `This change is ${change.status}; only pending changes can be reviewed.` };
  return { allowed: true };
}

export interface EdgeCounts {
  alarmRules: number;
  edges: number;
  loops: number;
  nodes: number;
  situations: number;
}

export function countOps(change: Pick<ChangeRequest, "change_set">): EdgeCounts {
  const counts: EdgeCounts = { alarmRules: 0, edges: 0, loops: 0, nodes: 0, situations: 0 };
  for (const op of change.change_set?.ops ?? []) {
    if (op.op === "add_alarm_rule" || op.op === "update_alarm_rule") counts.alarmRules += 1;
    if (op.op === "add_edge" || op.op === "update_edge") {
      counts.edges += 1;
      const e = (op.edge ?? op.fields ?? {}) as { loop_ok?: boolean };
      if (e.loop_ok) counts.loops += 1;
    }
    if (op.op === "upsert_node") counts.nodes += 1;
    if (op.op === "add_situation_type") counts.situations += 1;
  }
  return counts;
}

/** Consequence lines for the confirm dialog. */
export function consequences(
  draft: ReviewDraft,
  change: Pick<ChangeRequest, "change_set" | "title">,
  latestRev: number | null | undefined,
): string[] {
  if (draft.decision === "reject") {
    return [
      `Marks “${change.title}” as rejected. Nothing reaches the runtime.`,
      "Your comment is written to the audit ledger (change.review.reject).",
    ];
  }
  const next = latestRev != null ? `r${latestRev + 1}` : "a new revision";
  const c = countOps(change);
  const lines = [`Creates revision ${next} and hot-deploys it. The runtime swaps atomically; earlier revisions stay available for rollback.`];
  const parts = [];
  if (c.alarmRules) parts.push(`${c.alarmRules} alarm rule${c.alarmRules > 1 ? "s" : ""}`);
  if (c.nodes) parts.push(`${c.nodes} node evidence update${c.nodes > 1 ? "s" : ""}`);
  if (c.edges) parts.push(`${c.edges} causal edge${c.edges > 1 ? "s" : ""}`);
  if (c.situations) parts.push(`${c.situations} situation type${c.situations > 1 ? "s" : ""}`);
  if (parts.length) lines.push(`Applies ${parts.join(", ")}.`);
  if (c.edges) {
    lines.push(
      draft.approveEdges
        ? `The ${c.edges} proposed edge${c.edges > 1 ? "s are" : " is"} admitted (approved) — the live causal engine will traverse ${c.edges > 1 ? "them" : "it"}${c.loops ? `, including ${c.loops} flagged feedback loop edge${c.loops > 1 ? "s" : ""}` : ""}.`
        : "Proposed edges are stored unapproved; the runtime ignores them until a later change admits them.",
    );
  }
  lines.push("Approval and deployment are recorded in the audit ledger.");
  return lines;
}

/** Map review API refusals to {message, fix} for ErrorNotice. */
export function explainReviewError(error: unknown): { message: string; fix?: string | undefined; kind: "four_eyes" | "stale" | "invalid" | "conflict" | "other" } {
  const e = error as { status?: number; body?: { message?: string; fix?: string; base_rev?: number; current_rev?: number } } | null;
  const status = e?.status;
  const body = e?.body ?? {};
  const message = body.message ?? (error instanceof Error ? error.message : "Review failed");
  if (status === 403) {
    if (/four-eyes/i.test(message)) {
      return {
        kind: "four_eyes",
        message: "You drafted this change, so you cannot approve it yourself (four-eyes policy).",
        fix: "Ask another engineer or an administrator to review it. The draft stays pending until then.",
      };
    }
    return { kind: "other", message, fix: body.fix ?? "Sign in as an engineer or administrator to review changes." };
  }
  if (status === 409 && body.base_rev !== undefined) {
    return {
      kind: "stale",
      message: `This change was drafted against r${body.base_rev}, but r${body.current_rev} is live now. It has been marked stale.`,
      fix: "Re-submit it against the current revision so the preview and validation are recomputed.",
    };
  }
  if (status === 409) return { kind: "conflict", message, fix: body.fix ?? "Reload the queue; the change may already have been reviewed." };
  if (status === 422) {
    return { kind: "invalid", message, fix: body.fix ?? "Fix the validation errors listed above (re-draft the change), then submit it again." };
  }
  return { kind: "other", message, fix: body.fix };
}
