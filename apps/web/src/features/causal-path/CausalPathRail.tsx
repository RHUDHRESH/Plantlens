import { useRef, type KeyboardEvent } from "react";
import type { MapZoomBand, UserRole } from "../operational-map";
import { STATUS_VISUALS } from "../maps2d/statusStyles";
import type { AssetStatus } from "../maps2d/mapTypes";
import { getNextPathAssetId, getPreviousPathAssetId } from "./causalPathModel";
import type { CausalPathViewModel } from "./causalPathTypes";

const KIND_LABELS: Record<string, string> = {
  root: "Root",
  cause: "Cause",
  effect: "Effect",
  downstream: "Downstream",
  unknown: "Step",
};

interface CausalPathRailProps {
  viewModel: CausalPathViewModel;
  role: UserRole;
  zoomBand: MapZoomBand;
  visible: boolean;
  onSelectAsset: (assetId: string) => void;
  onFocusAsset: (assetId: string) => void;
  onOpenRawAlarms?: () => void;
}

function showAlarmCount(role: UserRole): boolean {
  return role === "operator" || role === "engineer" || role === "maintenance";
}

function showBadQuality(role: UserRole): boolean {
  return role === "engineer" || role === "maintenance";
}

export function CausalPathRail({
  viewModel,
  role,
  zoomBand,
  visible,
  onSelectAsset,
  onFocusAsset,
}: CausalPathRailProps) {
  const stepRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  if (!visible) return null;

  if (!viewModel.hasActivePath) {
    return (
      <div className="causal-path-rail causal-path-rail--empty" role="status">
        <span className="causal-path-evidence__muted">No active causal path</span>
      </div>
    );
  }

  const handleStep = (assetId: string) => {
    onSelectAsset(assetId);
    onFocusAsset(assetId);
  };

  const focusStepButton = (assetId: string) => {
    stepRefs.current[assetId]?.focus();
  };

  const handleStepKeyDown = (event: KeyboardEvent<HTMLButtonElement>, assetId: string) => {
    if (event.key === "ArrowRight") {
      const nextId = getNextPathAssetId(viewModel, assetId);
      if (nextId) {
        event.preventDefault();
        handleStep(nextId);
        focusStepButton(nextId);
      }
      return;
    }
    if (event.key === "ArrowLeft") {
      const prevId = getPreviousPathAssetId(viewModel, assetId);
      if (prevId) {
        event.preventDefault();
        handleStep(prevId);
        focusStepButton(prevId);
      }
    }
  };

  return (
    <nav className="causal-path-rail" aria-label="Causal path explorer">
      {viewModel.situationTitle && (
        <span className="causal-path-rail__title">{viewModel.situationTitle}</span>
      )}
      <span className="causal-path-rail__zoom-hint" aria-label={`Zoom band: ${zoomBand}`}>
        {zoomBand}
      </span>
      <ol className="causal-path-rail__steps">
        {viewModel.steps.map((step) => {
          const visual = STATUS_VISUALS[(step.status as AssetStatus) in STATUS_VISUALS ? (step.status as AssetStatus) : "unknown"];
          const statusText = visual.label ? `${visual.icon} ${visual.label}` : "—";
          return (
            <li key={step.assetId} className="causal-path-rail__step-item">
              <button
                ref={(el) => {
                  stepRefs.current[step.assetId] = el;
                }}
                type="button"
                className={`causal-path-rail__step${step.isSelected ? " causal-path-rail__step--selected" : ""}`}
                aria-pressed={step.isSelected}
                aria-label={`Step ${step.index + 1}: ${step.label}, ${KIND_LABELS[step.kind] ?? step.kind}, ${visual.label || "unknown"}`}
                onClick={() => handleStep(step.assetId)}
                onKeyDown={(e) => handleStepKeyDown(e, step.assetId)}
              >
                <span className="causal-path-rail__step-num" data-tabular>
                  {step.index + 1}
                </span>
                <span className="causal-path-rail__step-label">{step.label}</span>
                <span className="causal-path-rail__step-kind">{KIND_LABELS[step.kind] ?? step.kind}</span>
                <span className="causal-path-rail__step-status">{statusText}</span>
                {step.isRoot && <span className="causal-path-rail__root-badge">▲ ROOT</span>}
                {showAlarmCount(role) && step.alarmCount > 0 && (
                  <span className="causal-path-rail__metric">A:{step.alarmCount}</span>
                )}
                {showBadQuality(role) && step.badQualityCount > 0 && (
                  <span className="causal-path-rail__metric">Q:{step.badQualityCount}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}