import { REVIEW_QUEUE_COUNTS, DEMO_PENDING_APPROVALS } from "./demoAuditData";

export function AuditReviewQueuePanel() {
  const assetCount = DEMO_PENDING_APPROVALS.filter((a) => a.kind === "assetDraft").length;
  const layoutCount = DEMO_PENDING_APPROVALS.filter((a) => a.kind === "layoutDraft").length;
  const hmiCount = DEMO_PENDING_APPROVALS.filter((a) => a.kind === "hmiDraft").length;

  return (
    <aside className="pl-audit-queue" aria-label="Review queue">
      <header className="pl-audit-queue__header">
        <h2 className="pl-audit-queue__title">Review Queue</h2>
      </header>

      <section className="pl-audit-queue__section">
        <ul className="pl-audit-queue__counts">
          <li className="pl-audit-queue__count pl-audit-queue__count--pending">
            <span className="pl-audit-queue__marker" aria-hidden="true">●</span>
            <span>Pending</span>
            <strong>{REVIEW_QUEUE_COUNTS.pending} changes</strong>
          </li>
          <li className="pl-audit-queue__count">
            <span className="pl-audit-queue__marker" aria-hidden="true">○</span>
            <span>Approved</span>
            <strong>{REVIEW_QUEUE_COUNTS.approved} changes</strong>
          </li>
          <li className="pl-audit-queue__count">
            <span className="pl-audit-queue__marker" aria-hidden="true">○</span>
            <span>Rejected</span>
            <strong>{REVIEW_QUEUE_COUNTS.rejected} changes</strong>
          </li>
        </ul>
      </section>

      <section className="pl-audit-queue__section">
        <h3 className="pl-audit-queue__label">Approvals</h3>
        <ul className="pl-audit-queue__approvals">
          <li>{assetCount} Asset draft</li>
          <li>{layoutCount} Layout draft</li>
          <li>{hmiCount} HMI draft</li>
        </ul>
      </section>
    </aside>
  );
}