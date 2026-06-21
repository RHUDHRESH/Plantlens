import type { CalmCard } from "../app/schemas/calmCard";
import type { Situation } from "../app/schemas/situation";
import type { TagFrame } from "../app/schemas/tagFrame";
import type { AssetStatus, MapEdge, MapNode } from "../features/maps2d/mapTypes";
import type { Map3DEdge, Map3DNode } from "../features/ops3d/map3dTypes";

export interface ApiErrorBody {
  code?: string;
  message: string;
  fix?: string;
  errors?: Array<{ code?: string; message: string; fix?: string; path?: string }>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ActiveAlarm {
  alarm_id: string;
  asset_id: string;
  tag_id: string;
  severity: "info" | "warning" | "critical";
  message: string;
  raised_at: string;
  value?: number | boolean | string | null;
  acked: boolean;
  priority?: number;
}

export interface RuntimeSnapshot {
  tags: Record<string, TagFrame>;
  active_alarms: ActiveAlarm[];
  active_situations: Situation[];
  latest_calm_card: CalmCard | null;
  asset_status: Record<string, AssetStatus>;
}

export interface HmiViewModel {
  view_id: string;
  version: string;
  map_2d: { nodes: MapNode[]; edges: MapEdge[] };
  map_3d: { nodes: Map3DNode[]; edges: Map3DEdge[] };
  layout?: { default_view?: "2d" | "3d" };
}

export interface CompiledBundle {
  plant_id: string;
  content_hash: string;
  version: string;
  hmi_view_model: HmiViewModel;
}

export type WsConnectionState = "connecting" | "live" | "stale" | "disconnected";

export interface WsRuntimeSnapshotMessage {
  type: "runtime.snapshot";
  ts: string;
  state: RuntimeSnapshot;
}

export interface WsTagFrameMessage {
  type: "tag.frame";
  frame: TagFrame;
}

export type WsMessage = WsRuntimeSnapshotMessage | WsTagFrameMessage | { type: string };

export type {
  PlantHMIState,
  HMIOverallStatus,
  HMIAssetStatus,
  HMISignalStatus,
  HMISeverity,
  SafetyLevel,
} from "../app/schemas/plantHmi";