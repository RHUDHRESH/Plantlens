import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getScenarios, startScenario, stopScenario } from "../../api/client";
import { ApiError } from "../../api/types";
import { useRuntimeStore } from "../../app/store/runtime";

function formatDuration(ms: number | undefined): string {
  if (!ms) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ScenarioLauncher() {
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
    <section className="scenario-launcher" aria-label="Simulator scenarios">
      <div className="scenario-launcher__header">
        <h2 className="scenario-launcher__title">Scenarios</h2>
        {runningId && (
          <span className="scenario-launcher__badge" role="status" aria-live="polite">
            {scenarioState.status.toUpperCase()}: {runningId}
            {scenarioState.progress != null ? ` (${Math.round(scenarioState.progress * 100)}%)` : ""}
          </span>
        )}
      </div>

      {listQuery.isLoading && <p className="scenario-launcher__hint">Loading scenarios…</p>}
      {errorMessage && (
        <p className="scenario-launcher__error" role="alert">
          {errorMessage}
        </p>
      )}

      <ul className="scenario-launcher__list">
        {(listQuery.data?.scenarios ?? []).map((scenario) => {
          const isThisRunning = runningId === scenario.id && isRunning;
          return (
            <li key={scenario.id} className="scenario-launcher__item">
              <div className="scenario-launcher__meta">
                <strong>{scenario.name}</strong>
                <span className="scenario-launcher__id" data-tabular>
                  {scenario.id}
                </span>
                <span className="scenario-launcher__duration">{formatDuration(scenario.duration_ms)}</span>
                {scenario.expected_situation && (
                  <span className="scenario-launcher__expect">
                    → {scenario.expected_situation} @ {scenario.expected_root_cause}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="scenario-launcher__run"
                aria-label={`Run scenario ${scenario.name}`}
                disabled={isRunning || startMutation.isPending}
                onClick={() => startMutation.mutate(scenario.id)}
              >
                Run
              </button>
              {isThisRunning && (
                <button
                  type="button"
                  className="scenario-launcher__stop"
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

      {isRunning && (
        <button
          type="button"
          className="scenario-launcher__reset"
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