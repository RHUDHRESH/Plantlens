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

export default function App() {
  const connect = useStore((s) => s.connect);

  useEffect(() => {
    void connect();
  }, [connect]);

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