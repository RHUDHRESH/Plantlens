import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useStore } from "../store/useStore";
import { AppShell } from "../components/shell/AppShell";
import { TopStatusBar } from "../components/shell/TopStatusBar";
import { MobileBottomNav } from "../components/shell/MobileBottomNav";
import { Copilot } from "../copilot/Copilot";
import { Badge } from "../components/ui/Badge";
import { BlockPalettePanel } from "../components/layoutStudio/BlockPalettePanel";
import { LayoutCanvas } from "../components/layoutStudio/LayoutCanvas";
import { LayoutInspectorPanel } from "../components/layoutStudio/LayoutInspectorPanel";
import { LayoutCommandBar } from "../components/layoutStudio/LayoutCommandBar";
import { MobilePlantLayoutStudioView } from "../components/layoutStudio/MobilePlantLayoutStudioView";

export function PlantLayoutStudio() {
  const { role, leftRailOpen, rightPanelOpen, layoutDraftDirty } = useStore();
  const editable = role === "engineer";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  return (
    <DndContext sensors={sensors}>
      <AppShell
        top={<TopStatusBar />}
        left={leftRailOpen ? <BlockPalettePanel /> : null}
        right={rightPanelOpen ? <LayoutInspectorPanel /> : null}
        bottom={<LayoutCommandBar />}
        mobileNav={<MobileBottomNav />}
        copilot={<Copilot />}
      >
        <div className="pl-layout-studio">
          {!editable && (
            <div className="pl-layout-studio__banner" role="status">
              Plant Layout Studio is view-only for this role.
            </div>
          )}

          <div className="pl-layout-studio__mode-bar">
            <Badge variant="info">Studio Mode</Badge>
            <span className="pl-layout-studio__heading">Plant Layout Studio</span>
            <span className="pl-layout-studio__line">Line A</span>
            <Badge variant="warning">MODEL DRAFT</Badge>
            <Badge variant="readonly">READ-ONLY PLANT</Badge>
            {layoutDraftDirty && <Badge variant="warning">Unsaved draft</Badge>}
          </div>

          <div className="pl-layout-studio__desktop">
            <LayoutCanvas />
          </div>

          <div className="pl-layout-studio__mobile">
            <MobilePlantLayoutStudioView />
          </div>
        </div>
      </AppShell>
    </DndContext>
  );
}