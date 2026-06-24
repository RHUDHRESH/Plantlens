import { useEffect } from "react";
import { useStore } from "./store/useStore";
import { Scene } from "./three/Scene";
import { Plant2D } from "./fallback2d/Plant2D";
import { AppShell } from "./components/shell/AppShell";
import { PrimaryMapCanvas } from "./components/shell/PrimaryMapCanvas";
import { TopStatusBar } from "./components/shell/TopStatusBar";
import { LeftContextRail } from "./components/shell/LeftContextRail";
import { RightInspectorPanel } from "./components/shell/RightInspectorPanel";
import { BottomCommandSheet } from "./components/shell/BottomCommandSheet";
import { MobileBottomNav } from "./components/shell/MobileBottomNav";
import { Copilot } from "./copilot/Copilot";
import { SituationEvidenceRoom } from "./screens/SituationEvidenceRoom";
import { EngineerDagView } from "./screens/EngineerDagView";
import { AssetStudio } from "./screens/AssetStudio";
import { PlantLayoutStudio } from "./screens/PlantLayoutStudio";
import { HmiGenerationPreview } from "./screens/HmiGenerationPreview";
import { CopilotExplainRoom } from "./screens/CopilotExplainRoom";
import { AuditApprovalCenter } from "./screens/AuditApprovalCenter";

export default function App() {
  const connect = useStore((s) => s.connect);
  const screen = useStore((s) => s.screen);

  useEffect(() => {
    void connect();
  }, [connect]);

  if (screen === "evidence") {
    return <SituationEvidenceRoom />;
  }

  if (screen === "dag") {
    return <EngineerDagView />;
  }

  if (screen === "assetStudio") {
    return <AssetStudio />;
  }

  if (screen === "plantLayoutStudio") {
    return <PlantLayoutStudio />;
  }

  if (screen === "hmiPreview") {
    return <HmiGenerationPreview />;
  }

  if (screen === "copilotRoom") {
    return <CopilotExplainRoom />;
  }

  if (screen === "auditCenter") {
    return <AuditApprovalCenter />;
  }

  return (
    <AppShell
      top={<TopStatusBar />}
      left={<LeftContextRail />}
      right={<RightInspectorPanel />}
      bottom={<BottomCommandSheet />}
      mobileNav={<MobileBottomNav />}
      copilot={<Copilot />}
    >
      <PrimaryMapCanvas fallback={<Plant2D />}>
        <Scene />
      </PrimaryMapCanvas>
    </AppShell>
  );
}