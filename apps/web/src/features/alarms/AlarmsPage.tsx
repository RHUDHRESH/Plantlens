import * as Tabs from "@radix-ui/react-tabs";
import { BellOff, CheckCheck, Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useShelvedAlarms, useUnshelveAlarm } from "../../api/queries";
import { ALARM_ACTION_ROLES, useCan } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { Button, EmptyState, ErrorNotice, Mono, PageHeader, PriorityGlyph } from "../../components/ui/primitives";
import { formatAge, formatClock, formatDateTime, parseTs, pluralize } from "../operational-map/format";
import { usePlantModel } from "../operational-map/plantModel";
import { useRuntimeNow } from "../operational-map/runtimeClock";
import { useOperateRuntime } from "../operational-map/useRuntimeSeed";
import "../operational-map/ops.css";
import { AckConfirmDialog, ShelveDialog } from "./AlarmDialogs";
import { AlarmDetailSheet } from "./AlarmDetailSheet";
import type { AlarmFilter, AlarmRow, SortDir, SortKey } from "./alarmModel";
import { EMPTY_FILTER, PRIORITY_LABEL, ackNeedsConfirm, filterRows, priorityStatus, sortRows } from "./alarmModel";
import { AlarmTable } from "./AlarmTable";
import { useAckAlarms } from "./useAlarmActions";
import { useAlarmRows } from "./useAlarmRows";
import "./alarms.css";

type TabKey = "active" | "shelved" | "grouped";

export function AlarmsPage() {
  useOperateRuntime();
  const now = useRuntimeNow(1000);
  const [params, setParams] = useSearchParams();
  const tab = (["active", "shelved", "grouped"].includes(params.get("tab") ?? "") ? params.get("tab") : "active") as TabKey;
  const openId = params.get("alarm");
  const canAct = useCan(ALARM_ACTION_ROLES);
  const { rows, rules } = useAlarmRows();
  const shelved = useShelvedAlarms();
  const shelvedCount = shelved.data?.shelved.length ?? 0;

  const [filter, setFilter] = useState<AlarmFilter>(EMPTY_FILTER);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "priority", dir: "asc" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRows, setConfirmRows] = useState<AlarmRow[] | null>(null);
  const [shelveRow, setShelveRow] = useState<AlarmRow | null>(null);
  const ack = useAckAlarms();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value === null) next.delete(key);
          else next.set(key, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const visible = useMemo(() => sortRows(filterRows(rows, filter), sort.key, sort.dir), [rows, filter, sort]);
  const openRow = rows.find((r) => r.id === openId) ?? null;
  const selectedRows = rows.filter((r) => selected.has(r.id) && r.state !== "acked");
  const unacked = rows.filter((r) => r.state !== "acked").length;
  const assets = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.assetId, r.assetName);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const requestAck = (targets: AlarmRow[]) => {
    const pending = targets.filter((r) => r.state !== "acked");
    if (!pending.length) return;
    if (ackNeedsConfirm(pending)) setConfirmRows(pending);
    else doAck(pending);
  };
  const doAck = (targets: AlarmRow[]) => {
    ack.mutate(
      targets.map((r) => r.id),
      {
        onSuccess: () => {
          setConfirmRows(null);
          setSelected((s) => {
            const n = new Set(s);
            for (const r of targets) n.delete(r.id);
            return n;
          });
        },
      },
    );
  };

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  const filtersActive = filter.priorities.length > 0 || filter.state !== "all" || filter.assetId || filter.text;

  return (
    <div className="pl-page alm-page">
      <PageHeader
        title="Alarms"
        description="Every raw alarm, always. Situations group alarms by root cause; nothing is suppressed."
        meta={
          <>
            <span className="pl-chip">
              <strong>{rows.length}</strong> active
            </span>
            <span className="pl-chip">
              <strong>{unacked}</strong> unacked
            </span>
            <span className="pl-chip">
              <strong>{shelvedCount}</strong> shelved
            </span>
          </>
        }
      />

      <Tabs.Root value={tab} onValueChange={(v) => setParam("tab", v === "active" ? null : v)} className="alm-tabs">
        <Tabs.List className="alm-tablist" aria-label="Alarm views">
          <Tabs.Trigger value="active" className="alm-tab">
            Active <span className="alm-tab__count">{rows.length}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="shelved" className="alm-tab">
            Shelved <span className="alm-tab__count">{shelvedCount}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="grouped" className="alm-tab">
            By situation
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="active" className="alm-panel">
          <div className="alm-toolbar" role="search">
            <label className="alm-search">
              <Search aria-hidden />
              <input
                className="pl-input"
                type="search"
                placeholder="Search alarm, asset or tag"
                aria-label="Search alarms"
                value={filter.text}
                onChange={(e) => setFilter((f) => ({ ...f, text: e.target.value }))}
              />
            </label>
            <div className="alm-prio-filter" role="group" aria-label="Filter by priority">
              {([1, 2, 3, 4] as const).map((p) => {
                const on = filter.priorities.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    className="alm-toggle"
                    aria-pressed={on}
                    title={PRIORITY_LABEL[p]}
                    onClick={() =>
                      setFilter((f) => ({
                        ...f,
                        priorities: on ? f.priorities.filter((x) => x !== p) : [...f.priorities, p],
                      }))
                    }
                  >
                    <PriorityGlyph status={priorityStatus(p)} />P{p}
                  </button>
                );
              })}
            </div>
            <select
              className="pl-select alm-select"
              aria-label="Filter by state"
              value={filter.state}
              onChange={(e) => setFilter((f) => ({ ...f, state: e.target.value as AlarmFilter["state"] }))}
            >
              <option value="all">Any state</option>
              <option value="unacked">Unacked</option>
              <option value="latched">Cleared · unacked</option>
              <option value="acked">Acked</option>
            </select>
            <select
              className="pl-select alm-select"
              aria-label="Filter by asset"
              value={filter.assetId}
              onChange={(e) => setFilter((f) => ({ ...f, assetId: e.target.value }))}
            >
              <option value="">All assets</option>
              {assets.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            {filtersActive ? (
              <Button variant="ghost" size="sm" icon={<X />} onClick={() => setFilter(EMPTY_FILTER)}>
                Clear filters
              </Button>
            ) : null}
            <div className="alm-toolbar__spacer" />
            {canAct ? (
              <div className="alm-bulk" aria-live="polite">
                {selectedRows.length ? <span className="ops-muted">{selectedRows.length} selected</span> : null}
                <Button
                  variant="primary"
                  size="sm"
                  icon={<CheckCheck />}
                  disabled={!selectedRows.length}
                  busy={ack.isPending}
                  onClick={() => requestAck(selectedRows)}
                >
                  Acknowledge selected
                </Button>
              </div>
            ) : (
              <span className="ops-subtle alm-readonly">Read-only · viewer role</span>
            )}
          </div>
          {ack.error ? <ErrorNotice error={ack.error} /> : null}
          <AlarmTable
            rows={visible}
            now={now}
            sort={sort}
            onSort={toggleSort}
            selectable={canAct}
            selected={selected}
            onToggle={(id) =>
              setSelected((s) => {
                const n = new Set(s);
                if (n.has(id)) n.delete(id);
                else n.add(id);
                return n;
              })
            }
            onToggleAll={(ids, on) =>
              setSelected((s) => {
                const n = new Set(s);
                for (const id of ids) {
                  if (on) n.add(id);
                  else n.delete(id);
                }
                return n;
              })
            }
            onOpen={(r) => setParam("alarm", r.id)}
            {...(canAct ? { onAck: (r: AlarmRow) => requestAck([r]) } : {})}
            openId={openId}
            emptyState={
              rows.length ? (
                <EmptyState title="No alarms match these filters">Clear the filters to see all {rows.length} active alarms.</EmptyState>
              ) : (
                <EmptyState title="No active alarms">The plant is running inside every configured limit.</EmptyState>
              )
            }
          />
          <p className="alm-keys ops-subtle">
            ↑ ↓ move · Space select · Enter details{canAct ? " · A acknowledge" : ""} · First out = earliest onset in a flood
          </p>
        </Tabs.Content>

        <Tabs.Content value="shelved" className="alm-panel">
          <ShelvedView now={now} canAct={canAct} rulesById={new Map(rules.map((r) => [r.id, r]))} />
        </Tabs.Content>

        <Tabs.Content value="grouped" className="alm-panel">
          <GroupedView rows={rows} now={now} onOpen={(r) => setParam("alarm", r.id)} />
        </Tabs.Content>
      </Tabs.Root>

      <AlarmDetailSheet
        row={openRow}
        open={!!openRow}
        onOpenChange={(o) => {
          if (!o) setParam("alarm", null);
        }}
        canAct={canAct}
        onAck={(r) => requestAck([r])}
        onShelve={(r) => setShelveRow(r)}
        ackBusy={ack.isPending}
      />
      <AckConfirmDialog
        rows={confirmRows ?? []}
        open={!!confirmRows}
        onOpenChange={(o) => {
          if (!o) setConfirmRows(null);
        }}
        onConfirm={() => confirmRows && doAck(confirmRows)}
        busy={ack.isPending}
      />
      <ShelveDialog row={shelveRow} open={!!shelveRow} onOpenChange={(o) => !o && setShelveRow(null)} />
    </div>
  );
}

function ShelvedView({
  now,
  canAct,
  rulesById,
}: {
  now: number;
  canAct: boolean;
  rulesById: Map<string, { message: string; asset_id?: string; priority?: number; severity: string }>;
}) {
  const shelved = useShelvedAlarms();
  const unshelve = useUnshelveAlarm();
  const { model } = usePlantModel();
  const list = shelved.data?.shelved ?? [];
  if (shelved.error) return <ErrorNotice error={shelved.error} />;
  if (!list.length) {
    return (
      <EmptyState icon={<BellOff />} title="No shelved alarms">
        Shelved alarms appear here with who shelved them, why, and when they return.
      </EmptyState>
    );
  }
  return (
    <div className="alm-table-wrap">
      {unshelve.error ? <ErrorNotice error={unshelve.error} /> : null}
      <table className="pl-table alm-table" aria-label="Shelved alarms">
        <thead>
          <tr>
            <th className="alm-col-priority">Priority</th>
            <th>Alarm</th>
            <th className="alm-col-asset">Asset</th>
            <th>Shelved by</th>
            <th>Reason</th>
            <th className="alm-col-num">Returns at</th>
            <th className="alm-col-num">Remaining</th>
            {canAct ? <th className="alm-col-action"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {list.map((s) => {
            const rule = rulesById.get(s.alarm_id);
            const status = priorityStatus(
              rule?.priority === 1 || rule?.priority === 2 || rule?.priority === 3 || rule?.priority === 4
                ? rule.priority
                : rule?.severity === "critical"
                  ? 1
                  : 2,
            );
            const until = parseTs(s.until);
            return (
              <tr key={s.alarm_id}>
                <td className="alm-col-priority">
                  <span className="ops-priority ops-priority--shelved">
                    <PriorityGlyph status={status} />
                    <span>Shelved</span>
                  </span>
                </td>
                <td>
                  <div>{rule?.message ?? s.alarm_id}</div>
                  <div className="ops-id">{s.alarm_id}</div>
                </td>
                <td className="alm-col-asset">{rule?.asset_id ? (model.assetById[rule.asset_id]?.name ?? rule.asset_id) : "—"}</td>
                <td>
                  <Mono>{s.by ?? "—"}</Mono>
                  <div className="ops-id">{s.at ? `at ${formatDateTime(s.at)}` : ""}</div>
                </td>
                <td className="alm-reason">{s.reason ?? "—"}</td>
                <td className="alm-col-num">
                  <Mono>{until ? formatClock(until) : "—"}</Mono>
                </td>
                <td className="alm-col-num">
                  <Mono>{until ? formatAge(until - now) : "—"}</Mono>
                </td>
                {canAct ? (
                  <td className="alm-col-action">
                    <Button size="sm" onClick={() => unshelve.mutate(s.alarm_id)} busy={unshelve.isPending && unshelve.variables === s.alarm_id}>
                      Unshelve
                    </Button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GroupedView({ rows, now, onOpen }: { rows: AlarmRow[]; now: number; onOpen: (r: AlarmRow) => void }) {
  const situation = useRuntimeStore((s) => s.activeSituation);
  const groups = useMemo(() => {
    const bySit = new Map<string, { title: string; rows: AlarmRow[] }>();
    const loose: AlarmRow[] = [];
    for (const r of sortRows(rows, "onset", "asc")) {
      if (r.situationId) {
        const g = bySit.get(r.situationId) ?? { title: r.situationTitle ?? r.situationId, rows: [] };
        g.rows.push(r);
        bySit.set(r.situationId, g);
      } else loose.push(r);
    }
    return { bySit: [...bySit.entries()], loose };
  }, [rows]);

  if (!rows.length) return <EmptyState title="No active alarms">Nothing to group.</EmptyState>;

  const renderRows = (list: AlarmRow[]) => (
    <ol className="alm-group__list">
      {list.map((r) => (
        <li key={r.id}>
          <button type="button" className="alm-group__row" onClick={() => onOpen(r)}>
            <PriorityGlyph status={r.status} title={PRIORITY_LABEL[r.priority]} />
            <span className="alm-group__msg">{r.message}</span>
            <span>{r.firstOut ? <span className="ops-first-out">First out</span> : null}</span>
            <span className="ops-muted">{r.assetName}</span>
            <Mono className="alm-group__time">{formatClock(r.onsetMs, true)}</Mono>
            <Mono className="alm-group__age">{formatAge(now - r.onsetMs)}</Mono>
          </button>
        </li>
      ))}
    </ol>
  );

  return (
    <div className="alm-groups">
      {groups.bySit.map(([id, g]) => (
        <section key={id} className="alm-group" aria-label={g.title}>
          <header className="alm-group__head">
            <div>
              <h3 className="alm-group__title">{g.title}</h3>
              <div className="ops-muted">
                Root: {situation?.situation_id === id ? (situation.root_asset_name ?? situation.root_asset_id) : "—"} ·{" "}
                {pluralize(g.rows.length, "raw alarm")} grouped, in onset order
              </div>
            </div>
          </header>
          {renderRows(g.rows)}
        </section>
      ))}
      {groups.loose.length ? (
        <section className="alm-group" aria-label="Not grouped">
          <header className="alm-group__head">
            <div>
              <h3 className="alm-group__title">Not grouped</h3>
              <div className="ops-muted">No approved root cause explains these alarms. Handle them individually.</div>
            </div>
          </header>
          {renderRows(groups.loose)}
        </section>
      ) : null}
    </div>
  );
}
