import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ackAlarm } from "../../api/client";
import { ApiError } from "../../api/types";
import type { ActiveAlarm } from "../../api/types";

interface RawAlarmTableProps {
  alarms: ActiveAlarm[];
  situationTitle?: string | null;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
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

function AckButton({ alarmId, acked, severity }: { alarmId: string; acked: boolean; severity: ActiveAlarm["severity"] }) {
  const [confirm, setConfirm] = useState(false);
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
    onSuccess: () => {
      setError(null);
      setConfirm(false);
    },
  });

  if (acked) {
    return <span className="alarm-acked">Acked</span>;
  }

  const needsConfirm = severity === "critical";

  return (
    <span className="alarm-ack-cell">
      {needsConfirm && confirm ? (
        <>
          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            aria-label={`Confirm acknowledge critical alarm ${alarmId}`}
          >
            {mutation.isPending ? "Ack…" : "Confirm ack"}
          </button>
          <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => (needsConfirm ? setConfirm(true) : mutation.mutate())}
          aria-label={`Acknowledge alarm ${alarmId}`}
        >
          {mutation.isPending ? "Ack…" : "Ack"}
        </button>
      )}
      {error && <span className="alarm-ack-error" role="alert">{error}</span>}
      {mutation.isSuccess && <span className="alarm-ack-ok">Recorded</span>}
    </span>
  );
}

export function RawAlarmTable({
  alarms,
  situationTitle,
  defaultExpanded = false,
  onExpandedChange,
}: RawAlarmTableProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    onExpandedChange?.(next);
  };

  const collapsedLabel =
    alarms.length === 0
      ? "No raw alarms — view raw alarms"
      : `${alarms.length} raw alarm${alarms.length === 1 ? "" : "s"} grouped — view raw alarms`;

  return (
    <section className={`raw-alarm-strip${expanded ? " raw-alarm-strip--expanded" : ""}`} aria-label="Raw alarms">
      <div className="raw-alarm-strip__header">
        <button
          type="button"
          className="raw-alarm-strip__toggle"
          aria-expanded={expanded}
          onClick={toggle}
        >
          {collapsedLabel}
        </button>
        {situationTitle && !expanded && (
          <span className="raw-alarm-strip__receipt">Grouped under {situationTitle}</span>
        )}
      </div>
      {expanded && (
        <div className="raw-alarm-strip__table-wrap" role="region">
          {situationTitle && (
            <p className="raw-alarm-strip__grouping-receipt">
              Grouping receipt: Situation “{situationTitle}” grouped these alarms.
            </p>
          )}
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
                    <td className="data-number">{alarm.asset_id}</td>
                    <td>{alarm.message}</td>
                    <td className="data-number">{alarm.raised_at}</td>
                    <td>
                      <AckButton alarmId={alarm.alarm_id} acked={alarm.acked} severity={alarm.severity} />
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