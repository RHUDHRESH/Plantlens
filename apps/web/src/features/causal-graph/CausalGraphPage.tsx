import { LineChart, Radar } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCausalGraph } from "../../api/queries";
import type { CausalGraphView } from "../../api/v2";
import { ENGINEER_ROLES, useCan } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { EquipmentSymbol, symbolForAssetType } from "../../components/symbols";
import { EmptyState, ErrorNotice, Mono, PageHeader, PriorityGlyph, StatusBadge } from "../../components/ui/primitives";
import { PRIORITY_LABEL } from "../alarms/alarmModel";
import { AlarmStateLabel } from "../alarms/AlarmStateLabel";
import { useAlarmRows } from "../alarms/useAlarmRows";
import { assetStatusKind, assetStatusLabel, formatValue, isAbnormal } from "../operational-map/format";
import { MapControls } from "../operational-map/MapControls";
import { usePlantModel } from "../operational-map/plantModel";
import { Facts, SectionLabel, SideSheet } from "../operational-map/SideSheet";
import { usePanZoom } from "../operational-map/usePanZoom";
import { useOperateRuntime } from "../operational-map/useRuntimeSeed";
import { SvgStatusTag } from "../operational-map/SvgStatus";
import { trendsHref } from "../trends/trendModel";
import "../operational-map/ops.css";
import type { GraphLayout, GraphNode, LoopGroup } from "./graphModel";
import { edgeLabel, formatLag, labelAnchor, layoutCausalGraph, loopBounds, loopGroups, pointsToPath, polarityText } from "./graphModel";
import "./causal-graph.css";

export function CausalGraphPage() {
  useOperateRuntime();
  const graph = useCausalGraph();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("asset");
  const showDrafts = params.get("drafts") !== "hide";
  const [layout, setLayout] = useState<GraphLayout | null>(null);
  const [layoutError, setLayoutError] = useState<unknown>(null);
  const view = graph.data;
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Layout only depends on structure, not on live status; re-run when nodes/edges/toggle change.
  const structureKey = view
    ? `${view.graph_id}|${view.bundle_rev}|${view.nodes.map((n) => n.id).join(",")}|${view.edges.map((e) => `${e.id}:${e.approved}`).join(",")}|${showDrafts}`
    : "";
  useEffect(() => {
    if (!view) return;
    let cancelled = false;
    const stage = stageRef.current;
    const viewport = stage ? { width: stage.clientWidth, height: Math.max(240, stage.clientHeight - 90) } : undefined;
    layoutCausalGraph(view, showDrafts, viewport)
      .then((l) => !cancelled && (setLayout(l), setLayoutError(null)))
      .catch((e: unknown) => !cancelled && setLayoutError(e));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const draftCount = view?.edges.filter((e) => !e.approved).length ?? 0;
  const loops = useMemo(() => (view ? loopGroups(view) : []), [view]);
  const rootName = view?.highlight.root_asset_id
    ? (view.nodes.find((n) => n.id === view.highlight.root_asset_id)?.label ?? view.highlight.root_asset_id)
    : null;

  return (
    <div className="pl-page cg-page">
      <PageHeader
        title="Causal graph"
        description="Engineer-approved cause → effect structure the runtime traces. Read-only; changes go through Approvals."
        meta={
          view ? (
            <>
              <span className="pl-chip">
                <strong>{view.nodes.length}</strong> nodes
              </span>
              <span className="pl-chip">
                <strong>{view.edges.length - draftCount}</strong> approved edges
              </span>
              {view.bundle_rev ? (
                <span className="pl-chip">
                  Bundle <strong>r{view.bundle_rev}</strong>
                </span>
              ) : null}
            </>
          ) : null
        }
        actions={
          <label className="cg-toggle">
            <input type="checkbox" checked={showDrafts} onChange={(e) => setParam("drafts", e.target.checked ? null : "hide")} />
            Show {draftCount} draft edge{draftCount === 1 ? "" : "s"}
          </label>
        }
      />
      {graph.error ? <ErrorNotice error={graph.error} /> : null}
      {layoutError ? <ErrorNotice error={layoutError} /> : null}

      <div className="cg-stage" ref={stageRef}>
        {rootName ? (
          <div className="cg-banner" role="status">
            <span className="cg-banner__root">ROOT</span>
            Live situation traced from <strong>{rootName}</strong> along {view?.highlight.traversed_edges.length ?? 0} approved
            edge{view?.highlight.traversed_edges.length === 1 ? "" : "s"}.
          </div>
        ) : view ? (
          <div className="cg-banner cg-banner--calm" role="status">
            No active situation — nothing is being traced right now.
          </div>
        ) : null}
        {view && layout ? (
          <GraphCanvas
            view={view}
            layout={layout}
            loops={loops}
            showDrafts={showDrafts}
            selectedId={selectedId}
            onSelect={(id) => setParam("asset", id === selectedId ? null : id)}
          />
        ) : !graph.error ? (
          <EmptyState title="Laying out the causal graph…" />
        ) : null}
        <Legend hasLoops={loops.length > 0} showDrafts={showDrafts} />
      </div>

      {view && selectedId ? (
        <NodeSheet view={view} nodeId={selectedId} loops={loops} onClose={() => setParam("asset", null)} />
      ) : null}
    </div>
  );
}

const CgNode = memo(function CgNode({
  node,
  x,
  y,
  w,
  h,
  isRoot,
  alarmed,
  selected,
  onSelect,
}: {
  node: GraphNode;
  x: number;
  y: number;
  w: number;
  h: number;
  isRoot: boolean;
  alarmed: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const kind = assetStatusKind(node.status);
  const abnormal = isAbnormal(node.status) || alarmed;
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(node.id);
    }
  };
  return (
    <g
      className={`cg-node cg-node--${abnormal ? kind : "normal"}${selected ? " is-selected" : ""}${isRoot ? " is-root" : ""}`}
      transform={`translate(${x},${y})`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${node.label}, ${assetStatusLabel(node.status)}${isRoot ? ", live root" : ""}`}
      data-interactive
      onClick={() => onSelect(node.id)}
      onKeyDown={onKey}
    >
      <rect className="cg-node__card" width={w} height={h} rx={10} />
      <EquipmentSymbol kind={symbolForAssetType(node.asset_type)} size={34} x={10} y={(h - 34) / 2} status={abnormal ? kind : "normal"} />
      <text className="cg-node__label" x={54} y={h / 2 - 3}>
        {node.label}
      </text>
      <text className="cg-node__id" x={54} y={h / 2 + 13}>
        {node.id}
      </text>
      {abnormal && kind !== "normal" ? <SvgStatusTag status={kind} label={assetStatusLabel(node.status)} x={w - 8} y={0} /> : null}
      {isRoot ? (
        <g className="cg-node__rootbadge" aria-hidden>
          <rect x={8} y={-9} width={42} height={18} rx={9} />
          <text x={29} y={3.8} textAnchor="middle">
            ROOT
          </text>
        </g>
      ) : null}
    </g>
  );
});

function GraphCanvas({
  view,
  layout,
  loops,
  showDrafts,
  selectedId,
  onSelect,
}: {
  view: CausalGraphView;
  layout: GraphLayout;
  loops: LoopGroup[];
  showDrafts: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const bounds = useMemo(() => ({ x: 0, y: 0, w: Math.max(layout.width, 400), h: Math.max(layout.height, 240) }), [layout]);
  const pz = usePanZoom(bounds);
  const edgeById = useMemo(() => new Map(view.edges.map((e) => [e.id, e])), [view.edges]);
  const traversed = new Set(view.highlight.traversed_edges);
  const alarmed = new Set(view.highlight.alarmed_assets);
  const root = view.highlight.root_asset_id;
  // Draw traversed edges last so the live path sits on top.
  const edges = [...layout.edges].sort((a, b) => Number(traversed.has(a.id)) - Number(traversed.has(b.id)));

  // Keep the selected node clear of the side sheet (fixed, right edge): pan it into the
  // uncovered part of the canvas once the sheet has mounted and finished its slide-in (240 ms),
  // so its measured left edge is final.
  const { reveal } = pz;
  const selectedPos = selectedId ? layout.nodes[selectedId] : undefined;
  useEffect(() => {
    if (!selectedPos) return;
    const t = window.setTimeout(() => {
      // Use the resting position (layout box), not the possibly still-translating client rect.
      const sheet = document.querySelector<HTMLElement>(".ops-sheet");
      const left = sheet
        ? window.innerWidth - sheet.offsetWidth - (parseFloat(getComputedStyle(sheet).right) || 0)
        : undefined;
      reveal(
        { x: selectedPos.x, y: selectedPos.y, w: selectedPos.width, h: selectedPos.height },
        left !== undefined && left > 0 ? { right: left } : {},
      );
    }, 260);
    return () => window.clearTimeout(t);
  }, [selectedPos, reveal]);

  return (
    <div className="cg-canvas">
      <svg
        ref={pz.svgRef}
        className="cg-svg"
        viewBox={pz.viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        tabIndex={0}
        aria-label={`Causal graph with ${view.nodes.length} assets. Use + and − to zoom, arrow keys to pan, Tab to move between assets.`}
        {...pz.handlers}
      >
        <defs>
          <marker id="cg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 Z" className="cg-arrow" />
          </marker>
          <marker id="cg-arrow-live" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 Z" className="cg-arrow cg-arrow--live" />
          </marker>
          <marker id="cg-arrow-draft" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,1 L9,5 L0,9 Z" className="cg-arrow cg-arrow--draft" />
          </marker>
        </defs>
        <g className="cg-loops">
          {loops.map((l) => {
            const b = loopBounds(layout, l.members);
            if (!b) return null;
            return (
              <g key={l.id} className="cg-loop">
                <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={16} />
                <text x={b.x + 12} y={b.y + 15}>
                  {`${l.id} · ${l.polarity === "unknown" ? "polarity unknown" : `${l.polarity} (${l.polarity === "reinforcing" ? "+" : "−"})`}${l.lag ? ` · ${formatLag(l.lag)} per turn` : ""}`}
                </text>
              </g>
            );
          })}
        </g>
        <g className="cg-edges">
          {edges.map((re) => {
            const e = edgeById.get(re.id);
            if (!e || re.points.length < 2) return null;
            const live = traversed.has(e.id);
            const text = edgeLabel(e);
            const anchor = labelAnchor(re.points);
            const cls = `cg-edge${e.approved ? "" : " is-draft"}${live ? " is-live" : ""}${e.loop_ok ? " is-loop" : ""}`;
            return (
              <g key={re.id} className={cls}>
                <path
                  d={pointsToPath(re.points)}
                  markerEnd={`url(#${live ? "cg-arrow-live" : e.approved ? "cg-arrow" : "cg-arrow-draft"})`}
                >
                  <title>{`${e.id}: ${e.from} → ${e.to}${e.approved ? "" : " (draft, not used by runtime)"} · ${edgeLabel(e) || "no lag"} · ${e.edge_type ?? ""}`}</title>
                </path>
                {anchor && (text || !e.approved) ? (
                  <text
                    className="cg-edge__label"
                    x={anchor.horizontal ? anchor.x : anchor.x + 6}
                    y={anchor.horizontal ? anchor.y - 6 : anchor.y + 4}
                    textAnchor={anchor.horizontal ? "middle" : "start"}
                  >
                    {[text, e.approved ? "" : "draft"].filter(Boolean).join(" · ")}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
        <g className="cg-nodes">
          {view.nodes.map((n) => {
            const p = layout.nodes[n.id];
            if (!p) return null;
            return (
              <CgNode
                key={n.id}
                node={n}
                x={p.x}
                y={p.y}
                w={p.width}
                h={p.height}
                isRoot={n.id === root}
                alarmed={alarmed.has(n.id)}
                selected={selectedId === n.id}
                onSelect={onSelect}
              />
            );
          })}
        </g>
      </svg>
      <div className="cg-controls">
        <MapControls onZoomIn={pz.zoomIn} onZoomOut={pz.zoomOut} onFit={pz.fit} />
      </div>
      {!showDrafts ? <div className="cg-hint ops-subtle">Draft edges hidden</div> : null}
    </div>
  );
}

function Legend({ hasLoops, showDrafts }: { hasLoops: boolean; showDrafts: boolean }) {
  return (
    <div className="cg-legend" aria-label="Legend">
      <span className="cg-legend__item">
        <svg width="28" height="10" aria-hidden>
          <line x1="1" x2="27" y1="5" y2="5" className="cg-legend__approved" />
        </svg>
        Approved edge
      </span>
      {showDrafts ? (
        <span className="cg-legend__item">
          <svg width="28" height="10" aria-hidden>
            <line x1="1" x2="27" y1="5" y2="5" className="cg-legend__draft" />
          </svg>
          Draft (not used by runtime)
        </span>
      ) : null}
      <span className="cg-legend__item">
        <svg width="28" height="10" aria-hidden>
          <line x1="1" x2="27" y1="5" y2="5" className="cg-legend__live" />
        </svg>
        Live traced path
      </span>
      {hasLoops ? (
        <span className="cg-legend__item">
          <svg width="18" height="12" aria-hidden>
            <rect x="1" y="1" width="16" height="10" rx="3" className="cg-legend__loop" />
          </svg>
          Feedback loop
        </span>
      ) : null}
      <span className="cg-legend__item">± polarity · lag window</span>
    </div>
  );
}

function NodeSheet({ view, nodeId, loops, onClose }: { view: CausalGraphView; nodeId: string; loops: LoopGroup[]; onClose: () => void }) {
  const node = view.nodes.find((n) => n.id === nodeId);
  const tags = useRuntimeStore((s) => s.tags);
  const { model } = usePlantModel();
  const { rows } = useAlarmRows();
  const isEngineer = useCan(ENGINEER_ROLES);
  if (!node) return null;
  const kind = assetStatusKind(node.status);
  const alarms = rows.filter((r) => r.assetId === node.id);
  const incoming = view.edges.filter((e) => e.to === node.id);
  const outgoing = view.edges.filter((e) => e.from === node.id);
  const loop = loops.find((l) => l.members.includes(node.id));
  const nameOf = (id: string) => view.nodes.find((n) => n.id === id)?.label ?? id;
  const edgeRow = (e: CausalGraphView["edges"][number], other: string, dir: "from" | "to") => (
    <li key={e.id} className={e.approved ? undefined : "is-draft"}>
      <span className="cg-rel__dir">{dir === "from" ? "←" : "→"}</span>
      <span className="cg-rel__name">{nameOf(other)}</span>
      <Mono className="cg-rel__meta">
        {polarityText(e.polarity)} {formatLag(e.lag_ms)}
      </Mono>
      {!e.approved ? <span className="cg-rel__draft">draft</span> : null}
    </li>
  );

  return (
    <SideSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="ops-sheet-title">
          <EquipmentSymbol kind={symbolForAssetType(node.asset_type)} size={28} status={kind} />
          {node.label}
        </span>
      }
      subtitle={
        <>
          <Mono>{node.id}</Mono>
          {node.asset_type ? ` · ${node.asset_type}` : ""}
          {view.highlight.root_asset_id === node.id ? " · live root" : ""}
        </>
      }
      badge={<StatusBadge status={kind} label={assetStatusLabel(node.status)} />}
      footer={
        <>
          {node.evidence_tags.length ? (
            <Link className="pl-btn pl-btn--secondary pl-btn--md" to={trendsHref(node.evidence_tags)}>
              <LineChart width={15} height={15} aria-hidden /> Trend evidence
            </Link>
          ) : null}
          {isEngineer ? (
            <Link className="pl-btn pl-btn--ghost pl-btn--md" to={`/eng/coverage?asset=${encodeURIComponent(node.id)}`}>
              <Radar width={15} height={15} aria-hidden /> Pattern coverage
            </Link>
          ) : null}
        </>
      }
    >
      <section>
        <SectionLabel aside="what the engine reads">Evidence tags</SectionLabel>
        {node.evidence_tags.length ? (
          <ul className="cg-evidence">
            {node.evidence_tags.map((t) => {
              const live = tags[t];
              const unit = model.tagById[t]?.unit ?? live?.unit ?? null;
              return (
                <li key={t}>
                  <Mono className="cg-evidence__id">{t}</Mono>
                  <Mono className="cg-evidence__v">{live ? formatValue(live.value, unit) : "—"}</Mono>
                  <span className={`cg-evidence__q${live && live.quality !== "GOOD" ? " is-bad" : ""}`}>{live?.quality ?? "no data"}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="ops-empty-inline">No evidence tags are authored for this node, so it can only be an unobserved root.</p>
        )}
      </section>
      <section>
        <SectionLabel aside={alarms.length ? `${alarms.length} active` : undefined}>Alarms</SectionLabel>
        {alarms.length ? (
          <ul className="ops-sheet-alarms">
            {alarms.map((a) => (
              <li key={a.id}>
                <Link to={`/ops/alarms?alarm=${encodeURIComponent(a.id)}`} className="ops-sheet-alarm">
                  <PriorityGlyph status={a.status} title={PRIORITY_LABEL[a.priority]} />
                  <span className="ops-sheet-alarm__msg">{a.message}</span>
                  <AlarmStateLabel state={a.state} />
                  <span />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ops-empty-inline">No active alarms on this asset.</p>
        )}
      </section>
      <section>
        <SectionLabel>Relations</SectionLabel>
        {incoming.length || outgoing.length ? (
          <ul className="cg-rel">
            {incoming.map((e) => edgeRow(e, e.from, "from"))}
            {outgoing.map((e) => edgeRow(e, e.to, "to"))}
          </ul>
        ) : (
          <p className="ops-empty-inline">No edges.</p>
        )}
      </section>
      {loop ? (
        <section>
          <SectionLabel>Feedback loop</SectionLabel>
          <Facts
            items={[
              { label: "Loop", value: <Mono>{loop.id}</Mono> },
              { label: "Polarity", value: loop.polarity },
              { label: "Lag per turn", value: formatLag(loop.lag) || "—" },
              { label: "Members", value: loop.members.map(nameOf).join(", ") },
            ]}
          />
        </section>
      ) : null}
    </SideSheet>
  );
}
