/** Typed fetcher + TanStack hook for GET /api/gateways (apps/api/app/routers/gateways.py). */
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../api/client";
import { useSession } from "../../app/session";

export type GatewayStatus = "online" | "stale" | "offline" | "unknown";

export interface GatewayLink {
  name?: string | null;
  state: string;
  device: string | null;
  selector: string | null;
  vid: string | null;
  pid: string | null;
  serial_number: string | null;
  description: string | null;
  adapter?: string | null;
  baudrate?: number | null;
  reconnect_count: number;
  last_error: string | null;
}

export interface GatewayCounters {
  frames_published: number;
  frames_per_s: number;
  stale_tags: number;
  modbus_requests?: number | null;
  modbus_timeouts?: number | null;
  modbus_crc_errors?: number | null;
  line_accepted?: number | null;
  line_rejected?: number | null;
  line_checksum_failures?: number | null;
}

export interface GatewayUplink {
  queue_depth: number;
  dropped: number;
  quarantined: number;
  last_status: number | null;
  last_error?: string | null;
}

export interface GatewayHeartbeat {
  gateway_id: string;
  hostname: string;
  os: string;
  version: string;
  mode: string;
  links: GatewayLink[];
  counters: GatewayCounters;
  uplink: GatewayUplink;
  started_at: string | null;
  health_port: number | null;
  ips: string[];
}

export interface GatewayTag {
  tag_id: string;
  asset_id: string;
  value: unknown;
  unit: string;
  quality: string;
  source: string;
  received_at: string | null;
}

export interface GatewayEntry {
  gateway_id: string;
  status: GatewayStatus;
  heartbeat_age_s: number | null;
  received_at: string | null;
  first_seen_at: string | null;
  remote_addr: string | null;
  heartbeat: GatewayHeartbeat | null;
  last_frame_at: string | null;
  tag_count: number;
  assets: string[];
  tags: GatewayTag[];
}

export interface GatewaysResponse {
  checked_at: string;
  online_within_s: number;
  stale_within_s: number;
  gateways: GatewayEntry[];
}

export const gatewaysKey = ["gateways"] as const;
export const GATEWAYS_POLL_MS = 3_000;

export function listGateways(signal?: AbortSignal): Promise<GatewaysResponse> {
  return apiFetch<GatewaysResponse>("/api/gateways", signal ? { signal } : {});
}

export function useGateways() {
  const ready = useSession((s) => s.status === "ready");
  return useQuery({
    queryKey: gatewaysKey,
    queryFn: ({ signal }) => listGateways(signal),
    enabled: ready,
    refetchInterval: GATEWAYS_POLL_MS,
    refetchIntervalInBackground: false,
  });
}
