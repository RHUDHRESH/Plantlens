/**
 * Shared types for the 2D (and 3D) map. Mirror the relevant bits of
 * packages/contracts/hmi_view_model.schema.json + situation.schema.json. CHUNK: 5
 */

export type AssetStatus =
  | "normal" | "warning" | "critical" | "sensor_bad" | "offline" | "unknown";

export type MapNode = {
  id: string;                  // equals an asset_id
  label: string;
  asset_type: string;
  position: { x: number; y: number };
  status_binding: string;      // e.g. "asset_status.MTR-301"
};

export type MapEdge = {
  id: string;
  from: string;
  to: string;
  type: "power_flow" | "signal" | "causal";
};

export type ActiveSituation = {
  id: string;
  title: string;
  root_asset_id: string;
  affected_asset_ids: string[];
  causal_path: string[];       // ordered [root, ...effects] → drives the numbered overlay
};

export type RuntimeState = {
  asset_status: Record<string, AssetStatus>;
  activeSituation: ActiveSituation | null;
};
