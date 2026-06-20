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
    <section className="hmi-mode-switcher" aria-label="HMI mode">
      <div className="hmi-mode-switcher__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "preview"}
          className={mode === "preview" ? "is-active" : ""}
          onClick={() => onModeChange("preview")}
        >
          Scenario Preview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "runtime"}
          className={mode === "runtime" ? "is-active" : ""}
          onClick={() => onModeChange("runtime")}
        >
          Runtime Snapshot
        </button>
      </div>

      {mode === "preview" ? (
        <div className="hmi-mode-switcher__panel">
          <label className="hmi-mode-switcher__field">
            <span>Scenario</span>
            <select
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
          <button type="button" onClick={onRunPreview} disabled={loading}>
            {loading ? "Projecting…" : "Run HMI projection"}
          </button>
        </div>
      ) : (
        <div className="hmi-mode-switcher__panel">
          <p className="hmi-mode-switcher__help">
            Runtime mode renders the backend runtime PlantHMIState. It does not infer diagnosis in
            the browser.
          </p>
          <button type="button" onClick={onLoadRuntime} disabled={loading || runtimeUnavailable}>
            {loading ? "Loading…" : "Load runtime HMI"}
          </button>
        </div>
      )}
    </section>
  );
}