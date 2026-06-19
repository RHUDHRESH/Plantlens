import type { CalmCardBlockedAction } from "../../app/schemas/calmCard";

export function BlockedActions({ actions }: { actions: CalmCardBlockedAction[] }) {
  if (!actions.length) return null;

  return (
    <section className="calm-card__blocked" aria-label="Blocked actions">
      <h3>Blocked actions</h3>
      <ul className="calm-card__blocked-list">
        {actions.map((action) => (
          <li key={action.action_id} className="calm-card__blocked-item">
            <span className="calm-card__blocked-label">{action.label}</span>
            <span className="calm-card__blocked-reason">{action.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}