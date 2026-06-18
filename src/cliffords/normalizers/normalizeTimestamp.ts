import { DateTime } from "luxon";

export type TimestampNormalization =
  | { ok: true; value: string }
  | { ok: false; reason: "BAD_TIMESTAMP" | "NEEDS_TIMEZONE" };

const FORMATS = [
  "yyyy-MM-dd HH:mm:ss",
  "dd/MM/yyyy HH:mm:ss",
  "MM-dd-yyyy hh:mm a",
  "MM-dd-yyyy HH:mm:ss"
];

export function normalizeTimestamp(
  value: unknown,
  plantTimezone?: string
): TimestampNormalization {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true, value: value.toISOString() };
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, reason: "BAD_TIMESTAMP" };
  }
  const input = value.trim();
  const hasExplicitZone =
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input);

  if (!hasExplicitZone && !plantTimezone) {
    return { ok: false, reason: "NEEDS_TIMEZONE" };
  }

  const zoneOptions = plantTimezone
    ? { zone: plantTimezone, setZone: true }
    : { setZone: true };
  let parsed = DateTime.fromISO(input, zoneOptions);

  if (!parsed.isValid) {
    for (const format of FORMATS) {
      parsed = DateTime.fromFormat(input, format, zoneOptions);
      if (parsed.isValid) {
        break;
      }
    }
  }

  if (!parsed.isValid) {
    return { ok: false, reason: "BAD_TIMESTAMP" };
  }
  return { ok: true, value: parsed.toUTC().toISO()! };
}
