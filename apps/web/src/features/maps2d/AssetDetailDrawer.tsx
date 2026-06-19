import { Drawer } from "../../components/shell/Drawer";
import type { ActiveAlarm } from "../../api/types";
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { AssetStatus, MapNode } from "./mapTypes";
import { STATUS_VISUALS } from "./statusStyles";

interface AssetDetailDrawerProps {
  node: MapNode | null;
  status: AssetStatus;
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
  open: boolean;
  onClose: () => void;
  onFocusMap?: (assetId: string) => void;
  onViewRawAlarms?: () => void;
}

export function AssetDetailDrawer({
  node,
  status,
  tags,
  alarms,
  open,
  onClose,
  onFocusMap,
  onViewRawAlarms,
}: AssetDetailDrawerProps) {
  if (!node) return null;

  const visual = STATUS_VISUALS[status];
  const assetTags = Object.values(tags).filter((t) => t.asset_id === node.id);
  const assetAlarms = alarms.filter((a) => a.asset_id === node.id);

  return (
    <Drawer
      title={node.label}
      subtitle={`${node.id} · ${node.asset_type}`}
      open={open}
      onClose={onClose}
      ariaLabel={`Asset detail ${node.label}`}
    >
      <div className="asset-drawer">
        <div className="asset-drawer__status">
          <span className={`status-badge status-badge--${status === "unknown" ? "offline" : status === "normal" ? "normal" : status}`}>
            {visual.icon} {visual.label || "NORMAL"}
          </span>
        </div>

        <section className="asset-drawer__section">
          <h3>Live tags</h3>
          {assetTags.length === 0 ? (
            <p className="asset-drawer__muted">No live tag values for this asset.</p>
          ) : (
            <ul className="asset-drawer__tag-list">
              {assetTags.map((tag) => (
                <li key={tag.tag_id}>
                  <span className="data-number">{tag.tag_id}</span>
                  <span className="data-number">
                    {String(tag.value ?? "—")} {tag.unit}
                  </span>
                  <span className={`status-badge status-badge--${tag.quality === "GOOD" ? "normal" : "sensor_bad"}`}>
                    {tag.quality}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="asset-drawer__section">
          <h3>Alarms on asset</h3>
          {assetAlarms.length === 0 ? (
            <p className="asset-drawer__muted">No active alarms on this asset.</p>
          ) : (
            <ul className="asset-drawer__alarm-list">
              {assetAlarms.map((a) => (
                <li key={a.alarm_id}>
                  <span className={`status-badge status-badge--${a.severity === "critical" ? "critical" : "warning"}`}>
                    {a.severity}
                  </span>
                  {a.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="asset-drawer__actions">
          {onFocusMap && (
            <button type="button" className="pl-btn pl-btn--compact" onClick={() => onFocusMap(node.id)}>
              Focus on map
            </button>
          )}
          {onViewRawAlarms && (
            <button type="button" className="pl-btn pl-btn--ghost pl-btn--compact" onClick={onViewRawAlarms}>
              Open raw alarms
            </button>
          )}
        </div>
      </div>
    </Drawer>
  );
}