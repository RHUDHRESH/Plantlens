import { useCallback, useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AssemblyNode, type AssemblyNodeData } from "./AssemblyNode";
import { checkPortCompatibilityLocal } from "./connectionValidation";
import {
  buildConnectionFromPorts,
  useAssemblyStudioStore,
} from "./studioAssemblyState";

const nodeTypes = { assemblyNode: AssemblyNode };

export function AssemblyCanvas() {
  const assembly = useAssemblyStudioStore((s) => s.assembly);
  const library = useAssemblyStudioStore((s) => s.library);
  const moveAsset = useAssemblyStudioStore((s) => s.moveAsset);
  const addConnection = useAssemblyStudioStore((s) => s.addConnection);
  const selectAsset = useAssemblyStudioStore((s) => s.selectAsset);
  const selectConnection = useAssemblyStudioStore((s) => s.selectConnection);
  const setRejectionMessage = useAssemblyStudioStore((s) => s.setRejectionMessage);
  const getTemplate = useAssemblyStudioStore((s) => s.getTemplate);
  const selectedAssetId = useAssemblyStudioStore((s) => s.selectedAssetId);
  const selectedConnectionId = useAssemblyStudioStore((s) => s.selectedConnectionId);

  const templateByType = useMemo(
    () => new Map(library.map((c) => [c.component_type_id, c])),
    [library],
  );

  const nodes: Node[] = useMemo(() => {
    const built: Node[] = [];
    for (const asset of assembly.assets) {
      const template = templateByType.get(asset.component_type_id);
      if (!template) continue;
      built.push({
        id: asset.asset_id,
        type: "assemblyNode",
        position: asset.position_2d,
        selected: asset.asset_id === selectedAssetId,
        data: {
          assetId: asset.asset_id,
          displayName: asset.display_name,
          category: template.category,
          template,
          hasSafety: template.safety_notes.length > 0,
        } satisfies AssemblyNodeData,
      });
    }
    return built;
  }, [assembly.assets, templateByType, selectedAssetId]);

  const edges: Edge[] = useMemo(
    () =>
      assembly.connections.map((conn) => ({
        id: conn.connection_id,
        source: conn.from_asset_id,
        target: conn.to_asset_id,
        sourceHandle: conn.from_port_id,
        targetHandle: conn.to_port_id,
        label: conn.approved ? "✓ approved" : "draft",
        labelStyle: {
          fill: conn.approved ? "#2563EB" : "#687077",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.05em",
        },
        labelBgStyle: {
          fill: conn.approved ? "#EAF1FE" : "#F6F7F8",
          stroke: conn.approved ? "#2563EB" : "#CDD2D7",
          strokeWidth: 1,
        },
        selected: conn.connection_id === selectedConnectionId,
        className: conn.approved ? "edge-approved" : "edge-draft",
        style: {
          stroke: conn.approved ? "#2563EB" : "#A6ADB4",
          strokeWidth: conn.approved ? 2 : 1.5,
          strokeDasharray: conn.approved ? undefined : "5 4",
        },
        animated: conn.approved,
      })),
    [assembly.connections, selectedConnectionId],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "position" && change.position && !change.dragging && change.id) {
          moveAsset(change.id, change.position);
        }
        if (change.type === "select" && change.selected) {
          selectAsset(change.id);
        }
      }
      void applyNodeChanges(changes, nodes);
    },
    [moveAsset, nodes, selectAsset],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const {
        source,
        target,
        sourceHandle,
        targetHandle,
      } = connection;
      if (!source || !target || !sourceHandle || !targetHandle) return;
      if (source === target && sourceHandle === targetHandle) {
        setRejectionMessage("Cannot connect a port to itself.");
        return;
      }

      const fromAsset = assembly.assets.find((a) => a.asset_id === source);
      const toAsset = assembly.assets.find((a) => a.asset_id === target);
      if (!fromAsset || !toAsset) return;

      const fromTemplate = getTemplate(fromAsset.component_type_id);
      const toTemplate = getTemplate(toAsset.component_type_id);
      if (!fromTemplate || !toTemplate) {
        setRejectionMessage("Missing component template for connection validation.");
        return;
      }

      const exists = assembly.connections.some(
        (c) =>
          c.from_asset_id === source &&
          c.from_port_id === sourceHandle &&
          c.to_asset_id === target &&
          c.to_port_id === targetHandle,
      );
      if (exists) {
        setRejectionMessage("Connection already exists.");
        return;
      }

      const result = checkPortCompatibilityLocal(
        fromTemplate,
        sourceHandle,
        toTemplate,
        targetHandle,
      );
      if (!result.compatible) {
        setRejectionMessage(result.reason);
        return;
      }

      const medium = result.from_medium ?? fromTemplate.ports.find((p) => p.port_id === sourceHandle)?.medium ?? "data";
      addConnection(
        buildConnectionFromPorts(
          source,
          sourceHandle,
          target,
          targetHandle,
          medium,
          assembly.connections.length,
        ),
      );
      if (result.warnings.length) {
        setRejectionMessage(`Connected with warnings: ${result.warnings.join("; ")}`);
      }
    },
    [addConnection, assembly.assets, assembly.connections, getTemplate, setRejectionMessage],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      selectConnection(edge.id);
    },
    [selectConnection],
  );

  return (
    <div className="assembly-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} color="rgba(28,200,255,0.08)" />
        <Controls />
      </ReactFlow>
    </div>
  );
}