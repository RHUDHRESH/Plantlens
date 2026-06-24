import { DEMO_BLOCKED_ACTIONS, boundaryLabel } from "./demoAuditData";

export function BlockedActionsPanel() {
  return (
    <section className="pl-audit-blocked" aria-label="Blocked AI and tool actions">
      <h3 className="pl-audit-blocked__title">AI / blocked actions</h3>
      <ul className="pl-audit-blocked__list">
        {DEMO_BLOCKED_ACTIONS.map((action) => (
          <li key={action.id} className="pl-audit-blocked__item">
            <div className="pl-audit-blocked__row">
              <code className="pl-audit-blocked__tool">{action.tool}</code>
              <span className="pl-audit-blocked__tag">BLOCKED</span>
            </div>
            <p className="pl-audit-blocked__reason">{action.reason}</p>
            <p className="pl-audit-blocked__meta">
              {action.actor} · {action.attemptedAt} · {boundaryLabel(action.boundary)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}