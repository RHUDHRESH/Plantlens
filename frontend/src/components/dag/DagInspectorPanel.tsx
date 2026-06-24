import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import type { Situation } from "../../store/useStore";
import { getDemoDagForSituation } from "./demoDagData";
import { Panel } from "../ui/Panel";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/IconButton";

interface DagInspectorPanelProps {
  situation: Situation;
  situationId: string;
}

export function DagInspectorPanel({ situation, situationId }: DagInspectorPanelProps) {
  const {
    selectedDagNodeId,
    selectedDagEdgeId,
    toggleRightPanel,
  } = useStore();

  const { nodes, edges } = useMemo(
    () => getDemoDagForSituation(situationId),
    [situationId],
  );

  const selectedNode = nodes.find((n) => n.id === selectedDagNodeId);
  const selectedEdge = edges.find((e) => e.id === selectedDagEdgeId);
  const sourceNode = selectedEdge
    ? nodes.find((n) => n.id === selectedEdge.source)
    : undefined;
  const targetNode = selectedEdge
    ? nodes.find((n) => n.id === selectedEdge.target)
    : undefined;

  return (
    <div className="pl-dag-inspector">
      <header className="pl-dag-inspector__header">
        <h2 className="pl-dag-inspector__title">
          {selectedEdge ? "Edge Inspector" : selectedNode ? "Node Inspector" : "Inspector"}
        </h2>
        <IconButton label="Close inspector" onClick={toggleRightPanel}>
          <CloseIcon />
        </IconButton>
      </header>

      {selectedEdge && selectedEdge.data && (
        <Panel title="Edge" variant="light">
          <p className="pl-dag-inspector__route">
            {sourceNode?.data.label ?? selectedEdge.source} →{" "}
            {targetNode?.data.label ?? selectedEdge.target}
          </p>
          <dl className="pl-dag-inspector__dl">
            <dt>Type</dt>
            <dd>{selectedEdge.data.kind}</dd>
            <dt>Expected window</dt>
            <dd>{selectedEdge.data.expectedWindow}</dd>
            <dt>Observed delay</dt>
            <dd>{selectedEdge.data.observedDelay ?? "—"}</dd>
            <dt>Confidence</dt>
            <dd>
              {selectedEdge.data.confidence !== undefined
                ? selectedEdge.data.confidence.toFixed(2)
                : "—"}
            </dd>
            <dt>Gate</dt>
            <dd>
              <Badge variant={selectedEdge.data.approved ? "success" : "warning"}>
                {selectedEdge.data.approved ? "APPROVED" : "PENDING"}
              </Badge>
            </dd>
            <dt>Source ref</dt>
            <dd>{selectedEdge.data.sourceRef ?? "—"}</dd>
          </dl>
          {selectedEdge.data.evidence && (
            <ul className="pl-evidence-list pl-evidence-list--support">
              {selectedEdge.data.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <p className="pl-dag-inspector__readonly">Read-only live graph — no mutation.</p>
        </Panel>
      )}

      {selectedNode && !selectedEdge && (
        <Panel title="Node" variant="light">
          <p className="pl-dag-inspector__label">{selectedNode.data.label}</p>
          <dl className="pl-dag-inspector__dl">
            <dt>Kind</dt>
            <dd>{selectedNode.data.kind}</dd>
            <dt>Status</dt>
            <dd>{selectedNode.data.status}</dd>
            {selectedNode.data.confidence !== undefined && (
              <>
                <dt>Confidence</dt>
                <dd>{(selectedNode.data.confidence * 100).toFixed(0)}%</dd>
              </>
            )}
            {selectedNode.data.timestamp && (
              <>
                <dt>Timestamp</dt>
                <dd>{selectedNode.data.timestamp}</dd>
              </>
            )}
            {selectedNode.data.note && (
              <>
                <dt>Note</dt>
                <dd>{selectedNode.data.note}</dd>
              </>
            )}
          </dl>
          {selectedNode.data.evidence && (
            <ul className="pl-evidence-list pl-evidence-list--support">
              {selectedNode.data.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <p className="pl-dag-inspector__readonly">Read-only live graph — no mutation.</p>
        </Panel>
      )}

      {!selectedNode && !selectedEdge && (
        <Panel title="Situation summary">
          <p className="pl-dag-inspector__situation">{situation.primary_fault}</p>
          <p className="pl-dag-inspector__hint">
            Select a node or edge to inspect causal evidence.
          </p>
          <Badge variant="readonly">Read-only live</Badge>
        </Panel>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path d="M5.5 4.5L10 9l4.5-4.5L15 5.5 10.5 10 15 14.5l-1.5 1.5L10 11.5 5.5 16 4 14.5 8.5 10 4 5.5z" />
    </svg>
  );
}