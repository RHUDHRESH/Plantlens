import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { DEMO_AUDIT_EVENTS, filterAuditEvents } from "./demoAuditData";
import { AuditLedgerRow } from "./AuditLedgerRow";

export function AuditLedgerTable() {
  const {
    selectedAuditEventId,
    setSelectedAuditEventId,
    setSelectedApprovalId,
    auditFilter,
    auditLedgerSearch,
  } = useStore();

  const events = useMemo(
    () => filterAuditEvents(DEMO_AUDIT_EVENTS, auditFilter, auditLedgerSearch),
    [auditFilter, auditLedgerSearch],
  );

  const handleSelect = (id: string) => {
    setSelectedAuditEventId(id);
    setSelectedApprovalId(null);
  };

  return (
    <section className="pl-audit-ledger" aria-label="Audit ledger">
      <h2 className="pl-audit-ledger__title">Audit Ledger — Model + Runtime Events</h2>
      <div className="pl-audit-ledger__table-wrap">
        <table className="pl-audit-ledger__table">
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Event</th>
              <th scope="col">Actor</th>
              <th scope="col">Kind</th>
              <th scope="col">Status</th>
              <th scope="col">Scope</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={6} className="pl-audit-ledger__empty">
                  No events match current filter.
                </td>
              </tr>
            ) : (
              events.map((evt) => (
                <AuditLedgerRow
                  key={evt.id}
                  event={evt}
                  selected={selectedAuditEventId === evt.id}
                  onSelect={handleSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}