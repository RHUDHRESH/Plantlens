import type { CSSProperties } from "react";
import { AssetIcon } from "./iconRegistry";
import type { AssetStatus, MapNode } from "./mapTypes";
import { STATUS_VISUALS } from "./statusStyles";

interface PlantNodeProps {
  node: MapNode;
  status: AssetStatus;
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

export function PlantNode({
  node,
  status,
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
  const showHalo =
    visual.halo && (status === "warning" || status === "critical" || isAffected);
  const haloSteady = status === "critical" || isRoot || reducedMotion;

  const fill = status === "offline" ? "url(#offline-stripe)" : visual.fill;
  const strokeColor = isFocused
    ? "var(--accent)"
    : isRoot
      ? "var(--status-critical)"
      : visual.border;
  const strokeW = isRoot ? 2.5 : isFocused ? 2 : 1.5;

  return (
    <g
      transform={`translate(${x - NODE_W / 2}, ${y - NODE_H / 2})`}
      role="button"
      tabIndex={0}
      aria-label={`${node.label} ${visual.label || "normal"}`}
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
      {/* Halo glow ring */}
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

      {/* Low-poly angular body */}
      <path
        d={angularPath(NODE_W, NODE_H)}
        fill={fill}
        stroke={strokeColor}
        strokeWidth={strokeW}
        style={{ transition }}
      />

      {/* Accent bar top-left → top-right */}
      <line
        x1={NOTCH}
        y1={2}
        x2={NODE_W}
        y2={2}
        stroke={strokeColor}
        strokeWidth={1.5}
        opacity={0.6}
      />

      {/* Icon */}
      <g style={{ color: visual.text }}>
        <AssetIcon assetType={node.asset_type} size={iconSize} nodeWidth={NODE_W} />
      </g>

      {/* Asset label */}
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

      {/* Asset ID — monospace engineering */}
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

      {/* Status badge top-right */}
      {visual.label && (
        <text
          x={NODE_W - 10}
          y={16}
          textAnchor="end"
          fill={visual.text}
          fontSize={8}
          fontWeight={700}
          letterSpacing="0.06em"
        >
          {visual.label.toUpperCase()}
        </text>
      )}

      {/* ROOT indicator */}
      {isRoot && (
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

      {/* Causal path step — diamond badge */}
      {pathStep !== undefined && (
        <g transform={`translate(${NODE_W - 16}, ${NODE_H - 14})`}>
          <path d="M 8,0 L 16,8 L 8,16 L 0,8 Z" fill="var(--accent)" />
          <text x={8} y={12} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>
            {pathStep}
          </text>
        </g>
      )}
    </g>
  );
}
