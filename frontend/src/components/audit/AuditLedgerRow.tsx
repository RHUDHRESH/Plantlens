import type { AuditEvent } from "./auditTypes";
import { statusLabel } from "./demoAuditData";

interface AuditLedgerRowProps {
  event: AuditEvent;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function AuditLedgerRow({ event, selected, onSelect }: AuditLedgerRowProps) {
  const blocked = event.status === "blockedLive" || event.kind === "blockedTool";

  return (
    <tr
      className={[
        "pl-audit-row",
        selected ? "pl-audit-row--selected" : "",
        blocked ? "pl-audit-row--blocked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onSelect(event.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(event.id);
        }
      }}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${event.time} ${event.event} by ${event.actor}`}
    >
      <td>{event.time}</td>
      <td>
        <span className="pl-audit-row__event">{event.event}</span>
        {blocked && (
          <span className="pl-audit-row__blocked-tag" aria-label="Blocked">
            BLOCKED
          </span>
        )}
      </td>
      <td>{event.actor}</td>
      <td className="pl-audit-row__kind">{event.kind}</td>
      <td>
        <span className="pl-audit-row__status">
          {event.status === "hashVerified" && (
            <span className="pl-audit-row__hash-marker" aria-hidden="true">✓</span>
          )}
          {statusLabel(event.status)}
        </span>
      </td>
      <td className="pl-audit-row__scope">{event.scope}</td>
    </tr>
  );
}