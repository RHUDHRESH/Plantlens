import { useStore } from "../../store/useStore";
import {
  getDemoAsset,
  getSituationMeta,
} from "../../data/demoPlant";
import { Panel } from "../ui/Panel";
import { EmptyState } from "../ui/EmptyState";
import { Metric } from "../ui/Metric";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";
import { RoleView } from "../RoleView";
import { Button } from "../ui/Button";

function severityBadge(severity?: string) {
  if (severity === "critical") return "critical" as const;
  if (severity === "unknown") return "unknown" as const;
  if (severity === "warning") return "warning" as const;
  return "normal" as const;
}

export function RightInspectorPanel() {
  const {
    rightPanelOpen,
    toggleRightPanel,
    selectedAssetId,
    selectedSituationId,
    situations,
    role,
    openEvidenceRoom,
    openDagView,
    openAssetStudio,
  } = useStore();

  if (!rightPanelOpen) return null;

  const asset = selectedAssetId ? getDemoAsset(selectedAssetId) : undefined;
  const situation = situations.find((s) => s.id === selectedSituationId) ?? null;
  const meta = situation ? getSituationMeta(situation.id) : undefined;
  const displayAsset = asset ?? (meta?.assetId ? getDemoAsset(meta.assetId) : undefined);

  return (
    <div className="pl-right-panel">
      <header className="pl-right-panel__header">
        <h2 className="pl-right-panel__title">Inspect</h2>
        <IconButton label="Close inspector panel" onClick={toggleRightPanel}>
          <CloseIcon />
        </IconButton>
      </header>

      {!displayAsset && !situation && (
        <EmptyState
          title="Nothing selected"
          description="Tap an asset on the map or pick a situation from the rail."
        />
      )}

      {(displayAsset || situation) && (
        <Panel
          title={displayAsset?.id ?? meta?.assetId ?? "Asset"}
          subtitle={displayAsset?.location ?? meta?.location}
        >
          <div className="pl-right-panel__badges">
            <Badge variant={severityBadge(meta?.severity)}>
              {(meta?.severity ?? displayAsset?.state ?? "normal").toUpperCase()}
            </Badge>
            {!asset && meta && (
              <span className="pl-scaffold-tag">Demo fallback</span>
            )}
          </div>

          <div className="pl-right-panel__metrics">
            <Metric
              label="Confidence"
              value={situation ? `${(situation.confidence * 100).toFixed(0)}%` : "—"}
              size="lg"
            />
            <Metric
              label="Coverage"
              value={situation ? `${(situation.coverage * 100).toFixed(0)}%` : "—"}
              size="lg"
            />
          </div>
        </Panel>
      )}

      {meta && (
        <Panel title="Evidence" scaffold>
          <ul className="pl-evidence-list pl-evidence-list--support">
            {meta.supportingEvidence.map((e) => (
              <li key={e}>+ {e}</li>
            ))}
          </ul>
          <ul className="pl-evidence-list pl-evidence-list--missing">
            {meta.missingEvidence.map((e) => (
              <li key={e}>? {e}</li>
            ))}
          </ul>
          {situation && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openEvidenceRoom(situation.id)}
            >
              View Evidence
            </Button>
          )}
        </Panel>
      )}

      {meta && (
        <Panel title="Action envelope" scaffold>
          <p className="pl-right-panel__placeholder">{meta.actionEnvelope}</p>
          <Badge variant="readonly">Read-only — no plant control</Badge>
        </Panel>
      )}

      <RoleView />

      {role === "engineer" && situation && (
        <Panel title="DAG peek" scaffold subtitle="Engineer-only">
          <p className="pl-right-panel__placeholder">
            Causal DAG — read-only live traversal of approved graph.
          </p>
          <Button variant="secondary" size="sm" onClick={() => openDagView(situation.id)}>
            Open DAG
          </Button>
          <span className="pl-scaffold-tag">Demo fallback</span>
        </Panel>
      )}

      {displayAsset && (
        <Panel title="Asset spec" scaffold subtitle="Model draft editor">
          <p className="pl-right-panel__placeholder">
            Parameterized block editor — configure datasheet specs without code.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openAssetStudio(undefined, selectedAssetId ?? displayAsset.id)}
          >
            Open Asset Spec
          </Button>
          <Badge variant="readonly">Draft only — no plant control</Badge>
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