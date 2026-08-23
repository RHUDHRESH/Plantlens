import type { WsConnectionState } from "../../api/types";
import type { ScenarioRunStatus } from "../../app/store/runtime";
import { ProviderBadge, type ProviderState } from "../plant";
import { Button } from "../ui/button";

export type MapRole = "operator" | "engineer" | "maintenance" | "manager";

export interface RuntimeTopStripProps {
  plantName: string;
  plantHealth: string;
  mode: string;
  dataSource: string;
  timeLabel: string;
  role: MapRole;
  connection: WsConnectionState;
  apiAvailable: boolean;
  scenarioId?: string | null;
  scenarioStatus?: ScenarioRunStatus;
  providerState?: ProviderState;
  providerLabel?: string;
  onOpenCopilot?: () => void;
  onRoleChange?: (role: MapRole) => void;
  onOpenAgents?: () => void;
  onOpenScenarios?: () => void;
  onOpenSearch?: () => void;
  /** Map visibility toggle (Monitor secondary surface) */
  showMap?: boolean;
  onToggleMap?: () => void;
}

const CONN: Record<WsConnectionState, { label: string; cls: string; dot: string }> = {
  connecting: { label: "CONNECTING", cls: "conn-stale", dot: "status-dot--warning" },
  live: { label: "LIVE", cls: "conn-live", dot: "status-dot--live" },
  stale: { label: "DATA STALE", cls: "conn-stale", dot: "status-dot--warning" },
  disconnected: { label: "OFFLINE", cls: "conn-off", dot: "status-dot--offline" },
};

const ROLE_LABELS: { id: MapRole; label: string }[] = [
  { id: "operator", label: "Operator" },
  { id: "engineer", label: "Engineer" },
  { id: "maintenance", label: "Maint" },
  { id: "manager", label: "Manager" },
];

export function RuntimeTopStrip({
  plantName,
  plantHealth,
  mode,
  dataSource,
  timeLabel,
  role,
  connection,
  apiAvailable,
  scenarioId,
  scenarioStatus,
  providerState = "degraded",
  providerLabel = "Advisor LLM",
  onOpenCopilot,
  onRoleChange,
  onOpenAgents,
  onOpenScenarios,
  onOpenSearch,
  showMap,
  onToggleMap,
}: RuntimeTopStripProps) {
  const conn = CONN[connection];

  return (
    <header className="runtime-top-strip" role="banner">
      <div className="runtime-top-strip__brand">
        <span className="runtime-top-strip__plant-label">PlantLens</span>
        <span className="runtime-top-strip__sep" aria-hidden>/</span>
        <span className="runtime-top-strip__plant">{plantName}</span>
        <span className={`runtime-top-strip__live-pill runtime-top-strip__live-pill--${conn.cls}`}>
          <span className={`status-dot ${conn.dot}`} aria-hidden />
          {connection === "live" ? "LIVE · READ-ONLY" : conn.label}
        </span>
        <ProviderBadge
          state={providerState}
          label={providerLabel}
          {...(onOpenCopilot ? { onClick: onOpenCopilot } : {})}
        />
      </div>

      <div className="runtime-top-strip__meta">
        <MetaItem label="Mode" value={mode} />
        <MetaItem label="Source" value={dataSource} />
        <MetaItem label="Time" value={timeLabel} tabular />
        <MetaItem label="Health" value={plantHealth} />
        {scenarioId && scenarioStatus && scenarioStatus !== "idle" && (
          <div className="runtime-top-strip__item">
            <span className="runtime-top-strip__label">Scenario</span>
            <span className="data-number">{scenarioId}</span>
            <span className="status-badge status-badge--warning">{scenarioStatus}</span>
          </div>
        )}
      </div>

      {onRoleChange && (
        <div className="runtime-top-strip__role-seg" role="group" aria-label="Active role">
          {ROLE_LABELS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={`runtime-top-strip__role-btn${role === id ? " runtime-top-strip__role-btn--active" : ""}`}
              onClick={() => onRoleChange(id)}
              aria-pressed={role === id}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="runtime-top-strip__actions">
        {onToggleMap && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={showMap}
            title={showMap ? "Hide plant map" : "Show plant map"}
            onClick={onToggleMap}
          >
            Map
          </Button>
        )}
        {onOpenSearch && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="command-palette-trigger"
            title="Search assets, alarms, tags, commands (Ctrl K)"
            onClick={onOpenSearch}
          >
            Search <span className="command-palette-trigger__hint">Ctrl K</span>
          </Button>
        )}
        {onOpenScenarios && (
          <Button type="button" variant="ghost" size="sm" onClick={onOpenScenarios}>
            Scenarios
          </Button>
        )}
        {onOpenAgents && (
          <Button type="button" variant="ghost" size="sm" onClick={onOpenAgents}>
            Agents
          </Button>
        )}
      </div>

      {!apiAvailable && (
        <p className="runtime-top-strip__warn" role="status">
          Backend unavailable — map may be empty until compiled HMI loads.
        </p>
      )}
    </header>
  );
}

function MetaItem({ label, value, tabular }: { label: string; value: string; tabular?: boolean }) {
  return (
    <div className="runtime-top-strip__item">
      <span className="runtime-top-strip__label">{label}</span>
      <span className={tabular ? "data-number" : undefined}>{value}</span>
    </div>
  );
}
