import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { DagNodeData } from "./dagTypes";

const STATUS_MARKERS: Record<DagNodeData["status"], string> = {
  root: "■",
  supporting: "+",
  missing: "?",
  contradicting: "!",
  projected: "○",
  neutral: "·",
};

export function DagNode({ data, selected }: NodeProps) {
  const nodeData = data as DagNodeData;
  const marker = STATUS_MARKERS[nodeData.status];

  const classes = [
    "pl-dag-node",
    `pl-dag-node--${nodeData.status}`,
    `pl-dag-node--kind-${nodeData.kind}`,
    selected ? "pl-dag-node--selected" : "",
    nodeData.highlighted ? "pl-dag-node--highlighted" : "",
    nodeData.dimmed ? "pl-dag-node--dimmed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="button" tabIndex={0} aria-label={`${nodeData.label}, ${nodeData.kind}`}>
      <Handle type="target" position={Position.Top} className="pl-dag-handle" />
      <div className="pl-dag-node__marker" aria-hidden="true">
        {marker}
      </div>
      <div className="pl-dag-node__body">
        <span className="pl-dag-node__label">{nodeData.label}</span>
        <span className="pl-dag-node__kind">{nodeData.kind}</span>
        {nodeData.confidence !== undefined && (
          <span className="pl-dag-node__conf">
            {(nodeData.confidence * 100).toFixed(0)}%
          </span>
        )}
        {nodeData.timestamp && (
          <span className="pl-dag-node__ts">{nodeData.timestamp}</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="pl-dag-handle" />
    </div>
  );
}