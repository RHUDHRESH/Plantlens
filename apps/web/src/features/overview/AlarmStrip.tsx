import { Time } from "../../components/ui/Time";
import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Mono, PriorityGlyph } from "../../components/ui/primitives";
import type { AlarmRow } from "../alarms/alarmModel";
import { PRIORITY_LABEL, sortRows } from "../alarms/alarmModel";
import { AlarmStateLabel } from "../alarms/AlarmStateLabel";
import { formatAge, formatValue } from "../operational-map/format";

/** Raw alarm strip — always visible under the map, never collapsed away (DESIGN_SYSTEM layout). */
export function AlarmStrip({ rows, now, shelvedCount }: { rows: AlarmRow[]; now: number; shelvedCount: number }) {
  const navigate = useNavigate();
  const sorted = sortRows(rows, "priority", "asc");
  const unacked = rows.filter((r) => r.state !== "acked").length;
  const grouped = rows.filter((r) => r.situationId).length;
  return (
    <section className="ov-strip" aria-label="Raw alarms">
      <header className="ov-strip__head">
        <h2 className="ov-strip__title">Raw alarms</h2>
        <span className="ov-strip__meta">
          <Mono>{rows.length}</Mono> active · <Mono>{unacked}</Mono> unacked
          {grouped ? (
            <>
              {" "}
              · <Mono>{grouped}</Mono> grouped into the situation
            </>
          ) : null}
          {shelvedCount ? (
            <>
              {" "}
              · <Mono>{shelvedCount}</Mono> shelved
            </>
          ) : null}
        </span>
        <Link className="ops-link ov-strip__link" to="/ops/alarms">
          Open alarm list <ArrowRight aria-hidden />
        </Link>
      </header>
      {sorted.length ? (
        <div className="ov-strip__scroll">
          <table className="ov-strip__table">
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  className={`ov-strip__row ov-strip__row--${r.state}`}
                  onClick={() => navigate(`/ops/alarms?alarm=${encodeURIComponent(r.id)}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") navigate(`/ops/alarms?alarm=${encodeURIComponent(r.id)}`);
                  }}
                  aria-label={`${PRIORITY_LABEL[r.priority]}: ${r.message}, ${r.assetName}`}
                >
                  <td className="ov-strip__prio">
                    <span className={`ops-priority ops-priority--${r.status}`}>
                      <PriorityGlyph status={r.status} />P{r.priority}
                    </span>
                  </td>
                  <td className="ov-strip__msg">
                    {r.message}
                    {r.firstOut ? <span className="ops-first-out">First out</span> : null}
                  </td>
                  <td className="ov-strip__asset">{r.assetName}</td>
                  <td className="ov-strip__num">
                    <Mono>{formatValue(r.value, r.unit)}</Mono>
                  </td>
                  <td className="ov-strip__num">
                    <Time value={r.onsetMs} tenths />
                  </td>
                  <td className="ov-strip__num ops-muted">
                    <Mono>{formatAge(now - r.onsetMs)}</Mono>
                  </td>
                  <td className="ov-strip__state">
                    <AlarmStateLabel state={r.state} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="ov-strip__empty">No active alarms. Every configured limit is satisfied.</p>
      )}
    </section>
  );
}
