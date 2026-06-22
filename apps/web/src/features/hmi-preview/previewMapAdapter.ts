import type { MapEdge, MapNode } from "../maps2d/mapTypes";
import type { LocalHmiPreviewModel } from "./previewTypes";

export function previewModelToMapNodes(model: LocalHmiPreviewModel): MapNode[] {
  return model.map2d.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    asset_type: node.asset_type,
    position: node.position,
    status_binding: `preview.${node.id}`,
  }));
}

export function previewModelToMapEdges(model: LocalHmiPreviewModel): MapEdge[] {
  return model.map2d.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    type:
      edge.kind === "causal" ? "causal" : edge.kind === "signal" ? "signal" : ("power_flow" as const),
  }));
}

export function buildPreviewAssetStatus(model: LocalHmiPreviewModel): Record<string, "unknown"> {
  return Object.fromEntries(model.map2d.nodes.map((n) => [n.id, "unknown" as const]));
}