/**
 * Plant Studio canvas (xyflow, controlled). The assembly in the store is the truth; this component
 * projects it into nodes/edges and keeps only transient state locally:
 *   - live drag positions (applied every pointer move → nodes follow the cursor at 60 fps),
 *     committed to the store as ONE undoable command on drag stop;
 *   - measured node sizes, alignment guides, the palette drop ghost.
 */
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  SelectionMode,
  ViewportPortal,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type FinalConnectionState,
  type NodeChange,
  type NodeHandle,
  type OnReconnect,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { buildEngineContext, LOOP_OK_METADATA_KEY, primaryReason } from "../../connection-rules/engine";
import { mediumColor } from "../../connection-rules/media";
import { useRulesStore } from "../../connection-rules/rulesStore";
import type { Issue, RuleComponent } from "../../connection-rules/types";
import { boundsOf, computeAlignment, GRID, nearbyRects, snapPoint, type Guide, type Rect } from "../model/geometry";
import { validRoute } from "../model/autoLayout";
import { cachedLayout, type NodeLayout } from "../model/portLayout";
import { useReducedMotion } from "../../../app/hooks/useReducedMotion";
import type { XY } from "../model/assemblyOps";
import { selectAssembly, useStudioStore } from "../studioStore";
import { decideConnect, decideDropOnNode, makeIsValidConnection } from "./connectionHandlers";
import { PALETTE_MIME } from "./dnd";
import { CanvasContextMenu, type MenuTarget } from "./CanvasContextMenu";
import { EngineRefContext, type EngineSnapshot } from "./engineRef";
import { EquipmentNode, type EquipmentFlowNode } from "./EquipmentNode";
import { MediumEdge, StudioConnectionLine, type MediumFlowEdge } from "./MediumEdge";
import { PortTooltip } from "./PortTooltip";
import { useStudioKeyboard } from "./useStudioKeyboard";
import { useStudioActions } from "./useStudioActions";

export { PALETTE_MIME };

const nodeTypes = { equipment: EquipmentNode };
const edgeTypes = { medium: MediumEdge };
const SNAP_GRID: [number, number] = [GRID, GRID];
const GUIDE_THRESHOLD_PX = 6;
const GUIDE_RADIUS = 480;
const PRO = { hideAttribution: true };
const MULTI_SELECT_KEYS = ["Shift", "Meta", "Control"];
const TWEEN_MS = 280;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

interface Ghost {
  templateId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudioCanvasProps {
  issues: readonly Issue[];
  readOnly: boolean;
  onOpenHelp: () => void;
  onViewportChange?: ((viewport: Viewport) => void) | undefined;
  defaultViewport?: Viewport | null | undefined;
}

function severityMaps(issues: readonly Issue[]) {
  const nodes = new Map<string, "deny" | "warn">();
  const edges = new Map<string, "deny" | "warn">();
  for (const i of issues) {
    const map = i.target.kind === "edge" ? edges : i.target.kind === "node" ? nodes : null;
    if (!map) continue; // unconnected required ports are listed in validation, not painted on nodes
    if (map.get(i.target.id) !== "deny") map.set(i.target.id, i.severity);
  }
  return { nodes, edges };
}

const HANDLE = 11;
const handleCache = new WeakMap<NodeLayout, NodeHandle[]>();
function handlesFor(layout: NodeLayout): NodeHandle[] {
  let out = handleCache.get(layout);
  if (!out) {
    out = [...layout.left, ...layout.right].map((p) => ({
      id: p.port.port_id,
      type: "source" as const,
      position: p.side === "left" ? Position.Left : Position.Right,
      x: (p.side === "left" ? 0 : layout.width) - HANDLE / 2,
      y: p.offsetY - HANDLE / 2,
      width: HANDLE,
      height: HANDLE,
    }));
    handleCache.set(layout, out);
  }
  return out;
}

function clientPoint(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ("changedTouches" in event) {
    const t = event.changedTouches[0];
    return t ? { x: t.clientX, y: t.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

export function StudioCanvas({ issues, readOnly, onOpenHelp, onViewportChange, defaultViewport }: StudioCanvasProps) {
  const flow = useReactFlow();
  const actions = useStudioActions();
  const assembly = useStudioStore(selectAssembly);
  const templates = useStudioStore((s) => s.templates);
  const selection = useStudioStore((s) => s.selection);
  const renamingId = useStudioStore((s) => s.renamingId);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);
  const showLagLabels = useStudioStore((s) => s.showLagLabels);
  const edgeRoutes = useStudioStore((s) => s.edgeRoutes);
  const layoutTween = useStudioStore((s) => s.layoutTween);
  const reducedMotion = useReducedMotion();
  const rules = useRulesStore((s) => s.rules);

  // ---- rule engine (read imperatively by nodes/isValidConnection) ------------------------------
  const ctx = useMemo(() => buildEngineContext(assembly, templates as unknown as Map<string, RuleComponent>), [assembly, templates]);
  const engineRef = useRef<EngineSnapshot | null>(null);
  const reconnectingRef = useRef<string | null>(null);
  engineRef.current = { ctx, rules, reconnectingEdgeId: reconnectingRef.current, readOnly };
  const isValidConnection = useMemo(() => makeIsValidConnection(engineRef), []);

  // ---- transient drag / measure state -----------------------------------------------------------
  const [dragPositions, setDragPositions] = useState<Record<string, XY>>({});
  const dragRef = useRef<Record<string, XY>>({});
  const [guides, setGuides] = useState<Guide[]>([]);
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [altHeld, setAltHeld] = useState(false);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [menuTarget, setMenuTarget] = useState<MenuTarget>({ kind: "pane" });
  const connectHandled = useRef(false);

  // ---- auto-arrange tween: nodes glide from their old spots to the committed layout -------------
  const [tweenPositions, setTweenPositions] = useState<Record<string, XY>>({});
  useEffect(() => {
    if (!layoutTween || reducedMotion) return;
    const to = new Map(useStudioStore.getState().history.present.assets.map((a) => [a.asset_id, a.position_2d]));
    const ids = Object.keys(layoutTween.from).filter((id) => to.has(id));
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_MS);
      if (t >= 1) {
        setTweenPositions({});
        return;
      }
      const k = ease(t);
      const out: Record<string, XY> = {};
      for (const id of ids) {
        const a = layoutTween.from[id]!;
        const b = to.get(id)!;
        out[id] = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      }
      setTweenPositions(out);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      setTweenPositions({});
    };
  }, [layoutTween, reducedMotion]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === "Alt" && setAltHeld(true);
    const up = (e: KeyboardEvent) => e.key === "Alt" && setAltHeld(false);
    const blur = () => setAltHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  const { nodes: nodeIssues, edges: edgeIssues } = useMemo(() => severityMaps(issues), [issues]);

  // ---- projection: assembly → nodes (per-node identity cache keeps memoised nodes cheap) --------
  const nodeCache = useRef(new Map<string, EquipmentFlowNode>());
  const nodes = useMemo(() => {
    const selected = new Set(selection.nodes);
    const connected = new Map<string, string[]>();
    for (const c of assembly.connections) {
      (connected.get(c.from_asset_id) ?? connected.set(c.from_asset_id, []).get(c.from_asset_id)!).push(c.from_port_id);
      (connected.get(c.to_asset_id) ?? connected.set(c.to_asset_id, []).get(c.to_asset_id)!).push(c.to_port_id);
    }
    const cache = nodeCache.current;
    const next = new Map<string, EquipmentFlowNode>();
    const list = assembly.assets.map((asset) => {
      const template = templates.get(asset.component_type_id);
      const layout = cachedLayout(template?.ports ?? []);
      const position = dragPositions[asset.asset_id] ?? tweenPositions[asset.asset_id] ?? asset.position_2d;
      const isSelected = selected.has(asset.asset_id);
      const issue = nodeIssues.get(asset.asset_id) ?? null;
      const renaming = renamingId === asset.asset_id;
      const connectedKey = (connected.get(asset.asset_id) ?? []).sort().join("|");
      const m = measured[asset.asset_id];
      const prev = cache.get(asset.asset_id);
      if (
        prev &&
        prev.position.x === position.x &&
        prev.position.y === position.y &&
        prev.selected === isSelected &&
        prev.measured === m &&
        prev.data.asset === asset &&
        prev.data.template === template &&
        prev.data.issue === issue &&
        prev.data.renaming === renaming &&
        prev.data.readOnly === readOnly &&
        prev.data.connectedKey === connectedKey
      ) {
        next.set(asset.asset_id, prev);
        return prev;
      }
      const node: EquipmentFlowNode = {
        id: asset.asset_id,
        type: "equipment",
        position,
        width: layout.width,
        height: layout.height,
        selected: isSelected,
        // Deterministic handle geometry: without it xyflow drops handleBounds whenever a node object
        // is re-created before its measurement lands, and those edges silently never render.
        handles: handlesFor(layout),
        ...(m ? { measured: m } : {}),
        data: { asset, template, issue, renaming, readOnly, connectedKey },
        ariaLabel: `${asset.display_name} (${asset.asset_id})`,
      };
      next.set(asset.asset_id, node);
      return node;
    });
    nodeCache.current = next;
    return list;
  }, [assembly.assets, assembly.connections, templates, selection.nodes, dragPositions, tweenPositions, nodeIssues, renamingId, readOnly, measured]);

  // ---- projection: connections → edges ----------------------------------------------------------
  const edges = useMemo<MediumFlowEdge[]>(() => {
    const selected = new Set(selection.edges);
    const loopOk = new Set(
      Array.isArray(assembly.metadata?.[LOOP_OK_METADATA_KEY]) ? (assembly.metadata[LOOP_OK_METADATA_KEY] as string[]) : [],
    );
    const livePos = new Map<string, XY>();
    for (const a of assembly.assets) livePos.set(a.asset_id, dragPositions[a.asset_id] ?? tweenPositions[a.asset_id] ?? a.position_2d);
    return assembly.connections.map((c) => {
      // Stored ELK route only while neither endpoint has moved since the auto-arrange.
      const route = validRoute(edgeRoutes[c.connection_id], livePos.get(c.from_asset_id), livePos.get(c.to_asset_id));
      const fromAsset = ctx.assets.get(c.from_asset_id);
      const medium = (fromAsset && templates.get(fromAsset.component_type_id)?.ports.find((p) => p.port_id === c.from_port_id)?.medium) ?? "unknown";
      const issue = edgeIssues.get(c.connection_id) ?? null;
      const color = issue === "deny" ? "var(--status-critical)" : mediumColor(medium);
      return {
        id: c.connection_id,
        type: "medium",
        source: c.from_asset_id,
        sourceHandle: c.from_port_id,
        target: c.to_asset_id,
        targetHandle: c.to_port_id,
        selected: selected.has(c.connection_id),
        reconnectable: !readOnly,
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
        data: {
          medium,
          approved: c.approved,
          issue,
          loopOk: loopOk.has(c.connection_id),
          lagLabel: showLagLabels ? `${c.lag_min_ms}–${c.lag_max_ms} ms` : null,
          points: route?.points ?? null,
        },
        ariaLabel: `Connection ${c.connection_id} ${c.from_asset_id} to ${c.to_asset_id}`,
      } satisfies MediumFlowEdge;
    });
  }, [assembly.connections, assembly.assets, assembly.metadata, selection.edges, edgeIssues, showLagLabels, readOnly, ctx, templates, edgeRoutes, dragPositions, tweenPositions]);

  // ---- node changes: apply everything locally; select → store; drag stop → one command ----------
  const onNodesChange = useCallback(
    (changes: NodeChange<EquipmentFlowNode>[]) => {
      let selectionChanged = false;
      const sel = new Set(useStudioStore.getState().selection.nodes);
      const moving: Record<string, XY> = {};
      let dims: Record<string, { width: number; height: number }> | null = null;
      for (const change of changes) {
        if (change.type === "select") {
          selectionChanged = true;
          if (change.selected) sel.add(change.id);
          else sel.delete(change.id);
        } else if (change.type === "position" && change.position && change.dragging) {
          moving[change.id] = change.position;
        } else if (change.type === "dimensions" && change.dimensions) {
          dims ??= {};
          dims[change.id] = { width: change.dimensions.width, height: change.dimensions.height };
        }
      }
      if (dims) {
        const d = dims;
        setMeasured((prev) => {
          let changed = false;
          const out = { ...prev };
          for (const [id, v] of Object.entries(d)) {
            const p = prev[id];
            if (!p || p.width !== v.width || p.height !== v.height) {
              out[id] = v;
              changed = true;
            }
          }
          return changed ? out : prev;
        });
      }
      if (Object.keys(moving).length && !readOnly) {
        const ids = Object.keys(moving);
        const { templates: tpl, history } = useStudioStore.getState();
        const assetsById = new Map(history.present.assets.map((a) => [a.asset_id, a]));
        const rectOf = (id: string, p: XY): Rect => {
          const layout = cachedLayout(tpl.get(assetsById.get(id)?.component_type_id ?? "")?.ports ?? []);
          return { id, x: p.x, y: p.y, width: layout.width, height: layout.height };
        };
        // The whole dragged group = moving changes + already-dragging nodes not in this batch.
        const group = { ...dragRef.current, ...moving };
        const box = boundsOf(Object.entries(group).map(([id, p]) => rectOf(id, p)));
        let dx = 0;
        let dy = 0;
        let nextGuides: Guide[] = [];
        if (box && !altHeld) {
          const others: Rect[] = [];
          for (const a of history.present.assets) if (!(a.asset_id in group)) others.push(rectOf(a.asset_id, a.position_2d));
          const zoom = flow.getZoom();
          const result = computeAlignment(box, nearbyRects(box, others, GUIDE_RADIUS), GUIDE_THRESHOLD_PX / zoom);
          dx = result.dx;
          dy = result.dy;
          nextGuides = result.guides;
        }
        const adjusted: Record<string, XY> = {};
        for (const id of ids) adjusted[id] = { x: moving[id]!.x + dx, y: moving[id]!.y + dy };
        dragRef.current = { ...dragRef.current, ...adjusted };
        setDragPositions(dragRef.current);
        setGuides(nextGuides);
      }
      if (selectionChanged) useStudioStore.getState().setSelection({ nodes: [...sel] });
    },
    [altHeld, flow, readOnly],
  );

  const onNodeDragStop = useCallback(() => {
    const positions = dragRef.current;
    dragRef.current = {};
    setGuides([]);
    setDragPositions({});
    if (Object.keys(positions).length) useStudioStore.getState().moveNodes(positions);
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange<MediumFlowEdge>[]) => {
    const sel = new Set(useStudioStore.getState().selection.edges);
    let changed = false;
    for (const change of changes) {
      if (change.type === "select") {
        changed = true;
        if (change.selected) sel.add(change.id);
        else sel.delete(change.id);
      }
    }
    if (changed) useStudioStore.getState().setSelection({ edges: [...sel] });
  }, []);

  // ---- connections -------------------------------------------------------------------------------
  const onConnect = useCallback((c: Connection) => {
    connectHandled.current = true;
    const outcome = decideConnect(engineRef.current, c);
    const store = useStudioStore.getState();
    if (outcome.kind === "rejected") store.showNotice("error", outcome.message, outcome.fix);
    if (outcome.kind !== "created") return;
    const { evaluation } = outcome;
    store.connect(evaluation.proposal, evaluation.medium ?? "unknown");
    const warn = primaryReason(evaluation);
    if (evaluation.verdict === "warn" && warn) store.showNotice("warn", `Connected with a warning: ${warn.message}`, warn.fix);
  }, []);

  const onConnectStart = useCallback(() => {
    connectHandled.current = false;
  }, []);

  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
    if (connectHandled.current || reconnectingRef.current) {
      connectHandled.current = false;
      return;
    }
    const store = useStudioStore.getState();
    const fromNode = state.fromNode?.id;
    const fromHandle = state.fromHandle?.id;
    if (!fromNode || !fromHandle) return;
    if (state.toHandle && state.toNode) {
      // Released on a handle the rules rejected: say why.
      const outcome = decideConnect(engineRef.current, {
        source: fromNode,
        sourceHandle: fromHandle,
        target: state.toNode.id,
        targetHandle: state.toHandle.id ?? null,
      });
      if (outcome.kind === "rejected") store.showNotice("error", outcome.message, outcome.fix);
      return;
    }
    const point = clientPoint(event);
    const el = point ? document.elementFromPoint(point.x, point.y) : null;
    const nodeEl = el?.closest<HTMLElement>(".react-flow__node");
    const targetId = nodeEl?.dataset.id;
    if (!targetId) return;
    const outcome = decideDropOnNode(engineRef.current, fromNode, fromHandle, targetId);
    if (outcome.kind === "rejected") store.showNotice("error", outcome.message, outcome.fix);
    if (outcome.kind !== "created") return;
    store.connect(outcome.evaluation.proposal, outcome.evaluation.medium ?? "unknown");
    const warn = primaryReason(outcome.evaluation);
    store.showNotice(
      outcome.evaluation.verdict === "warn" ? "warn" : "info",
      `Connected to ${outcome.evaluation.proposal.toAssetId === targetId ? outcome.evaluation.proposal.toPortId : outcome.evaluation.proposal.fromPortId} on ${targetId}${warn ? ` — ${warn.message}` : ""}`,
      warn?.fix,
    );
  }, []);

  const onReconnectStart = useCallback((_: unknown, edge: Edge) => {
    reconnectingRef.current = edge.id;
    if (engineRef.current) engineRef.current.reconnectingEdgeId = edge.id;
  }, []);

  const onReconnect: OnReconnect<MediumFlowEdge> = useCallback((oldEdge, c) => {
    const snap = engineRef.current;
    const outcome = decideConnect(snap ? { ...snap, reconnectingEdgeId: oldEdge.id } : null, c);
    const store = useStudioStore.getState();
    if (outcome.kind === "rejected") store.showNotice("error", outcome.message, outcome.fix);
    if (outcome.kind !== "created") return;
    store.reconnectEdge(oldEdge.id, outcome.evaluation.proposal, outcome.evaluation.medium ?? "unknown");
    store.showNotice("info", `${oldEdge.id} reconnected — it is a draft again until approved in Approvals.`);
  }, []);

  const onReconnectEnd = useCallback(() => {
    reconnectingRef.current = null;
    if (engineRef.current) engineRef.current.reconnectingEdgeId = null;
    connectHandled.current = false;
  }, []);

  // ---- palette drag & drop ------------------------------------------------------------------------
  const dropPosition = useCallback(
    (e: DragEvent, templateId: string | null) => {
      const raw0 = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // A zero-size or not-yet-fitted viewport can yield NaN; never let that reach the document.
      const p = { x: Number.isFinite(raw0.x) ? raw0.x : 0, y: Number.isFinite(raw0.y) ? raw0.y : 0 };
      const template = templateId ? useStudioStore.getState().templates.get(templateId) : undefined;
      const layout = cachedLayout(template?.ports ?? []);
      // Cursor holds the node by its header centre.
      const raw = { x: p.x - layout.width / 2, y: p.y - 28 };
      const snapped = useStudioStore.getState().snapEnabled && !e.altKey ? snapPoint(raw) : { x: Math.round(raw.x), y: Math.round(raw.y) };
      return { ...snapped, width: layout.width, height: layout.height };
    },
    [flow],
  );

  const onDragOver = useCallback(
    (e: DragEvent) => {
      if (readOnly || !Array.from(e.dataTransfer.types).includes(PALETTE_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      const templateId = useStudioStore.getState().draggingTemplateId;
      const pos = dropPosition(e, templateId);
      setGhost((g) => (g && g.x === pos.x && g.y === pos.y && g.templateId === templateId ? g : { templateId, ...pos }));
    },
    [dropPosition, readOnly],
  );

  const onDragLeave = useCallback((e: DragEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as HTMLElement).contains(next)) return;
    setGhost(null);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      const templateId = e.dataTransfer.getData(PALETTE_MIME);
      setGhost(null);
      useStudioStore.getState().setDraggingTemplate(null);
      if (readOnly || !templateId) return;
      e.preventDefault();
      const pos = dropPosition(e, templateId);
      useStudioStore.getState().addComponent(templateId, { x: pos.x, y: pos.y });
    },
    [dropPosition, readOnly],
  );

  // ---- keyboard ----------------------------------------------------------------------------------
  useStudioKeyboard({ readOnly, actions, onOpenHelp });

  const ghostTemplate = ghost?.templateId ? templates.get(ghost.templateId) : undefined;

  return (
    <EngineRefContext.Provider value={engineRef}>
      <CanvasContextMenu target={menuTarget} readOnly={readOnly} actions={actions} onOpenHelp={onOpenHelp}>
        <div
          className="st-canvas"
          data-connection-mode={readOnly ? "readonly" : "edit"}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          data-testid="studio-canvas"
        >
          <ReactFlow<EquipmentFlowNode, MediumFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onReconnect={onReconnect}
            onReconnectStart={onReconnectStart}
            onReconnectEnd={onReconnectEnd}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={28}
            reconnectRadius={22}
            connectionLineComponent={StudioConnectionLine}
            onNodeDoubleClick={(_, node) => !readOnly && useStudioStore.getState().startRename(node.id)}
            onNodeContextMenu={(_, node) => {
              const s = useStudioStore.getState();
              if (!s.selection.nodes.includes(node.id)) s.setSelection({ nodes: [node.id], edges: [] });
              setMenuTarget({ kind: "node", id: node.id });
            }}
            onEdgeContextMenu={(_, edge) => {
              const s = useStudioStore.getState();
              if (!s.selection.edges.includes(edge.id)) s.setSelection({ nodes: [], edges: [edge.id] });
              setMenuTarget({ kind: "edge", id: edge.id });
            }}
            onSelectionContextMenu={() => setMenuTarget({ kind: "selection" })}
            onPaneContextMenu={(e) => {
              setMenuTarget({ kind: "pane", at: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
            }}
            onMoveEnd={(_, vp) => onViewportChange?.(vp)}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            edgesReconnectable={!readOnly}
            elementsSelectable
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1]}
            panActivationKeyCode="Space"
            selectionKeyCode={null}
            multiSelectionKeyCode={MULTI_SELECT_KEYS}
            deleteKeyCode={null}
            snapToGrid={snapEnabled && !altHeld}
            snapGrid={SNAP_GRID}
            onlyRenderVisibleElements
            minZoom={0.2}
            maxZoom={2.5}
            {...(defaultViewport ? { defaultViewport } : { fitView: true, fitViewOptions: { padding: 0.25, maxZoom: 1.1 } })}
            proOptions={PRO}
            nodeDragThreshold={2}
            autoPanOnNodeDrag
            autoPanOnConnect
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={GRID} size={1.4} color="var(--st-dot)" />
            <MiniMap
              pannable
              zoomable
              className="st-minimap"
              nodeColor={(n) => ((n as EquipmentFlowNode).data?.issue === "deny" ? "var(--status-critical)" : "var(--border-strong)")}
              nodeStrokeWidth={0}
              maskColor="var(--st-minimap-mask)"
              ariaLabel="Mini map"
            />
            <Controls showInteractive={false} className="st-controls" position="bottom-left" />
            <ViewportPortal>
              {guides.map((g, i) =>
                g.orientation === "vertical" ? (
                  <div key={i} className="st-guide st-guide--v" style={{ transform: `translate(${g.pos}px, ${g.from}px)`, height: g.to - g.from }} />
                ) : (
                  <div key={i} className="st-guide st-guide--h" style={{ transform: `translate(${g.from}px, ${g.pos}px)`, width: g.to - g.from }} />
                ),
              )}
              {ghost ? (
                <div
                  className="st-drop-ghost"
                  style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)`, width: ghost.width, height: ghost.height }}
                  aria-hidden
                >
                  <span>{ghostTemplate?.display_name ?? "Component"}</span>
                </div>
              ) : null}
            </ViewportPortal>
          </ReactFlow>
          <PortTooltip />
          {!assembly.assets.length && !ghost ? (
            <div className="st-canvas__empty" role="note">
              <strong>Drag components here from the palette</strong>
              <span>
                or press <kbd className="pl-kbd">Enter</kbd> on a palette item to place it in the centre. Connect ports by dragging
                from one handle to another; the rules show which ports fit.
              </span>
            </div>
          ) : null}
        </div>
      </CanvasContextMenu>
    </EngineRefContext.Provider>
  );
}
