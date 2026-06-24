/**
 * Audit Ledger types — governance and approval review (Screen 08).
 * Frontend preview only; no runtime mutation.
 */

export type AuditEventKind =
  | "runtime"
  | "situation"
  | "acknowledgement"
  | "aiProposal"
  | "modelDraft"
  | "layoutDraft"
  | "hmiDraft"
  | "blockedTool"
  | "approvalDecision";

export type AuditEventStatus =
  | "hashVerified"
  | "grouped"
  | "recorded"
  | "blockedLive"
  | "pending"
  | "approved"
  | "rejected"
  | "changesRequested"
  | "draftExport";

export type AuditFilter =
  | "all"
  | "runtime"
  | "modelDrafts"
  | "aiProposals"
  | "acknowledgements"
  | "blockedTools";

export type HashChainStatus = "verified" | "warning" | "failed" | "unknown";

export type ApprovalReviewState =
  | "none"
  | "approved"
  | "rejected"
  | "changesRequested";

export interface AuditEvent {
  id: string;
  time: string;
  kind: AuditEventKind;
  event: string;
  actor: string;
  status: AuditEventStatus;
  scope: string;
  summary: string;
  hash: string;
  previousHash: string;
  evidenceRefs: string[];
}

export interface ApprovalItem {
  id: string;
  title: string;
  kind: "assetDraft" | "layoutDraft" | "hmiDraft" | "graphProposal";
  actor: string;
  scope: string;
  status: "pending" | "approved" | "rejected" | "changesRequested";
  beforeLabel: string;
  beforeValue: string;
  afterLabel: string;
  afterValue: string;
  evidence: string[];
  risk: "low" | "medium" | "high" | "safety";
}

export interface BlockedAction {
  id: string;
  tool: string;
  actor: string;
  reason: string;
  attemptedAt: string;
  boundary: "noWritePath" | "readOnlyGraph" | "draftOnly" | "approvalRequired";
}

export interface HashChainStep {
  id: string;
  label: string;
  hash: string;
  status: "verified" | "warning" | "failed";
}

export interface ReviewQueueCounts {
  pending: number;
  approved: number;
  rejected: number;
}