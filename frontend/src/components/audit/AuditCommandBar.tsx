import { useStore } from "../../store/useStore";
import { Button } from "../ui/Button";
import { CommandInput } from "../ui/CommandInput";

export function AuditCommandBar() {
  const {
    auditLedgerSearch,
    setAuditLedgerSearch,
    verifyHashChain,
    setAuditFilter,
    goBackToHmiPreview,
    requestApprovalChanges,
    selectedApprovalId,
  } = useStore();

  return (
    <div className="pl-audit-command-bar" role="toolbar" aria-label="Audit actions">
      <CommandInput
        placeholder="Search ledger…"
        value={auditLedgerSearch}
        onChange={(e) => setAuditLedgerSearch(e.target.value)}
        className="pl-audit-command-bar__search"
        readOnlyHint={false}
      />

      <p className="pl-audit-command-bar__notice">
        Audit export is a draft report. It does not mutate runtime.
      </p>

      <div className="pl-audit-command-bar__actions">
        <Button variant="secondary" size="md" onClick={verifyHashChain}>
          Verify Hash Chain
        </Button>
        <Button variant="secondary" size="md" onClick={() => setAuditFilter("blockedTools")}>
          Filter Blocked Tools
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToHmiPreview}>
          Back HMI Preview
        </Button>
        <Button variant="ghost" size="md" disabled title="Export audit report scaffold — draft only">
          Export Audit Report
        </Button>
        <Button
          variant="secondary"
          size="md"
          disabled={!selectedApprovalId}
          onClick={requestApprovalChanges}
        >
          Request Changes
        </Button>
      </div>
    </div>
  );
}