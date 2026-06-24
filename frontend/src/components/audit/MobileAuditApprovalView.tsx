import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import {
  DEMO_AUDIT_EVENTS,
  DEMO_BLOCKED_ACTIONS,
  REVIEW_QUEUE_COUNTS,
  filterAuditEvents,
  getApprovalById,
  statusLabel,
  boundaryLabel,
} from "./demoAuditData";
import { ApprovalDiffPanel } from "./ApprovalDiffPanel";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

export function MobileAuditApprovalView() {
  const {
    auditFilter,
    auditLedgerSearch,
    selectedApprovalId,
    hashChainStatus,
    approvalReviewState,
    verifyHashChain,
    goBackToHmiPreview,
    recordApprovalDecision,
    role,
  } = useStore();

  const events = useMemo(
    () => filterAuditEvents(DEMO_AUDIT_EVENTS, auditFilter, auditLedgerSearch).slice(-4),
    [auditFilter, auditLedgerSearch],
  );
  const approval = selectedApprovalId ? getApprovalById(selectedApprovalId) : null;
  const canDecide = role === "supervisor" || role === "engineer";

  return (
    <div className="pl-mobile-audit">
      <header className="pl-mobile-audit__header">
        <span className="pl-label">Audit</span>
        <h1 className="pl-mobile-audit__title">Approval Review</h1>
        <div className="pl-mobile-audit__badges">
          <Badge variant="success">Chain {hashChainStatus}</Badge>
          <Badge variant="readonly">DRAFT GOVERNANCE</Badge>
        </div>
      </header>

      <Panel title="Review queue" variant="light">
        <ul className="pl-mobile-audit__queue">
          <li>Pending changes <strong>{REVIEW_QUEUE_COUNTS.pending}</strong></li>
          <li>Approved changes <strong>{REVIEW_QUEUE_COUNTS.approved}</strong></li>
          <li>Rejected changes <strong>{REVIEW_QUEUE_COUNTS.rejected}</strong></li>
        </ul>
      </Panel>

      <Panel title="Latest events" variant="light">
        <ul className="pl-mobile-audit__events">
          {events.map((evt) => (
            <li key={evt.id} className="pl-mobile-audit__event">
              <div className="pl-mobile-audit__event-row">
                <strong>{evt.time} {evt.event}</strong>
                <span>{statusLabel(evt.status)}</span>
              </div>
              <span className="pl-mobile-audit__event-meta">{evt.actor} · {evt.summary}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Selected approval" variant="light">
        {approval ? (
          <>
            <p className="pl-mobile-audit__approval-title">{approval.title}</p>
            <p className="pl-mobile-audit__meta">{approval.scope} · {approval.status}</p>
            <ApprovalDiffPanel />
            {approvalReviewState !== "none" && (
              <p className="pl-mobile-audit__meta">Review: {approvalReviewState}</p>
            )}
          </>
        ) : (
          <p className="pl-mobile-audit__meta">No approval selected</p>
        )}
      </Panel>

      <Panel title="Blocked actions" variant="light">
        <ul className="pl-mobile-audit__blocked">
          {DEMO_BLOCKED_ACTIONS.map((a) => (
            <li key={a.id}>
              <code>{a.tool}</code> <span>BLOCKED</span>
              <span className="pl-mobile-audit__meta">{boundaryLabel(a.boundary)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <div className="pl-mobile-audit__actions">
        <Button variant="secondary" size="lg" fullWidth onClick={verifyHashChain}>
          Verify Chain
        </Button>
        <Button variant="ghost" size="lg" fullWidth disabled title="Export draft only">
          Export Draft
        </Button>
        <Button variant="secondary" size="lg" fullWidth onClick={goBackToHmiPreview}>
          Back HMI Preview
        </Button>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          disabled={!canDecide || !approval}
          onClick={() => recordApprovalDecision("approved")}
        >
          Approve
        </Button>
        <Button
          variant="danger"
          size="lg"
          fullWidth
          disabled={!canDecide || !approval}
          onClick={() => recordApprovalDecision("rejected")}
        >
          Reject
        </Button>
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          disabled={!canDecide || !approval}
          onClick={() => recordApprovalDecision("changesRequested")}
        >
          Request
        </Button>
      </div>
    </div>
  );
}