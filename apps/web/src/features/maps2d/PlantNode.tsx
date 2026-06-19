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
  comfortable: { w: 120, h: 56, icon: 28 },
  compact: { w: 100, h: 48, icon: 24 },
} as const;

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

  const fill =
    status === "offline"
      ? "url(#offline-stripe)"
      : visual.fill;

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
      {showHalo && (
        <rect
          x={-4}
          y={-4}
          width={NODE_W + 8}
          height={NODE_H + 8}
          rx={12}
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
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={10}
        fill={fill}
        stroke={isFocused ? "var(--accent)" : visual.border}
        strokeWidth={isRoot ? 2.5 : isFocused ? 2 : 1.5}
        style={{ transition }}
      />
      <g style={{ color: visual.text }}>
        <AssetIcon assetType={node.asset_type} size={iconSize} nodeWidth={NODE_W} />
      </g>
      <text x={10} y={density === "compact" ? 20 : 22} fill="var(--text)" fontSize={density === "compact" ? 11 : 12} fontWeight={600}>
        {node.label}
      </text>
      <text x={10} y={density === "compact" ? 36 : 40} fill="var(--text-muted)" fontSize={10} data-tabular>
        {node.id}
      </text>
      {visual.label && (
        <text
          x={NODE_W - 8}
          y={16}
          textAnchor="end"
          fill={visual.text}
          fontSize={9}
          fontWeight={700}
        >
          {visual.icon} {visual.label}
        </text>
      )}
      {isRoot && (
        <text x={NODE_W / 2} y={-8} textAnchor="middle" fill="var(--status-critical)" fontSize={10} fontWeight={700}>
          ROOT
        </text>
      )}
      {pathStep !== undefined && (
        <circle cx={NODE_W - 12} cy={NODE_H - 12} r={10} fill="var(--accent)" />
      )}
      {pathStep !== undefined && (
        <text
          x={NODE_W - 12}
          y={NODE_H - 8}
          textAnchor="middle"
          fill="#fff"
          fontSize={11}
          fontWeight={700}
          data-tabular
        >
          {pathStep}
        </text>
      )}
    </g>
  );
}