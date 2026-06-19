import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ackAlarm } from "../../api/client";
import { ApiError } from "../../api/types";
import type { ActiveAlarm } from "../../api/types";

interface RawAlarmTableProps {
  alarms: ActiveAlarm[];
  situationTitle?: string | null;
  defaultExpanded?: boolean;
}

const SEVERITY_LABEL: Record<ActiveAlarm["severity"], string> = {
  info: "INFO",
  warning: "WARNING",
  critical: "CRITICAL",
};

const SEVERITY_ICON: Record<ActiveAlarm["severity"], string> = {
  info: "ℹ",
  warning: "⚠",
  critical: "✕",
};

function AckButton({ alarmId, acked }: { alarmId: string; acked: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => ackAlarm(alarmId),
    onError: (err) => {
      if (err instanceof ApiError) {
        setError(err.body.fix ?? err.message);
      } else {
        setError("Ack failed — try again.");
      }
    },
    onSuccess: () => setError(null),
  });

  if (acked) {
    return <span className="alarm-acked">Acked</span>;
  }

  return (
    <span className="alarm-ack-cell">
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
        aria-label={`Acknowledge alarm ${alarmId}`}
      >
        {mutation.isPending ? "Ack…" : "Ack"}
      </button>
      {error && <span className="alarm-ack-error" role="alert">{error}</span>}
      {mutation.isSuccess && <span className="alarm-ack-ok">Recorded</span>}
    </span>
  );
}

export function RawAlarmTable({
  alarms,
  situationTitle,
  defaultExpanded = false,
}: RawAlarmTableProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className="raw-alarm-strip" aria-label="Raw alarms">
      <div className="raw-alarm-strip__header">
        <button
          type="button"
          className="raw-alarm-strip__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          Raw alarms ({alarms.length})
          {situationTitle ? ` — grouped under ${situationTitle}` : ""}
        </button>
      </div>
      {expanded && (
        <div className="raw-alarm-strip__table-wrap" role="region">
          <table className="raw-alarm-table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Asset</th>
                <th scope="col">Message</th>
                <th scope="col">Time</th>
                <th scope="col">Ack</th>
              </tr>
            </thead>
            <tbody>
              {alarms.length === 0 ? (
                <tr>
                  <td colSpan={5}>No active raw alarms.</td>
                </tr>
              ) : (
                alarms.map((alarm) => (
                  <tr key={alarm.alarm_id}>
                    <td>
                      <span
                        className={`alarm-sev alarm-sev--${alarm.severity}`}
                        title={SEVERITY_LABEL[alarm.severity]}
                      >
                        {SEVERITY_ICON[alarm.severity]} {SEVERITY_LABEL[alarm.severity]}
                      </span>
                    </td>
                    <td data-tabular>{alarm.asset_id}</td>
                    <td>{alarm.message}</td>
                    <td data-tabular>{alarm.raised_at}</td>
                    <td>
                      <AckButton alarmId={alarm.alarm_id} acked={alarm.acked} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}