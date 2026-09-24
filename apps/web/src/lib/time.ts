/**
 * One time-display policy for the whole app (see docs/FRONTEND_V2.md → Time):
 *
 * - Absolute plant/runtime timestamps are shown in the viewer's LOCAL time zone, 24 h, the same
 *   zone as the top-bar clock. The zone abbreviation and UTC offset are available on hover
 *   (`timeTitle`) so a timestamp can always be read unambiguously.
 * - Relative ages ("3 min 05 s") are computed against the runtime clock (`useRuntimeNow`), never
 *   the browser wall clock, so they stay right during scenario replay.
 *
 * Every function accepts an optional IANA `timeZone` (tests and future per-site overrides).
 */

type Ts = string | number | Date | null | undefined;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string | undefined, kind: "time" | "date" | "zone" | "offset"): Intl.DateTimeFormat {
  const key = `${timeZone ?? ""}|${kind}`;
  let f = formatters.get(key);
  if (!f) {
    const base: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};
    const opts: Intl.DateTimeFormatOptions =
      kind === "time"
        ? { ...base, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }
        : kind === "date"
          ? { ...base, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }
          : kind === "zone"
            ? { ...base, hour: "2-digit", timeZoneName: "short" }
            : { ...base, hour: "2-digit", timeZoneName: "longOffset" };
    f = new Intl.DateTimeFormat("en-GB", opts);
    formatters.set(key, f);
  }
  return f;
}

export function toMs(ts: Ts): number | null {
  if (ts === null || ts === undefined || ts === "") return null;
  if (ts instanceof Date) return Number.isFinite(ts.getTime()) ? ts.getTime() : null;
  if (typeof ts === "number") return Number.isFinite(ts) ? ts : null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

function parts(ms: number, timeZone: string | undefined, kind: "time" | "date"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of formatter(timeZone, kind).formatToParts(new Date(ms))) out[p.type] = p.value;
  // Some engines render midnight as "24" even with h23.
  if (out.hour === "24") out.hour = "00";
  return out;
}

/** HH:MM:SS (24 h) in the local zone; `withTenths` appends one decimal of seconds. */
export function formatClock(ts: Ts, withTenths = false, timeZone?: string): string {
  const ms = toMs(ts);
  if (ms === null) return "—";
  const p = parts(ms, timeZone, "time");
  const base = `${p.hour}:${p.minute}:${p.second}`;
  if (!withTenths) return base;
  const tenths = Math.floor((((ms % 1000) + 1000) % 1000) / 100);
  return `${base}.${tenths}`;
}

/** YYYY-MM-DD HH:MM:SS in the local zone. */
export function formatDateTime(ts: Ts, timeZone?: string): string {
  const ms = toMs(ts);
  if (ms === null) return "—";
  const p = parts(ms, timeZone, "date");
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/** Short zone name for the instant, e.g. "CEST", "UTC", or "GMT+5:30" where no abbreviation exists. */
export function zoneAbbreviation(ts: Ts = Date.now(), timeZone?: string): string {
  const ms = toMs(ts) ?? Date.now();
  const name = formatter(timeZone, "zone").formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value;
  return name === "GMT" ? "UTC" : (name ?? "UTC");
}

/** "UTC+02:00" style offset for the instant. */
export function utcOffsetLabel(ts: Ts = Date.now(), timeZone?: string): string {
  const ms = toMs(ts) ?? Date.now();
  const name = formatter(timeZone, "offset").formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return name === "GMT" ? "UTC+00:00" : name.replace("GMT", "UTC");
}

/** Hover text for any absolute timestamp: full local date-time, zone and offset. */
export function timeTitle(ts: Ts, timeZone?: string): string {
  const ms = toMs(ts);
  if (ms === null) return "";
  return `${formatDateTime(ms, timeZone)} ${zoneAbbreviation(ms, timeZone)} (${utcOffsetLabel(ms, timeZone)}) · your local time`;
}

/** The viewer's IANA zone, e.g. "Europe/Oslo". */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
