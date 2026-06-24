import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { getApprovalById, getAuditEventById, statusLabel } from "./demoAuditData";
import { ApprovalDiffPanel } from "./ApprovalDiffPanel";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";

export function AuditEventInspector() {
  const {
    selectedApprovalId,
    selectedAuditEventId,
    approvalReviewState,
    recordApprovalDecision,
    role,
  } = useStore();

  const approval = useMemo(
    () => (selectedApprovalId ? getApprovalById(selectedApprovalId) : null),
    [selectedApprovalId],
  );
  const event = useMemo(
    () => (selectedAuditEventId ? getAuditEventById(selectedAuditEventId) : null),
    [selectedAuditEventId],
  );

  const canDecide = role === "supervisor" || role === "engineer";

  if (approval) {
    const riskVariant =
      approval.risk === "safety" || approval.risk === "high"
        ? "critical"
        : approval.risk === "medium"
          ? "warning"
          : "normal";

    return (
      <aside className="pl-audit-inspector" aria-label="Event inspector">
        <header className="pl-audit-inspector__header">
          <h2 className="pl-audit-inspector__title">Event Inspector</h2>
          <Badge variant="warning">Model draft submitted</Badge>
        </header>

        <section className="pl-audit-inspector__section">
          <h3 className="pl-audit-inspector__label">Selected approval</h3>
          <p className="pl-audit-inspector__value">{approval.title}</p>
          <dl className="pl-audit-inspector__meta">
            <div><dt>Actor</dt><dd>{approval.actor}</dd></div>
            <div><dt>Scope</dt><dd>{approval.scope}</dd></div>
            <div><dt>Kind</dt><dd>{approval.kind}</dd></div>
          </dl>
          <Badge variant={riskVariant}>risk: {approval.risk}</Badge>
        </section>

        <ApprovalDiffPanel />

        <section className="pl-audit-inspector__section">
          <h3 className="pl-audit-inspector__label">Decision</h3>
          {approvalReviewState !== "none" && (
            <p className="pl-audit-inspector__decision">
              Local review state: <strong>{approvalReviewState}</strong>
            </p>
          )}
          <div className="pl-audit-inspector__actions">
            <Button
              variant="primary"
              size="md"
              disabled={!canDecide}
              onClick={() => recordApprovalDecision("approved")}
            >
              Approve
            </Button>
            <Button
              variant="danger"
              size="md"
              disabled={!canDecide}
              onClick={() => recordApprovalDecision("rejected")}
            >
              Reject
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={!canDecide}
              onClick={() => recordApprovalDecision("changesRequested")}
            >
              Request changes
            </Button>
          </div>
          {!canDecide && (
            <p className="pl-audit-inspector__role-hint">
              Supervisor/engineer role required for approval review.
            </p>
          )}
        </section>

        <footer className="pl-audit-inspector__footer">
          <p>Decision is recorded locally in this frontend pass. Runtime model is not changed.</p>
        </footer>
      </aside>
    );
  }

  if (event) {
    return (
      <aside className="pl-audit-inspector" aria-label="Event inspector">
        <header className="pl-audit-inspector__header">
          <h2 className="pl-audit-inspector__title">Event Inspector</h2>
        </header>

        <section className="pl-audit-inspector__section">
          <dl className="pl-audit-inspector__details">
            <div><dt>Time</dt><dd>{event.time}</dd></div>
            <div><dt>Event</dt><dd>{event.event}</dd></div>
            <div><dt>Kind</dt><dd>{event.kind}</dd></div>
            <div><dt>Actor</dt><dd>{event.actor}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(event.status)}</dd></div>
            <div><dt>Scope</dt><dd>{event.scope}</dd></div>
            <div><dt>Hash</dt><dd><code>{event.hash}</code></dd></div>
            <div><dt>Previous hash</dt><dd><code>{event.previousHash}</code></dd></div>
          </dl>
          <p className="pl-audit-inspector__summary">{event.summary}</p>
        </section>

        {event.evidenceRefs.length > 0 && (
          <section className="pl-audit-inspector__section">
            <h3 className="pl-audit-inspector__label">Evidence refs</h3>
            <ul className="pl-audit-inspector__refs">
              {event.evidenceRefs.map((ref) => (
                <li key={ref}><code>{ref}</code></li>
              ))}
            </ul>
          </section>
        )}

        <footer className="pl-audit-inspector__footer">
          <p>Audit preview data only. No runtime mutation.</p>
        </footer>
      </aside>
    );
  }

  return (
    <aside className="pl-audit-inspector pl-audit-inspector--empty" aria-label="Event inspector">
      <p>Select an audit event or pending approval to inspect.</p>
    </aside>
  );
}