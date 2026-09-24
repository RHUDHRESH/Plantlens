import type { AlarmState } from "./alarmModel";
import { ALARM_STATE_LABEL } from "./alarmModel";

/** State is shape + text (filled square = unacked, ring = acked, half = cleared awaiting ack). */
export function AlarmStateLabel({ state }: { state: AlarmState }) {
  return (
    <span className={`ops-state ops-state--${state}`}>
      <span className="ops-state__mark" aria-hidden />
      {ALARM_STATE_LABEL[state]}
    </span>
  );
}
