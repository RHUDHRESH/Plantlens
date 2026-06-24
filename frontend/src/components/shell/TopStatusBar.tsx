import { useStore } from "../../store/useStore";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";
import { SegmentedControl } from "../ui/SegmentedControl";
import { DEMO_PLANT_NAME } from "../../data/demoPlant";
import type { Role, SourceMode } from "../../design/types";

const ROLE_LABELS: Record<Role, string> = {
  operator: "Operator",
  maintenance: "Maintenance",
  supervisor: "Supervisor",
  engineer: "Engineer",
};

const SOURCE_LABELS: Record<SourceMode, string> = {
  sim: "SIM",
  modbus: "MODBUS",
  opcua: "OPC UA",
};

const ROLES: Role[] = ["operator", "maintenance", "supervisor", "engineer"];

export function TopStatusBar() {
  const {
    situations,
    connectionStatus,
    sourceMode,
    role,
    setRole,
    degraded,
    toggleLeftRail,
    toggleRightPanel,
    leftRailOpen,
    rightPanelOpen,
  } = useStore();

  const situationCount = situations.length;

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
          <span className="pl-top-bar__plant">{DEMO_PLANT_NAME}</span>
        </div>

        <div className="pl-top-bar__meta">
          <Badge variant="info" dot>
            {SOURCE_LABELS[sourceMode]}
          </Badge>

          <Badge
            variant={
              connectionStatus === "online"
                ? "success"
                : connectionStatus === "degraded"
                  ? "warning"
                  : "critical"
            }
            dot
          >
            {connectionStatus.toUpperCase()}
          </Badge>

          <Badge variant="readonly">Read-only</Badge>

          <span className="pl-top-bar__role pl-top-bar__role--desktop">{ROLE_LABELS[role]}</span>

          <span className="pl-top-bar__health" aria-live="polite">
            {situationCount === 0
              ? "All normal"
              : `${situationCount} situation${situationCount > 1 ? "s" : ""}`}
          </span>
        </div>

        <div className="pl-top-bar__role-switch pl-top-bar__role-switch--desktop">
          <SegmentedControl
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
            value={role}
            onChange={setRole}
            ariaLabel="Select role view"
          />
        </div>

        <div className="pl-top-bar__actions">
          <IconButton
            label={leftRailOpen ? "Close context rail" : "Open context rail"}
            onClick={toggleLeftRail}
          >
            <MenuIcon />
          </IconButton>
          <IconButton
            label={rightPanelOpen ? "Close inspector" : "Open inspector"}
            onClick={toggleRightPanel}
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