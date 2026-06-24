import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import type { DagEdgeData } from "./dagTypes";

export function DagEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = (data ?? {}) as DagEdgeData;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const classes = [
    "pl-dag-edge",
    `pl-dag-edge--${edgeData.kind ?? "causal"}`,
    selected ? "pl-dag-edge--selected" : "",
    edgeData.highlighted ? "pl-dag-edge--highlighted" : "",
    edgeData.dimmed ? "pl-dag-edge--dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const label = edgeData.expectedWindow
    ? `${edgeData.expectedWindow}${edgeData.observedDelay ? ` / ${edgeData.observedDelay}` : ""}`
    : edgeData.label;

  return (
    <>
      <BaseEdge id={id} path={path} className={classes} />
      <EdgeLabelRenderer>
        <div
          className="pl-dag-edge__label"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}