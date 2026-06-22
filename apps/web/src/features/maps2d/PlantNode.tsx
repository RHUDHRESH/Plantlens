import type { CSSProperties } from "react";
import type { MapNodeDetailPolicy } from "../operational-map/detailPolicy";
import type { MapZoomBand } from "../operational-map";
import { AssetIcon } from "./iconRegistry";
import type { MapNodeOperationalMeta } from "./nodeOperationalMeta";
import type { AssetStatus, MapNode } from "./mapTypes";
import { STATUS_VISUALS } from "./statusStyles";

interface PlantNodeProps {
  node: MapNode;
  status: AssetStatus;
  detailPolicy: MapNodeDetailPolicy;
  zoomBand: MapZoomBand;
  meta?: MapNodeOperationalMeta;
  isRoot?: boolean;
  isAffected?: boolean;
  isFocused?: boolean;
  pathStep?: number;
  density?: "comfortable" | "compact";
  reducedMotion?: boolean;
  onSelect?: (id: string) => void;
}

const NODE_DIMS = {
  comfortable: { w: 128, h: 60, icon: 26 },
  compact: { w: 108, h: 50, icon: 22 },
} as const;

const NOTCH = 12;

function angularPath(w: number, h: number): string {
  return `M ${NOTCH},0 L ${w},0 L ${w},${h - NOTCH} L ${w - NOTCH},${h} L 0,${h} L 0,0 Z`;
}

function haloPath(w: number, h: number, pad: number): string {
  return `M ${NOTCH + pad},${-pad} L ${w + pad},${-pad} L ${w + pad},${h - NOTCH + pad} L ${w - NOTCH + pad},${h + pad} L ${-pad},${h + pad} L ${-pad},${-pad} Z`;
}

function isAbnormalStatus(status: AssetStatus): boolean {
  return status !== "normal" && status !== "unknown";
}

function buildAriaLabel(
  node: MapNode,
  status: AssetStatus,
  visual: (typeof STATUS_VISUALS)[AssetStatus],
  opts: {
    isRoot: boolean;
    isAffected: boolean;
    policy: MapNodeDetailPolicy;
    zoomBand: MapZoomBand;
    meta?: MapNodeOperationalMeta;
  },
): string {
  const parts = [node.label, visual.label || "normal"];
  if (opts.isRoot) parts.push("root cause");
  if (opts.isAffected) parts.push("affected");
  const abnormal = isAbnormalStatus(status) || opts.isRoot || opts.isAffected;
  const showAlarms =
    opts.policy.showAlarmCount &&
    opts.meta &&
    opts.meta.alarmCount > 0 &&
    (opts.zoomBand !== "plant" || abnormal);
  const showCritical =
    opts.policy.showCriticalAlarmCount &&
    opts.meta &&
    opts.meta.criticalAlarmCount > 0 &&
    (opts.zoomBand !== "plant" || abnormal);
  if (showAlarms) parts.push(`${opts.meta!.alarmCount} alarms`);
  if (showCritical) parts.push(`${opts.meta!.criticalAlarmCount} critical`);
  if (opts.policy.showTagCount && opts.meta && opts.meta.tagCount > 0) {
    parts.push(`${opts.meta.tagCount} tags`);
  }
  if (opts.policy.showBadQualityCount && opts.meta && opts.meta.badQualityCount > 0) {
    parts.push(`${opts.meta.badQualityCount} bad quality`);
  }
  return parts.join(", ");
}

export function PlantNode({
  node,
  status,
  detailPolicy,
  zoomBand,
  meta,
  isRoot = false,
  isAffected = false,
  isFocused = false,
  pathStep,
  density = "comfortable",
  reducedMotion = false,
  onSelect,
}: PlantNodeProps) {
  const visual = STATUS_VISUALS[status];
  const { w: NODE_W, h: NODE_H, icon: iconSize } = NODE_DIMS[density];
  const x = node.position?.x ?? 0;
  const y = node.position?.y ?? 0;
  const transition = reducedMotion ? undefined : "stroke 180ms, fill 180ms";
  const abnormal = isAbnormalStatus(status) || isRoot || isAffected;
  const showHalo =
    visual.halo && (status === "warning" || status === "critical" || isAffected);
  const haloSteady = status === "critical" || isRoot || reducedMotion;

  const showStatusText =
    detailPolicy.showStatusText ||
    (zoomBand === "plant" && abnormal && Boolean(visual.label));
  const showAlarmBadge =
    detailPolicy.showAlarmCount &&
    meta &&
    meta.alarmCount > 0 &&
    (zoomBand !== "plant" || abnormal);
  const showCriticalBadge =
    detailPolicy.showCriticalAlarmCount &&
    meta &&
    meta.criticalAlarmCount > 0 &&
    (zoomBand !== "plant" || abnormal);
  const showTagBadge = detailPolicy.showTagCount && meta && meta.tagCount > 0;
  const showQualityBadge =
    detailPolicy.showBadQualityCount && meta && meta.badQualityCount > 0;

  const fill = status === "offline" ? "url(#offline-stripe)" : visual.fill;
  const strokeColor = isFocused
    ? "var(--accent)"
    : isRoot
      ? "var(--status-critical)"
      : visual.border;
  const strokeW = isRoot ? 2.5 : isFocused ? 2 : 1.5;

  const microBadges: string[] = [];
  if (showAlarmBadge) microBadges.push(`A:${meta!.alarmCount}`);
  if (showCriticalBadge) microBadges.push(`C:${meta!.criticalAlarmCount}`);
  if (showTagBadge) microBadges.push(`T:${meta!.tagCount}`);
  if (showQualityBadge) microBadges.push(`Q:${meta!.badQualityCount}`);
  if (detailPolicy.showActionCue) microBadges.push("ACT");
  if (detailPolicy.showMaintenanceCue) microBadges.push("MNT");
  if (detailPolicy.showAuditCue) microBadges.push("AUD");

  return (
    <g
      transform={`translate(${x - NODE_W / 2}, ${y - NODE_H / 2})`}
      role="button"
      tabIndex={0}
      aria-label={buildAriaLabel(node, status, visual, {
        isRoot,
        isAffected,
        policy: detailPolicy,
        zoomBand,
        ...(meta ? { meta } : {}),
      })}
      onClick={() => onSelect?.(node.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(node.id);
        }
      }}
      style={{ cursor: "pointer" }}
      className={isFocused ? "plant-node--focused" : undefined}
    >
      {showHalo && (
        <path
          d={haloPath(NODE_W, NODE_H, 4)}
          fill="none"
          stroke={visual.border}
          strokeWidth={status === "critical" || isRoot ? 2.5 : 2}
          opacity={haloSteady ? 0.45 : 0.35}
          className={haloSteady ? "status-halo--steady" : reducedMotion ? undefined : "status-halo"}
          style={
            !haloSteady && !reducedMotion
              ? ({ ["--halo-duration" as string]: visual.haloDuration } as CSSProperties)
              : undefined
          }
        />
      )}

      <path
        d={angularPath(NODE_W, NODE_H)}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        style={{ transition }}
      />

      <line
        x1={NOTCH}
        y1={2}
        x2={NODE_W}
        y2={2}
        stroke={strokeColor}
        strokeWidth={1.5}
        opacity={0.6}
      />

      <g style={{ color: visual.text }}>
        <AssetIcon assetType={node.asset_type} size={iconSize} nodeWidth={NODE_W} />
      </g>

      {detailPolicy.showAssetLabel && (
        <text
          x={10}
          y={density === "compact" ? 20 : 22}
          fill="var(--text)"
          fontSize={density === "compact" ? 11 : 12}
          fontWeight={700}
          letterSpacing="0.01em"
        >
          {node.label}
        </text>
      )}

      {detailPolicy.showAssetId && (
        <text
          x={10}
          y={density === "compact" ? 35 : 38}
          fill="var(--text-muted)"
          fontSize={9}
          fontFamily="ui-monospace, monospace"
          letterSpacing="0.03em"
        >
          {node.id}
        </text>
      )}

      {detailPolicy.showAssetType && (
        <text
          x={10}
          y={density === "compact" ? 46 : 50}
          fill="var(--text-muted)"
          fontSize={8}
          letterSpacing="0.02em"
        >
          {node.asset_type}
        </text>
      )}

      {detailPolicy.showPrimaryValue && meta?.primaryValueLabel && (
        <text
          x={10}
          y={NODE_H - 6}
          fill="var(--text-muted)"
          fontSize={8}
          fontFamily="ui-monospace, monospace"
        >
          {meta.primaryValueLabel}
        </text>
      )}

      {showStatusText && visual.label && (
        <text
          x={NODE_W - 10}
          y={16}
          textAnchor="end"
          fill={visual.text}
          fontSize={8}
          fontWeight={700}
          letterSpacing="0.06em"
        >
          {visual.icon} {visual.label.toUpperCase()}
        </text>
      )}

      {detailPolicy.showRootBadge && isRoot && (
        <text
          x={NODE_W / 2}
          y={-8}
          textAnchor="middle"
          fill="var(--status-critical)"
          fontSize={9}
          fontWeight={700}
          letterSpacing="0.08em"
        >
          ▲ ROOT CAUSE
        </text>
      )}

      {detailPolicy.showCausalStep && pathStep !== undefined && (
        <g transform={`translate(${NODE_W - 16}, ${NODE_H - 14})`}>
          <path d="M 8,0 L 16,8 L 8,16 L 0,8 Z" fill="var(--accent)" />
          <text x={8} y={12} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>
            {pathStep}
          </text>
        </g>
      )}

      {microBadges.length > 0 && (
        <g className="plant-node__micro-badges" transform={`translate(4, ${NODE_H + 2})`}>
          {microBadges.map((badge, i) => (
            <g key={badge} transform={`translate(${i * 34}, 0)`}>
              <rect
                className="plant-node__micro-badge"
                x={0}
                y={0}
                width={32}
                height={12}
                rx={2}
                fill="var(--surface)"
                stroke="var(--border)"
                strokeWidth={0.5}
              />
              <text
                x={16}
                y={9}
                textAnchor="middle"
                fill="var(--text-muted)"
                fontSize={7}
                fontWeight={600}
                fontFamily="ui-monospace, monospace"
              >
                {badge}
              </text>
            </g>
          ))}
        </g>
      )}
    </g>
  );
}