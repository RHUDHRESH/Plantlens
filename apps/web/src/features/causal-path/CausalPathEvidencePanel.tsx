import type { MapLayerId, MapZoomBand, UserRole } from "../operational-map";
import { STATUS_VISUALS } from "../maps2d/statusStyles";
import type { AssetStatus } from "../maps2d/mapTypes";
import type { CausalPathViewModel } from "./causalPathTypes";

const KIND_MEANING: Record<string, string> = {
  root: "Root cause — where the situation originated.",
  cause: "Intermediate cause along the causal chain.",
  effect: "Downstream effect of the causal chain.",
  downstream: "Affected asset in the propagation path.",
  unknown: "Step in the active causal path.",
};

interface CausalPathEvidencePanelProps {
  viewModel: CausalPathViewModel;
  role: UserRole;
  zoomBand: MapZoomBand;
  visibleLayers: Record<MapLayerId, boolean>;
  onSelectAsset: (assetId: string) => void;
  onFocusAsset: (assetId: string) => void;
  onOpenRawAlarms?: () => void;
}

function layerOn(visibleLayers: Record<MapLayerId, boolean>, id: MapLayerId): boolean {
  return visibleLayers[id] ?? false;
}

export function CausalPathEvidencePanel({
  viewModel,
  role,
  zoomBand,
  visibleLayers,
  onSelectAsset,
  onFocusAsset,
  onOpenRawAlarms,
}: CausalPathEvidencePanelProps) {
  if (!viewModel.hasActivePath) return null;

  const step = viewModel.selectedStep;
  if (!step) {
    return (
      <section className="causal-path-evidence" aria-label="Causal path evidence">
        <p className="causal-path-evidence__muted">No evidence attached for this step.</p>
      </section>
    );
  }

  const visual = STATUS_VISUALS[(step.status as AssetStatus) in STATUS_VISUALS ? (step.status as AssetStatus) : "unknown"];
  const showRecommended =
    (step.isRoot || step.kind === "root") && viewModel.recommendedActionLabel;
  const badTags = step.tags.filter((t) => t.quality !== "GOOD");
  const hasAlarms = step.alarms.length > 0;

  return (
    <section className="causal-path-evidence" aria-label="Causal path evidence">
      <header className="causal-path-evidence__header">
        <h2 className="causal-path-evidence__title">
          Step {step.index + 1}: {step.label}
        </h2>
        <span className={`status-badge status-badge--${step.status === "unknown" ? "offline" : step.status === "normal" ? "normal" : step.status}`}>
          {visual.icon} {visual.label || "UNKNOWN"}
        </span>
      </header>

      <p className="causal-path-evidence__kind">{KIND_MEANING[step.kind] ?? KIND_MEANING.unknown}</p>

      {viewModel.firstSignalLabel && step.isRoot && (
        <div className="causal-path-evidence__section">
          <h3>First signal</h3>
          <p>{viewModel.firstSignalLabel}</p>
        </div>
      )}

      {role === "operator" && (
        <>
          <div className="causal-path-evidence__section">
            <h3>Summary</h3>
            <p>
              {step.isRoot && "Root cause asset. "}
              {step.isAffected && !step.isRoot && "Affected asset. "}
              {step.alarmCount} alarm{step.alarmCount === 1 ? "" : "s"},{" "}
              {step.criticalAlarmCount} critical.
            </p>
          </div>
          {showRecommended && (
            <div className="causal-path-evidence__section">
              <h3>Recommended check</h3>
              <p>
                <span className="status-badge status-badge--warning">ACT</span>{" "}
                {viewModel.recommendedActionLabel}
              </p>
            </div>
          )}
          {hasAlarms && onOpenRawAlarms && (
            <button type="button" className="pl-btn pl-btn--compact" onClick={onOpenRawAlarms}>
              Open raw alarms
            </button>
          )}
        </>
      )}

      {role === "engineer" && (
        <>
          <div className="causal-path-evidence__section">
            <h3>Asset</h3>
            <p className="data-number">
              {step.assetId} · {step.assetType} · index {step.index + 1}
            </p>
            <p className="causal-path-evidence__muted">
              Zoom: {zoomBand} · layers:{" "}
              {Object.entries(visibleLayers)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(", ") || "—"}
            </p>
          </div>
          <div className="causal-path-evidence__section">
            <h3>Alarms</h3>
            {step.alarms.length === 0 ? (
              <p className="causal-path-evidence__muted">No evidence attached for this step.</p>
            ) : (
              <ul>
                {step.alarms.map((a) => (
                  <li key={a.alarmId}>
                    <span className={`status-badge status-badge--${a.severity === "critical" ? "critical" : "warning"}`}>
                      {a.severity === "critical" ? "CRIT" : "WARN"} {a.severity}
                    </span>{" "}
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {layerOn(visibleLayers, "tags") && (
            <div className="causal-path-evidence__section">
              <h3>Tag evidence</h3>
              {step.tags.length === 0 ? (
                <p className="causal-path-evidence__muted">No evidence attached for this step.</p>
              ) : (
                <ul>
                  {step.tags.map((t) => (
                    <li key={t.tagId}>
                      <span className="data-number">{t.tagId}</span> {t.valueLabel}{" "}
                      <span className={`status-badge status-badge--${t.quality === "GOOD" ? "normal" : "sensor_bad"}`}>
                        {t.quality === "GOOD" ? "✓ GOOD" : `⚠ ${t.quality}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {role === "maintenance" && (
        <>
          <div className="causal-path-evidence__section">
            <h3>Service context</h3>
            <p>
              {badTags.length} bad-quality tag{badTags.length === 1 ? "" : "s"},{" "}
              {step.alarmCount} alarm{step.alarmCount === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="causal-path-evidence__section">
            <h3>Bad quality tags</h3>
            {badTags.length === 0 ? (
              <p className="causal-path-evidence__muted">All tags report good quality.</p>
            ) : (
              <ul>
                {badTags.map((t) => (
                  <li key={t.tagId}>
                    <span className="data-number">{t.tagId}</span>{" "}
                    <span className="status-badge status-badge--sensor_bad">⚠ {t.quality}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {step.alarms.length > 0 && (
            <div className="causal-path-evidence__section">
              <h3>Alarms</h3>
              <ul>
                {step.alarms.map((a) => (
                  <li key={a.alarmId}>
                    <span className={`status-badge status-badge--${a.severity === "critical" ? "critical" : "warning"}`}>
                      {a.severity}
                    </span>{" "}
                    {a.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {showRecommended && (
            <div className="causal-path-evidence__section">
              <h3>Recommended check</h3>
              <p>{viewModel.recommendedActionLabel}</p>
            </div>
          )}
        </>
      )}

      {role === "manager" && (
        <>
          <div className="causal-path-evidence__section">
            <h3>Path summary</h3>
            <p>
              {step.label} ({KIND_MEANING[step.kind]?.split("—")[0]?.trim() ?? step.kind}) —{" "}
              {visual.label || "unknown"} status.
            </p>
          </div>
          {layerOn(visibleLayers, "audit") && (
            <div className="causal-path-evidence__section">
              <h3>Audit</h3>
              <p className="causal-path-evidence__muted">
                Audit receipts available in incident/audit surfaces.
              </p>
            </div>
          )}
        </>
      )}

      <div className="causal-path-evidence__actions">
        <button
          type="button"
          className="pl-btn pl-btn--compact"
          onClick={() => onSelectAsset(step.assetId)}
        >
          Open asset detail
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--compact"
          onClick={() => onFocusAsset(step.assetId)}
        >
          Focus on map
        </button>
      </div>
    </section>
  );
}