/**
 * Demo audit ledger data — frontend governance preview, not live backend proof.
 */
import type {
  ApprovalItem,
  AuditEvent,
  AuditEventKind,
  AuditFilter,
  BlockedAction,
  HashChainStep,
  ReviewQueueCounts,
} from "./auditTypes";

export const DEMO_AUDIT_EVENTS: AuditEvent[] = [
  {
    id: "evt-1042",
    time: "10:42",
    kind: "runtime",
    event: "State tick",
    actor: "engine",
    status: "hashVerified",
    scope: "plant state",
    summary: "Canonical values tick — hash verified",
    hash: "a3f8…c21",
    previousHash: "genesis…001",
    evidenceRefs: ["plant.json", "signals.json"],
  },
  {
    id: "evt-1043",
    time: "10:43",
    kind: "situation",
    event: "Situation grouped",
    actor: "engine",
    status: "grouped",
    scope: "motor overload",
    summary: "14 alarms → motor overload situation",
    hash: "b7e2…d44",
    previousHash: "a3f8…c21",
    evidenceRefs: ["graph.json", "faults.json"],
  },
  {
    id: "evt-1044",
    time: "10:44",
    kind: "acknowledgement",
    event: "Ack hold",
    actor: "operator",
    status: "recorded",
    scope: "sit-motor-overload",
    summary: "Press-hold ack recorded — no plant write",
    hash: "c1a9…e88",
    previousHash: "b7e2…d44",
    evidenceRefs: ["audit log"],
  },
  {
    id: "evt-1048",
    time: "10:48",
    kind: "aiProposal",
    event: "AI proposal",
    actor: "copilot",
    status: "blockedLive",
    scope: "write_plc",
    summary: "write_plc proposal blocked — no write path",
    hash: "d4b1…f02",
    previousHash: "c1a9…e88",
    evidenceRefs: ["audit log", "roles.json"],
  },
  {
    id: "evt-1049",
    time: "10:49",
    kind: "blockedTool",
    event: "write_plc blocked",
    actor: "copilot",
    status: "blockedLive",
    scope: "PLC write",
    summary: "Tool boundary enforced",
    hash: "e2c3…a11",
    previousHash: "d4b1…f02",
    evidenceRefs: ["audit log"],
  },
  {
    id: "evt-1051",
    time: "10:51",
    kind: "modelDraft",
    event: "Asset draft submitted",
    actor: "engineer",
    status: "pending",
    scope: "motor.dc",
    summary: "Threshold update pending review",
    hash: "f5d6…b33",
    previousHash: "e2c3…a11",
    evidenceRefs: ["asset_types.json", "signals.json"],
  },
  {
    id: "evt-1053",
    time: "10:53",
    kind: "layoutDraft",
    event: "Layout draft submitted",
    actor: "engineer",
    status: "pending",
    scope: "Line A",
    summary: "Add vibration sensor V-101",
    hash: "g6e7…c44",
    previousHash: "f5d6…b33",
    evidenceRefs: ["plant_layout.json"],
  },
  {
    id: "evt-1055",
    time: "10:55",
    kind: "hmiDraft",
    event: "HMI preview exported",
    actor: "compiler",
    status: "draftExport",
    scope: "mobile operator warning",
    summary: "Draft export — no runtime deploy",
    hash: "h7f8…d55",
    previousHash: "g6e7…c44",
    evidenceRefs: ["templates.json", "roles.json"],
  },
];

export const DEMO_PENDING_APPROVALS: ApprovalItem[] = [
  {
    id: "appr-asset-1",
    title: "Asset template change: motor.dc threshold update",
    kind: "assetDraft",
    actor: "engineer",
    scope: "motor.dc",
    status: "pending",
    beforeLabel: "current.warning_high",
    beforeValue: "4.83A",
    afterLabel: "current.warning_high",
    afterValue: "5.10A",
    evidence: ["formula source", "parameter update", "validation warning"],
    risk: "medium",
  },
  {
    id: "appr-layout-1",
    title: "Layout draft: add vibration sensor V-101",
    kind: "layoutDraft",
    actor: "engineer",
    scope: "Line A",
    status: "pending",
    beforeLabel: "layout blocks",
    beforeValue: "no V-101 vibration sensor",
    afterLabel: "layout blocks",
    afterValue: "add V-101 vibration sensor to M-101",
    evidence: ["layout draft", "binding validation"],
    risk: "low",
  },
  {
    id: "appr-hmi-1",
    title: "HMI draft: operator mobile warning variant",
    kind: "hmiDraft",
    actor: "compiler",
    scope: "mobile operator warning variant",
    status: "pending",
    beforeLabel: "HMI variant",
    beforeValue: "no warning mobile variant",
    afterLabel: "HMI variant",
    afterValue: "generated warning variant",
    evidence: ["compiler preview", "role target operator"],
    risk: "low",
  },
];

export const DEMO_BLOCKED_ACTIONS: BlockedAction[] = [
  {
    id: "blk-plc",
    tool: "write_plc",
    actor: "copilot",
    reason: "PlantLens has no write path",
    attemptedAt: "10:48",
    boundary: "noWritePath",
  },
  {
    id: "blk-graph",
    tool: "change_graph",
    actor: "engineer",
    reason: "Live approved graph is read-only",
    attemptedAt: "10:47",
    boundary: "readOnlyGraph",
  },
  {
    id: "blk-hmi",
    tool: "deploy_hmi",
    actor: "compiler",
    reason: "HMI export is draft-only",
    attemptedAt: "10:55",
    boundary: "draftOnly",
  },
  {
    id: "blk-ack",
    tool: "approve_for_user",
    actor: "copilot",
    reason: "Human approval required",
    attemptedAt: "10:48",
    boundary: "approvalRequired",
  },
];

export const DEMO_HASH_CHAIN: HashChainStep[] = [
  { id: "genesis", label: "Genesis", hash: "gen…001", status: "verified" },
  { id: "tick_1042", label: "tick_1042", hash: "a3f…c21", status: "verified" },
  { id: "group_1043", label: "group_1043", hash: "b7e…d44", status: "verified" },
  { id: "ack_1044", label: "ack_1044", hash: "c1a…e88", status: "verified" },
  { id: "proposal_1048", label: "proposal_1048", hash: "d4b…f02", status: "verified" },
  { id: "draft_1051", label: "draft_1051", hash: "f5d…b33", status: "verified" },
];

export const REVIEW_QUEUE_COUNTS: ReviewQueueCounts = {
  pending: 3,
  approved: 14,
  rejected: 2,
};

const FILTER_KIND_MAP: Record<Exclude<AuditFilter, "all">, AuditEventKind[]> = {
  runtime: ["runtime"],
  modelDrafts: ["modelDraft", "layoutDraft", "hmiDraft"],
  aiProposals: ["aiProposal"],
  acknowledgements: ["acknowledgement"],
  blockedTools: ["blockedTool", "aiProposal"],
};

export function filterAuditEvents(
  events: AuditEvent[],
  filter: AuditFilter,
  search: string,
): AuditEvent[] {
  let result = events;
  if (filter !== "all") {
    const kinds = FILTER_KIND_MAP[filter];
    result = result.filter((e) => kinds.includes(e.kind));
    if (filter === "blockedTools") {
      result = result.filter(
        (e) => e.kind === "blockedTool" || e.status === "blockedLive",
      );
    }
  }
  const q = search.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (e) =>
        e.event.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.scope.toLowerCase().includes(q) ||
        e.summary.toLowerCase().includes(q),
    );
  }
  return result;
}

export function getAuditEventById(id: string): AuditEvent | undefined {
  return DEMO_AUDIT_EVENTS.find((e) => e.id === id);
}

export function getApprovalById(id: string): ApprovalItem | undefined {
  return DEMO_PENDING_APPROVALS.find((a) => a.id === id);
}

export function statusLabel(status: AuditEvent["status"]): string {
  const labels: Record<AuditEvent["status"], string> = {
    hashVerified: "hash verified",
    grouped: "grouped",
    recorded: "recorded",
    blockedLive: "blocked live",
    pending: "pending",
    approved: "approved",
    rejected: "rejected",
    changesRequested: "changes requested",
    draftExport: "draft export",
  };
  return labels[status];
}

export function boundaryLabel(boundary: BlockedAction["boundary"]): string {
  const labels: Record<BlockedAction["boundary"], string> = {
    noWritePath: "no write path",
    readOnlyGraph: "read-only graph",
    draftOnly: "draft only",
    approvalRequired: "approval required",
  };
  return labels[boundary];
}