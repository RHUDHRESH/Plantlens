import { Button, Panel, SegmentedControl } from "../../components/ui/primitives";
import type { ScenarioOption } from "./scenarios";

export type HmiMode = "preview" | "runtime";

interface HmiModeSwitcherProps {
  mode: HmiMode;
  selectedScenarioId: string;
  scenarios: ScenarioOption[];
  loading: boolean;
  runtimeUnavailable: boolean;
  onModeChange: (mode: HmiMode) => void;
  onScenarioChange: (scenarioId: string) => void;
  onRunPreview: () => void;
  onLoadRuntime: () => void;
}

const MODE_OPTIONS: { value: HmiMode; label: string }[] = [
  { value: "preview", label: "Scenario Preview" },
  { value: "runtime", label: "Runtime Snapshot" },
];

export function HmiModeSwitcher({
  mode,
  selectedScenarioId,
  scenarios,
  loading,
  runtimeUnavailable,
  onModeChange,
  onScenarioChange,
  onRunPreview,
  onLoadRuntime,
}: HmiModeSwitcherProps) {
  return (
    <Panel aria-label="HMI mode" className="hmi-mode-switcher">
      <div className="hmi-mode-switcher__row">
        <SegmentedControl label="HMI data source" value={mode} options={MODE_OPTIONS} onChange={onModeChange} />
        {mode === "preview" ? (
          <div className="hmi-mode-switcher__controls">
            <label className="pl-field hmi-mode-switcher__field">
              <span>Scenario</span>
              <select
                className="pl-select"
                value={selectedScenarioId}
                onChange={(e) => onScenarioChange(e.target.value)}
                disabled={loading}
              >
                {scenarios.map((scenario) => (
                  <option key={scenario.id} value={scenario.id}>
                    {scenario.label}
                  </option>
                ))}
              </select>
            </label>
            <Button variant="primary" onClick={onRunPreview} disabled={loading}>
              {loading ? "Projecting…" : "Run HMI projection"}
            </Button>
          </div>
        ) : (
          <div className="hmi-mode-switcher__controls">
            <p className="hmi-mode-switcher__help">
              Runtime mode renders the backend runtime PlantHMIState. It does not infer diagnosis in the browser.
            </p>
            <Button variant="primary" onClick={onLoadRuntime} disabled={loading || runtimeUnavailable}>
              {loading ? "Loading…" : "Load runtime HMI"}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
