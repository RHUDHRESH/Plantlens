import { useStore } from "../../store/useStore";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";

const ROLE_LABELS = {
  operator: "Operator",
  maintenance: "Maintenance",
  supervisor: "Supervisor",
  engineer: "Engineer",
} as const;

const SOURCE_LABELS = {
  sim: "Simulator",
  modbus: "Modbus",
  opcua: "OPC UA",
} as const;

export function TopStatusBar() {
  const plantName = "demo_plant";
  const {
    situations,
    connectionStatus,
    sourceMode,
    role,
    degraded,
    toggleLeftRail,
    toggleRightPanel,
    leftRailOpen,
    rightPanelOpen,
  } = useStore();

  const situationCount = situations.length;
  const isHealthy = situationCount === 0 && connectionStatus === "online";

  return (
    <header className="pl-top-bar">
      {degraded && (
        <div className="pl-top-bar__banner" role="status">
          <Badge variant="warning" dot>
            Degraded mode
          </Badge>
          <span>Visualization fallback active — data may be stale</span>
        </div>
      )}

      <div className="pl-top-bar__main">
        <div className="pl-top-bar__brand">
          <span className="pl-top-bar__wordmark">PlantLens</span>
          <span className="pl-top-bar__plant">{plantName}</span>
        </div>

        <div className="pl-top-bar__meta">
          <Badge variant="info">{SOURCE_LABELS[sourceMode]}</Badge>

          <Badge
            variant={
              connectionStatus === "online"
                ? "success"
                : connectionStatus === "degraded"
                  ? "warning"
                  : "danger"
            }
            dot
          >
            {connectionStatus}
          </Badge>

          <span className="pl-top-bar__role">{ROLE_LABELS[role]}</span>

          <span
            className={`pl-top-bar__health ${isHealthy ? "pl-top-bar__health--ok" : "pl-top-bar__health--alert"}`}
            aria-live="polite"
          >
            {situationCount === 0
              ? "All normal"
              : `${situationCount} active situation${situationCount > 1 ? "s" : ""}`}
          </span>
        </div>

        <div className="pl-top-bar__actions">
          <IconButton
            label={leftRailOpen ? "Close context rail" : "Open context rail"}
            onClick={toggleLeftRail}
            className="pl-top-bar__toggle pl-top-bar__toggle--left"
          >
            <MenuIcon />
          </IconButton>
          <IconButton
            label={rightPanelOpen ? "Close inspector" : "Open inspector"}
            onClick={toggleRightPanel}
            className="pl-top-bar__toggle pl-top-bar__toggle--right"
          >
            <PanelIcon />
          </IconButton>
        </div>
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3 5h14v1.5H3V5zm0 4.25h14V11H3v-1.75zm0 4.25h14V15H3v-1.5z" />
    </svg>
  );
}

function PanelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M3 3h14v14H3V3zm1.5 1.5v11h4.5v-11H4.5zm6 0v11h5.5v-11h-5.5z" />
    </svg>
  );
}