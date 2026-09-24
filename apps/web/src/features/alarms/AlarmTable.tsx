import { Time } from "../../components/ui/Time";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { Button, Mono, PriorityGlyph } from "../../components/ui/primitives";
import { formatAge, formatValue } from "../operational-map/format";
import type { AlarmRow, SortDir, SortKey } from "./alarmModel";
import { PRIORITY_LABEL } from "./alarmModel";
import { AlarmStateLabel } from "./AlarmStateLabel";

interface Column {
  key: string;
  label: string;
  sort?: SortKey;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "priority", label: "Priority", sort: "priority", className: "alm-col-priority" },
  { key: "state", label: "State", sort: "state", className: "alm-col-state" },
  { key: "message", label: "Alarm", sort: "message" },
  { key: "asset", label: "Asset", sort: "asset", className: "alm-col-asset" },
  { key: "value", label: "Value", className: "alm-col-num alm-col-value" },
  { key: "onset", label: "Onset (UTC)", sort: "onset", className: "alm-col-num alm-col-onset" },
  { key: "age", label: "Age", sort: "age", className: "alm-col-num alm-col-age" },
  { key: "situation", label: "Situation", className: "alm-col-sit" },
];

/**
 * Active alarm table. Keyboard: ↑/↓ move, Home/End jump, Space selects, Enter opens details,
 * "a" acknowledges the focused alarm (when permitted).
 */
export function AlarmTable({
  rows,
  now,
  sort,
  onSort,
  selectable,
  selected,
  onToggle,
  onToggleAll,
  onOpen,
  onAck,
  openId,
  emptyState,
}: {
  rows: AlarmRow[];
  now: number;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  selectable: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onOpen: (row: AlarmRow) => void;
  onAck?: (row: AlarmRow) => void;
  openId?: string | null;
  emptyState: ReactNode;
}) {
  const [focus, setFocus] = useState(0);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);
  useEffect(() => {
    if (focus > rows.length - 1) setFocus(Math.max(0, rows.length - 1));
  }, [rows.length, focus]);

  const moveTo = (i: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, i));
    setFocus(next);
    rowRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, i: number, row: AlarmRow) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        moveTo(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        moveTo(i - 1);
        break;
      case "Home":
        e.preventDefault();
        moveTo(0);
        break;
      case "End":
        e.preventDefault();
        moveTo(rows.length - 1);
        break;
      case " ":
        if (selectable) {
          e.preventDefault();
          onToggle(row.id);
        }
        break;
      case "Enter":
        e.preventDefault();
        onOpen(row);
        break;
      case "a":
        if (onAck && row.state !== "acked") {
          e.preventDefault();
          onAck(row);
        }
        break;
    }
  };

  const ids = rows.map((r) => r.id);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const someOn = ids.some((id) => selected.has(id));

  return (
    <div className="alm-table-wrap">
      <table className="pl-table alm-table" aria-label="Active alarms" aria-rowcount={rows.length}>
        <thead>
          <tr>
            {selectable ? (
              <th className="alm-col-check">
                <input
                  type="checkbox"
                  aria-label={allOn ? "Clear selection" : "Select all visible alarms"}
                  checked={allOn}
                  ref={(el) => {
                    if (el) el.indeterminate = someOn && !allOn;
                  }}
                  onChange={() => onToggleAll(ids, !allOn)}
                />
              </th>
            ) : null}
            {COLUMNS.map((c) => {
              const active = c.sort && sort.key === c.sort;
              return (
                <th
                  key={c.key}
                  className={c.className}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {c.sort ? (
                    <button type="button" className="alm-sort" onClick={() => onSort(c.sort!)}>
                      {c.label}
                      {active ? (
                        sort.dir === "asc" ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />
                      ) : (
                        <span className="alm-sort__spacer" aria-hidden />
                      )}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
            {onAck ? <th className="alm-col-action"><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isSel = selected.has(row.id);
            return (
              <tr
                key={row.id}
                ref={(el) => {
                  rowRefs.current[i] = el;
                }}
                tabIndex={i === focus ? 0 : -1}
                aria-selected={isSel}
                data-open={openId === row.id || undefined}
                data-state={row.state}
                className="alm-row"
                onFocus={() => setFocus(i)}
                onKeyDown={(e) => onKeyDown(e, i, row)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest("input,button,a")) return;
                  onOpen(row);
                }}
              >
                {selectable ? (
                  <td className="alm-col-check">
                    <input
                      type="checkbox"
                      tabIndex={-1}
                      aria-label={`Select ${row.message}`}
                      checked={isSel}
                      onChange={() => onToggle(row.id)}
                    />
                  </td>
                ) : null}
                <td className="alm-col-priority">
                  <span className={`ops-priority ops-priority--${row.status}`}>
                    <PriorityGlyph status={row.status} title={PRIORITY_LABEL[row.priority]} />
                    <span>P{row.priority}</span>
                  </span>
                </td>
                <td className="alm-col-state">
                  <AlarmStateLabel state={row.state} />
                </td>
                <td>
                  <div className="alm-msg">
                    <span className="alm-msg__text">{row.message}</span>
                    {row.firstOut ? (
                      <span className="ops-first-out" title="Earliest onset in this alarm flood">
                        First out
                      </span>
                    ) : null}
                  </div>
                  <div className="ops-id">{row.id}</div>
                </td>
                <td className="alm-col-asset">
                  <div>{row.assetName}</div>
                  <div className="ops-id">{row.assetId}</div>
                </td>
                <td className="alm-col-num">
                  <Mono>{formatValue(row.value, row.unit)}</Mono>
                </td>
                <td className="alm-col-num">
                  <Time value={row.onsetMs} tenths />
                </td>
                <td className="alm-col-num">
                  <Mono>{formatAge(now - row.onsetMs)}</Mono>
                </td>
                <td className="alm-col-sit">
                  {row.situationTitle ? (
                    <span className="alm-sit" title={row.situationId ?? undefined}>
                      {row.situationTitle}
                    </span>
                  ) : (
                    <span className="ops-subtle">—</span>
                  )}
                </td>
                {onAck ? (
                  <td className="alm-col-action">
                    {row.state !== "acked" ? (
                      <Button size="sm" variant="ghost" tabIndex={-1} onClick={() => onAck(row)}>
                        Ack
                      </Button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length ? <div className="alm-table-empty">{emptyState}</div> : null}
    </div>
  );
}
