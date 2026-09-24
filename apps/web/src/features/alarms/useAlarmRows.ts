import { useMemo } from "react";
import { useAlarmRules } from "../../api/queries";
import { useRuntimeStore } from "../../app/store/runtime";
import { usePlantModel } from "../operational-map/plantModel";
import type { AlarmRow, RuntimeAlarm, RuntimeAlarmRule } from "./alarmModel";
import { buildAlarmRows } from "./alarmModel";

/** Live alarm rows: runtime store (WebSocket) + alarm rules + plant names. */
export function useAlarmRows(): { rows: AlarmRow[]; rules: RuntimeAlarmRule[] } {
  const alarms = useRuntimeStore((s) => s.activeAlarms) as RuntimeAlarm[];
  const situation = useRuntimeStore((s) => s.activeSituation);
  const tags = useRuntimeStore((s) => s.tags);
  const rulesQuery = useAlarmRules();
  const { model } = usePlantModel();
  const rules = useMemo(() => (rulesQuery.data?.rules ?? []) as RuntimeAlarmRule[], [rulesQuery.data]);
  const rows = useMemo(
    () => buildAlarmRows({ alarms, rules, situations: [situation], model, tags }),
    [alarms, rules, situation, model, tags],
  );
  return { rows, rules };
}
