import { useStore } from "../../store/useStore";
import {
  DEMO_ALARM_COLLAPSE,
  DEMO_AREAS,
  DEMO_ASSETS,
  getSituationMeta,
} from "../../data/demoPlant";
import { Panel } from "../ui/Panel";
import { EmptyState } from "../ui/EmptyState";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";

export function LeftContextRail() {
  const {
    leftRailOpen,
    toggleLeftRail,
    situations,
    selectedSituationId,
    setSelectedSituation,
    openEvidenceRoom,
    setSelectedAsset,
    selectedAssetId,
    selectedAreaId,
    setSelectedAreaId,
  } = useStore();

  if (!leftRailOpen) return null;

  return (
    <div className="pl-left-rail">
      <header className="pl-left-rail__header">
        <h2 className="pl-left-rail__title">Plant</h2>
        <IconButton label="Close context rail" onClick={toggleLeftRail}>
          <CloseIcon />
        </IconButton>
      </header>

      <Panel title="Overview" subtitle="Demo fallback">
        <ul className="pl-left-rail__areas" role="list">
          {DEMO_AREAS.map((area) => (
            <li key={area.id}>
              <button
                type="button"
                className={`pl-left-rail__area ${
                  selectedAreaId === area.id ? "pl-left-rail__area--active" : ""
                }`}
                onClick={() => setSelectedAreaId(area.id)}
              >
                <span className="pl-left-rail__area-dot" aria-hidden="true" />
                {area.name}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Situations" subtitle={`${situations.length} active`}>
        {situations.length === 0 ? (
          <EmptyState title="No active situations" description="All parameters normal." />
        ) : (
          <ul className="pl-left-rail__list" role="list">
            {situations.map((s, idx) => {
              const meta = getSituationMeta(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`pl-left-rail__list-item ${
                      selectedSituationId === s.id ? "pl-left-rail__list-item--selected" : ""
                    }`}
                    onClick={() => {
                      setSelectedSituation(s.id);
                      openEvidenceRoom(s.id);
                    }}
                  >
                    <span className="pl-left-rail__list-index">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="pl-left-rail__list-body">
                      <span className="pl-left-rail__list-title">{s.primary_fault}</span>
                      <span className="pl-left-rail__list-meta">
                        {(s.confidence * 100).toFixed(0)}% / {(s.coverage * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Badge variant={meta?.severity === "unknown" ? "unknown" : "warning"}>
                      {meta?.severity ?? "warning"}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Assets" subtitle="Demo fallback">
        <ul className="pl-left-rail__list" role="list">
          {DEMO_ASSETS.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                className={`pl-left-rail__list-item ${
                  selectedAssetId === asset.id ? "pl-left-rail__list-item--selected" : ""
                }`}
                onClick={() => setSelectedAsset(asset.id)}
              >
                <span className="pl-left-rail__list-title">{asset.label}</span>
                <Badge
                  variant={
                    asset.state === "warning"
                      ? "warning"
                      : asset.state === "critical"
                        ? "critical"
                        : "normal"
                  }
                >
                  {asset.state}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Alarms" scaffold subtitle="Collapse summary">
        <p className="pl-left-rail__alarm-text">{DEMO_ALARM_COLLAPSE}</p>
        <span className="pl-scaffold-tag">Scaffold / Demo</span>
      </Panel>
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