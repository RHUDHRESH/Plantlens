import type { WsConnectionState } from "../../api/types";
import type { ScenarioRunStatus } from "../../app/store/runtime";

export interface RuntimeTopStripProps {
  plantName: string;
  plantHealth: string;
  mode: string;
  dataSource: string;
  timeLabel: string;
  role: string;
  connection: WsConnectionState;
  apiAvailable: boolean;
  scenarioId?: string | null;
  scenarioStatus?: ScenarioRunStatus;
  onOpenAgents?: () => void;
  onOpenScenarios?: () => void;
}

const CONN: Record<WsConnectionState, { label: string; cls: string; dot: string }> = {
  connecting: { label: "CONNECTING", cls: "conn-stale", dot: "status-dot--warning" },
  live: { label: "LIVE", cls: "conn-live", dot: "status-dot--live" },
  stale: { label: "DATA STALE", cls: "conn-stale", dot: "status-dot--warning" },
  disconnected: { label: "OFFLINE", cls: "conn-off", dot: "status-dot--offline" },
};

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
  onOpenAgents,
  onOpenScenarios,
}: RuntimeTopStripProps) {
  const conn = CONN[connection];

  return (
    <header className="runtime-top-strip" role="banner">
      <div className="runtime-top-strip__brand">
        <span className="runtime-top-strip__plant">{plantName}</span>
        <span className={`status-badge status-badge--${healthBadge(plantHealth)}`}>
          {plantHealth}
        </span>
      </div>

      <div className="runtime-top-strip__meta">
        <MetaItem label="Mode" value={mode} />
        <MetaItem label="Source" value={dataSource} />
        <MetaItem label="Time" value={timeLabel} tabular />
        <MetaItem label="Role" value={role} />
      </div>

      {scenarioId && scenarioStatus && scenarioStatus !== "idle" && (
        <div className="runtime-top-strip__scenario" role="status" aria-live="polite">
          <span className="runtime-top-strip__label">Scenario</span>
          <span className="data-number">{scenarioId}</span>
          <span className="status-badge status-badge--warning">{scenarioStatus}</span>
        </div>
      )}

      <div className={`runtime-top-strip__conn ${conn.cls}`} aria-live="polite">
        <span className={`status-dot ${conn.dot}`} aria-hidden />
        <span>{conn.label}</span>
      </div>

      <div className="runtime-top-strip__actions">
        {onOpenScenarios && (
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onOpenScenarios}>
            Scenarios
          </button>
        )}
        {onOpenAgents && (
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onOpenAgents}>
            Agents
          </button>
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

function healthBadge(health: string): string {
  const h = health.toLowerCase();
  if (h.includes("critical")) return "critical";
  if (h.includes("warning")) return "warning";
  if (h.includes("sensor")) return "sensor_bad";
  if (h.includes("normal")) return "normal";
  return "offline";
}