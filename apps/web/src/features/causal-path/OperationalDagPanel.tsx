import type { ActiveAlarm } from "../../api/types";
import type { TagFrame } from "../../app/schemas/tagFrame";
import type { AssetStatus, MapNode } from "../maps2d/mapTypes";
import { STATUS_VISUALS } from "../maps2d/statusStyles";

export interface OperationalDagNode {
  id: string;
  label: string;
  evidence_tags?: string[];
}

export interface OperationalDagEdge {
  id: string;
  from: string;
  to: string;
  edge_type: string;
  approved: boolean;
  confidence?: number;
}

interface OperationalDagPanelProps {
  nodes: OperationalDagNode[];
  edges: OperationalDagEdge[];
  mapNodes: MapNode[];
  assetStatus: Record<string, AssetStatus>;
  activePath: string[];
  tags: Record<string, TagFrame>;
  alarms: ActiveAlarm[];
  onSelectAsset: (assetId: string) => void;
  onFocusAsset: (assetId: string) => void;
}

function edgeLabel(edgeType: string): string {
  return edgeType.replace(/_/g, " ");
}

function assetHasLiveTag(assetId: string, tags: Record<string, TagFrame>): boolean {
  return Object.values(tags).some((tag) => tag.asset_id === assetId && tag.quality === "GOOD");
}

export function OperationalDagPanel({
  nodes,
  edges,
  mapNodes,
  assetStatus,
  activePath,
  tags,
  alarms,
  onSelectAsset,
  onFocusAsset,
}: OperationalDagPanelProps) {
  const approvedEdges = edges.filter((edge) => edge.approved);
  const mapLabels = new Map(mapNodes.map((node) => [node.id, node.label]));
  const graphNodes = new Map(nodes.map((node) => [node.id, node]));
  const alarmAssets = new Set(alarms.map((alarm) => alarm.asset_id));
  const activePathSet = new Set(activePath);
  const approvedAssetIds = Array.from(
    new Set(approvedEdges.flatMap((edge) => [edge.from, edge.to])),
  );
  const hiddenEdgeCount = edges.length - approvedEdges.length;

  if (!approvedEdges.length) {
    return (
      <section className="operational-dag operational-dag--empty" aria-label="Approved DAG">
        <div>
          <h2>Approved DAG</h2>
          <p>No approved causal edges are available.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="operational-dag" aria-label="Approved DAG">
      <div className="operational-dag__header">
        <div>
          <h2>Approved DAG</h2>
          <p>
            {approvedEdges.length} approved edge{approvedEdges.length === 1 ? "" : "s"}
            {hiddenEdgeCount > 0 ? ` · ${hiddenEdgeCount} draft edges pending review` : ""}
          </p>
        </div>
        <span className="operational-dag__mode">
          {activePath.length ? "runtime path active" : "standby"}
        </span>
      </div>

      <ol className="operational-dag__nodes">
        {approvedAssetIds.map((assetId, index) => {
          const graphNode = graphNodes.get(assetId);
          const status = assetStatus[assetId] ?? "unknown";
          const visual = STATUS_VISUALS[status];
          const hasLiveTag = assetHasLiveTag(assetId, tags);
          const hasAlarm = alarmAssets.has(assetId);
          const isOnPath = activePathSet.has(assetId);
          return (
            <li key={assetId} className="operational-dag__node-item">
              <button
                type="button"
                className={`operational-dag__node${isOnPath ? " operational-dag__node--path" : ""}${hasAlarm ? " operational-dag__node--alarm" : ""}`}
                onClick={() => {
                  onSelectAsset(assetId);
                  onFocusAsset(assetId);
                }}
                aria-label={`${mapLabels.get(assetId) ?? graphNode?.label ?? assetId}, ${visual.label || "unknown"} status`}
              >
                <span className="operational-dag__index">{index + 1}</span>
                <span className="operational-dag__asset">
                  <strong>{mapLabels.get(assetId) ?? graphNode?.label ?? assetId}</strong>
                  <span>{assetId}</span>
                </span>
                <span className={`status-badge status-badge--${status === "unknown" ? "offline" : status}`}>
                  {visual.label || "UNKNOWN"}
                </span>
                <span className="operational-dag__evidence">
                  {hasAlarm ? "alarm" : hasLiveTag ? "live" : "no evidence"}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <ul className="operational-dag__edges" aria-label="Approved DAG edges">
        {approvedEdges.map((edge) => (
          <li key={edge.id}>
            <span className="data-number">{edge.from}</span>
            <span aria-hidden="true">→</span>
            <span className="data-number">{edge.to}</span>
            <span>{edgeLabel(edge.edge_type)}</span>
            {edge.confidence !== undefined && (
              <span className="operational-dag__confidence">
                {Math.round(edge.confidence * 100)}%
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
