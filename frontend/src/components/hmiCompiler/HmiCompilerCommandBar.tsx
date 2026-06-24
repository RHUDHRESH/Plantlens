import { useStore } from "../../store/useStore";
import { Button } from "../ui/Button";

const HMI_ROLES = ["operator", "maintenance", "supervisor", "engineer"] as const;
const HMI_DEVICES = ["desktop", "tablet", "mobile"] as const;

export function HmiCompilerCommandBar() {
  const {
    hmiRoleTarget,
    setHmiRoleTarget,
    hmiDeviceTarget,
    setHmiDeviceTarget,
    regenerateHmiPreview,
    goBackToPlantLayout,
    openAuditCenter,
    hmiValidationStatus,
  } = useStore();

  const canExport = hmiValidationStatus === "valid" || hmiValidationStatus === "warning";

  const cycleRole = () => {
    const idx = HMI_ROLES.indexOf(hmiRoleTarget);
    setHmiRoleTarget(HMI_ROLES[(idx + 1) % HMI_ROLES.length] ?? "operator");
  };

  const cycleDevice = () => {
    const idx = HMI_DEVICES.indexOf(hmiDeviceTarget);
    setHmiDeviceTarget(HMI_DEVICES[(idx + 1) % HMI_DEVICES.length] ?? "desktop");
  };

  return (
    <div className="pl-hmi-command-bar" role="toolbar" aria-label="HMI compiler actions">
      <p className="pl-hmi-command-bar__notice">
        Export creates a review draft only. Runtime deployment is intentionally unavailable here.
      </p>

      <div className="pl-hmi-command-bar__actions">
        <Button variant="secondary" size="md" onClick={regenerateHmiPreview}>
          Regenerate Preview
        </Button>
        <Button variant="secondary" size="md" onClick={cycleRole}>
          Switch Role
        </Button>
        <Button variant="secondary" size="md" onClick={cycleDevice}>
          Switch Device
        </Button>
        <Button variant="secondary" size="md" onClick={goBackToPlantLayout}>
          Back Layout
        </Button>
        <Button variant="secondary" size="md" onClick={openAuditCenter}>
          Open Audit Center
        </Button>
        <Button variant="ghost" size="md" disabled title="Screen spec scaffold — not wired">
          Open Screen Spec
        </Button>
        <Button
          variant="primary"
          size="md"
          disabled={!canExport}
          title={
            canExport
              ? "Export review draft (local scaffold — no runtime write)"
              : "Regenerate and validate before export"
          }
          onClick={() => {
            /* Export scaffold — writes review draft locally only, no deployment */
          }}
        >
          Export HMI Draft
        </Button>
      </div>
    </div>
  );
}