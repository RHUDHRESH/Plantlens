import { useStore } from "../store/useStore";
import { AppShell } from "../components/shell/AppShell";
import { TopStatusBar } from "../components/shell/TopStatusBar";
import { MobileBottomNav } from "../components/shell/MobileBottomNav";
import { Badge } from "../components/ui/Badge";
import { AuditReviewQueuePanel } from "../components/audit/AuditReviewQueuePanel";
import { AuditFiltersPanel } from "../components/audit/AuditFiltersPanel";
import { AuditLedgerTable } from "../components/audit/AuditLedgerTable";
import { HashChainPanel } from "../components/audit/HashChainPanel";
import { PendingApprovalsPanel } from "../components/audit/PendingApprovalsPanel";
import { BlockedActionsPanel } from "../components/audit/BlockedActionsPanel";
import { AuditEventInspector } from "../components/audit/AuditEventInspector";
import { AuditCommandBar } from "../components/audit/AuditCommandBar";
import { MobileAuditApprovalView } from "../components/audit/MobileAuditApprovalView";

export function AuditApprovalCenter() {
  const { leftRailOpen, rightPanelOpen, hashChainStatus } = useStore();

  const chainBadge =
    hashChainStatus === "verified"
      ? "success"
      : hashChainStatus === "warning"
        ? "warning"
        : "unknown";

  return (
    <AppShell
      top={<TopStatusBar />}
      left={
        leftRailOpen ? (
          <div className="pl-audit-left">
            <AuditReviewQueuePanel />
            <AuditFiltersPanel />
          </div>
        ) : null
      }
      right={rightPanelOpen ? <AuditEventInspector /> : null}
      bottom={<AuditCommandBar />}
      mobileNav={<MobileBottomNav />}
    >
      <div className="pl-audit-center">
        <div className="pl-audit-center__mode-bar">
          <Badge variant="info">Governance</Badge>
          <span className="pl-audit-center__heading">Audit Ledger / Approval Review Center</span>
          <Badge variant={chainBadge}>AUDIT {hashChainStatus.toUpperCase()}</Badge>
          <Badge variant="readonly">DRAFT GOVERNANCE</Badge>
          <Badge variant="readonly">NO RUNTIME MUTATION</Badge>
        </div>

        <div className="pl-audit-center__desktop">
          <div className="pl-audit-center__main">
            <AuditLedgerTable />
            <HashChainPanel />
            <PendingApprovalsPanel />
            <BlockedActionsPanel />
          </div>
        </div>

        <div className="pl-audit-center__mobile">
          <MobileAuditApprovalView />
        </div>
      </div>
    </AppShell>
  );
}