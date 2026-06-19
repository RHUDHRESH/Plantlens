import type { WsConnectionState } from "../../api/types";

interface TopStripProps {
  connection: WsConnectionState;
  plantHealth: string;
  mode: string;
  dataSource: string;
  timeLabel: string;
  role: string;
  apiAvailable: boolean;
  onOpenAgents?: () => void;
}

const CONN_LABEL: Record<WsConnectionState, string> = {
  connecting: "CONNECTING",
  live: "LIVE",
  stale: "DATA STALE",
  disconnected: "OFFLINE",
};

export function TopStrip({
  connection,
  plantHealth,
  mode,
  dataSource,
  timeLabel,
  role,
  apiAvailable,
  onOpenAgents,
}: TopStripProps) {
  const connClass =
    connection === "live" ? "conn-live" : connection === "stale" ? "conn-stale" : "conn-off";

  return (
    <header className="top-strip" role="banner">
      <div className="top-strip__item">
        <span className="top-strip__label">Plant</span>
        <span className="top-strip__value">{plantHealth}</span>
      </div>
      <div className="top-strip__item">
        <span className="top-strip__label">Mode</span>
        <span className="top-strip__value">{mode}</span>
      </div>
      <div className="top-strip__item">
        <span className="top-strip__label">Source</span>
        <span className="top-strip__value">{dataSource}</span>
      </div>
      <div className="top-strip__item">
        <span className="top-strip__label">Time</span>
        <span className="top-strip__value" data-tabular>
          {timeLabel}
        </span>
      </div>
      <div className="top-strip__item">
        <span className="top-strip__label">Role</span>
        <span className="top-strip__value">{role}</span>
      </div>
      <div className={`top-strip__conn ${connClass}`} aria-live="polite">
        <span className="top-strip__conn-icon" aria-hidden>
          {connection === "live" ? "●" : connection === "stale" ? "◌" : "○"}
        </span>
        <span className="top-strip__conn-text">{CONN_LABEL[connection]}</span>
      </div>
      {!apiAvailable && (
        <div className="top-strip__api-warn" role="status">
          API unavailable — showing last known runtime
        </div>
      )}
      {onOpenAgents && (
        <button type="button" className="top-strip__agents" onClick={onOpenAgents}>
          Agents
        </button>
      )}
    </header>
  );
}