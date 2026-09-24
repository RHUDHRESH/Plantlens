/**
 * Pure helpers for the Connections page: adapter families, status → badge mapping, ages and the
 * setup commands a new gateway PC needs. No React, no fetch.
 */
import type { StatusKind } from "../../components/ui/primitives";
import type { GatewayEntry, GatewayLink, GatewayStatus } from "./api";

// ---- Adapter family from USB VID:PID (mirrors apps/gateway transport/discovery.py) ------------

const KNOWN_ADAPTERS: Record<string, string> = {
  "1A86:7523": "CH340",
  "1A86:5523": "CH341",
  "1A86:55D4": "CH9102",
  "10C4:EA60": "CP210x",
  "10C4:EA70": "CP2105",
  "0403:6001": "FTDI FT232R",
  "0403:6010": "FTDI FT2232",
  "0403:6014": "FTDI FT232H",
  "0403:6015": "FTDI FT-X",
  "067B:2303": "Prolific PL2303",
  "2341:0043": "Arduino Uno R3",
  "2341:0001": "Arduino Uno",
  "2341:0069": "Arduino Uno R4 Minima",
  "2341:1002": "Arduino Uno R4 WiFi",
  "2341:0042": "Arduino Mega 2560",
  "2341:0058": "Arduino Nano Every",
};

const KNOWN_VENDORS: Record<string, string> = {
  "1A86": "WCH (CH34x)",
  "0403": "FTDI",
  "10C4": "Silicon Labs CP210x",
  "067B": "Prolific",
  "2341": "Arduino",
  "2A03": "Arduino",
  "1B4F": "SparkFun",
  "239A": "Adafruit",
};

function hex4(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.trim().replace(/^0x/i, "").toUpperCase();
  return /^[0-9A-F]{1,4}$/.test(clean) ? clean.padStart(4, "0") : null;
}

/** Human adapter family, e.g. "CH340", "FTDI FT232R", "Arduino Uno R3"; null when unknown. */
export function adapterFamily(vid: string | null | undefined, pid: string | null | undefined): string | null {
  const v = hex4(vid);
  const p = hex4(pid);
  if (!v) return null;
  if (p && KNOWN_ADAPTERS[`${v}:${p}`]) return KNOWN_ADAPTERS[`${v}:${p}`] ?? null;
  return KNOWN_VENDORS[v] ?? null;
}

export function vidPid(link: Pick<GatewayLink, "vid" | "pid">): string | null {
  const v = hex4(link.vid);
  const p = hex4(link.pid);
  return v && p ? `${v}:${p}` : null;
}

/** Prefer the gateway's own adapter name, fall back to the VID:PID table, then the OS description. */
export function linkAdapter(link: GatewayLink): string | null {
  return link.adapter || adapterFamily(link.vid, link.pid) || null;
}

// ---- Status → badge (colour + shape + text) -------------------------------------------------

export const GATEWAY_STATUS: Record<GatewayStatus, { kind: StatusKind; label: string; hint: string }> = {
  online: { kind: "normal", label: "Online", hint: "Heartbeat within the last 15 s" },
  stale: { kind: "medium", label: "Stale", hint: "No heartbeat for 15–60 s" },
  offline: { kind: "offline", label: "Offline", hint: "No heartbeat for over 60 s" },
  unknown: { kind: "low", label: "No heartbeat", hint: "Data arrives but this gateway build sends no heartbeat" },
};

export function linkStatus(state: string): { kind: StatusKind; label: string } {
  switch (state) {
    case "connected":
      return { kind: "normal", label: "Connected" };
    case "connecting":
      return { kind: "low", label: "Connecting" };
    case "resetting":
      return { kind: "low", label: "Resetting" };
    case "backoff":
      return { kind: "high", label: "Disconnected, retrying" };
    case "stopped":
    case "idle":
      return { kind: "offline", label: state === "idle" ? "Idle" : "Stopped" };
    default:
      return { kind: "offline", label: state || "Unknown" };
  }
}

export function qualityStatus(quality: string): { kind: StatusKind; label: string } | null {
  switch (quality) {
    case "GOOD":
      return null;
    case "BAD":
      return { kind: "sensor_bad", label: "Bad" };
    case "STALE":
      return { kind: "offline", label: "Stale" };
    default:
      return { kind: "medium", label: quality.charAt(0) + quality.slice(1).toLowerCase() };
  }
}

// ---- Counts, ages, values -------------------------------------------------------------------

export function summarize(gateways: GatewayEntry[]): Record<GatewayStatus, number> {
  const out: Record<GatewayStatus, number> = { online: 0, stale: 0, offline: 0, unknown: 0 };
  for (const g of gateways) out[g.status] += 1;
  return out;
}

/** Something on this gateway needs attention (for the card border and screen readers). */
export function needsAttention(g: GatewayEntry): boolean {
  if (g.status !== "online") return true;
  const hb = g.heartbeat;
  if (!hb) return false;
  return hb.links.some((l) => l.state !== "connected") || hb.counters.stale_tags > 0 || hb.uplink.quarantined > 0;
}

export function secondsSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 1000) : null;
}

export function formatAge(seconds: number | null | undefined): string {
  if (seconds == null) return "never";
  if (seconds < 2) return "just now";
  if (seconds < 60) return `${Math.round(seconds)} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86_400)} d ago`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  const h = Math.floor(seconds / 3600);
  if (h < 48) return `${h} h ${Math.floor((seconds % 3600) / 60)} min`;
  return `${Math.floor(h / 24)} d`;
}

export function formatValue(value: unknown): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return String(value);
    const abs = Math.abs(value);
    return abs !== 0 && (abs >= 1e5 || abs < 1e-3) ? value.toExponential(2) : String(Number(value.toFixed(3)));
  }
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (value == null) return "—";
  return String(value);
}

export function formatCount(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString("en-US");
}

// ---- Setup instructions ---------------------------------------------------------------------

/** URL a gateway PC should post to: the API on port 8000 of the host serving this page. */
export function serverUrl(loc: Pick<Location, "protocol" | "hostname"> = window.location, apiBase = ""): string {
  if (apiBase && /^https?:\/\//.test(apiBase)) return apiBase.replace(/\/$/, "");
  const host = loc.hostname.includes(":") ? `[${loc.hostname}]` : loc.hostname;
  return `${loc.protocol === "https:" ? "https:" : "http:"}//${host}:8000`;
}

export function setupCommands(url: string): { windows: string; unix: string } {
  return {
    windows: [
      `$env:API_BASE_URL="${url}"`,
      `$env:GATEWAY_INGEST_TOKEN="<same token as the server>"`,
      `powershell -ExecutionPolicy Bypass -File apps\\gateway\\scripts\\start-gateway.ps1`,
    ].join("\n"),
    unix: `API_BASE_URL=${url} GATEWAY_INGEST_TOKEN=<same token as the server> ./apps/gateway/scripts/start-gateway.sh`,
  };
}
