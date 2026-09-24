/**
 * Copy/paste/duplicate with id remapping. Only connections whose both ends are copied travel with
 * the selection; pasted connections are always drafts (approved: false) with fresh ids.
 */
import type { AssetInstance, PlantAssembly, PlantConnection } from "../../../app/schemas/plantAssembly";
import { nextAssetId, nextConnectionId, type XY } from "./assemblyOps";

export interface ClipboardPayload {
  kind: "plantlens.studio.clipboard";
  version: 1;
  assets: AssetInstance[];
  connections: PlantConnection[];
}

export const PASTE_OFFSET = 32;

export function copySelection(assembly: PlantAssembly, assetIds: Iterable<string>): ClipboardPayload | null {
  const ids = new Set(assetIds);
  const assets = assembly.assets.filter((a) => ids.has(a.asset_id));
  if (!assets.length) return null;
  const connections = assembly.connections.filter((c) => ids.has(c.from_asset_id) && ids.has(c.to_asset_id));
  return { kind: "plantlens.studio.clipboard", version: 1, assets: structuredClone(assets), connections: structuredClone(connections) };
}

export interface PasteResult {
  assembly: PlantAssembly;
  assetIds: string[];
  connectionIds: string[];
  idMap: Record<string, string>;
}

/**
 * Paste at `offset` from the copied positions, or with the copied bounding box's top-left at
 * `anchor` when given (paste at cursor / viewport centre).
 */
export function pasteClipboard(
  assembly: PlantAssembly,
  payload: ClipboardPayload,
  placement: { offset: XY } | { anchor: XY },
): PasteResult {
  const taken = new Set(assembly.assets.map((a) => a.asset_id));
  const idMap: Record<string, string> = {};
  let shift: XY;
  if ("anchor" in placement) {
    const minX = Math.min(...payload.assets.map((a) => a.position_2d.x));
    const minY = Math.min(...payload.assets.map((a) => a.position_2d.y));
    shift = { x: placement.anchor.x - minX, y: placement.anchor.y - minY };
  } else {
    shift = placement.offset;
  }
  const assets = payload.assets.map((a) => {
    const id = nextAssetId(a.component_type_id, taken);
    taken.add(id);
    idMap[a.asset_id] = id;
    return {
      ...structuredClone(a),
      asset_id: id,
      position_2d: { x: Math.round(a.position_2d.x + shift.x), y: Math.round(a.position_2d.y + shift.y) },
    };
  });
  const all: Pick<PlantConnection, "connection_id">[] = [...assembly.connections];
  const connections = payload.connections.flatMap((c) => {
    const from = idMap[c.from_asset_id];
    const to = idMap[c.to_asset_id];
    if (!from || !to) return [];
    const connection: PlantConnection = {
      ...structuredClone(c),
      connection_id: nextConnectionId(all),
      from_asset_id: from,
      to_asset_id: to,
      approved: false,
    };
    all.push(connection);
    return [connection];
  });
  return {
    assembly: { ...assembly, assets: [...assembly.assets, ...assets], connections: [...assembly.connections, ...connections] },
    assetIds: assets.map((a) => a.asset_id),
    connectionIds: connections.map((c) => c.connection_id),
    idMap,
  };
}

export function isClipboardPayload(value: unknown): value is ClipboardPayload {
  return (
    !!value &&
    typeof value === "object" &&
    (value as ClipboardPayload).kind === "plantlens.studio.clipboard" &&
    Array.isArray((value as ClipboardPayload).assets) &&
    Array.isArray((value as ClipboardPayload).connections)
  );
}
