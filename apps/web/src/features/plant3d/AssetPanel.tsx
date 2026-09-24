/** Side panel for the selected asset: identity, status, key live values with units, active alarms. */
import { X } from "lucide-react";
import { Link } from "react-router-dom";
import type { ActiveAlarm } from "../../api/types";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { IconButton, Mono, PriorityGlyph, StatusBadge, priorityToStatus } from "../../components/ui/primitives";
import type { AssetStatus } from "../maps2d/mapTypes";
import { assetAlarms, assetTagRows, type TagIndexEntry } from "./lib/assetDetails";
import type { PlacedAsset } from "./lib/layout";
import { modelKindInfo } from "./lib/registry";
import { panelBadge } from "./lib/status";
import { formatClock } from "../../lib/time";

function formatTime(iso: string): string {
  const text = formatClock(iso);
  return text === "—" ? iso : text;
}

export function AssetPanel({
  asset,
  areaName,
  status,
  tags,
  tagIndex,
  alarms,
  onClose,
}: {
  asset: PlacedAsset;
  areaName?: string | undefined;
  status: AssetStatus;
  tags: Record<string, TagFrame>;
  tagIndex: Record<string, TagIndexEntry>;
  alarms: ActiveAlarm[];
  onClose: () => void;
}) {
  const badge = panelBadge(status);
  const rows = assetTagRows(asset.id, tags, tagIndex, asset.tags);
  const active = assetAlarms(asset.id, alarms);
  return (
    <aside className="plant3d-panel" aria-label={`${asset.label} details`}>
      <header className="plant3d-panel__head">
        <div className="plant3d-panel__title">
          <h2>{asset.label}</h2>
          <Mono className="plant3d-panel__id">{asset.id}</Mono>
        </div>
        <IconButton label="Close details" icon={<X size={16} />} onClick={onClose} />
      </header>
      <dl className="plant3d-panel__meta">
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={badge.kind} label={badge.label} />
          </dd>
        </div>
        <div>
          <dt>Equipment</dt>
          <dd>{modelKindInfo(asset.kind).label}</dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>
            <Mono>{asset.assetType}</Mono>
          </dd>
        </div>
        {asset.areaId ? (
          <div>
            <dt>Area</dt>
            <dd>{areaName ?? asset.areaId}</dd>
          </div>
        ) : null}
      </dl>

      <section className="plant3d-panel__section">
        <h3>Live values</h3>
        {rows.length ? (
          <table className="plant3d-values">
            <tbody>
              {rows.map((r) => (
                <tr key={r.tagId} className={r.quality !== "GOOD" && r.quality !== "no data" ? "is-degraded" : undefined}>
                  <th scope="row">
                    <Mono>{r.tagId}</Mono>
                  </th>
                  <td>
                    <Mono>
                      {r.value}
                      {r.unit ? <span className="plant3d-values__unit"> {r.unit}</span> : null}
                    </Mono>
                  </td>
                  <td className="plant3d-values__q">{r.quality === "GOOD" ? "" : r.quality.toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="plant3d-panel__empty">No tags are configured for this asset.</p>
        )}
      </section>

      <section className="plant3d-panel__section">
        <h3>Active alarms {active.length ? <span className="plant3d-panel__count">{active.length}</span> : null}</h3>
        {active.length ? (
          <ul className="plant3d-alarms">
            {active.map((a) => {
              const kind = priorityToStatus(a.priority, a.severity);
              return (
                <li key={a.alarm_id}>
                  <PriorityGlyph status={kind} title={`Priority ${a.priority ?? ""} ${a.severity}`} />
                  <span className="plant3d-alarms__msg">{a.message}</span>
                  <Mono className="plant3d-alarms__time">{formatTime(a.raised_at)}</Mono>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="plant3d-panel__empty">No active alarms.</p>
        )}
        <div className="plant3d-panel__links">
          <Link to="/ops/alarms">Open alarm list</Link>
          <Link to="/ops">View on 2D overview</Link>
        </div>
      </section>
    </aside>
  );
}
