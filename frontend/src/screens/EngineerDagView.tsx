import { useMemo } from "react";
import { useStore } from "../store/useStore";
import { getDemoDagForSituation } from "../components/dag/demoDagData";
import { AppShell } from "../components/shell/AppShell";
import { TopStatusBar } from "../components/shell/TopStatusBar";
import { MobileBottomNav } from "../components/shell/MobileBottomNav";
import { Copilot } from "../copilot/Copilot";
import { Badge } from "../components/ui/Badge";
import { Metric } from "../components/ui/Metric";
import { DagLayerPanel } from "../components/dag/DagLayerPanel";
import { DagCanvas } from "../components/dag/DagCanvas";
import { DagInspectorPanel } from "../components/dag/DagInspectorPanel";
import { DagCommandBar } from "../components/dag/DagCommandBar";
import { MobileDagPathView } from "../components/dag/MobileDagPathView";

export function EngineerDagView() {
  const {
    situations,
    selectedSituationId,
    role,
    leftRailOpen,
    rightPanelOpen,
  } = useStore();

  const fallbackId = situations[0]?.id ?? "sit-motor-overload";
  const situation =
    situations.find((s) => s.id === selectedSituationId) ??
    situations[0] ??
    null;

  const situationId = situation?.id ?? fallbackId;
  const { meta } = useMemo(
    () => getDemoDagForSituation(situationId),
    [situationId],
  );

  if (!situation) {
    return (
      <div className="pl-dag-view pl-dag-view--empty">
        <p>No situation selected.</p>
      </div>
    );
  }

  const title = `Causal DAG — ${situation.primary_fault}`;

  return (
    <AppShell
      top={<TopStatusBar />}
      left={
        leftRailOpen ? (
          <DagLayerPanel situation={situation} meta={meta} />
        ) : null
      }
      right={
        rightPanelOpen ? (
          <DagInspectorPanel situation={situation} situationId={situationId} />
        ) : null
      }
      bottom={<DagCommandBar />}
      mobileNav={<MobileBottomNav />}
      copilot={<Copilot />}
    >
      <div className="pl-dag-view">
        {role !== "engineer" && (
          <div className="pl-dag-view__banner" role="status">
            Engineer DAG view is read-only for this role.
          </div>
        )}

        <div className="pl-dag-view__desktop">
          <div className="pl-dag-view__header-meta">
            <Metric
              label="Confidence"
              value={`${(situation.confidence * 100).toFixed(0)}%`}
              size="sm"
            />
            <Metric
              label="Coverage"
              value={`${(situation.coverage * 100).toFixed(0)}%`}
              size="sm"
            />
            <Badge variant="readonly">Read-only live</Badge>
          </div>
          <DagCanvas situationId={situationId} title={title} />
        </div>

        <div className="pl-dag-view__mobile">
          <MobileDagPathView situation={situation} meta={meta} title={title} />
        </div>
      </div>
    </AppShell>
  );
}