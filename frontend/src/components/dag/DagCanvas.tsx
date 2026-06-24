import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "../../store/useStore";
import { getDemoDagForSituation } from "./demoDagData";
import { nodeKindToLayer } from "./demoDagData";
import { DagNode } from "./DagNode";
import { DagEdge } from "./DagEdge";
import type { DagFlowEdge, DagFlowNode } from "./dagTypes";
import { DagPathSummary } from "./DagPathSummary";

const nodeTypes = { dagNode: DagNode };
const edgeTypes = { dagEdge: DagEdge };

interface DagCanvasProps {
  situationId: string;
  title: string;
}

function applyHighlights(
  nodes: DagFlowNode[],
  edges: DagFlowEdge[],
  highlightMode: string,
  pathIds: string[],
  searchQuery: string,
): { nodes: DagFlowNode[]; edges: DagFlowEdge[] } {
  const q = searchQuery.trim().toLowerCase();

  const nodeMatchesHighlight = (n: DagFlowNode) => {
    if (highlightMode === "path") return pathIds.includes(n.id);
    if (highlightMode === "missing") return n.data.status === "missing";
    if (highlightMode === "contradictions") return n.data.status === "contradicting";
    return true;
  };

  const newNodes = nodes.map((n) => {
    const searchMatch = !q || n.data.label.toLowerCase().includes(q);
    const highlight = nodeMatchesHighlight(n) && searchMatch;
    const dimmed = highlightMode !== "all" && !nodeMatchesHighlight(n);
    return {
      ...n,
      data: { ...n.data, highlighted: highlight, dimmed },
    };
  });

  const newEdges = edges.map((e) => {
    const edgeData = e.data;
    if (!edgeData) return e;
    const searchMatch =
      !q ||
      e.id.toLowerCase().includes(q) ||
      edgeData.label.toLowerCase().includes(q);
    const onPath =
      highlightMode === "path" &&
      pathIds.includes(e.source) &&
      pathIds.includes(e.target);
    const highlight = highlightMode === "all" ? searchMatch : onPath && searchMatch;
    const dimmed = highlightMode === "path" && !onPath;
    return {
      ...e,
      data: { ...edgeData, highlighted: highlight, dimmed },
    };
  });

  return { nodes: newNodes, edges: newEdges };
}

export function DagCanvas({ situationId, title }: DagCanvasProps) {
  const {
    dagLayerVisibility,
    dagHighlightMode,
    dagSearchQuery,
    setSelectedDagNodeId,
    setSelectedDagEdgeId,
  } = useStore();

  const { nodes: baseNodes, edges: baseEdges, meta } = useMemo(
    () => getDemoDagForSituation(situationId),
    [situationId],
  );

  const filteredNodes = useMemo(() => {
    return baseNodes.map((n) => {
      const layer = nodeKindToLayer(n.data.kind);
      const hidden =
        !dagLayerVisibility[layer] ||
        (n.data.status === "neutral" && !dagLayerVisibility.hiddenNormal);
      return { ...n, hidden };
    });
  }, [baseNodes, dagLayerVisibility]);

  const { nodes, edges } = useMemo(
    () =>
      applyHighlights(
        filteredNodes,
        baseEdges,
        dagHighlightMode,
        meta.pathNodeIds,
        dagSearchQuery,
      ),
    [filteredNodes, baseEdges, dagHighlightMode, meta.pathNodeIds, dagSearchQuery],
  );

  const onSelectionChange = useCallback(
    ({ nodes: selNodes, edges: selEdges }: OnSelectionChangeParams) => {
      setSelectedDagNodeId(selNodes[0]?.id ?? null);
      setSelectedDagEdgeId(selEdges[0]?.id ?? null);
    },
    [setSelectedDagNodeId, setSelectedDagEdgeId],
  );

  return (
    <div className="pl-dag-canvas-wrap">
      <header className="pl-dag-canvas__header">
        <h1 className="pl-dag-canvas__title">{title}</h1>
        {meta.isDemoFallback && (
          <span className="pl-scaffold-tag">Demo fallback data</span>
        )}
      </header>
      <div className="pl-dag-canvas__flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          panOnDrag
          zoomOnScroll
          fitView
          onSelectionChange={onSelectionChange}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="rgba(255,255,255,0.06)" />
          <Controls showInteractive={false} className="pl-dag-controls" />
        </ReactFlow>
      </div>
      <DagPathSummary meta={meta} />
    </div>
  );
}