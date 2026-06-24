import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { getApprovalById } from "./demoAuditData";
import { Badge } from "../ui/Badge";

export function ApprovalDiffPanel() {
  const { selectedApprovalId } = useStore();

  const approval = useMemo(
    () => (selectedApprovalId ? getApprovalById(selectedApprovalId) : null),
    [selectedApprovalId],
  );

  if (!approval) {
    return (
      <section className="pl-audit-diff pl-audit-diff--empty" aria-label="Approval diff">
        <p>Select a pending approval to view before/after diff.</p>
      </section>
    );
  }

  const riskVariant =
    approval.risk === "safety" || approval.risk === "high"
      ? "critical"
      : approval.risk === "medium"
        ? "warning"
        : "normal";

  return (
    <section className="pl-audit-diff" aria-label="Approval diff">
      <header className="pl-audit-diff__header">
        <h3 className="pl-audit-diff__title">{approval.title}</h3>
        <Badge variant={riskVariant}>risk: {approval.risk}</Badge>
      </header>

      <div className="pl-audit-diff__grid">
        <div className="pl-audit-diff__col pl-audit-diff__col--before">
          <h4>Before</h4>
          <p className="pl-audit-diff__label">{approval.beforeLabel}</p>
          <p className="pl-audit-diff__value">{approval.beforeValue}</p>
        </div>
        <div className="pl-audit-diff__arrow" aria-hidden="true">→</div>
        <div className="pl-audit-diff__col pl-audit-diff__col--after">
          <h4>After</h4>
          <p className="pl-audit-diff__label">{approval.afterLabel}</p>
          <p className="pl-audit-diff__value">{approval.afterValue}</p>
        </div>
      </div>

      <div className="pl-audit-diff__evidence">
        <h4>Evidence</h4>
        <ul>
          {approval.evidence.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}