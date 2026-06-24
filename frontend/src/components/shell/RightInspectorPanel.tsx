import { useStore } from "../../store/useStore";
import { Panel } from "../ui/Panel";
import { EmptyState } from "../ui/EmptyState";
import { ProgressRing } from "../ui/ProgressRing";
import { IconButton } from "../ui/IconButton";
import { CalmCard } from "../CalmCard";
import { RoleView } from "../RoleView";

export function RightInspectorPanel() {
  const {
    rightPanelOpen,
    toggleRightPanel,
    selectedAssetId,
    selectedSituationId,
    situations,
    role,
  } = useStore();

  if (!rightPanelOpen) return null;

  const selectedSituation = situations.find((s) => s.id === selectedSituationId) ?? null;

  return (
    <div className="pl-right-panel">
      <header className="pl-right-panel__header">
        <h2 className="pl-right-panel__title">Inspector</h2>
        <IconButton label="Close inspector panel" onClick={toggleRightPanel}>
          <CloseIcon />
        </IconButton>
      </header>

      {!selectedAssetId && !selectedSituation && (
        <EmptyState
          title="Nothing selected"
          description="Select an asset on the map or a situation from the rail."
        />
      )}

      {selectedAssetId && (
        <Panel title="Selected asset" scaffold>
          <p className="pl-right-panel__asset-id">{selectedAssetId}</p>
          <span className="pl-scaffold-tag">Scaffold / Demo asset</span>
          <div className="pl-right-panel__metrics">
            <div>
              <span className="pl-label">Confidence</span>
              <ProgressRing value={0.72} label="72%" size={56} />
            </div>
            <div>
              <span className="pl-label">Coverage</span>
              <ProgressRing value={0.85} label="85%" size={56} />
            </div>
          </div>
        </Panel>
      )}

      {selectedSituation && (
        <Panel title="Selected situation">
          <CalmCard situation={selectedSituation} />
        </Panel>
      )}

      <Panel title="Evidence summary" scaffold>
        <p className="pl-right-panel__placeholder">
          Evidence chain preview — scaffold placeholder for signal correlation graph.
        </p>
        <span className="pl-scaffold-tag">Scaffold</span>
      </Panel>

      <Panel title="Action envelope" scaffold>
        <p className="pl-right-panel__placeholder">
          Available actions (read-only posture) — no plant control from PlantLens.
        </p>
        <span className="pl-scaffold-tag">Scaffold</span>
      </Panel>

      <RoleView />

      {role === "engineer" && (
        <Panel title="DAG peek" scaffold subtitle="Engineer-only">
          <p className="pl-right-panel__placeholder">
            Causal DAG preview — engineer role surface. Scaffold demo node graph.
          </p>
          <span className="pl-scaffold-tag">Scaffold / Engineer</span>
        </Panel>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 4.5L10 9l4.5-4.5L15 5.5 10.5 10 15 14.5l-1.5 1.5L10 11.5 5.5 16 4 14.5 8.5 10 4 5.5z" />
    </svg>
  );
}