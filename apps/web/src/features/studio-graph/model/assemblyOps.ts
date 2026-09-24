/**
 * Pure, immutable operations on the PlantAssembly document (the form-backed source of truth, R4).
 * Every Studio command is one of these; the store wraps them in the undo history.
 */
import type { AssetInstance, PlantAssembly, PlantConnection } from "../../../app/schemas/plantAssembly";
import { LOOP_OK_METADATA_KEY } from "../../connection-rules/engine";
import type { Proposal } from "../../connection-rules/types";
import type { ComponentTemplate } from "../componentLibraryTypes";

export type XY = { x: number; y: number };

export const DEFAULT_PLANT_ID = "demo_microgrid_001";

export function emptyAssembly(plantId: string = DEFAULT_PLANT_ID): PlantAssembly {
  return {
    assembly_id: `${plantId}_studio`,
    plant_id: plantId,
    version: "0.1.0",
    assets: [],
    connections: [],
    global_tags: [],
    metadata: {},
  };
}

export function nextAssetId(componentTypeId: string, taken: Iterable<string>): string {
  const prefix = `${componentTypeId}_`;
  let max = 0;
  for (const id of taken) {
    if (!id.startsWith(prefix)) continue;
    const n = Number.parseInt(id.slice(prefix.length), 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return `${componentTypeId}_${max + 1}`;
}

/** Next free `C###` id; based on the highest existing number so deletions never cause reuse. */
export function nextConnectionId(existing: readonly Pick<PlantConnection, "connection_id">[]): string {
  let max = 0;
  for (const { connection_id } of existing) {
    const match = /^C(\d+)$/.exec(connection_id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `C${String(max + 1).padStart(3, "0")}`;
}

export function inferConnectionKind(medium: string): PlantConnection["connection_kind"] {
  switch (medium) {
    case "dc_power":
    case "ac_power":
      return "power";
    case "analog_signal":
    case "digital_signal":
      return "signal";
    case "mechanical_rotation":
      return "mechanical";
    case "airflow":
    case "pneumatic_air":
      return "airflow";
    case "fluid_flow":
      return "fluid";
    case "mounting":
      return "mounting";
    default:
      return "data";
  }
}

export function buildConnectionFromPorts(
  fromAssetId: string,
  fromPortId: string,
  toAssetId: string,
  toPortId: string,
  medium: string,
  existing: readonly Pick<PlantConnection, "connection_id">[],
): PlantConnection {
  return {
    connection_id: nextConnectionId(existing),
    from_asset_id: fromAssetId,
    from_port_id: fromPortId,
    to_asset_id: toAssetId,
    to_port_id: toPortId,
    connection_kind: inferConnectionKind(medium),
    // New relations are drafts: only an engineer's explicit approval admits them to the runtime DAG (R2/R5).
    approved: false,
    lag_min_ms: 0,
    lag_max_ms: 200,
    notes: "",
  };
}

const finite = (v: number) => (Number.isFinite(v) ? Math.round(v) : 0);

export function createAsset(template: ComponentTemplate, assetId: string, position: XY): AssetInstance {
  return {
    asset_id: assetId,
    component_type_id: template.component_type_id,
    display_name: template.display_name,
    position_2d: { x: finite(position.x), y: finite(position.y) },
    configured_ports: template.ports.map((p) => p.port_id),
    configured_signals: template.signal_templates.map((s) => s.signal_template_id),
    overrides: {},
    enabled_fault_modes: template.fault_modes.map((f) => f.fault_mode_id),
  };
}

export function addAsset(assembly: PlantAssembly, template: ComponentTemplate, position: XY): { assembly: PlantAssembly; assetId: string } {
  const assetId = nextAssetId(template.component_type_id, assembly.assets.map((a) => a.asset_id));
  return { assembly: { ...assembly, assets: [...assembly.assets, createAsset(template, assetId, position)] }, assetId };
}

/** Returns the same object when nothing moved, so no-op drags never create undo entries. */
export function moveAssets(assembly: PlantAssembly, positions: Readonly<Record<string, XY>>): PlantAssembly {
  let changed = false;
  const assets = assembly.assets.map((asset) => {
    const p = positions[asset.asset_id];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return asset;
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    if (asset.position_2d.x === x && asset.position_2d.y === y) return asset;
    changed = true;
    return { ...asset, position_2d: { x, y } };
  });
  return changed ? { ...assembly, assets } : assembly;
}

function loopOkIds(assembly: PlantAssembly): string[] {
  const v = assembly.metadata?.[LOOP_OK_METADATA_KEY];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function withLoopOk(assembly: PlantAssembly, ids: string[]): PlantAssembly {
  const metadata = { ...(assembly.metadata ?? {}) };
  if (ids.length) metadata[LOOP_OK_METADATA_KEY] = ids;
  else delete metadata[LOOP_OK_METADATA_KEY];
  return { ...assembly, metadata };
}

/** Deleting a node deletes its connections too. */
export function removeElements(assembly: PlantAssembly, assetIds: Iterable<string>, connectionIds: Iterable<string>): PlantAssembly {
  const nodes = new Set(assetIds);
  const edges = new Set(connectionIds);
  const assets = assembly.assets.filter((a) => !nodes.has(a.asset_id));
  const connections = assembly.connections.filter(
    (c) => !edges.has(c.connection_id) && !nodes.has(c.from_asset_id) && !nodes.has(c.to_asset_id),
  );
  if (assets.length === assembly.assets.length && connections.length === assembly.connections.length) return assembly;
  const kept = new Set(connections.map((c) => c.connection_id));
  const loops = loopOkIds(assembly);
  const next = { ...assembly, assets, connections };
  return loops.length ? withLoopOk(next, loops.filter((id) => kept.has(id))) : next;
}

export function addConnection(assembly: PlantAssembly, connection: PlantConnection): PlantAssembly {
  if (assembly.connections.some((c) => c.connection_id === connection.connection_id)) return assembly;
  return { ...assembly, connections: [...assembly.connections, { ...connection, approved: false }] };
}

type ConnectionPatch = Partial<Pick<PlantConnection, "lag_min_ms" | "lag_max_ms" | "notes">>;

/** Editable fields only — approval is never set from the Studio (R5: approval happens in Approvals). */
export function updateConnection(assembly: PlantAssembly, id: string, patch: ConnectionPatch): PlantAssembly {
  let changed = false;
  const connections = assembly.connections.map((c) => {
    if (c.connection_id !== id) return c;
    const next = { ...c, ...patch };
    if (next.lag_max_ms < next.lag_min_ms) next.lag_max_ms = next.lag_min_ms;
    changed = (Object.keys(patch) as (keyof ConnectionPatch)[]).some((k) => c[k] !== next[k]) || next.lag_max_ms !== c.lag_max_ms;
    return changed ? next : c;
  });
  return changed ? { ...assembly, connections } : assembly;
}

/** Moving an endpoint changes the relation, so the connection returns to draft. */
export function reconnect(assembly: PlantAssembly, id: string, proposal: Proposal, medium: string): PlantAssembly {
  return {
    ...assembly,
    connections: assembly.connections.map((c) =>
      c.connection_id === id
        ? {
            ...c,
            from_asset_id: proposal.fromAssetId,
            from_port_id: proposal.fromPortId,
            to_asset_id: proposal.toAssetId,
            to_port_id: proposal.toPortId,
            connection_kind: inferConnectionKind(medium),
            approved: false,
          }
        : c,
    ),
  };
}

export function setLoopOk(assembly: PlantAssembly, connectionId: string, loopOk: boolean): PlantAssembly {
  const ids = loopOkIds(assembly);
  const has = ids.includes(connectionId);
  if (has === loopOk) return assembly;
  return withLoopOk(assembly, loopOk ? [...ids, connectionId] : ids.filter((i) => i !== connectionId));
}

export function assetNotes(asset: AssetInstance): string {
  const notes = asset.overrides?.notes;
  return typeof notes === "string" ? notes : "";
}

export function updateAsset(assembly: PlantAssembly, id: string, patch: { display_name?: string; notes?: string }): PlantAssembly {
  let changed = false;
  const assets = assembly.assets.map((a) => {
    if (a.asset_id !== id) return a;
    let next = a;
    if (patch.display_name !== undefined) {
      const name = patch.display_name.trim();
      if (name && name !== a.display_name) next = { ...next, display_name: name };
    }
    if (patch.notes !== undefined && patch.notes !== assetNotes(a)) {
      const overrides = { ...(next.overrides ?? {}) };
      if (patch.notes) overrides.notes = patch.notes;
      else delete overrides.notes;
      next = { ...next, overrides };
    }
    changed = changed || next !== a;
    return next;
  });
  return changed ? { ...assembly, assets } : assembly;
}

/** Imported/sample assemblies enter the Studio as drafts: approvals are not carried over (R5). */
export function asDraft(assembly: PlantAssembly, plantId: string): PlantAssembly {
  return {
    ...assembly,
    plant_id: plantId,
    connections: assembly.connections.map((c) => ({ ...c, approved: false })),
  };
}
