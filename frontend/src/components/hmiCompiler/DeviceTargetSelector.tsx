import { useStore } from "../../store/useStore";
import type { HmiDeviceTarget } from "./hmiCompilerTypes";

const DEVICES: { id: HmiDeviceTarget; label: string }[] = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "mobile", label: "Mobile" },
];

export function DeviceTargetSelector() {
  const { hmiDeviceTarget, setHmiDeviceTarget } = useStore();

  return (
    <fieldset className="pl-hmi-selector">
      <legend className="pl-hmi-selector__legend">Device target</legend>
      <div className="pl-hmi-selector__options" role="radiogroup" aria-label="HMI device target">
        {DEVICES.map((device) => (
          <button
            key={device.id}
            type="button"
            role="radio"
            aria-checked={hmiDeviceTarget === device.id}
            className={[
              "pl-hmi-selector__option",
              hmiDeviceTarget === device.id ? "pl-hmi-selector__option--active" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setHmiDeviceTarget(device.id)}
          >
            <span className="pl-hmi-selector__marker" aria-hidden="true">
              {hmiDeviceTarget === device.id ? "●" : "○"}
            </span>
            {device.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}