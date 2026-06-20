import type { PlantHMIState } from "../../app/schemas/plantHmi";
import { DataQualityBanner } from "./DataQualityBanner";
import { HmiEvidenceList } from "./HmiEvidenceList";
import { OperatorActionsPanel } from "./OperatorActionsPanel";
import { RootCauseSummary } from "./RootCauseSummary";

interface HmiStatePanelProps {
  state: PlantHMIState;
  runtimeError?: string | null;
  onViewRawAlarms?: () => void;
  onHighlightAsset?: (assetId: string) => void;
}

export function HmiStatePanel({
  state,
  runtimeError,
  onViewRawAlarms,
  onHighlightAsset,
}: HmiStatePanelProps) {
  const affectedAssets = state.active_incident?.affected_assets ?? [];

  return (
    <article className="hmi-state-panel" aria-label="HMI operator summary">
      <DataQualityBanner state={state} errorMessage={runtimeError ?? null} />

      <section className="hmi-state-panel__section">
        <RootCauseSummary state={state} />
      </section>

      <section className="hmi-state-panel__section">
        <OperatorActionsPanel state={state} />
      </section>

      {affectedAssets.length > 0 && onHighlightAsset && (
        <section className="hmi-state-panel__section hmi-state-panel__assets">
          <h3>Affected assets</h3>
          <div className="hmi-state-panel__asset-links">
            {affectedAssets.map((assetId) => (
              <button
                key={assetId}
                type="button"
                className="pl-btn pl-btn--ghost pl-btn--compact"
                onClick={() => onHighlightAsset(assetId)}
              >
                Highlight {assetId}
              </button>
            ))}
          </div>
        </section>
      )}

      {state.assets.length > 0 && (
        <section className="hmi-state-panel__section hmi-state-panel__asset-summary">
          <h3>Asset summary</h3>
          <ul className="hmi-state-panel__asset-list">
            {state.assets.map((asset) => (
              <li key={asset.asset_id}>
                <span>{asset.name}</span>
                <span className={`hmi-state-panel__asset-status hmi-state-panel__asset-status--${asset.status}`}>
                  {asset.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="hmi-state-panel__section">
        <HmiEvidenceList state={state} />
      </section>

      {onViewRawAlarms && (
        <footer className="hmi-state-panel__footer">
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onViewRawAlarms}>
            View raw alarms
          </button>
        </footer>
      )}
    </article>
  );
}