import { Drawer } from "../../components/shell/Drawer";
import type { ActiveAlarm } from "../../api/types";
import type { CalmCard } from "../../app/schemas/calmCard";
import type { Situation } from "../../app/schemas/situation";
import type { TagFrame } from "../../app/schemas/tagFrame";
import {
  getAssetInspectorPolicy,
  type MapLayerId,
  type MapZoomBand,
  type UserRole,
} from "../operational-map";
import type { AssetSourceLineage, StudioOpenIntent } from "../source-lineage";
import { SourceLineagePanel } from "../source-lineage";
import type { AssetStatus, MapNode } from "./mapTypes";
import { STATUS_VISUALS } from "./statusStyles";

interface AssetDetailDrawerProps {
  node: MapNode | null;
  status: AssetStatus;
  role: UserRole;
  zoomBand: MapZoomBand;
  visibleLayers: Record<MapLayerId, boolean>;
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
  rootAssetId?: string | null;
  affectedAssetIds?: string[];
  calmCard?: CalmCard | null;
  activeSituation?: Situation | null;
  open: boolean;
  onClose: () => void;
  onFocusMap?: (assetId: string) => void;
  onViewRawAlarms?: () => void;
  sourceLineage?: AssetSourceLineage | null;
  onOpenStudio?: (intent: StudioOpenIntent) => void;
}

function operatorStatusSummary(status: AssetStatus): string {
  switch (status) {
    case "critical":
      return "Asset is in critical condition and needs immediate attention.";
    case "warning":
      return "Asset is in warning state — review alarms and recommended checks.";
    case "sensor_bad":
      return "One or more sensors on this asset report bad quality.";
    case "offline":
      return "Asset is offline or not reporting live data.";
    case "normal":
      return "Asset is operating within normal limits.";
    default:
      return "Asset status is unknown.";
  }
}

export function AssetDetailDrawer({
  node,
  status,
  role,
  zoomBand,
  visibleLayers,
  tags,
  alarms,
  rootAssetId,
  affectedAssetIds = [],
  calmCard,
  activeSituation,
  open,
  onClose,
  onFocusMap,
  onViewRawAlarms,
  sourceLineage,
  onOpenStudio,
}: AssetDetailDrawerProps) {
  if (!node) return null;

  const policy = getAssetInspectorPolicy({ role, zoomBand, visibleLayers });
  const visual = STATUS_VISUALS[status];
  const assetTags = Object.values(tags)
    .filter((t) => t.asset_id === node.id)
    .sort((a, b) => a.tag_id.localeCompare(b.tag_id));
  const assetAlarms = alarms
    .filter((a) => a.asset_id === node.id)
    .sort((a, b) => a.alarm_id.localeCompare(b.alarm_id));
  const criticalCount = assetAlarms.filter((a) => a.severity === "critical").length;
  const badQualityTags = assetTags.filter((t) => t.quality !== "GOOD");
  const isRoot = node.id === rootAssetId;
  const isAffected = affectedAssetIds.includes(node.id);
  const primaryTag = assetTags.find((t) => t.quality === "GOOD") ?? assetTags[0];
  const primaryValue = primaryTag
    ? `${primaryTag.tag_id}: ${String(primaryTag.value ?? "—")} ${primaryTag.unit}`
    : null;

  const showRecommendedForAsset =
    calmCard &&
    (calmCard.root_asset_id === node.id ||
      activeSituation?.root_asset_id === node.id ||
      isRoot);

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
          <span
            className={`status-badge status-badge--${status === "unknown" ? "offline" : status === "normal" ? "normal" : status}`}
          >
            {visual.icon} {visual.label || "NORMAL"}
          </span>
        </div>

        <div className="asset-drawer__summary-grid">
          <div className="asset-drawer__metric">
            <span className="asset-drawer__metric-label">Alarms</span>
            <span className="data-number">{assetAlarms.length}</span>
          </div>
          <div className="asset-drawer__metric">
            <span className="asset-drawer__metric-label">Critical</span>
            <span className="data-number">{criticalCount}</span>
          </div>
          <div className="asset-drawer__metric">
            <span className="asset-drawer__metric-label">Tags</span>
            <span className="data-number">{assetTags.length}</span>
          </div>
          <div className="asset-drawer__metric">
            <span className="asset-drawer__metric-label">Bad quality</span>
            <span className="data-number">{badQualityTags.length}</span>
          </div>
        </div>

        {(isRoot || isAffected) && (
          <p className="asset-drawer__role-note">
            {isRoot && "Root cause asset"}
            {isRoot && isAffected && " · "}
            {isAffected && "Affected asset"}
          </p>
        )}

        {policy.showOperatorSummary && (
          <section className="asset-drawer__section">
            <h3>Operator summary</h3>
            <p>{operatorStatusSummary(status)}</p>
            {isRoot && <p className="asset-drawer__role-note">Root cause asset in active situation.</p>}
            {isAffected && !isRoot && (
              <p className="asset-drawer__role-note">Affected by active situation.</p>
            )}
            {assetAlarms.length > 0 && (
              <p>
                {assetAlarms.length} active alarm{assetAlarms.length === 1 ? "" : "s"} on this asset.
              </p>
            )}
          </section>
        )}

        {policy.showManagerSummary && (
          <section className="asset-drawer__section">
            <h3>Manager summary</h3>
            <p>
              {node.label} ({node.id}) — {visual.label || "normal"}.
              {assetAlarms.length > 0
                ? ` ${assetAlarms.length} active alarm${assetAlarms.length === 1 ? "" : "s"}.`
                : " No active alarms."}
            </p>
          </section>
        )}

        {policy.showLiveTagSummary && (
          <section className="asset-drawer__section">
            <h3>Live tag summary</h3>
            <p>
              {assetTags.length} tag{assetTags.length === 1 ? "" : "s"},{" "}
              {badQualityTags.length} bad quality.
            </p>
            {primaryValue && <p className="data-number">{primaryValue}</p>}
            {!primaryValue && (
              <p className="asset-drawer__muted">No live tag values for this asset.</p>
            )}
          </section>
        )}

        {policy.showFullTagTable && (
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
                    <span
                      className={`status-badge status-badge--${tag.quality === "GOOD" ? "normal" : "sensor_bad"}`}
                    >
                      {tag.quality === "GOOD" ? "✓ GOOD" : "⚠ " + tag.quality}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {policy.showAlarmSummary && (
          <section className="asset-drawer__section">
            <h3>Alarm summary</h3>
            <p>
              {assetAlarms.length} alarm{assetAlarms.length === 1 ? "" : "s"},{" "}
              {criticalCount} critical.
            </p>
          </section>
        )}

        {policy.showFullAlarmList && (
          <section className="asset-drawer__section">
            <h3>Alarms on asset</h3>
            {assetAlarms.length === 0 ? (
              <p className="asset-drawer__muted">No active alarms on this asset.</p>
            ) : (
              <ul className="asset-drawer__alarm-list">
                {assetAlarms.map((a) => (
                  <li key={a.alarm_id}>
                    <span
                      className={`status-badge status-badge--${a.severity === "critical" ? "critical" : "warning"}`}
                    >
                      {a.severity === "critical" ? "CRIT" : "WARN"} {a.severity}
                    </span>
                    {a.message}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {policy.showRecommendedActions && (
          <section className="asset-drawer__section">
            <h3>Recommended actions</h3>
            {showRecommendedForAsset && calmCard?.recommended_first_check ? (
              <p>
                <span className="status-badge status-badge--warning">ACT</span>{" "}
                {calmCard.recommended_first_check.label}
              </p>
            ) : (
              <p className="asset-drawer__muted">
                No recommended action attached to this asset.
              </p>
            )}
          </section>
        )}

        {policy.showMaintenanceSection && (
          <section className="asset-drawer__section">
            <h3>Maintenance</h3>
            <p>
              {badQualityTags.length} tag{badQualityTags.length === 1 ? "" : "s"} with bad sensor
              quality.
            </p>
            {badQualityTags.length > 0 ? (
              <ul className="asset-drawer__tag-list">
                {badQualityTags.map((tag) => (
                  <li key={tag.tag_id}>
                    <span className="data-number">{tag.tag_id}</span>
                    <span
                      className={`status-badge status-badge--sensor_bad`}
                    >
                      ⚠ {tag.quality}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="asset-drawer__muted">All tags report good quality.</p>
            )}
          </section>
        )}

        {policy.showAuditSection && (
          <section className="asset-drawer__section">
            <h3>Audit</h3>
            <p className="asset-drawer__muted">
              Audit receipts available in incident/audit surfaces.
            </p>
          </section>
        )}

        {policy.showEngineeringSection && (
          <section className="asset-drawer__section">
            <h3>Engineering</h3>
            <ul className="asset-drawer__tag-list">
              <li>
                <span>Asset ID</span>
                <span className="data-number">{node.id}</span>
              </li>
              <li>
                <span>Type</span>
                <span>{node.asset_type}</span>
              </li>
              <li>
                <span>Zoom band</span>
                <span>{zoomBand}</span>
              </li>
              <li>
                <span>Tag IDs</span>
                <span className="data-number">
                  {assetTags.length ? assetTags.map((t) => t.tag_id).join(", ") : "—"}
                </span>
              </li>
              <li>
                <span>Layers</span>
                <span>
                  {Object.entries(visibleLayers)
                    .filter(([, v]) => v)
                    .map(([k]) => k)
                    .join(", ") || "—"}
                </span>
              </li>
            </ul>
          </section>
        )}

        {sourceLineage && onOpenStudio && (
          <SourceLineagePanel
            lineage={sourceLineage}
            role={role}
            onOpenStudio={onOpenStudio}
          />
        )}

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