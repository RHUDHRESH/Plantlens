import { useStore } from "../store/useStore";
import { AppShell } from "../components/shell/AppShell";
import { TopStatusBar } from "../components/shell/TopStatusBar";
import { MobileBottomNav } from "../components/shell/MobileBottomNav";
import { Copilot } from "../copilot/Copilot";
import { Badge } from "../components/ui/Badge";
import { GeneratedScreensPanel } from "../components/hmiCompiler/GeneratedScreensPanel";
import { HmiPreviewCanvas } from "../components/hmiCompiler/HmiPreviewCanvas";
import { GeneratedWidgetMap } from "../components/hmiCompiler/GeneratedWidgetMap";
import { CompilerInspectorPanel } from "../components/hmiCompiler/CompilerInspectorPanel";
import { HmiCompilerCommandBar } from "../components/hmiCompiler/HmiCompilerCommandBar";
import { MobileHmiPreviewView } from "../components/hmiCompiler/MobileHmiPreviewView";

const ROLE_LABELS = {
  operator: "Operator",
  maintenance: "Maintenance",
  supervisor: "Supervisor",
  engineer: "Engineer",
} as const;

export function HmiGenerationPreview() {
  const { leftRailOpen, rightPanelOpen, hmiRoleTarget, hmiDeviceTarget, hmiVariant } =
    useStore();

  return (
    <AppShell
      top={<TopStatusBar />}
      left={leftRailOpen ? <GeneratedScreensPanel /> : null}
      right={rightPanelOpen ? <CompilerInspectorPanel /> : null}
      bottom={<HmiCompilerCommandBar />}
      mobileNav={<MobileBottomNav />}
      copilot={<Copilot />}
    >
      <div className="pl-hmi-compiler">
        <div className="pl-hmi-compiler__mode-bar">
          <Badge variant="info">Studio Mode</Badge>
          <Badge variant="info">HMI Compiler</Badge>
          <span className="pl-hmi-compiler__heading">HMI Generation Preview</span>
          <span className="pl-hmi-compiler__meta">
            {ROLE_LABELS[hmiRoleTarget]} / {hmiDeviceTarget} / {hmiVariant}
          </span>
          <Badge variant="warning">GENERATED PREVIEW</Badge>
          <Badge variant="readonly">DRAFT ONLY</Badge>
          <Badge variant="readonly">NO RUNTIME DEPLOY</Badge>
        </div>

        <div className="pl-hmi-compiler__desktop">
          <div className="pl-hmi-compiler__center">
            <HmiPreviewCanvas />
            <GeneratedWidgetMap />
          </div>
        </div>

        <div className="pl-hmi-compiler__mobile">
          <MobileHmiPreviewView />
        </div>
      </div>
    </AppShell>
  );
}