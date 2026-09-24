import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { memo } from "react";
import { mediumColor, mediumDash } from "../../connection-rules/media";

export interface MediumEdgeData extends Record<string, unknown> {
  medium: string;
  approved: boolean;
  issue: "deny" | "warn" | null;
  lagLabel: string | null;
  loopOk: boolean;
}

export type MediumFlowEdge = Edge<MediumEdgeData, "medium">;

function MediumEdgeImpl({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
  markerEnd,
}: EdgeProps<MediumFlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 10,
    offset: 20,
  });
  const medium = data?.medium ?? "unknown";
  const draft = !data?.approved;
  const issue = data?.issue ?? null;
  const showLabel = draft || issue || data?.lagLabel || data?.loopOk;
  return (
    <>
      {selected ? <path d={path} className="st-edge__halo" fill="none" /> : null}
      <BaseEdge
        id={id}
        path={path}
        {...(markerEnd ? { markerEnd } : {})}
        interactionWidth={18}
        className="st-edge"
        style={{
          stroke: issue === "deny" ? "var(--status-critical)" : mediumColor(medium),
          strokeDasharray: mediumDash(medium),
          strokeWidth: selected ? 2.5 : 1.75,
          opacity: draft && !selected ? 0.72 : 1,
        }}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className="st-edge-label nodrag nopan"
            data-selected={selected || undefined}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {issue ? (
              <span className="st-edge-label__issue" data-issue={issue} title={issue === "deny" ? "Violates a connection rule" : "Rule warning"}>
                {issue === "deny" ? "✕" : "!"}
              </span>
            ) : null}
            {draft ? <span className="st-edge-label__draft">draft</span> : null}
            {data?.loopOk ? <span className="st-edge-label__loop">loop</span> : null}
            {data?.lagLabel ? <span className="st-edge-label__lag pl-mono">{data.lagLabel}</span> : null}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const MediumEdge = memo(MediumEdgeImpl);

/** In-progress connection line: accent when the hovered target is valid, red when it is not. */
export function StudioConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition, connectionStatus }: ConnectionLineComponentProps) {
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    targetX: toX,
    targetY: toY,
    sourcePosition: fromPosition,
    targetPosition: toPosition,
    borderRadius: 10,
    offset: 20,
  });
  return (
    <g className="st-connection-line" data-status={connectionStatus ?? undefined}>
      <path d={path} fill="none" />
      <circle cx={toX} cy={toY} r={3.5} />
    </g>
  );
}
