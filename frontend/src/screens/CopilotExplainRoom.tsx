import { useStore } from "../store/useStore";
import { AppShell } from "../components/shell/AppShell";
import { TopStatusBar } from "../components/shell/TopStatusBar";
import { MobileBottomNav } from "../components/shell/MobileBottomNav";
import { Badge } from "../components/ui/Badge";
import { CopilotContextPanel } from "../components/copilotRoom/CopilotContextPanel";
import { CopilotChatPanel } from "../components/copilotRoom/CopilotChatPanel";
import { ToolTracePanel } from "../components/copilotRoom/ToolTracePanel";
import { CopilotCommandBar } from "../components/copilotRoom/CopilotCommandBar";
import { MobileCopilotExplainView } from "../components/copilotRoom/MobileCopilotExplainView";

export function CopilotExplainRoom() {
  const { leftRailOpen, rightPanelOpen, copilotShowToolTrace } = useStore();

  return (
    <AppShell
      top={<TopStatusBar />}
      left={leftRailOpen ? <CopilotContextPanel /> : null}
      right={rightPanelOpen || copilotShowToolTrace ? <ToolTracePanel /> : null}
      bottom={<CopilotCommandBar />}
      mobileNav={<MobileBottomNav />}
    >
      <div className="pl-copilot-room">
        <div className="pl-copilot-room__mode-bar">
          <Badge variant="info">Copilot</Badge>
          <span className="pl-copilot-room__heading">Read-Only Copilot</span>
          <Badge variant="readonly">READ-ONLY</Badge>
          <Badge variant="readonly">NO CONTROL</Badge>
        </div>

        <div className="pl-copilot-room__desktop">
          <CopilotChatPanel />
        </div>

        <div className="pl-copilot-room__mobile">
          <MobileCopilotExplainView />
        </div>
      </div>
    </AppShell>
  );
}