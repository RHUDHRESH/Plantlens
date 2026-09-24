import { LineChart } from "lucide-react";
import { Link } from "react-router-dom";
import { useTrends } from "../../api/queries";
import { Button, Mono, PriorityGlyph, StatusBadge } from "../../components/ui/primitives";
import { formatAge, formatDateTime, formatValue, parseTs } from "../operational-map/format";
import { useRuntimeNow } from "../operational-map/runtimeClock";
import { Facts, SectionLabel, SideSheet } from "../operational-map/SideSheet";
import { Sparkline } from "../operational-map/Sparkline";
import { extractLimits, trendsHref, withCarryIn } from "../trends/trendModel";
import { useRuntimeStore } from "../../app/store/runtime";
import type { AlarmRow } from "./alarmModel";
import { ALARM_STATE_LABEL, PRIORITY_LABEL } from "./alarmModel";
import { AlarmStateLabel } from "./AlarmStateLabel";

const WINDOW_S = 15 * 60;

export function AlarmDetailSheet({
  row,
  open,
  onOpenChange,
  canAct,
  onAck,
  onShelve,
  ackBusy,
}: {
  row: AlarmRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canAct: boolean;
  onAck: (row: AlarmRow) => void;
  onShelve: (row: AlarmRow) => void;
  ackBusy?: boolean;
}) {
  const now = useRuntimeNow(1000);
  const trend = useTrends(row && open ? [row.tagId] : [], WINDOW_S, 2000);
  const liveTag = useRuntimeStore((s) => (row ? s.tags[row.tagId] : undefined));
  if (!row) return null;
  const ev = row.alarm.evidence;
  const toMs = parseTs(trend.data?.now) ?? now;
  const series = trend.data?.series[0]
    ? withCarryIn(trend.data.series[0], liveTag, (toMs - WINDOW_S * 1000) / 1000)
    : undefined;
  const limits = row.rule
    ? extractLimits([row.rule], [row.tagId]).map((l) => ({ value: l.value, label: l.label, tone: l.tone }))
    : [];

  return (
    <SideSheet
      open={open}
      onOpenChange={onOpenChange}
      title={row.message}
      subtitle={
        <>
          <Mono>{row.id}</Mono> · {row.assetName}
        </>
      }
      badge={<StatusBadge status={row.status} label={PRIORITY_LABEL[row.priority]} />}
      footer={
        <>
          {canAct && row.state !== "acked" ? (
            <Button variant="primary" onClick={() => onAck(row)} busy={ackBusy ?? false}>
              Acknowledge
            </Button>
          ) : null}
          {canAct ? (
            <Button onClick={() => onShelve(row)} disabled={row.rule?.shelvable === false} title={row.rule?.shelvable === false ? "Not shelvable by rule" : undefined}>
              Shelve…
            </Button>
          ) : null}
          <Link className="pl-btn pl-btn--ghost pl-btn--md" to={trendsHref([row.tagId])}>
            <LineChart width={15} height={15} aria-hidden /> Open in trends
          </Link>
        </>
      }
    >
      <section>
        <Facts
          items={[
            { label: "State", value: <AlarmStateLabel state={row.state} /> },
            { label: "Current value", value: <Mono>{formatValue(row.value, row.unit)}</Mono> },
            { label: "Onset", value: <Mono>{formatDateTime(row.onsetMs)}</Mono> },
            { label: "Latched at", value: <Mono>{formatDateTime(row.raisedMs)}</Mono> },
            { label: "Age", value: <Mono>{formatAge(now - row.onsetMs)}</Mono> },
            {
              label: "Situation",
              value: row.situationTitle ? (
                <Link className="ops-link" to="/ops">
                  {row.situationTitle}
                </Link>
              ) : (
                <span className="ops-muted">Not grouped</span>
              ),
            },
          ]}
        />
      </section>

      <section>
        <SectionLabel aside="why the alarm raised">Evidence</SectionLabel>
        {ev ? (
          <div className="alm-evidence">
            <div className="alm-evidence__expr">
              <Mono>{ev.tag_id ?? row.tagId}</Mono>
              <span className="alm-evidence__obs">
                <Mono>{formatValue(ev.observed_value, row.unit)}</Mono>
              </span>
              {(ev.comparator ?? row.rule?.condition.op ?? "").startsWith("bool_") ? (
                <span className="ops-muted">
                  raises when {(ev.comparator ?? row.rule?.condition.op) === "bool_true" ? "ON" : "OFF"}
                </span>
              ) : (
                <>
                  <span className="alm-evidence__op">{ev.comparator ?? row.rule?.condition.op}</span>
                  <Mono>{ev.threshold != null ? formatValue(ev.threshold, row.unit) : "—"}</Mono>
                </>
              )}
            </div>
            <div className="ops-subtle">
              Observed at raise time · quality <Mono>{ev.quality ?? row.alarm.quality ?? "—"}</Mono>
            </div>
          </div>
        ) : (
          <p className="ops-empty-inline">The runtime did not attach evidence to this alarm.</p>
        )}
      </section>

      <section>
        <SectionLabel aside="last 15 min · dashed = alarm limit">
          <Mono>{row.tagId}</Mono>
        </SectionLabel>
        <Sparkline
          points={series?.points ?? []}
          fromMs={toMs - WINDOW_S * 1000}
          toMs={toMs}
          unit={row.unit}
          limits={limits}
          height={72}
          label={`${row.tagId} trend`}
        />
      </section>

      {row.rule ? (
        <section>
          <SectionLabel>Rule</SectionLabel>
          <Facts
            items={[
              {
                label: "Priority",
                value: (
                  <span className="alm-inline">
                    <PriorityGlyph status={row.status} /> {PRIORITY_LABEL[row.priority]}
                  </span>
                ),
              },
              { label: "Deadband", value: <Mono>{row.unit === "bool" ? "—" : formatValue(row.rule.deadband ?? 0, row.unit)}</Mono> },
              { label: "Delay / on-for", value: <Mono>{`${row.rule.delay_ms ?? 0} ms / ${row.rule.condition.for_ms ?? 0} ms`}</Mono> },
              { label: "Latching", value: row.rule.latching ? "Yes" : "No" },
              { label: "Ack required", value: row.rule.requires_ack ? "Yes" : "No" },
              {
                label: "Shelvable",
                value:
                  row.rule.shelvable === false
                    ? "No"
                    : row.rule.max_shelve_seconds
                      ? `Up to ${Math.round(row.rule.max_shelve_seconds / 60)} min`
                      : "Yes",
              },
            ]}
          />
        </section>
      ) : null}
      <p className="ops-subtle" style={{ margin: 0, fontSize: 12 }}>
        {ALARM_STATE_LABEL[row.state]} since <Mono>{formatDateTime(row.onsetMs)}</Mono>. Times use the runtime clock.
      </p>
    </SideSheet>
  );
}
