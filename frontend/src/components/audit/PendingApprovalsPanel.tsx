import { useStore } from "../../store/useStore";
import { DEMO_PENDING_APPROVALS } from "./demoAuditData";

export function PendingApprovalsPanel() {
  const { selectedApprovalId, setSelectedApprovalId, setSelectedAuditEventId } = useStore();

  return (
    <section className="pl-audit-pending" aria-label="Pending approvals">
      <h3 className="pl-audit-pending__title">Pending approvals</h3>
      <ul className="pl-audit-pending__list">
        {DEMO_PENDING_APPROVALS.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={[
                "pl-audit-pending__card",
                selectedApprovalId === item.id ? "pl-audit-pending__card--selected" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setSelectedApprovalId(item.id);
                setSelectedAuditEventId(null);
              }}
              aria-pressed={selectedApprovalId === item.id}
            >
              <span className="pl-audit-pending__card-title">{item.title}</span>
              <span className="pl-audit-pending__card-meta">
                {item.kind} · {item.scope} · {item.actor}
              </span>
              <span className={`pl-audit-pending__risk pl-audit-pending__risk--${item.risk}`}>
                risk: {item.risk}
              </span>
              <span className="pl-audit-pending__status">{item.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}