import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Play, Square } from "lucide-react";
import { getScenarios, startScenario, stopScenario } from "../../api/client";
import { ENGINEER_ROLES, useCan, useSession } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { Button, ErrorNotice } from "../../components/ui/primitives";
import "./scenarios.css";

/**
 * Bench-only scenario launcher (simulator replay). The API requires an engineer role, so the
 * control is hidden for everyone else. It never talks to hardware.
 */
export function ScenarioLauncher() {
  const canRun = useCan(ENGINEER_ROLES);
  const ready = useSession((s) => s.status === "ready");
  const client = useQueryClient();
  const scenarioState = useRuntimeStore((s) => s.scenarioState);
  const list = useQuery({
    queryKey: ["scenarios"],
    queryFn: ({ signal }) => getScenarios(signal),
    enabled: ready && canRun,
    refetchInterval: 5_000,
  });
  const start = useMutation({
    mutationFn: (id: string) => startScenario(id),
    onSettled: () => void client.invalidateQueries({ queryKey: ["scenarios"] }),
  });
  const stop = useMutation({
    mutationFn: () => stopScenario(),
    onSettled: () => void client.invalidateQueries({ queryKey: ["scenarios"] }),
  });
  if (!canRun) return null;

  const running =
    list.data?.running_scenario_id ??
    (scenarioState.status === "running" || scenarioState.status === "started" ? scenarioState.scenarioId : null);
  const runningName = list.data?.scenarios.find((s) => s.id === running)?.name;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button size="sm" variant="ghost" icon={<FlaskConical />} aria-label="Bench scenarios">
          {running ? `Replaying: ${runningName ?? running}` : "Bench scenarios"}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pl-menu scn-pop" align="end" sideOffset={6}>
          <div className="scn-pop__head">
            <div className="pl-menu__label" style={{ padding: 0 }}>
              Simulator scenarios
            </div>
            <p className="scn-pop__note">Replays recorded frames through the same runtime. Bench only — never hardware.</p>
          </div>
          {list.error ? <ErrorNotice error={list.error} /> : null}
          <ul className="scn-list">
            {(list.data?.scenarios ?? []).map((s) => {
              const isRunning = running === s.id;
              return (
                <li key={s.id} className={`scn-item${isRunning ? " is-running" : ""}`}>
                  <div className="scn-item__text">
                    <div className="scn-item__name">{s.name}</div>
                    <div className="scn-item__desc">{s.description}</div>
                  </div>
                  {isRunning ? (
                    <Button size="sm" icon={<Square />} onClick={() => stop.mutate()} busy={stop.isPending}>
                      Stop
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      icon={<Play />}
                      onClick={() => start.mutate(s.id)}
                      busy={start.isPending && start.variables === s.id}
                      aria-label={`Start ${s.name}`}
                    >
                      Start
                    </Button>
                  )}
                </li>
              );
            })}
            {list.isLoading ? <li className="scn-item scn-item__desc">Loading scenarios…</li> : null}
          </ul>
          {start.error ? <ErrorNotice error={start.error} /> : null}
          {stop.error ? <ErrorNotice error={stop.error} /> : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
