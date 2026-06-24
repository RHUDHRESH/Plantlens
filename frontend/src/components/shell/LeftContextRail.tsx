import { useStore } from "../../store/useStore";
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
    setSelectedSituationId,
    setActive,
    setSelectedAssetId,
    selectedAssetId,
  } = useStore();

  if (!leftRailOpen) return null;

  return (
    <div className="pl-left-rail">
      <header className="pl-left-rail__header">
        <h2 className="pl-left-rail__title">Context</h2>
        <IconButton label="Close context rail" onClick={toggleLeftRail}>
          <CloseIcon />
        </IconButton>
      </header>

      <Panel title="Plant overview" scaffold>
        <p className="pl-left-rail__overview-text">
          Demo plant — scaffold overview. Map-first navigation with situation stack.
        </p>
        <div className="pl-left-rail__overview-stats">
          <div>
            <span className="pl-label">Situations</span>
            <span className="pl-numeric">{situations.length}</span>
          </div>
          <div>
            <span className="pl-label">Assets</span>
            <span className="pl-numeric">—</span>
          </div>
        </div>
      </Panel>

      <Panel title="Active situations" subtitle={`${situations.length} total`}>
        {situations.length === 0 ? (
          <EmptyState
            title="No active situations"
            description="Plant operating within normal parameters."
          />
        ) : (
          <ul className="pl-left-rail__list" role="list">
            {situations.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`pl-left-rail__list-item ${
                    selectedSituationId === s.id ? "pl-left-rail__list-item--selected" : ""
                  }`}
                  onClick={() => {
                    setSelectedSituationId(s.id);
                    setActive(s);
                  }}
                >
                  <span className="pl-left-rail__list-title">{s.primary_fault}</span>
                  <Badge variant="warning">{(s.confidence * 100).toFixed(0)}%</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Assets" scaffold subtitle="Placeholder">
        <EmptyState
          title="Asset list"
          description="Asset navigation will populate from plant topology."
          scaffold
        />
        <button
          type="button"
          className="pl-left-rail__asset-placeholder"
          onClick={() => setSelectedAssetId(selectedAssetId ? null : "asset-demo-01")}
        >
          {selectedAssetId ? "Clear selection" : "Select demo asset (scaffold)"}
        </button>
      </Panel>

      <Panel title="Alarms" scaffold subtitle="Collapse indicator placeholder">
        <div className="pl-left-rail__alarm-indicator">
          <Badge variant="default">0 collapsed</Badge>
          <span className="pl-scaffold-tag">Scaffold</span>
        </div>
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