export function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return value === null || value === undefined ? null : String(value);
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}
