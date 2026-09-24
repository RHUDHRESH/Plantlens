/**
 * Plant model for operator views, read from the compiled bundle (/api/hmi/compiled). Coordinates
 * come from plant.json via the compiler — never hard-coded in components (DESIGN_SYSTEM §2D).
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getCompiledBundle } from "../../api/client";
import type { CompiledBundle } from "../../api/types";
import { useSession } from "../../app/session";

export interface PlantAsset {
  id: string;
  name: string;
  type: string | null;
  criticality: string | null;
  position: { x: number; y: number } | null;
  tags: string[];
  alarmIds: string[];
}

export interface PlantTag {
  id: string;
  assetId: string | null;
  unit: string | null;
  signalType: string | null;
  role: string | null;
}

export interface PlantConnection {
  id: string;
  from: string;
  to: string;
  type: string;
}

export interface PlantModel {
  plantId: string | null;
  assets: PlantAsset[];
  assetById: Record<string, PlantAsset>;
  tagById: Record<string, PlantTag>;
  connections: PlantConnection[];
}

interface RawMapNode {
  id: string;
  label?: string;
  asset_type?: string;
  criticality?: string;
  position?: { x: number; y: number };
  tags?: string[];
  alarms?: string[];
}

type RawBundle = CompiledBundle & {
  asset_index?: Record<string, { display_name?: string; type?: string; criticality?: string; coords_2d?: { x: number; y: number } }>;
  tag_index?: Record<string, { asset_id?: string; unit?: string; signal_type?: string; role?: string }>;
};

export const EMPTY_MODEL: PlantModel = { plantId: null, assets: [], assetById: {}, tagById: {}, connections: [] };

/** Pure: compiled bundle → plant model. Exported for tests. */
export function buildPlantModel(bundle: RawBundle | null | undefined): PlantModel {
  if (!bundle) return EMPTY_MODEL;
  const nodes = (bundle.hmi_view_model?.map_2d?.nodes ?? []) as unknown as RawMapNode[];
  const assetIndex = bundle.asset_index ?? {};
  const tagIndex = bundle.tag_index ?? {};

  const tagById: Record<string, PlantTag> = {};
  for (const [id, t] of Object.entries(tagIndex)) {
    tagById[id] = {
      id,
      assetId: t.asset_id ?? null,
      unit: t.unit ?? null,
      signalType: t.signal_type ?? null,
      role: t.role ?? null,
    };
  }

  const seen = new Set<string>();
  const assets: PlantAsset[] = nodes.map((n) => {
    seen.add(n.id);
    const idx = assetIndex[n.id];
    return {
      id: n.id,
      name: n.label ?? idx?.display_name ?? n.id,
      type: n.asset_type ?? idx?.type ?? null,
      criticality: n.criticality ?? idx?.criticality ?? null,
      position: n.position ?? idx?.coords_2d ?? null,
      tags: n.tags ?? Object.values(tagById).filter((t) => t.assetId === n.id).map((t) => t.id),
      alarmIds: n.alarms ?? [],
    };
  });
  // Assets that exist in the plant but not on the map still need names for alarms and trends.
  for (const [id, idx] of Object.entries(assetIndex)) {
    if (seen.has(id)) continue;
    assets.push({
      id,
      name: idx.display_name ?? id,
      type: idx.type ?? null,
      criticality: idx.criticality ?? null,
      position: null,
      tags: Object.values(tagById).filter((t) => t.assetId === id).map((t) => t.id),
      alarmIds: [],
    });
  }
  const assetById = Object.fromEntries(assets.map((a) => [a.id, a]));
  const connections = (bundle.hmi_view_model?.map_2d?.edges ?? []).map((e) => ({
    id: e.id,
    from: e.from,
    to: e.to,
    type: e.type,
  }));
  return { plantId: bundle.plant_id ?? null, assets, assetById, tagById, connections };
}

export function usePlantModel(): { model: PlantModel; isLoading: boolean; error: unknown } {
  const ready = useSession((s) => s.status === "ready");
  const query = useQuery({
    queryKey: ["compiled-bundle"],
    queryFn: ({ signal }) => getCompiledBundle(signal),
    enabled: ready,
    staleTime: 60_000,
  });
  const model = useMemo(() => buildPlantModel(query.data as RawBundle | undefined), [query.data]);
  return { model, isLoading: query.isLoading, error: query.error };
}

export function assetName(model: PlantModel, assetId: string | null | undefined): string {
  if (!assetId) return "—";
  return model.assetById[assetId]?.name ?? assetId;
}
