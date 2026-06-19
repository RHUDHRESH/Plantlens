import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getScenarios, startScenario, stopScenario } from "../../api/client";
import { ApiError } from "../../api/types";
import { useRuntimeStore } from "../../app/store/runtime";

interface ScenarioLauncherProps {
  onClose?: () => void;
}

function formatDuration(ms: number | undefined): string {
  if (!ms) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

const HERO_SCENARIO_ID = "scn_motor_overload";

export function ScenarioLauncher({ onClose }: ScenarioLauncherProps) {
  const queryClient = useQueryClient();
  const scenarioState = useRuntimeStore((s) => s.scenarioState);

  const listQuery = useQuery({
    queryKey: ["scenarios"],
    queryFn: ({ signal }) => getScenarios(signal),
    retry: 1,
  });

  const startMutation = useMutation({
    mutationFn: (scenarioId: string) => startScenario(scenarioId),
    onSuccess: (_data, scenarioId) => {
      useRuntimeStore.getState().setScenarioState({
        scenarioId,
        status: "started",
        progress: 0,
      });
      void queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => stopScenario(),
    onSuccess: () => {
      useRuntimeStore.getState().setScenarioState({
        scenarioId: null,
        status: "stopped",
        progress: null,
      });
      void queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });

  const scenarios = listQuery.data?.scenarios ?? [];
  const heroScenario = scenarios.find((s) => s.id === HERO_SCENARIO_ID) ?? scenarios[0];
  const runningId =
    scenarioState.scenarioId ?? listQuery.data?.running_scenario_id ?? null;
  const isRunning =
    scenarioState.status === "started" ||
    scenarioState.status === "running" ||
    Boolean(listQuery.data?.running_scenario_id);

  const errorMessage =
    (startMutation.error instanceof ApiError && startMutation.error.body.message) ||
    (stopMutation.error instanceof ApiError && stopMutation.error.body.message) ||
    (listQuery.error instanceof ApiError && listQuery.error.body.message) ||
    null;

  return (
    <section className="scenario-launcher scenario-launcher--panel" aria-label="Simulator scenarios">
      <div className="scenario-launcher__header">
        <h2 className="scenario-launcher__title">Scenario control</h2>
        {onClose && (
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onClose} aria-label="Close scenarios">
            Close
          </button>
        )}
      </div>

      {runningId && (
        <div className="scenario-launcher__status" role="status" aria-live="polite">
          <span className="status-badge status-badge--warning">{scenarioState.status.toUpperCase()}</span>
          <span className="data-number">{runningId}</span>
          {scenarioState.progress != null && (
            <span className="data-number">{Math.round(scenarioState.progress * 100)}%</span>
          )}
        </div>
      )}

      {listQuery.isLoading && <p className="scenario-launcher__hint">Loading scenarios…</p>}
      {errorMessage && (
        <p className="scenario-launcher__error" role="alert">
          {errorMessage}
        </p>
      )}

      {heroScenario && (
        <div className="scenario-launcher__hero">
          <div className="scenario-launcher__hero-meta">
            <strong>{heroScenario.name}</strong>
            {heroScenario.expected_situation && (
              <span className="scenario-launcher__expect">
                Expected: {heroScenario.expected_situation}
                {heroScenario.expected_root_cause ? ` @ ${heroScenario.expected_root_cause}` : ""}
              </span>
            )}
            <span className="scenario-launcher__duration data-number">{formatDuration(heroScenario.duration_ms)}</span>
          </div>
          <button
            type="button"
            className="pl-btn pl-btn--primary scenario-launcher__hero-run"
            aria-label={`Run scenario ${heroScenario.name}`}
            disabled={isRunning || startMutation.isPending}
            onClick={() => startMutation.mutate(heroScenario.id)}
          >
            {startMutation.isPending ? "Starting…" : `Run ${heroScenario.name}`}
          </button>
        </div>
      )}

      {scenarios.length > 1 && (
        <ul className="scenario-launcher__list">
          {scenarios
            .filter((s) => s.id !== heroScenario?.id)
            .map((scenario) => {
              const isThisRunning = runningId === scenario.id && isRunning;
              return (
                <li key={scenario.id} className="scenario-launcher__item">
                  <div className="scenario-launcher__meta">
                    <strong>{scenario.name}</strong>
                    <span className="scenario-launcher__id data-number">{scenario.id}</span>
                    <span className="scenario-launcher__duration data-number">{formatDuration(scenario.duration_ms)}</span>
                  </div>
                  <button
                    type="button"
                    className="pl-btn pl-btn--compact"
                    aria-label={`Run scenario ${scenario.name}`}
                    disabled={isRunning || startMutation.isPending}
                    onClick={() => startMutation.mutate(scenario.id)}
                  >
                    Run
                  </button>
                  {isThisRunning && (
                    <button
                      type="button"
                      className="pl-btn pl-btn--ghost pl-btn--compact"
                      aria-label="Stop current scenario"
                      disabled={stopMutation.isPending}
                      onClick={() => stopMutation.mutate()}
                    >
                      Stop
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      )}

      {isRunning && (
        <button
          type="button"
          className="pl-btn pl-btn--ghost scenario-launcher__reset"
          aria-label="Stop and reset scenario"
          disabled={stopMutation.isPending}
          onClick={() => stopMutation.mutate()}
        >
          Stop / Reset
        </button>
      )}
    </section>
  );
}