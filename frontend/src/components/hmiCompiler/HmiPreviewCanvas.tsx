import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { getScreenById } from "./demoHmiCompilerData";
import { DEMO_PLANT_NAME } from "../../data/demoPlant";

const ROLE_LABELS = {
  operator: "Operator",
  maintenance: "Maintenance",
  supervisor: "Supervisor",
  engineer: "Engineer",
} as const;

export function HmiPreviewCanvas() {
  const {
    selectedGeneratedScreenId,
    hmiRoleTarget,
    hmiDeviceTarget,
    hmiVariant,
    sourceMode,
  } = useStore();

  const screen = getScreenById(selectedGeneratedScreenId);
  const showEngineerLinks = hmiRoleTarget === "engineer";
  const showEvidenceLink =
    hmiRoleTarget === "engineer" ||
    hmiRoleTarget === "supervisor" ||
    hmiRoleTarget === "maintenance";

  const statusLabel = useMemo(() => {
    switch (hmiVariant) {
      case "warning":
        return "1 active situation — motor thermal drift";
      case "degraded":
        return "Degraded mode — visualization fallback active";
      case "offline":
        return "Source offline — cached model preview only";
      default:
        return "No active situations — all modeled assets healthy";
    }
  }, [hmiVariant]);

  const connectionLabel =
    hmiVariant === "offline" ? "OFFLINE" : hmiVariant === "degraded" ? "DEGRADED" : "ONLINE";

  const frameClass = [
    "pl-hmi-preview-frame",
    `pl-hmi-preview-frame--${hmiDeviceTarget}`,
    `pl-hmi-preview-frame--${hmiVariant}`,
  ].join(" ");

  return (
    <div className="pl-hmi-preview-wrap">
      <header className="pl-hmi-preview-wrap__header">
        <h2 className="pl-hmi-preview-wrap__title">
          Preview — {screen?.label ?? "Generated Screen"}
        </h2>
        <span className="pl-hmi-preview-wrap__meta">
          {ROLE_LABELS[hmiRoleTarget]} / {hmiDeviceTarget}
        </span>
      </header>

      <div className={frameClass} role="region" aria-label="Generated HMI preview">
        {(hmiVariant === "degraded" || hmiVariant === "offline") && (
          <div
            className={`pl-hmi-preview-frame__banner pl-hmi-preview-frame__banner--${hmiVariant}`}
            role="status"
          >
            {hmiVariant === "degraded"
              ? "Degraded — data may be stale"
              : "Offline — no live source connection"}
          </div>
        )}

        <div className="pl-hmi-preview-frame__topbar">
          <span className="pl-hmi-preview-frame__brand">PlantLens</span>
          <span className="pl-hmi-preview-frame__plant">{DEMO_PLANT_NAME}</span>
          <span className="pl-hmi-preview-frame__source">{sourceMode.toUpperCase()}</span>
          <span
            className={`pl-hmi-preview-frame__conn pl-hmi-preview-frame__conn--${hmiVariant}`}
          >
            ● {connectionLabel}
          </span>
        </div>

        <div className="pl-hmi-preview-frame__body">
          <p className="pl-hmi-preview-frame__generated-label">Generated {screen?.kind} view</p>

          <div className="pl-hmi-preview-frame__map" aria-label="Simplified plant map">
            <span className="pl-hmi-preview-frame__map-title">Generated map</span>
            <pre className="pl-hmi-preview-frame__topology">
              {hmiDeviceTarget === "mobile"
                ? "DC BUS → RELAY\n         ↓\n      MOTOR → FAN\n             ↓\n          BLOWER"
                : "DC BUS → RELAY → MOTOR → FAN → BLOWER\n                  ▲\n               signals"}
            </pre>
          </div>

          {showEngineerLinks && (
            <div className="pl-hmi-preview-frame__eng-links">
              <span className="pl-hmi-preview-frame__link">DAG View</span>
              {showEvidenceLink && (
                <span className="pl-hmi-preview-frame__link">Evidence Room</span>
              )}
            </div>
          )}

          {!showEngineerLinks && showEvidenceLink && (
            <div className="pl-hmi-preview-frame__eng-links">
              <span className="pl-hmi-preview-frame__link">View Evidence</span>
            </div>
          )}
        </div>

        <div
          className={`pl-hmi-preview-frame__bottom pl-hmi-preview-frame__bottom--${hmiVariant}`}
        >
          <p className="pl-hmi-preview-frame__status">{statusLabel}</p>
          <div className="pl-hmi-preview-frame__copilot" aria-label="Read-only copilot input">
            Ask read-only copilot…
          </div>
        </div>
      </div>
    </div>
  );
}