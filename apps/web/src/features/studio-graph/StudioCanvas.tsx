import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Node,
  type NodeChange,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStudioStore, type AuthoredBundle } from "../../app/store/studio";

interface StudioCanvasProps {
  bundle: AuthoredBundle;
}

function bundleToFlow(bundle: AuthoredBundle): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = bundle.plant.assets.map((asset) => ({
    id: asset.id,
    type: "default",
    position: {
      x: asset.coords_2d?.x ?? 0,
      y: asset.coords_2d?.y ?? 0,
    },
    data: { label: asset.display_name },
  }));

  const edges: Edge[] = bundle.causal_graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    label: edge.approved ? "approved" : "draft",
    style: { stroke: edge.approved ? "var(--status-normal)" : "var(--text-muted)" },
  }));

  return { nodes, edges };
}

export function StudioCanvas({ bundle }: StudioCanvasProps) {
  const setNodePosition = useStudioStore((s) => s.setNodePosition);
  const toggleEdgeApproved = useStudioStore((s) => s.toggleEdgeApproved);
  const addEdge = useStudioStore((s) => s.addEdge);

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => bundleToFlow(bundle),
    [bundle],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const next = applyNodeChanges(changes, initialNodes);
      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging) {
          setNodePosition(change.id, change.position);
        }
      }
      void next;
    },
    [initialNodes, setNodePosition],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.source === connection.target) return;
      const exists = bundle.causal_graph.edges.some(
        (e) => e.from === connection.source && e.to === connection.target,
      );
      if (exists) return;
      addEdge({
        id: `E-${connection.source}-${connection.target}`,
        from: connection.source,
        to: connection.target,
        edge_type: "structural_power",
        approved: false,
        lag_ms: [0, 2000],
        provenance: "manual",
      });
    },
    [addEdge, bundle.causal_graph.edges],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const current = bundle.causal_graph.edges.find((e) => e.id === edge.id);
      if (current) toggleEdgeApproved(edge.id, !current.approved);
    },
    [bundle.causal_graph.edges, toggleEdgeApproved],
  );

  return (
    <div className="studio-canvas" style={{ height: 400 }}>
      <ReactFlow
        nodes={initialNodes}
        edges={initialEdges}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        fitView
      >
        <Background gap={16} color="var(--grid)" />
        <MiniMap />
        <Controls />
      </ReactFlow>
      <p className="studio-canvas__hint">
        Projection only — click an edge to toggle approved. Layout writes coords_2d only.
      </p>
    </div>
  );
}