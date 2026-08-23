import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ackAlarm } from "../../api/client";
import { ApiError } from "../../api/types";
import type { ActiveAlarm } from "../../api/types";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";

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

function severityVariant(
  severity: ActiveAlarm["severity"],
): "secondary" | "warning" | "critical" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "secondary";
}

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
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            aria-label={`Confirm acknowledge critical alarm ${alarmId}`}
          >
            {mutation.isPending ? "Ack…" : "Confirm ack"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => (needsConfirm ? setConfirm(true) : mutation.mutate())}
          aria-label={`Acknowledge alarm ${alarmId}`}
        >
          {mutation.isPending ? "Ack…" : "Ack"}
        </Button>
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

  // Glass-box copy: always "grouped", never "suppressed" / "hidden".
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
          <Table className="raw-alarm-table">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Severity</TableHead>
                <TableHead scope="col">Asset</TableHead>
                <TableHead scope="col">Message</TableHead>
                <TableHead scope="col">Time</TableHead>
                <TableHead scope="col">Ack</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alarms.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No active raw alarms.</TableCell>
                </TableRow>
              ) : (
                alarms.map((alarm) => (
                  <TableRow key={alarm.alarm_id}>
                    <TableCell>
                      <Badge variant={severityVariant(alarm.severity)} className={`alarm-sev alarm-sev--${alarm.severity}`}>
                        {SEVERITY_LABEL[alarm.severity]}
                      </Badge>
                    </TableCell>
                    <TableCell className="data-number">{alarm.asset_id}</TableCell>
                    <TableCell>{alarm.message}</TableCell>
                    <TableCell className="data-number">{alarm.raised_at}</TableCell>
                    <TableCell>
                      <AckButton alarmId={alarm.alarm_id} acked={alarm.acked} severity={alarm.severity} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
