import { memo, useMemo } from "react";
import type { KeyboardEvent } from "react";
import type { TagFrame } from "../../app/schemas/tagFrame";
import { EquipmentSymbol, symbolForAssetType } from "../../components/symbols";
import { assetStatusKind, assetStatusLabel, formatValue, isAbnormal } from "../operational-map/format";
import { MapControls } from "../operational-map/MapControls";
import type { PlantModel } from "../operational-map/plantModel";
import { SvgStatusTag } from "../operational-map/SvgStatus";
import { usePanZoom } from "../operational-map/usePanZoom";
import type { AssetStatus } from "../maps2d/mapTypes";
import type { PlacedNode } from "./mapLayout";
import { NODE_H, NODE_W, causalEdgeIds, contentBounds, keyTagFor, placeNodes, routeConnection } from "./mapLayout";

interface NodeProps {
  node: PlacedNode;
  status: AssetStatus;
  keyTag: TagFrame | null;
  unit: string | null;
  causalOrder: number | null;
  isRoot: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}

const MapNodeView = memo(function MapNodeView({ node, status, keyTag, unit, causalOrder, isRoot, selected, onSelect }: NodeProps) {
  const { asset, x, y } = node;
  const kind = assetStatusKind(status);
  const abnormal = isAbnormal(status);
  const quality = keyTag?.quality ?? null;
  const valueText = keyTag ? formatValue(keyTag.value, unit ?? keyTag.unit) : asset.tags.length ? "—" : "";
  const badQuality = quality && quality !== "GOOD";
  const label = `${asset.name}, ${assetStatusLabel(status)}${keyTag ? `, ${keyTag.tag_id} ${valueText}` : ""}${causalOrder ? `, causal step ${causalOrder}` : ""}`;
  const onKey = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(asset.id);
    }
  };
  return (
    <g
      className={`ov-node ov-node--${kind}${selected ? " is-selected" : ""}${causalOrder ? " is-causal" : ""}`}
      transform={`translate(${x},${y})`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      data-interactive
      onClick={() => onSelect(asset.id)}
      onKeyDown={onKey}
    >
      <rect className="ov-node__card" x={-NODE_W / 2} y={-NODE_H / 2} width={NODE_W} height={NODE_H} rx={10} />
      <EquipmentSymbol
        kind={symbolForAssetType(asset.type)}
        size={36}
        x={-18}
        y={-NODE_H / 2 + 7}
        status={abnormal ? kind : "normal"}
        state={keyTag ? "running" : "unknown"}
      />
      <text className="ov-node__label" x={0} y={16} textAnchor="middle">
        {asset.name}
      </text>
      {valueText ? (
        <text className={`ov-node__value${badQuality ? " is-bad" : ""}`} x={0} y={33} textAnchor="middle">
          {badQuality ? `${valueText} · ${quality}` : valueText}
        </text>
      ) : (
        <text className="ov-node__id" x={0} y={33} textAnchor="middle">
          {asset.id}
        </text>
      )}
      {abnormal ? <SvgStatusTag status={kind} label={assetStatusLabel(status)} x={0} y={NODE_H / 2 + 13} anchor="middle" /> : null}
      {causalOrder ? (
        <g className="ov-node__order" aria-hidden>
          <circle cx={-NODE_W / 2 + 4} cy={-NODE_H / 2 + 4} r={10} />
          <text x={-NODE_W / 2 + 4} y={-NODE_H / 2 + 7.8} textAnchor="middle">
            {causalOrder}
          </text>
          {isRoot ? (
            <text className="ov-node__root" x={NODE_W / 2 - 8} y={-NODE_H / 2 + 16} textAnchor="end">
              ROOT
            </text>
          ) : null}
        </g>
      ) : null}
    </g>
  );
});

export function PlantMap({
  model,
  assetStatus,
  tags,
  alarmedTagIds,
  causalPath,
  rootAssetId,
  selectedId,
  onSelect,
}: {
  model: PlantModel;
  assetStatus: Record<string, AssetStatus>;
  tags: Record<string, TagFrame>;
  alarmedTagIds: Set<string>;
  causalPath: string[] | null;
  rootAssetId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const nodes = useMemo(() => placeNodes(model.assets), [model.assets]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.asset.id, n])), [nodes]);
  const bounds = useMemo(() => contentBounds(nodes), [nodes]);
  const pz = usePanZoom(bounds);
  const highlighted = useMemo(() => causalEdgeIds(causalPath, model.connections), [causalPath, model.connections]);
  const orderOf = useMemo(() => new Map((causalPath ?? []).map((id, i) => [id, i + 1])), [causalPath]);

  const pathText = causalPath?.length
    ? causalPath.map((id) => model.assetById[id]?.name ?? id).join(" → ")
    : null;

  return (
    <div className="ov-map">
      <svg
        ref={pz.svgRef}
        className="ov-map__svg"
        viewBox={pz.viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={`Plant single-line map, ${nodes.length} assets${pathText ? `. Causal path: ${pathText}` : ""}. Use + and − to zoom, arrow keys to pan.`}
        tabIndex={0}
        {...pz.handlers}
      >
        <g className="ov-map__edges">
          {model.connections.map((c) => {
            const a = byId.get(c.from);
            const b = byId.get(c.to);
            if (!a || !b) return null;
            return (
              <path
                key={c.id}
                d={routeConnection(a, b)}
                className={`ov-edge ov-edge--${c.type}${highlighted.has(c.id) ? " is-causal" : ""}`}
              />
            );
          })}
        </g>
        <g className="ov-map__nodes">
          {nodes.map((n) => {
            const kt = keyTagFor(n.asset, tags, alarmedTagIds);
            return (
              <MapNodeView
                key={n.asset.id}
                node={n}
                status={assetStatus[n.asset.id] ?? "unknown"}
                keyTag={kt}
                unit={kt ? (model.tagById[kt.tag_id]?.unit ?? null) : null}
                causalOrder={orderOf.get(n.asset.id) ?? null}
                isRoot={n.asset.id === rootAssetId}
                selected={selectedId === n.asset.id}
                onSelect={onSelect}
              />
            );
          })}
        </g>
      </svg>
      {pathText ? (
        <div className="ov-map__caption" aria-hidden>
          <span className="ov-map__caption-key" />
          Causal path <strong>{pathText}</strong>
        </div>
      ) : null}
      <div className="ov-map__controls">
        <MapControls onZoomIn={pz.zoomIn} onZoomOut={pz.zoomOut} onFit={pz.fit} />
      </div>
    </div>
  );
}
